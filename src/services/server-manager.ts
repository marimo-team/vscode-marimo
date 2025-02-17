import { join } from "node:path";
import type * as vscode from "vscode";
import { window } from "vscode";
import { Config, composeUrl } from "../config";
import { MarimoTerminal } from "../launcher/terminal";
import { fetchMarimoStartupValues } from "../launcher/utils";
import { logger } from "../logger";
import { MarimoBridge } from "../notebook/marimo/bridge";
import type {
  MarimoConfig,
  MarimoFile,
  SessionId,
  SkewToken,
} from "../notebook/marimo/types";
import type { ServerStatus, StartupResult } from "../types";
import { MarimoCmdBuilder } from "../utils/cmd";
import { Deferred } from "../utils/deferred";
import { getInterpreter, maybeQuotes } from "../utils/exec";
import { LogMethodCalls } from "../utils/log";
import { tryPort } from "../utils/network";
import { VscodeContextManager } from "./context-manager";

interface IServerManager {
  getStatus(): "stopped" | "starting" | "started";
  init(): void;
  start(): Promise<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }>;
  stopServer(): Promise<void>;
  dispose(): void;
  getActiveSessions(): Promise<MarimoFile[]>;
  shutdownSession(file: MarimoFile): Promise<void>;
}

/**
 * Manages a single instance of a marimo server through the marimo CLI.
 */
export class ServerManager implements IServerManager {
  private static instance: ServerManager;
  private logger = logger.createLogger("server-manager");
  public terminal!: MarimoTerminal;
  private otherDisposables: vscode.Disposable[] = [];
  private state: ServerStatus = "stopped";
  private port: number | undefined;
  private startedPromise: Deferred<StartupResult> = new Deferred();
  private contextManager = new VscodeContextManager();
  private serverHealthCheckInterval: NodeJS.Timeout | null = null;
  private currentStartAttempt: AbortController | null = null;

  private constructor(private config: Config) {}

  public static getInstance(config: Config): ServerManager {
    if (!ServerManager.instance) {
      ServerManager.instance = new ServerManager(config);
    }
    return ServerManager.instance;
  }

  getStatus(): ServerStatus {
    return this.state;
  }

  getPort(): number | undefined {
    return this.port;
  }

  init(): void {
    this.terminal = new MarimoTerminal(
      this.config.root,
      this.config.root,
      "editor",
    );
    this.updateState("stopped");
    this.tryToRecover();
    this.otherDisposables.push(this.terminal);
  }

  private updateState(newState: ServerStatus) {
    this.state = newState;
    this.contextManager.setMarimoServerRunning(
      newState === "started" ? true : newState === "stopped" ? false : "null",
    );
  }

  @LogMethodCalls()
  private async tryToRecover() {
    const FORCE_RESTART_SERVER = true;

    const recovered = await this.terminal.tryRecoverTerminal();
    if (recovered) {
      this.logger.info("Recovered previous terminal");
      if (FORCE_RESTART_SERVER) {
        await this.stopServer();
        return;
      }

      const healthy = await this.isHealthy(this.config.port);
      if (healthy) {
        this.logger.info("Recovered server is healthy");
        this.updateState("started");

        this.port = this.config.port;
        const domValues = await fetchMarimoStartupValues({
          port: this.config.port,
        });
        this.startedPromise.resolve({
          port: this.config.port,
          ...domValues,
        });
        this.startHealthCheck(); // Start health check for recovered server
        return;
      }
      logger.warn("Recovered server is not healthy");
      const action = await window.showWarningMessage(
        "The recovered marimo server is not healthy. Would you like to restart it?",
        "Restart",
        "Stop",
      );
      if (action === "Restart") {
        await this.restartServer();
      } else {
        await this.stopServer();
      }
    } else {
      this.logger.info("Could not recover any state");
    }
  }

  /**
   * Check if the server is healthy
   */
  public async isHealthy(port: number): Promise<boolean> {
    try {
      const baseUrl = await composeUrl(port);
      const health = await fetch(join(baseUrl, "health"));
      return health.ok;
    } catch {
      return false;
    }
  }

  /**
   * Start the server
   * - If the server is already starting, wait for it to start
   * - If the server is already started, check if it is healthy
   * - If the server is not healthy, stop it and start a new one
   * - If the server is stopped, start it
   */
  @LogMethodCalls()
  async start(cancellationToken?: vscode.CancellationToken): Promise<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    // If its starting and didn't reject,
    // wait for it to start by returning the promise
    if (this.state === "starting" && !this.startedPromise.hasRejected) {
      this.logger.info("marimo server already starting");
      return this.startedPromise.promise;
    }

    const inProgressPromise = new Deferred<StartupResult>({
      onRejected: (reason: unknown) => {
        this.logger.error("Unexpected error starting server", {
          error: reason,
          state: this.state,
        });
        // Set to stopped, if we failed to start and it's the same promise
        if (this.startedPromise === inProgressPromise) {
          console.warn("Setting to stopped");
          this.updateState("stopped");
        }
      },
    });

    cancellationToken?.onCancellationRequested(() => {
      this.logger.info("Server start was cancelled");
      inProgressPromise.reject(new Error("Server start was cancelled"));
    });

    try {
      // If its started, check if it is healthy
      if (this.state === "started") {
        if (!this.port) {
          logger.warn("Port not set. Restarting...");
          // Assign _this_ in progress promise to singleton
          this.startedPromise = inProgressPromise;
          await this.stopServer();
          const port = await this.startServer(cancellationToken);
          const domValues = await fetchMarimoStartupValues({
            port,
            cancellationToken,
          });
          inProgressPromise.resolve({
            port,
            ...domValues,
          });
          return await inProgressPromise.promise;
        }

        // Check it is health, otherwise shutdown and restart
        this.logger.info("Checking server health...");
        if (!(await this.isHealthy(this.port))) {
          logger.warn("Server not healthy. Restarting...");
          // Assign _this_ in progress promise to singleton
          this.startedPromise = inProgressPromise;
          await this.stopServer();
          const port = await this.startServer(cancellationToken);
          const domValues = await fetchMarimoStartupValues({
            port,
            cancellationToken,
          });
          inProgressPromise.resolve({
            port,
            ...domValues,
          });
          return await inProgressPromise.promise;
        }

        // Otherwise, it is already running
        this.logger.info("Server health check passed");
        const result = await this.startedPromise.promise;
        this.logger.info("Server already running at port", this.port, {
          marimoVersion: result.version,
          skewToken: result.skewToken,
        });
        return result;
      }

      // If its stopped, start it
      if (this.state === "stopped") {
        this.logger.info("Starting server...");
        // Assign _this_ in progress promise to singleton
        this.startedPromise = inProgressPromise;
        const port = await this.startServer(cancellationToken);
        const domValues = await fetchMarimoStartupValues({
          port,
          cancellationToken,
        });
        inProgressPromise.resolve({
          port,
          ...domValues,
        });
        return await inProgressPromise.promise;
      }

      logger.error("Invalid state", this.state);
      throw new Error("Invalid state");
    } catch (error) {
      this.logger.error("Unexpected error starting server", { error });
      inProgressPromise.reject(error);
      throw error;
    }
  }

  private startHealthCheck() {
    if (this.serverHealthCheckInterval) {
      clearInterval(this.serverHealthCheckInterval);
    }

    this.serverHealthCheckInterval = setInterval(async () => {
      await this.checkServerHealth();
    }, 30000); // Check every 30 seconds
  }

  private async checkServerHealth() {
    if (!this.port) {
      return;
    }

    const isHealthy = await this.isHealthy(this.port);
    if (!isHealthy) {
      this.logger.warn(`Server health check failed on port ${this.port}`);
      const action = await window.showWarningMessage(
        "The marimo server is not responding. What would you like to do?",
        "Restart Server",
        "Ignore",
      );

      if (action === "Restart Server") {
        await this.restartServer();
      }
    }
  }

  private async restartServer() {
    this.logger.info("Restarting server...");
    await this.stopServer();
    await this.start();
    window.showInformationMessage("marimo server has been restarted.");
  }

  @LogMethodCalls()
  async restart(): Promise<void> {
    this.startedPromise = new Deferred();
    await this.stopServer().then(() => {
      this.start();
    });
  }

  private async startServer(
    cancellationToken?: vscode.CancellationToken,
  ): Promise<number> {
    this.updateState("starting");
    const port = await tryPort(this.config.port);
    this.port = port;

    if (await this.isHealthy(port)) {
      this.logger.info(`Found existing server at port ${port}. Reusing`);
      return port;
    }

    const cmd = this.buildServerCommand(port);
    await this.executeServerCommand(cmd, cancellationToken);

    this.logger.info("Server started at port", port);
    this.updateState("started");
    return port;
  }

  private buildServerCommand(port: number): string {
    return new MarimoCmdBuilder()
      .debug(this.config.debug)
      .mode("edit")
      .fileOrDir(this.config.root)
      .host(this.config.host)
      .port(port)
      .headless(true)
      .enableToken(this.config.enableToken)
      .tokenPassword(this.config.tokenPassword)
      .sandbox(this.config.sandbox)
      .watch(this.config.watch)
      .build();
  }

  private async executeServerCommand(
    cmd: string,
    cancellationToken?: vscode.CancellationToken,
  ): Promise<void> {
    try {
      if (Config.marimoPath) {
        this.logger.info(`Using marimo path ${Config.marimoPath}`);
        await this.terminal.executeCommand(
          `${maybeQuotes(Config.marimoPath)} ${cmd}`,
          cancellationToken,
        );
        return;
      }

      const interpreter = await getInterpreter();
      if (interpreter) {
        this.logger.info(`Using interpreter ${interpreter}`);
        await this.terminal.executeCommand(
          `${maybeQuotes(interpreter)} -m marimo ${cmd}`,
          cancellationToken,
        );
      } else {
        this.logger.info("Using system marimo command");
        await this.terminal.executeCommand(`marimo ${cmd}`, cancellationToken);
      }
    } catch (error) {
      // If cancelled, don't log as an error
      if (cancellationToken?.isCancellationRequested) {
        this.logger.info("Server start was cancelled");
        return;
      }
      this.logger.error("Failed to execute server command", {
        error,
        cmd,
        marimoPath: Config.marimoPath,
      });
      throw error;
    }
  }

  @LogMethodCalls()
  async stopServer() {
    this.port = undefined;
    if (this.terminal) {
      this.logger.info("Stopping server...");
      this.terminal.dispose();
    }

    if (!this.startedPromise.hasCompleted) {
      this.startedPromise.reject(new Error("Server stopped"));
    }

    this.updateState("stopped");

    if (this.serverHealthCheckInterval) {
      clearInterval(this.serverHealthCheckInterval);
      this.serverHealthCheckInterval = null;
    }
  }

  @LogMethodCalls()
  dispose(): void {
    this.stopServer();
    this.otherDisposables.forEach((d) => d.dispose());
  }

  @LogMethodCalls()
  async getActiveSessions(): Promise<MarimoFile[]> {
    if (this.state === "stopped") {
      return [];
    }
    try {
      const { port, skewToken } = await this.startedPromise.promise;
      const runningNotebooks = await MarimoBridge.getRunningNotebooks(
        port,
        skewToken,
      );
      if (runningNotebooks.error) {
        this.logger.error("Failed to get running notebooks", {
          error: (runningNotebooks as { error: string }).error,
          port,
          state: this.state,
        });
        return [];
      }
      return [...(runningNotebooks.data?.files ?? [])];
    } catch (error) {
      this.logger.error("Unexpected error getting active sessions", {
        error,
        state: this.state,
      });
      return [];
    }
  }

  @LogMethodCalls()
  async shutdownSession(file: MarimoFile): Promise<void> {
    if (this.state === "stopped" || file.sessionId === undefined) {
      return;
    }
    try {
      const { port, skewToken } = await this.startedPromise.promise;
      const response = await MarimoBridge.shutdownSession(
        port,
        skewToken,
        file.sessionId as SessionId,
      );
      if (response.error) {
        this.logger.error("Failed to shutdown session", {
          error: (response as { error: string }).error,
          sessionId: file.sessionId,
          port,
        });
      }
    } catch (error) {
      this.logger.error("Unexpected error shutting down session", {
        error,
        sessionId: file.sessionId,
        state: this.state,
      });
    }
  }
}
