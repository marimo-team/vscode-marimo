import {
  type ExtensionContext,
  Uri,
  commands,
  env,
  window,
  workspace,
} from "vscode";
import { DOCUMENTATION_URL } from "./constants";
import { convertIPyNotebook, convertMarkdownNotebook } from "./convert/convert";
import { MarimoExplorer } from "./explorer/explorer";
import { Config } from "./launcher/config";
import { Controllers, withController } from "./launcher/controller";
import { createNewMarimoFile } from "./launcher/new-file";
import { showCommands } from "./launcher/show-commands";
import { start, stop } from "./launcher/start";
import { updateStatusBar } from "./launcher/status-bar";
import { logger } from "./logger";

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
  commands.registerCommand("vscode-marimo.newMarimoFile", async () => {
    // create
    await createNewMarimoFile();
    // edit
    withController(extension, async (controller) => {
      await start({ controller, mode: "edit" });
      controller.open();
    });
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

    const marimoPath = Config.marimoPath;
    if (!marimoPath) {
      window.showErrorMessage("Marimo path is not set");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (filePath.endsWith(".ipynb")) {
      await convertIPyNotebook(filePath, marimoPath);
      return;
    }
    if (filePath.endsWith(".md")) {
      // Check 'marimo-version:' is in the markdown file
      const content = editor.document.getText();
      if (!content.includes("marimo-version:")) {
        await convertMarkdownNotebook(filePath, marimoPath);
      }
    }

    window.showErrorMessage("Not a notebook file");
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
