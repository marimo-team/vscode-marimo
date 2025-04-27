import { window, workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { execMarimoCommand, getInterpreter } from "../utils/exec";
import type { ServerManager } from "./server-manager";
import { getExtensionVersion, getVscodeVersion } from "../utils/versions";
import { anonymouseId } from "../telemetry";

export class HealthService {
  constructor(private readonly serverManager: ServerManager) {}

  public async isMarimoInstalled(): Promise<{
    isInstalled: boolean;
    version: string;
    path: string | undefined;
  }> {
    try {
      const bytes = await execMarimoCommand(["--version"]);
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
   * Shows an page with diagnostics the extension and server
   */
  public async showDiagnostics() {
    let statusText = "";
    try {
      statusText = await this.printStatusVerbose();
    } catch (error) {
      logger.error("Error showing status:", error);
      statusText = `Error showing status: ${error}`;
    }

    const document = await workspace.openTextDocument({
      content: statusText,
      language: "plaintext",
    });
    await window.showTextDocument(document);
    return document;
  }

  public async printStatusVerbose(): Promise<string> {
    const [{ isInstalled, version, path }, pythonInterpreter] =
      await Promise.all([this.isMarimoInstalled(), getInterpreter()]);

    if (isInstalled) {
      const status = await this.isServerRunning();
      const serverUrl = `${Config.https ? "https" : "http"}://${Config.host}:${status.port}`;

      return [
        "marimo configuration:",
        `\tpython interpreter: ${pythonInterpreter}`,
        isDefaultMarimoPath(path) ? "" : `\tmarimo executable path: ${path}`, // don't show if default
        `\tmarimo version: ${version}`,
        `\textension version: ${getExtensionVersion()}`,
        "\nserver status:",
        status.isRunning
          ? [
              `\trunning on port ${status.port}`,
              `\turl: ${serverUrl}`,
              `\tread port: ${Config.readPort}`,
            ].join("\n")
          : "\tnot running",
        "\nserver configuration:",
        `\thost: ${Config.host}`,
        `\tdefault port: ${Config.port}`,
        `\thttps enabled: ${Config.https}`,
        `\ttoken auth enabled: ${Config.enableToken}`,
        Config.enableToken
          ? `\ttoken password: ${Config.tokenPassword ? "set" : "not set"}`
          : "",
        "\nenvironment settings:",
        `\tsandbox mode: ${Config.sandbox}`,
        `\twatch mode: ${Config.watch}`,
        "\nUI settings:",
        `\tbrowser type: ${Config.browser}`,
        `\tshow terminal: ${Config.showTerminal}`,
        `\tdebug mode: ${Config.debug}`,
        "\nsystem information:",
        `\tplatform: ${process.platform}`,
        `\tanonymous id: ${anonymouseId()}`,
        `\tarchitecture: ${process.arch}`,
        `\tnode version: ${process.version}`,
        `\tvscode version: ${getVscodeVersion()}`,
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
  marimoPath: string | undefined,
  pythonInterpreter: string | undefined,
) {
  return [
    "marimo does not appear to be installed.",
    "",
    "Current configuration:",
    `\tpython interpreter: ${pythonInterpreter || "not set"}`,
    isDefaultMarimoPath(marimoPath)
      ? ""
      : `\tmarimo executable path: ${marimoPath}`, // don't show if default
    "",
    "Troubleshooting steps:",
    `\t1. Verify installation: ${pythonInterpreter} -m marimo`,
    "\t2. Install marimo: pip install marimo",
    "\t3. Check python.defaultInterpreterPath in VS Code settings",
    "\t4. Try creating a new virtual environment",
    "\t5. If using a virtual environment, ensure it's activated",
  ].join("\n");
}

function isDefaultMarimoPath(path: string | undefined) {
  return path === "marimo" || path === undefined;
}
