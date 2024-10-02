import { exec } from "node:child_process";
import { promisify } from "node:util";
import { window } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { getInterpreter } from "../utils/exec";
import type { ServerManager } from "./server-manager";

export class HealthService {
  constructor(private readonly serverManager: ServerManager) {}

  public async isMarimoInstalled(): Promise<{
    isInstalled: boolean;
    version: string;
    path: string;
  }> {
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(`"${Config.marimoPath}" --version`);
      return {
        isInstalled: true,
        version: stdout.trim(),
        path: Config.marimoPath,
      };
    } catch (error) {
      logger.error("Error checking marimo installation:", error);
      return {
        isInstalled: false,
        version: "unknown",
        path: Config.marimoPath,
      };
    }
  }

  public async isServerRunning(): Promise<{
    isRunning: boolean;
    port: number;
  }> {
    return {
      isRunning: this.serverManager.getStatus() === "started",
      port: this.serverManager.getPort() || 0,
    };
  }

  /**
   * Shows an alert with the status of the server
   */
  public async showStatus() {
    await window.showInformationMessage(await this.printStatus(), {
      modal: true,
    });
  }

  public async printStatus(): Promise<string> {
    const { isInstalled, version, path } = await this.isMarimoInstalled();
    const pythonInterpreter = await getInterpreter();

    if (isInstalled) {
      const status = await this.isServerRunning();
      return [
        "marimo is installed",
        `\tmarimo executable path: ${path}`,
        `\tpython interpreter: ${pythonInterpreter}`,
        `\tversion: ${version}`,
        status.isRunning
          ? `\tserver running: port ${status.port}`
          : "\tserver not running",
      ].join("\n");
    }

    return `marimo does not appear to be installed at: ${path}`;
  }
}
