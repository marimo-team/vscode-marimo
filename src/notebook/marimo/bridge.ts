import createClient from "openapi-fetch";
import * as vscode from "vscode";
import { WebSocket } from "ws";
import { Config, composeUrl } from "../../config";
import {
  MarimoExplorer,
  MarimoRunningKernelsProvider,
} from "../../explorer/explorer";
import type { paths } from "../../generated/api";
import { fetchMarimoStartupValues } from "../../launcher/utils";
import { logger } from "../../logger";
import type { ILifecycle } from "../../types";
import {
  DeferredRequestRegistry,
  type RequestId,
} from "../../utils/DeferredRequestRegistry";
import { Deferred } from "../../utils/deferred";
import { logNever } from "../../utils/invariant";
import { LogMethodCalls } from "../../utils/log";
import type { KernelKey } from "../common/key";
import {
  type CellOp,
  type DeleteCellRequest,
  type FunctionCallRequest,
  type FunctionCallResult,
  type InstallMissingPackagesRequest,
  type InstantiateRequest,
  type KernelReady,
  type MessageOperation,
  type RunRequest,
  type SaveNotebookRequest,
  SessionId,
  type SkewToken,
  type UpdateCellIdsRequest,
} from "./types";

/**
 * Bridge between VS Code and Marimo kernel.
 *
 * Connects to the Marimo kernel via WebSocket and HTTP.
 * Tries to connect to the WebSocket on construction.
 */
export class MarimoBridge implements ILifecycle {
  private logger = logger.createLogger("marimo-bridge");

  private socket!: WebSocket;
  private sessionId!: SessionId;
  private client!: ReturnType<typeof createClient<paths>>;
  private progress:
    | vscode.Progress<{ message?: string; increment?: number }>
    | undefined;
  private progressCompletedDeferred: Deferred<void> | undefined;

  private FUNCTIONS_REGISTRY = new DeferredRequestRegistry<
    Omit<FunctionCallRequest, "functionCallId">,
    FunctionCallResult
  >("function-call-result", async (requestId, req) => {
    // RPC counts as a kernel invocation
    await this.functionRequest({
      functionCallId: requestId,
      ...req,
    });
  });

  constructor(
    private readonly port: number,
    private kernelKey: KernelKey,
    private skewToken: SkewToken,
    private readonly callbacks: {
      onCellMessage: (message: CellOp) => void;
      onKernelReady: (payload: KernelReady) => void;
    },
  ) {}

  @LogMethodCalls()
  async start(): Promise<void> {
    // Create URLs
    const host = Config.host;
    const https = Config.https;
    this.sessionId = SessionId.create();
    const wsProtocol = https ? "wss" : "ws";
    const wsURL = new URL(`${wsProtocol}://${host}:${this.port}/ws`);
    wsURL.searchParams.set("session_id", this.sessionId);
    wsURL.searchParams.set("file", this.kernelKey);
    const httpURL = composeUrl(this.port);

    // Create WebSocket
    this.socket = new WebSocket(wsURL);
    this.socket.onopen = () => {
      this.logger.log("connected");
    };
    this.socket.onclose = (evt) => {
      this.logger.log("disconnected", evt.code, evt.reason);
    };
    this.socket.onerror = (error) => {
      this.logger.log("error", error);
    };
    this.socket.onmessage = (message) => {
      this.handleMessage(
        JSON.parse(message.data.toString()) as MessageOperation,
      );
    };

    // Create HTTP client
    this.client = createClient<paths>({ baseUrl: httpURL.toString() });
    this.client.use({
      onRequest: async (req) => {
        req.headers.set("Marimo-Session-Id", this.sessionId);
        req.headers.set("Marimo-Server-Token", this.skewToken);
        return req;
      },
      onResponse: async (res, _options) => {
        // Log errors
        if (!res.ok) {
          // If error is 401 and message includes 'Invalid server token' fetch a new token
          const text = await res.text();
          if (res.status === 401 && text.includes("Invalid server token")) {
            logger.error("Invalid server token");
            const { skewToken } = await fetchMarimoStartupValues(this.port);
            this.skewToken = skewToken;
            // TODO: Retry the request
          }

          logger.error(`HTTP error: ${res.status} ${res.statusText}`, text);
        }
        return res;
      },
    });
  }

  @LogMethodCalls()
  async restart(): Promise<void> {
    await retry(async () => {
      const response = await this.client.POST(
        "/api/kernel/restart_session",
        {},
      );
      if (response.error) {
        throw new Error((response as any).error);
      }
      this.socket.close();
    });
    this.start();
  }

  static getRunningNotebooks(port: number, skewToken: SkewToken) {
    const client = createClient<paths>({
      baseUrl: composeUrl(port),
    });
    client.use({
      onRequest: (req) => {
        req.headers.set("Marimo-Server-Token", skewToken);
        return req;
      },
    });
    return client.POST("/api/home/running_notebooks");
  }

  static shutdownSession(
    port: number,
    skewToken: SkewToken,
    sessionId: string,
  ) {
    const client = createClient<paths>({
      baseUrl: composeUrl(port),
    });
    client.use({
      onRequest: (req) => {
        req.headers.set("Marimo-Server-Token", skewToken);
        return req;
      },
    });
    return client.POST("/api/home/shutdown_session", {
      body: { sessionId: sessionId },
    });
  }

  @LogMethodCalls()
  public async dispose(): Promise<void> {
    this.socket.close();
  }

  @LogMethodCalls()
  public async run(request: RunRequest): Promise<void> {
    await this.client.POST("/api/kernel/run", {
      body: request,
    });
  }

  @LogMethodCalls()
  public async delete(request: DeleteCellRequest): Promise<void> {
    await this.client.POST("/api/kernel/delete", {
      body: request,
    });
  }

  @LogMethodCalls()
  public async save(request: SaveNotebookRequest): Promise<string> {
    const response = await this.client.POST("/api/kernel/save", {
      body: request,
      parseAs: "text",
    });
    return response.data ?? "";
  }

  @LogMethodCalls()
  public async functionRequest(request: FunctionCallRequest): Promise<void> {
    await this.client.POST("/api/kernel/function_call", {
      body: request,
    });
  }

  @LogMethodCalls()
  public async instantiate(request: InstantiateRequest): Promise<void> {
    await this.client.POST("/api/kernel/instantiate", {
      body: request,
    });
  }

  @LogMethodCalls()
  public async installMissingPackages(
    request: InstallMissingPackagesRequest,
  ): Promise<void> {
    await this.client.POST("/api/kernel/install_missing_packages", {
      body: request,
    });
  }

  @LogMethodCalls()
  public async interrupt(): Promise<void> {
    await this.client.POST("/api/kernel/interrupt", {});
  }

  @LogMethodCalls()
  public async readCode(): Promise<string> {
    const response = await this.client.POST("/api/kernel/read_code");
    return response.data?.contents ?? "";
  }

  @LogMethodCalls()
  public async updateCellIds(request: UpdateCellIdsRequest): Promise<void> {
    // Don't send if the socket is not open
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.logger.log("update cell ids");
    await this.client.POST("/api/kernel/sync/cell_ids", {
      body: request,
    });
  }

  private async handleMessage(message: MessageOperation): Promise<void> {
    logger.debug("message", message.op);
    switch (message.op) {
      case "kernel-ready":
        this.callbacks.onKernelReady(message.data);
        MarimoRunningKernelsProvider.refresh();
        return;
      case "cell-op":
        this.callbacks.onCellMessage(message.data);
        return;
      case "alert":
        if (message.data.variant === "danger") {
          vscode.window.showErrorMessage(message.data.title, {
            modal: true,
            detail: message.data.description,
          });
        }
        vscode.window.showInformationMessage(message.data.title, {
          modal: true,
          detail: message.data.description,
        });
        return;
      case "banner":
        if (message.data.variant === "danger") {
          vscode.window.showInformationMessage(message.data.title, {
            detail: message.data.description,
          });
        }
        return;
      case "query-params-append":
      case "query-params-delete":
      case "query-params-clear":
      case "query-params-set":
        logger.warn("query params not supported");
        return;
      case "interrupted":
        await this.interrupt();
        return;
      case "completed-run":
        return;
      case "reconnected":
        vscode.window.showInformationMessage("Reconnected to Marimo server");
        return;
      case "function-call-result":
        this.FUNCTIONS_REGISTRY.resolve(
          message.data.function_call_id as RequestId,
          message.data,
        );
        return;
      case "reload":
        vscode.commands.executeCommand("workbench.action.reloadWindow");
        return;
      case "missing-package-alert": {
        const response = await vscode.window.showInformationMessage(
          "Missing packages:",
          {
            detail: message.data.packages.join(", "),
          },
          {
            title: "Install",
          },
        );
        if (response?.title !== "Install") {
          return;
        }
        const manager = await vscode.window.showQuickPick(
          ["pip", "rye", "uv", "poetry", "pixi"],
          {
            placeHolder: "Select package manager",
          },
        );
        if (!manager) {
          return;
        }
        await this.installMissingPackages({
          manager: manager,
        });
        this.progressCompletedDeferred = new Deferred();
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Installing packages...",
            cancellable: true,
          },
          async (progress, token) => {
            this.progress = progress;
            token.onCancellationRequested(() => {
              vscode.window.showInformationMessage("Installation cancelled");
              // this.interrupt();
            });
            progress.report({ message: "Installing packages" });
            await this.progressCompletedDeferred?.promise;
          },
        );
        return;
      }
      case "installing-package-alert": {
        if (!this.progress) {
          return;
        }
        const installed = Object.entries(message.data.packages).filter(
          ([_, value]) => value === "installed",
        );
        const queued = Object.entries(message.data.packages).filter(
          ([_, value]) => value === "queued",
        );
        const failed = Object.entries(message.data.packages).filter(
          ([_, value]) => value === "failed",
        );
        const installing = Object.entries(message.data.packages).filter(
          ([_, value]) => value === "installing",
        );
        const messages = (
          [
            ["Installed", installed.length],
            ["Queued", queued.length],
            ["Failed", failed.length],
            ["Installing", installing.length],
          ] as const
        )
          .filter(([_, count]) => count > 0)
          .map(([name, count]) => `${name}: ${count}`)
          .join(", ");
        this.progress.report({ message: messages });
        if (queued.length === 0 && installing.length === 0) {
          this.progressCompletedDeferred?.resolve();
          this.progress = undefined;
          this.progressCompletedDeferred = undefined;
        }
        return;
      }
      // Unused features
      case "remove-ui-elements":
      case "data-column-preview":
      case "datasets":
      case "variables":
      case "variable-values":
      case "completion-result":
      case "focus-cell":
      case "update-cell-codes":
      case "update-cell-ids":
        return;
      default:
        return logNever(message);
    }
  }
}

function retry(fn: () => Promise<void>, retries = 3): Promise<void> {
  return fn().catch((error) => {
    if (retries === 0) {
      throw error;
    }
    return retry(fn, retries - 1);
  });
}
