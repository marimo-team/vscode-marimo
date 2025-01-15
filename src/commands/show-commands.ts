import {
  type QuickPickItem,
  QuickPickItemKind,
  Uri,
  commands,
  env,
  window,
} from "vscode";
import {
  DISCORD_URL,
  DOCUMENTATION_URL,
  EXTENSION_DISPLAY_NAME,
  EXTENSION_PACKAGE,
} from "../constants";
import { exportAsCommands } from "../export/export-as-commands";
import { MarimoController } from "../launcher/controller";
import { Launcher } from "../launcher/start";
import {
  getActiveMarimoFile,
  openMarimoNotebookDocument,
} from "../notebook/extension";
import { Kernel } from "../notebook/kernel";
import type { ServerManager } from "../services/server-manager";
import { tutorialCommands } from "./tutorial-commands";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
  if?: boolean;
}

const SEPARATOR = {
  label: "",
  kind: QuickPickItemKind.Separator,
  handler: () => {},
};

export async function showCommands(
  controller: MarimoController | Kernel | undefined,
  serverManager: ServerManager,
) {
  let commands: CommandPickItem[] = [];

  if (controller instanceof Kernel) {
    commands = await showKernelCommands(controller);
  }
  if (controller instanceof MarimoController) {
    commands = await showMarimoControllerCommands(controller);
  }

  commands.push(...miscCommands(serverManager));

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
      async handler() {
        await kernel.openKiosk("embedded");
      },
    },
    {
      label: "$(link-external) Open outputs in system browser",
      description: kernel.relativePath,
      async handler() {
        await kernel.openKiosk("system");
      },
    },
    SEPARATOR,
    {
      label: "$(refresh) Restart kernel",
      async handler() {
        await kernel.restart();
        await kernel.openKiosk();
      },
    },
    {
      label: "$(export) Export notebook as...",
      handler() {
        exportAsCommands(kernel.fileUri);
      },
    },
    SEPARATOR,
  ];
}

export async function showMarimoControllerCommands(
  controller: MarimoController,
): Promise<CommandPickItem[]> {
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
      label: "$(preview) Start in marimo editor (run)",
      async handler() {
        await Launcher.start({ controller, mode: "run" });
        controller.open();
      },
      if: !controller.active,
    },
    SEPARATOR,
    // Active commands
    {
      label: "$(split-horizontal) Open in embedded browser",
      description: await controller.url(),
      handler() {
        controller.open("embedded");
      },
      if: controller.active,
    },
    {
      label: "$(link-external) Open in system browser",
      description: await controller.url(),
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
    {
      label: "$(export) Export notebook as...",
      handler() {
        exportAsCommands(controller.file.uri);
      },
    },

    SEPARATOR,
  ];
}

export function miscCommands(serverManager: ServerManager): CommandPickItem[] {
  return [
    {
      label: "$(question) View marimo documentation",
      handler() {
        env.openExternal(Uri.parse(DOCUMENTATION_URL));
      },
    },
    {
      label: "$(bookmark) View tutorials",
      async handler() {
        await tutorialCommands();
      },
    },
    {
      label: "$(comment-discussion) Join Discord community",
      handler() {
        env.openExternal(Uri.parse(DISCORD_URL));
      },
    },
    {
      label: "$(settings) Edit settings",
      handler() {
        void commands.executeCommand("workbench.action.openSettings", "marimo");
      },
    },
    {
      label: `$(info) Server status: ${serverManager.getStatus()}`,
      handler: async () => {
        // Open output panel with channel 'marimo'
        await commands.executeCommand(
          `workbench.action.output.show.${EXTENSION_PACKAGE.fullName}.${EXTENSION_DISPLAY_NAME}`,
        );
        await commands.executeCommand(
          "marimo-explorer-running-applications.focus",
        );
      },
    },
  ];
}
