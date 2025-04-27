import { extensions } from "vscode";
import { EXTENSION_PACKAGE } from "../constants";
import { logger } from "../logger";
import { version as vscodeVersion } from "vscode";

export function getExtensionVersion(): string {
  try {
    const extension = extensions.getExtension(EXTENSION_PACKAGE.fullName);
    return extension?.packageJSON.version || "unknown";
  } catch (error) {
    logger.error("Error getting extension version:", error);
    return "unknown";
  }
}

export function getVscodeVersion(): string {
  return vscodeVersion;
}
