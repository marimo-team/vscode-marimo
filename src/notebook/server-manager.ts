import { JSDOM } from "jsdom";
import type * as vscode from "vscode";
import { Config, composeUrl } from "../launcher/config";
import { ping, tryPort } from "../launcher/utils";
import { logger } from "../logger";
import { Kernel } from "./kernel";
import { marimoEdit } from "./marimo/exec";
import type { MarimoConfig, SkewToken } from "./marimo/types";
import { Deferred } from "./utils/deferred";

/**
 * Manages a single instance of a marimo server
 */
export class ServerManager implements vscode.Disposable {
  private otherDisposables: vscode.Disposable[] = [];
  private state: "stopped" | "starting" | "started" = "stopped";
  private port: number | undefined;
  private server: vscode.Disposable | undefined;
  private startedPromise: Deferred<{
    port: number;
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> = new Deferred();

  private async isHealthy(port: number): Promise<boolean> {
    try {
      const health = await fetch(`${composeUrl(port)}/health`);
      return health.ok;
    } catch {
      return false;
    }
  }

  private async fetchMarimoStartupValues(port: number): Promise<{
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
  }> {
    const response = await fetch(`${composeUrl(port)}`);
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    const skewToken = Array.from(
      doc.getElementsByTagName("marimo-server-token"),
    )[0] as HTMLElement;
    const userConfig = Array.from(
      doc.getElementsByTagName("marimo-user-config"),
    )[0] as HTMLElement;
    const marimoVersion = Array.from(
      doc.getElementsByTagName("marimo-version"),
    )[0] as HTMLElement;
    if (!skewToken) {
      throw new Error("Could not find skew token");
    }
    if (skewToken.dataset.token === undefined) {
      throw new Error("Skew token is undefined");
    }
    if (!userConfig) {
      throw new Error("Could not find user config");
    }
    if (userConfig.dataset.config === undefined) {
      throw new Error("User config is undefined");
    }
    if (!marimoVersion) {
      throw new Error("Could not find marimo version");
    }
    if (marimoVersion.dataset.version === undefined) {
      throw new Error("Marimo version is undefined");
    }
    return {
      skewToken: skewToken.dataset.token as SkewToken,
      version: marimoVersion.dataset.version,
      userConfig: JSON.parse(userConfig.dataset.config),
    };
  }

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
    this.server = await marimoEdit(port, {
      onClose: () => {
        this.port = undefined;
        this.state = "stopped";
      },
    });

    logger.log("Server started at port", port);
    this.state = "started";
    return port;
  }

  private async stopServer() {
    this.port = undefined;
    if (this.server) {
      logger.log("Stopping server...");
      await this.server.dispose();
    }
    this.state = "stopped";
  }

  dispose(): void {
    this.otherDisposables.forEach((d) => d.dispose());
  }
}
