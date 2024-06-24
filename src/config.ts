import { workspace } from "vscode";

export function getConfig<T>(key: string): T | undefined;
export function getConfig<T>(key: string, v: T): T;
export function getConfig<T>(key: string, v?: T) {
  return workspace.getConfiguration().get(`marimo.${key}`, v);
}

export const Config = {
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
    return getConfig("pythonPath");
  },
  get port() {
    return getConfig("port", 2718);
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

export function composeUrl(port: number) {
  return `${Config.https ? "https" : "http"}://${Config.host}:${port}`;
}
