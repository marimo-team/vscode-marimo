import { Uri, env, workspace } from "vscode";
import { logger } from "./logger";

export function getConfig<T>(key: string): T | undefined;
export function getConfig<T>(key: string, v: T): T;
export function getConfig<T>(key: string, v?: T) {
  return workspace.getConfiguration().get(`marimo.${key}`, v) ?? v;
}

export interface Config {
  readonly root: string;
  readonly browser: "system" | "embedded";
  readonly showTerminal: boolean;
  readonly debug: boolean;
  readonly pythonPath: string | undefined;
  readonly port: number;
  readonly readPort: number;
  readonly host: string;
  readonly marimoPath: string | undefined;
  readonly enableToken: boolean;
  readonly tokenPassword: string | undefined;
  readonly https: boolean;
  readonly sandbox: boolean;
  readonly watch: boolean;
}

/**
 * Configuration options for the marimo extension.
 * These options can be set in the user's settings.json file.
 */
export const Config = {
  get root() {
    return workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  },
  // Browser settings
  /**
   * The type of browser to use for opening marimo apps.
   * @default "embedded"
   */
  get browser(): "embedded" | "system" {
    return getConfig("browserType", "embedded");
  },

  // Server settings
  /**
   * The port to use for the marimo server.
   * @default 2818
   */
  get port(): number {
    return getConfig("port", 2818);
  },

  get readPort() {
    if (typeof Config.port === "string") {
      return Number.parseInt(Config.port) + 10;
    }
    return Config.port + 10;
  },

  /**
   * The hostname to use for the marimo server.
   * @default "localhost"
   */
  get host(): string {
    return getConfig("host", "localhost") || "localhost";
  },

  /**
   * Whether to use HTTPS for the marimo server.
   * @default false
   */
  get https(): boolean {
    return getConfig("https", false);
  },

  // Authentication settings
  /**
   * Whether to enable token authentication for the marimo server.
   * @default false
   */
  get enableToken(): boolean {
    return getConfig("enableToken", false);
  },

  /**
   * The token password to use for authentication.
   * @default ""
   */
  get tokenPassword(): string {
    return getConfig("tokenPassword", "");
  },

  // Debug settings
  /**
   * Whether to enable debug mode.
   * @default false
   */
  get debug(): boolean {
    return getConfig("debug", false);
  },

  // Python settings
  /**
   * The path to the Python interpreter to use.
   * @default undefined (use the default Python interpreter)
   */
  get pythonPath(): string | undefined {
    return getConfig("pythonPath");
  },

  /**
   * The path to the marimo package to use.
   * @default undefined (use the default marimo package)
   */
  get marimoPath(): string | undefined {
    const path: string | undefined = getConfig("marimoPath");
    // Ignore just 'marimo'
    if (path === "marimo") {
      return undefined;
    }
    return path;
  },

  // UI settings
  /**
   * Whether to show the terminal when the server starts.
   * @default true or when debug is enabled
   */
  get showTerminal(): boolean {
    return getConfig("showTerminal", true) || Config.debug;
  },

  /**
   * Whether to always start marimo in sandbox mode.
   * @default false
   */
  get sandbox(): boolean {
    return getConfig("sandbox", false);
  },

  /**
   * Whether to always start marimo with the --watch flag.
   * @default true
   */
  get watch(): boolean {
    return getConfig("watch", true);
  },
};

export async function composeUrl(port: number): Promise<string> {
  const url = `${Config.https ? "https" : "http"}://${Config.host}:${port}/`;
  try {
    const externalUri = await env.asExternalUri(Uri.parse(url));
    const externalUrl = externalUri.toString();
    if (externalUrl !== url) {
      logger.info("Mapping to external url", externalUrl, "from", url);
    }
    return externalUrl;
  } catch (e) {
    logger.error("Failed to create external url", url, e);
    return url;
  }
}

export async function composeWsUrl(port: number): Promise<string> {
  const url = `${Config.https ? "wss" : "ws"}://${Config.host}:${port}/`;
  try {
    const externalUri = await env.asExternalUri(Uri.parse(url));
    const externalUrl = externalUri.toString();
    if (externalUrl !== url) {
      logger.info("Mapping to external url", externalUrl, "from", url);
    }
    return externalUrl;
  } catch (e) {
    logger.error("Failed to create external url", url, e);
    return url;
  }
}
