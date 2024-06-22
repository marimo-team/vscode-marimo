import { JSDOM } from "jsdom";
import type * as vscode from "vscode";
import { Config, composeUrl } from "../config";
import { logger as l } from "../logger";
import { Deferred } from "../utils/deferred";
import { tryPort } from "../utils/network";
import type { MarimoConfig, SkewToken } from "../notebook/marimo/types";
import { MarimoTerminal } from "./terminal";
import { MarimoCmdBuilder } from "../utils/cmd";
import { MarimoBridge } from "../notebook/marimo/bridge";

const logger = l.createLogger("server-manager");

/**
 * Manages a single instance of a marimo server
 */
export class ServerManager implements vscode.Disposable {
  public static instance: ServerManager = new ServerManager();


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

  init(ctx: vscode.ExtensionContext): void {
    this.terminal = new MarimoTerminal(ctx, Config.root, Config.root, "editor");
    this.tryToRecover();
    this.otherDisposables.push(this.terminal);
  }

  private constructor() {
  }

  private async tryToRecover() {
    const FORCE_RESTART_SERVER = true;

    const recovered = await this.terminal.tryRecoverTerminal();
    if (recovered) {
      logger.log("Recovered terminal");
      if (FORCE_RESTART_SERVER) {
        await this.stopServer();
        return;
      }

      const healthy = await this.isHealthy(Config.port);
      if (healthy) {
        logger.log("Recovered server is healthy");
        this.state = "started";
        this.port = Config.port;
        const domValues = await this.fetchMarimoStartupValues(Config.port);
        this.startedPromise.resolve({
          port: Config.port,
          ...domValues,
        });
        return;
      }
      logger.warn("Recovered server is not healthy");
      await this.stopServer();
    } else {
      logger.log("Could not recover any state");
    }
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
   * Grabs the index.html of the marimo server and extracts
   * various startup values.
   * - skewToken
   * - version
   * - userConfig
   */
  private async fetchMarimoStartupValues(port: number): Promise<{
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    const response = await fetch(`${composeUrl(port)}`);
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    const getDomValue = (tagName: string, datasetKey: string) => {
      const element = Array.from(doc.getElementsByTagName(tagName))[0] as
        | HTMLElement
        | undefined;
      if (!element) {
        throw new Error(`Could not find ${tagName}`);
      }
      if (element.dataset[datasetKey] === undefined) {
        throw new Error(`${datasetKey} is undefined`);
      }

      return element.dataset[datasetKey] as string;
    };

    const skewToken = getDomValue("marimo-server-token", "token") as SkewToken;
    const userConfig = JSON.parse(
      getDomValue("marimo-user-config", "config"),
    ) as MarimoConfig;
    const marimoVersion = getDomValue("marimo-version", "version");

    return {
      skewToken,
      version: marimoVersion,
      userConfig,
    };
  }

  /**
   * Start the server
   * - If the server is already starting, wait for it to start
   * - If the server is already started, check if it is healthy
   * - If the server is not healthy, stop it and start a new one
   * - If the server is stopped, start it
   */
  async start(): Promise<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    if (this.state === "starting") {
      logger.log("marimo server already starting");
      // If its starting, wait for it to start
      return this.startedPromise.promise;
    }

    if (this.state === "started") {
      if (!this.port) {
        logger.warn("Port not set. Restarting...");
        this.startedPromise = new Deferred();
        await this.stopServer();
        const port = await this.startServer();
        const domValues = await this.fetchMarimoStartupValues(port);
        this.startedPromise.resolve({
          port,
          ...domValues,
        });
        return this.startedPromise.promise;
      }

      // Check it is health, otherwise shutdown and restart
      logger.log("Checking server health...");
      if (!(await this.isHealthy(this.port))) {
        logger.warn("Server not healthy. Restarting...");
        this.startedPromise = new Deferred();
        await this.stopServer();
        const port = await this.startServer();
        const domValues = await this.fetchMarimoStartupValues(port);
        this.startedPromise.resolve({
          port,
          ...domValues,
        });
        return this.startedPromise.promise;
      }

      // Otherwise, it is already running
      logger.log("Server already running at port", this.port);
      return this.startedPromise.promise;
    }

    if (this.state === "stopped") {
      logger.log("Starting server...");
      this.startedPromise = new Deferred();
      const port = await this.startServer();
      const domValues = await this.fetchMarimoStartupValues(port);
      this.startedPromise.resolve({
        port,
        ...domValues,
      });
      return this.startedPromise.promise;
    }

    logger.error("Invalid state", this.state);
    throw new Error("Invalid state");
  }

  restart(): void {
    this.startedPromise = new Deferred();
    this.stopServer().then(() => {
      this.start();
    });
  }

  private async startServer() {
    this.state = "starting";

    // Find open port
    logger.log("Finding open port...");
    const port = await tryPort(Config.port);
    this.port = port;

    if (await this.isHealthy(port)) {
      logger.log(`Found existing server at port ${port}. Reusing`);
      return port;
    }

    // Start server
    logger.log("Starting server at port", port);
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

    logger.log("Server started at port", port);
    this.state = "started";
    return port;
  }

  private async stopServer() {
    this.port = undefined;
    if (this.terminal) {
      logger.log("Stopping server...");
      this.terminal.dispose();
    }
    this.state = "stopped";
  }

  dispose(): void {
    this.otherDisposables.forEach((d) => d.dispose());
  }

  async getActiveSessionIds(): Promise<string[]> {
    if (!this.port) {
      return [];
    }
    const runningNotebooks = await MarimoBridge.getRunningNotebooks(this.port);
    const activeSessions: string[] = [];
    for (const notebook of runningNotebooks.data?.files ?? []) {
      if (notebook.sessionId) {
        activeSessions.push(notebook.sessionId);
      }
    }
    return activeSessions;
  }
}
