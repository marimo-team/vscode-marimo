import { exec } from "node:child_process";
import { promisify } from "node:util";
import { window } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { execPython, getInterpreter } from "../utils/exec";
import type { ServerManager } from "./server-manager";

export class HealthService {
  constructor(private readonly serverManager: ServerManager) {}

  public async isMarimoInstalled(): Promise<{
    isInstalled: boolean;
    version: string;
    path: string;
  }> {
    try {
      const bytes = await execPython([Config.marimoPath, "--version"]);
      const stdout = bytes.toString();
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
    await window.showInformationMessage(await this.printStatusVerbose(), {
      modal: true,
    });
  }

  public async printStatusVerbose(): Promise<string> {
    const [{ isInstalled, version, path }, pythonInterpreter] =
      await Promise.all([this.isMarimoInstalled(), getInterpreter()]);

    if (isInstalled) {
      const status = await this.isServerRunning();
      return [
        "marimo configuration:",
        `\tpython interpreter: ${pythonInterpreter}`,
        path === "marimo" ? "" : `\tmarimo executable path: ${path}`, // don't show if default
        `\tversion: ${version}`,
        "",
        "server status:",
        status.isRunning ? `\trunning on port ${status.port}` : "\tnot running",
        "",
        "configuration:",
        `\thost: ${Config.host}`,
        `\tdefault port: ${Config.port}`,
        `\tread port: ${Config.readPort}`,
        `\thttps enabled: ${Config.https}`,
        `\ttoken auth enabled: ${Config.enableToken}`,
        `\tsandbox mode: ${Config.sandbox}`,
        `\tbrowser type: ${Config.browser}`,
        `\tshow terminal: ${Config.showTerminal}`,
        `\tdebug mode: ${Config.debug}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    return troubleShootingMessage(path, pythonInterpreter);
  }

  public async printStatus(): Promise<string> {
    const [{ isInstalled, version, path }, pythonInterpreter] =
      await Promise.all([this.isMarimoInstalled(), getInterpreter()]);

    if (isInstalled) {
      const status = await this.isServerRunning();
      return [
        "marimo is installed",
        path === "marimo" ? "" : `\tmarimo executable path: ${path}`, // don't show if default
        `\tpython interpreter: ${pythonInterpreter}`,
        `\tversion: ${version}`,
        status.isRunning
          ? `\tserver running: port ${status.port}`
          : "\tserver not running",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return troubleShootingMessage(path, pythonInterpreter);
  }
}

function troubleShootingMessage(
  marimoPath: string,
  pythonInterpreter: string | undefined,
) {
  return [
    "marimo does not appear to be installed.",
    "",
    "Current configuration:",
    `\tpython interpreter: ${pythonInterpreter || "not set"}`,
    marimoPath === "marimo" ? "" : `\tmarimo executable path: ${marimoPath}`, // don't show if default
    "",
    "Troubleshooting steps:",
    `\t1. Verify installation: ${pythonInterpreter} -m ${marimoPath}`,
    "\t2. Install marimo: pip install marimo",
    "\t3. Check python.defaultInterpreterPath in VS Code settings",
    "\t4. Try creating a new virtual environment",
    "\t5. If using a virtual environment, ensure it's activated",
  ].join("\n");
}
