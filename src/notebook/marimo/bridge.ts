import createClient from "openapi-fetch";
import * as vscode from "vscode";
import type { Disposable } from "vscode";
import { WebSocket } from "ws";
import type { paths } from "../../generated/api";
import { Config } from "../../launcher/config";
import { logger as l } from "../../logger";
import type { KernelKey } from "../common/key";
import {
  DeferredRequestRegistry,
  type RequestId,
} from "../utils/DeferredRequestRegistry";
import { Deferred } from "../utils/deferred";
import { logNever } from "../utils/invariant";
import {
  type CellOp,
  type DeleteRequest,
  type FunctionCallRequest,
  type FunctionCallResult,
  type InstallMissingPackagesRequest,
  type InstantiateRequest,
  type KernelReady,
  type MarimoConfig,
  type MessageOperation,
  type RunRequest,
  SessionId,
  type SkewToken,
  SaveNotebookRequest,
} from "./types";

const logger = l.createLogger("marimo-bridge");

/**
 * Bridge between VS Code and Marimo kernel.
 *
 * Connects to the Marimo kernel via WebSocket and HTTP.
 * Tries to connect to the WebSocket on construction.
 */
export class MarimoBridge implements Disposable {
  private socket: WebSocket;
  private sessionId: SessionId;
  private client: ReturnType<typeof createClient<paths>>;
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
    readonly port: number,
    readonly kernelKey: KernelKey,
    readonly skewToken: SkewToken,
    readonly userConfig: MarimoConfig,
    private readonly callbacks: {
      onCellMessage: (message: CellOp) => void;
      onKernelReady: (payload: KernelReady) => void;
    },
  ) {
    // Create URLs
    const host = Config.host;
    const https = Config.https;
    this.sessionId = SessionId.create();
    const wsProtocol = https ? "wss" : "ws";
    const httpProtocol = https ? "https" : "http";
    const wsURL = new URL(`${wsProtocol}://${host}:${port}/ws`);
    wsURL.searchParams.set("session_id", this.sessionId);
    wsURL.searchParams.set("file", kernelKey);
    const httpURL = new URL(`${httpProtocol}://${host}:${port}`);

    // Create WebSocket
    this.socket = new WebSocket(wsURL);
    this.socket.onopen = () => {
      logger.log("connected");
    };
    this.socket.onclose = () => {
      logger.log("disconnected");
    };
    this.socket.onerror = (error) => {
      logger.log("error", error);
    };
    this.socket.onmessage = (message) => {
      this.handleMessage(JSON.parse(message.data.toString()));
    };

    // Create HTTP client
    this.client = createClient<paths>({ baseUrl: httpURL.toString() });
    this.client.use({
      onRequest: async (req) => {
        req.headers.set("Marimo-Session-Id", this.sessionId);
        req.headers.set("Marimo-Server-Token", this.skewToken);
        return req;
      },
    });
  }

  public async dispose(): Promise<void> {
    logger.log("dispose");
    this.socket.close();
  }

  public async run(request: RunRequest): Promise<void> {
    logger.log("run");
    await this.client.POST("/api/kernel/run", {
      body: request,
    });
  }

  public async delete(request: DeleteRequest): Promise<void> {
    logger.log("delete");
    await this.client.POST("/api/kernel/delete", {
      body: request,
    });
  }

  public async save(request: SaveNotebookRequest): Promise<string> {
    logger.log("save");
    const response = await this.client.POST("/api/kernel/save", {
      body: request,
      parseAs: "text",
    });
    return response.data ?? "";
  }

  public async functionRequest(request: FunctionCallRequest): Promise<void> {
    logger.log("function request");
    await this.client.POST("/api/kernel/function_call", {
      body: request,
    });
  }

  public async instantiate(request: InstantiateRequest): Promise<void> {
    logger.log("instantiate");
    await this.client.POST("/api/kernel/instantiate", {
      body: request,
    });
  }

  public async installMissingPackages(
    request: InstallMissingPackagesRequest,
  ): Promise<void> {
    logger.log("install missing packages");
    await this.client.POST("/api/kernel/install_missing_packages", {
      body: request,
    });
  }

  public async interrupt(): Promise<void> {
    logger.log("interrupt");
    await this.client.POST("/api/kernel/interrupt", {});
  }

  public async readCode(): Promise<string> {
    logger.log("read code");
    const response = await this.client.POST("/api/kernel/read_code");
    return response.data?.contents ?? "";
  }

  private async handleMessage(message: MessageOperation): Promise<void> {
    logger.log("message", message.op);
    switch (message.op) {
      case "kernel-ready":
        this.callbacks.onKernelReady(message.data);
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
      case "remove-ui-elements":
        // TODO:
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
      case "missing-package-alert":
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
      case "installing-package-alert":
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
      // Unused features
      case "data-column-preview":
      case "datasets":
      case "variables":
      case "variable-values":
      case "completion-result":
        return;
      default:
        logNever(message);
        return;
    }
  }
}
