import { commands, env, ExtensionContext, Uri, window } from "vscode";
import { start, stop } from "./launcher/start";
import { updateStatusBar } from "./launcher/status-bar";
import { showCommands } from "./launcher/show-commands";
import { Controllers, withController } from "./launcher/controller";
import { logger } from "./logger";
import { MarimoExplorer } from "./explorer/explorer";
import { DOCUMENTATION_URL } from "./constants";
import { convertNotebook } from "./convert/convert";

export async function activate(extension: ExtensionContext) {
  logger.log("marimo extension is now active!");

  // These commands all operate on the current file
  commands.registerCommand("vscode-marimo.edit", () =>
    withController(extension, async (controller) => {
      await start({ controller, mode: "edit" });
      controller.open();
    }),
  );
  commands.registerCommand("vscode-marimo.restart", () => {
    withController(extension, async (controller) => {
      const mode = controller.currentMode || "edit";
      stop(controller);
      await start({ controller, mode });
      controller.open();
    });
  });
  commands.registerCommand("vscode-marimo.run", () => {
    withController(extension, async (controller) => {
      await start({ controller, mode: "run" });
      controller.open();
    });
  });
  commands.registerCommand("vscode-marimo.stop", () =>
    withController(extension, async (controller) => {
      stop(controller);
    }),
  );
  commands.registerCommand("vscode-marimo.showCommands", () => {
    withController(extension, async (controller) => {
      showCommands(controller);
    });
  });
  commands.registerCommand("vscode-marimo.openInBrowser", () => {
    withController(extension, async (controller) => {
      controller.open("system");
    });
  });
  commands.registerCommand("vscode-marimo.openDocumentation", () => {
    env.openExternal(Uri.parse(DOCUMENTATION_URL));
  });
  commands.registerCommand("vscode-marimo.reloadBrowser", () => {
    withController(extension, async (controller) => {
      controller.reloadPanel();
    });
  });
  commands.registerCommand("vscode-marimo.convertToMarimoApp", async () => {
    // active ipynb file
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (!filePath.endsWith(".ipynb")) {
      window.showErrorMessage("Not a notebook file");
      return;
    }

    await convertNotebook(filePath);
  });

  window.onDidCloseTerminal((error) => {
    const controller = Controllers.findWithTerminal(error);
    controller?.dispose();
  });

  window.onDidChangeActiveTextEditor(() => {
    updateStatusBar(extension);
  });

  updateStatusBar(extension);

  new MarimoExplorer(extension);
}

export async function deactivate() {
  Controllers.disposeAll();
}
