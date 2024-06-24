import { window } from "vscode";
import { Config } from "../config";
import { statusBarManager } from "../ui/status-bar";
import { tryPort } from "../utils/network";
import type { AppMode, MarimoController } from "./controller";

async function start({
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

  const defaultPort = mode === 'run' ? Config.readPort : Config.port;

  // Start with the current port if available
  // Make sure the port is free, otherwise try the next one
  const port = await tryPort(controller.port || defaultPort);
  window.showInformationMessage(
    `Starting ${controller.appName} in ${mode} mode (port: ${port})`,
  );

  await controller.start(mode, port);
}

function stop(controller: MarimoController) {
  controller.dispose();
  statusBarManager.update();
}

export const Launcher = {
  start,
  stop,
};
