import type { ExtensionContext } from "vscode";

export let extension: ExtensionContext;

export function setExtension(ext: ExtensionContext) {
  extension = ext;
}

export function getGlobalState() {
  if (!extension) {
    throw new Error("Extension not set");
  }
  return extension.globalState;
}
