import { type QuickPickItem, Uri, env, window } from "vscode";
import { DOCUMENTATION_URL } from "../constants";
import { exportAsCommands } from "../export/export-as-commands";
import { MarimoController } from "../launcher/controller";
import { Launcher } from "../launcher/start";
import {
  getActiveMarimoFile,
  openMarimoNotebookDocument,
} from "../notebook/extension";
import { Kernel } from "../notebook/kernel";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
  if?: boolean;
}

export async function showCommands(controller: MarimoController | Kernel) {
  let commands: CommandPickItem[] = [];

  if (controller instanceof Kernel) {
    commands = await showKernelCommands(controller);
  }
  if (controller instanceof MarimoController) {
    commands = await showMarimoControllerCommands(controller);
  }

  const filteredCommands = commands.filter((index) => index.if !== false);
  const result = await window.showQuickPick<CommandPickItem>(filteredCommands);

  if (result) {
    result.handler();
  }
}

export function showKernelCommands(kernel: Kernel): CommandPickItem[] {
  return [
    {
      label: "$(split-horizontal) Open outputs in embedded browser",
      description: kernel.relativePath,
      handler() {
        kernel.openKiosk("embedded");
      },
    },
    {
      label: "$(link-external) Open outputs in system browser",
      description: kernel.relativePath,
      handler() {
        kernel.openKiosk("system");
      },
    },
    {
      label: "$(refresh) Restart kernel",
      async handler() {
        await kernel.restart();
      },
    },
    {
      label: "$(question) Show documentation",
      handler() {
        env.openExternal(Uri.parse(DOCUMENTATION_URL));
      },
    },
    {
      label: "$(export) Export notebook as...",
      handler() {
        exportAsCommands(kernel.fileUri);
      },
    },
  ];
}

export function showMarimoControllerCommands(
  controller: MarimoController,
): CommandPickItem[] {
  return [
    // Non-active commands
    {
      label: "$(notebook) Start as VSCode notebook",
      async handler() {
        await openMarimoNotebookDocument(await getActiveMarimoFile());
      },
      if: !controller.active,
    },
    {
      label: "$(zap) Start in marimo editor (edit)",
      async handler() {
        await Launcher.start({ controller, mode: "edit" });
        controller.open();
      },
      if: !controller.active,
    },
    {
      label: "$(remote-explorer-documentation) Start in marimo editor (run)",
      async handler() {
        await Launcher.start({ controller, mode: "run" });
        controller.open();
      },
      if: !controller.active,
    },
    // Active commands
    {
      label: "$(split-horizontal) Open in embedded browser",
      description: controller.url,
      handler() {
        controller.open("embedded");
      },
      if: controller.active,
    },
    {
      label: "$(link-external) Open in system browser",
      description: controller.url,
      handler() {
        controller.open("system");
      },
      if: controller.active,
    },
    {
      label: "$(refresh) Restart marimo kernel",
      async handler() {
        const mode = controller.currentMode || "edit";
        await Launcher.stop(controller);
        await Launcher.start({ mode, controller });
        controller.open();
      },
      if: controller.active,
    },
    {
      label:
        controller.currentMode === "run"
          ? "$(package) Switch to edit mode"
          : "$(package) Switch to run mode",
      async handler() {
        const otherMode = controller.currentMode === "run" ? "edit" : "run";
        await Launcher.stop(controller);
        await Launcher.start({ mode: otherMode, controller });
        controller.open();
      },
      if: controller.active,
    },
    {
      label: "$(terminal) Show Terminal",
      handler() {
        controller.terminal.show();
      },
      if: controller.active,
    },
    {
      label: "$(close) Stop kernel",
      handler() {
        Launcher.stop(controller);
      },
      if: controller.active,
    },

    // Misc commands
    {
      label: "$(question) Show documentation",
      handler() {
        env.openExternal(Uri.parse(DOCUMENTATION_URL));
      },
      if: true,
    },
    {
      label: "$(export) Export notebook as...",
      handler() {
        exportAsCommands(controller.file.uri);
      },
      if: true,
    },
  ];
}
