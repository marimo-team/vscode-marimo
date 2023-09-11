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
  get port() {
    return getConfig("port", 2718);
  },
  get host() {
    return "localhost";
  },
  get https() {
    return false;
  },
};

export function composeUrl(port: number) {
  return `${Config.https ? "https" : "http"}://${Config.host}:${port}`;
}
