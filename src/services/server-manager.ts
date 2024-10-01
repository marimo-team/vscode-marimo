import { join } from "node:path";
import type * as vscode from "vscode";
import { type Config, composeUrl } from "../config";
import { MarimoTerminal } from "../launcher/terminal";
import { fetchMarimoStartupValues } from "../launcher/utils";
import { logger as l, logger } from "../logger";
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
import { getInterpreter } from "../utils/exec";
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
        const domValues = await fetchMarimoStartupValues(this.config.port);
        this.startedPromise.resolve({
          port: this.config.port,
          ...domValues,
        });
        return;
      }
      logger.warn("Recovered server is not healthy");
      await this.stopServer();
    } else {
      this.logger.info("Could not recover any state");
    }
  }

  /**
   * Check if the server is healthy
   */
  private async isHealthy(port: number): Promise<boolean> {
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
  async start(): Promise<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    if (this.state === "starting") {
      this.logger.info("marimo server already starting");
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
      this.logger.info("Checking server health...");
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
      this.logger.info("Server already running at port", this.port);
      return this.startedPromise.promise;
    }

    if (this.state === "stopped") {
      this.logger.info("Starting server...");
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

  private async startServer(): Promise<number> {
    this.updateState("starting");
    const port = await tryPort(this.config.port);
    this.port = port;

    if (await this.isHealthy(port)) {
      this.logger.info(`Found existing server at port ${port}. Reusing`);
      return port;
    }

    const cmd = this.buildServerCommand(port);
    await this.executeServerCommand(cmd);

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
      .build();
  }

  private async executeServerCommand(cmd: string): Promise<void> {
    const interpreter = await getInterpreter();
    if (interpreter) {
      await this.terminal.executeCommand(`${interpreter} -m ${cmd}`);
    } else {
      await this.terminal.executeCommand(cmd);
    }
  }

  @LogMethodCalls()
  async stopServer() {
    this.port = undefined;
    if (this.terminal) {
      this.logger.info("Stopping server...");
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
      this.logger.error("Error getting running notebooks", runningNotebooks);
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
      this.logger.error("Error shutting down session", response);
    }
  }
}
