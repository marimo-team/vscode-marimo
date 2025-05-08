import { workspace } from "vscode";
import { Config } from "./config";
import { getGlobalState } from "./ctx";
import { logger } from "./logger";
import { getExtensionVersion, getVscodeVersion } from "./utils/versions";

export function trackEvent(
  event: "vscode-lifecycle",
  data: { action: "activate" | "deactivate" },
): void;
export function trackEvent(
  event: "vscode-command",
  data: { command: string },
): void;
export function trackEvent(
  event: "vscode-configuration",
  data: { key: string; value: string },
): void;
export function trackEvent(event: string, data: Record<string, unknown>): void {
  if (!Config.telemetry) {
    return;
  }

  try {
    const metadata = {
      anonymous_id: anonymouseId(),
      extension_version: getExtensionVersion(),
      vscode_version: getVscodeVersion(),
      platform: process.platform,
      architecture: process.arch,
      node_version: process.version,
    };
    // Fire and forget
    void sendEvent(event, data, metadata).catch((error) => {
      logger.info("Error sending telemetry event:", error);
    });
  } catch (error) {
    logger.info("Error sending telemetry event:", error);
  }
}

async function sendEvent(
  event: string,
  data: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  const res = await fetch("https://metrics.marimo.app/api/v1/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event, data, metadata }),
  });
  if (!res.ok) {
    logger.info("Error sending telemetry event:", res.statusText);
  }
}

export function anonymouseId(): string {
  try {
    const globalState = getGlobalState();
    let id = globalState.get<string>("telemetry.anonymousId");
    if (!id) {
      id = crypto.randomUUID();
      void globalState.update("telemetry.anonymousId", id);
    }
    return id;
  } catch (error) {
    return "unknown";
  }
}

export function setupConfigTelemetry(): void {
  workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("marimo.telemetry")) {
      const enabled = Config.telemetry;
      trackEvent("vscode-configuration", {
        key: "marimo.telemetry",
        value: enabled.toString(),
      });
    }
  });
}
