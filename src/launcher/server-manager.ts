import * as vscode from "vscode";
import { Config, composeUrl } from "../config";
import { logger as l, logger } from "../logger";
import { MarimoBridge } from "../notebook/marimo/bridge";
import type {
  MarimoConfig,
  MarimoFile,
  SessionId,
  SkewToken,
} from "../notebook/marimo/types";
import { MarimoCmdBuilder } from "../utils/cmd";
import { Deferred } from "../utils/deferred";
import { LogMethodCalls } from "../utils/log";
import { tryPort } from "../utils/network";
import { MarimoTerminal } from "./terminal";
import { fetchMarimoStartupValues } from "./utils";

/**
 * Manages a single instance of a marimo server
 */
export class ServerManager {
  public static instance: ServerManager = new ServerManager();
  private logger = logger.createLogger("server-manager");

  private terminal!: MarimoTerminal;
  private otherDisposables: vscode.Disposable[] = [];
  private state: "stopped" | "starting" | "started" = "stopped";
  private port: number | undefined;
  private startedPromise: Deferred<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> = new Deferred();

  init(): void {
    this.terminal = new MarimoTerminal(Config.root, Config.root, "editor");
    this.updateState("stopped");
    this.tryToRecover();
    this.otherDisposables.push(this.terminal);
  }

  private constructor() {}

  @LogMethodCalls()
  private async tryToRecover() {
    const FORCE_RESTART_SERVER = true;

    const recovered = await this.terminal.tryRecoverTerminal();
    if (recovered) {
      this.logger.log("Recovered terminal");
      if (FORCE_RESTART_SERVER) {
        await this.stopServer();
        return;
      }

      const healthy = await this.isHealthy(Config.port);
      if (healthy) {
        this.logger.log("Recovered server is healthy");
        this.updateState("started");

        this.port = Config.port;
        const domValues = await fetchMarimoStartupValues(Config.port);
        this.startedPromise.resolve({
          port: Config.port,
          ...domValues,
        });
        return;
      }
      logger.warn("Recovered server is not healthy");
      await this.stopServer();
    } else {
      this.logger.log("Could not recover any state");
    }
  }

  private updateState(newState: "stopped" | "starting" | "started") {
    if (newState === "started") {
      void vscode.commands.executeCommand(
        "setContext",
        "marimo.isMarimoServerRunning",
        true,
      );
    } else if (newState === "stopped") {
      void vscode.commands.executeCommand(
        "setContext",
        "marimo.isMarimoServerRunning",
        false,
      );
    } else {
      void vscode.commands.executeCommand(
        "setContext",
        "marimo.isMarimoServerRunning",
        "null",
      );
    }
    this.state = newState;
  }

  /**
   * Check if the server is healthy
   */
  private async isHealthy(port: number): Promise<boolean> {
    try {
      const health = await fetch(`${composeUrl(port)}/health`);
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
  async start(): Promise<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    if (this.state === "starting") {
      this.logger.log("marimo server already starting");
      // If its starting, wait for it to start
      return this.startedPromise.promise;
    }

    if (this.state === "started") {
      if (!this.port) {
        logger.warn("Port not set. Restarting...");
        this.startedPromise = new Deferred();
        await this.stopServer();
        const port = await this.startServer();
        const domValues = await fetchMarimoStartupValues(port);
        this.startedPromise.resolve({
          port,
          ...domValues,
        });
        return this.startedPromise.promise;
      }

      // Check it is health, otherwise shutdown and restart
      this.logger.log("Checking server health...");
      if (!(await this.isHealthy(this.port))) {
        logger.warn("Server not healthy. Restarting...");
        this.startedPromise = new Deferred();
        await this.stopServer();
        const port = await this.startServer();
        const domValues = await fetchMarimoStartupValues(port);
        this.startedPromise.resolve({
          port,
          ...domValues,
        });
        return this.startedPromise.promise;
      }

      // Otherwise, it is already running
      this.logger.log("Server already running at port", this.port);
      return this.startedPromise.promise;
    }

    if (this.state === "stopped") {
      this.logger.log("Starting server...");
      this.startedPromise = new Deferred();
      const port = await this.startServer();
      const domValues = await fetchMarimoStartupValues(port);
      this.startedPromise.resolve({
        port,
        ...domValues,
      });
      return this.startedPromise.promise;
    }

    logger.error("Invalid state", this.state);
    throw new Error("Invalid state");
  }

  @LogMethodCalls()
  async restart(): Promise<void> {
    this.startedPromise = new Deferred();
    await this.stopServer().then(() => {
      this.start();
    });
  }

  private async startServer() {
    this.updateState("starting");

    // Find open port
    this.logger.log("Finding open port...");
    const port = await tryPort(Config.port);
    this.port = port;

    if (await this.isHealthy(port)) {
      this.logger.log(`Found existing server at port ${port}. Reusing`);
      return port;
    }

    // Start server
    this.logger.log("Starting server at port", port);
    const cmd = new MarimoCmdBuilder()
      .debug(Config.debug)
      .mode("edit")
      .fileOrDir(Config.root)
      .host(Config.host)
      .port(port)
      .headless(true)
      .enableToken(Config.enableToken)
      .tokenPassword(Config.tokenPassword)
      .build();

    await (Config.pythonPath
      ? this.terminal.executeCommand(`${Config.pythonPath} -m ${cmd}`)
      : this.terminal.executeCommand(cmd));

    this.logger.log("Server started at port", port);
    this.updateState("started");
    return port;
  }

  @LogMethodCalls()
  async stopServer() {
    this.port = undefined;
    if (this.terminal) {
      this.logger.log("Stopping server...");
      this.terminal.dispose();
    }
    this.updateState("stopped");
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
    const { port, skewToken } = await this.startedPromise.promise;
    const runningNotebooks = await MarimoBridge.getRunningNotebooks(
      port,
      skewToken,
    );
    if (runningNotebooks.error) {
      logger.error("Error getting running notebooks", runningNotebooks);
      return [];
    }
    return [...(runningNotebooks.data?.files ?? [])];
  }

  @LogMethodCalls()
  async shutdownSession(file: MarimoFile): Promise<void> {
    if (this.state === "stopped" || file.sessionId === undefined) {
      return;
    }
    const { port, skewToken } = await this.startedPromise.promise;
    const response = await MarimoBridge.shutdownSession(
      port,
      skewToken,
      file.sessionId as SessionId,
    );
    if (response.error) {
      logger.error("Error shutting down session", response);
    }
  }
}
