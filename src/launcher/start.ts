import { window } from "vscode";
import { Config } from "./config";
import { tryPort } from "./utils";
import { disposeStatusBar } from "./status-bar";
import { MarimoController, AppMode } from "./controller";

export async function start({
  controller,
  mode,
}: {
  controller: MarimoController;
  mode: AppMode;
}) {
  // If its already running and the mode is the same, do nothing
  if (controller.currentMode === mode && controller.active) {
    const button = "Open";
    if (Config.showTerminal) {
      controller.terminal.show();
    }
    window
      .showInformationMessage(
        `${controller.appName} is already running in ${mode} mode`,
        button,
      )
      .then((response) => {
        if (response === button) {
          controller.open();
        }
      });
    return;
  }

  // Restart if the mode is different
  if (mode !== controller.currentMode && controller.active) {
    controller.dispose();
  }

  // Start with the current port if available
  // Make sure the port is free, otherwise try the next one
  const port = await tryPort(controller.port || Config.port);

  await controller.start(mode, port);
}

export function stop(controller: MarimoController) {
  controller.dispose();
  disposeStatusBar();
}
