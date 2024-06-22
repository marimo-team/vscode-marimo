import { ExtensionContext } from "vscode";

export let extension: ExtensionContext;

export function setExtension(extension: ExtensionContext) {
  extension = extension;
}
