import { QuickPickItem, window } from "vscode";
import { start, stop } from "./start";
import { MarimoController } from "./controller";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
  if: boolean;
}

export async function showCommands(controller: MarimoController) {
  const commands: CommandPickItem[] = [
    {
      label: "$(zap) Start marimo server (edit)",
      async handler() {
        await start({ controller, mode: "edit" });
        controller.open();
      },
      if: !controller.active,
    },
    {
      label: "$(remote-explorer-documentation) Start marimo server (run)",
      async handler() {
        await start({ controller, mode: "run" });
        controller.open();
      },
      if: !controller.active,
    },
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
      label: `$(refresh) Restart marimo server`,
      async handler() {
        const mode = controller.currentMode || "edit";
        await stop(controller);
        await start({ mode, controller });
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
        await stop(controller);
        await start({ mode: otherMode, controller });
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
      label: "$(close) Stop server",
      handler() {
        stop(controller);
      },
      if: controller.active,
    },
  ];

  const filteredCommands = commands.filter((index) => index.if !== false);
  const result = await window.showQuickPick<CommandPickItem>(filteredCommands);

  if (result) {
    result.handler();
  }
}
