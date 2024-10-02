import { Uri, env, workspace } from "vscode";
import { logger } from "./logger";

export function getConfig<T>(key: string): T | undefined;
export function getConfig<T>(key: string, v: T): T;
export function getConfig<T>(key: string, v?: T) {
  return workspace.getConfiguration().get(`marimo.${key}`, v);
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
  readonly marimoPath: string;
  readonly enableToken: boolean;
  readonly tokenPassword: string | undefined;
  readonly https: boolean;
}

export const Config: Config = {
  get root() {
    return workspace.workspaceFolders?.[0]?.uri?.fsPath || "";
  },
  get browser() {
    return getConfig<"system" | "embedded">("browserType", "embedded");
  },
  get showTerminal() {
    return getConfig("showTerminal", false);
  },
  get debug() {
    return getConfig("debug", false);
  },
  get pythonPath() {
    return getConfig<string>("pythonPath");
  },
  get port() {
    return getConfig("port", 2818);
  },
  get readPort() {
    if (typeof Config.port === "string") {
      return Number.parseInt(Config.port) + 10;
    }
    return Config.port + 10;
  },
  get host() {
    return "localhost";
  },
  get marimoPath() {
    return getConfig("marimoPath", "marimo");
  },
  get enableToken() {
    return getConfig("enableToken", false);
  },
  get tokenPassword() {
    return getConfig<string>("tokenPassword");
  },
  get https() {
    return false;
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
