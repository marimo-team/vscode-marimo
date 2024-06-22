import { type ExtensionContext, Uri, commands, env, window, Disposable, workspace } from "vscode";
import { showCommands } from "./commands/show-commands";
import { Config } from "./config";
import { DOCUMENTATION_URL } from "./constants";
import { convertIPyNotebook, convertMarkdownNotebook } from "./convert/convert";
import { MarimoExplorer } from "./explorer/explorer";
import { exportAsCommands } from "./export/export-as-commands";
import { Controllers, withController } from "./launcher/controller";
import { createNewMarimoFile } from "./launcher/new-file";
import { Launcher } from "./launcher/start";
import { logger } from "./logger";
import { createNotebookController, createNotebookDocument, handleOnOpenNotebookDocument, openNotebookDocument } from "./notebook/extension";
import { KernelManager } from "./notebook/kernel-manager";
import { updateStatusBar } from "./ui/status-bar";
import { ServerManager } from "./launcher/server-manager";
import { MarimoNotebookSerializer } from "./notebook/serializer";
import { NOTEBOOK_TYPE } from "./notebook/constants";
import { setExtension } from "./ctx";

const Commands = {
  // Start marimo server (edit)
  edit: "vscode-marimo.edit",
  // Start marimo server (run)
  run: "vscode-marimo.run",
  // Restart marimo server
  restart: "vscode-marimo.restart",
  // Stop server
  stop: "vscode-marimo.stop",
  // Show marimo commands
  showCommands: "vscode-marimo.showCommands",
  // Export notebook as...
  exportAsCommands: "vscode-marimo.exportAsCommands",
  // Open in system browser
  openInBrowser: "vscode-marimo.openInBrowser",
  // Show documentation
  openDocumentation: "vscode-marimo.openDocumentation",
  // Create new marimo file
  newMarimoFile: "vscode-marimo.newMarimoFile",
  // Reload browser
  reloadBrowser: "vscode-marimo.reloadBrowser",
  // Convert Jupyter notebook to marimo notebook
  convertToMarimoApp: "vscode-marimo.convertToMarimoApp",

  createNotebook: "vscode-marimo.newVSCodeNotebook",
  openNotebook: "vscode-marimo.openAsVSCodeNotebook",
};

export async function activate(extension: ExtensionContext) {
  setExtension(extension);
  logger.log("marimo extension is now active!");

  const addDisposable = (...disposable: Disposable[]) =>
    extension.subscriptions.push(...disposable);

  // Services //

  const kernelManager = KernelManager.instance;
  const serverManager = ServerManager.instance;
  serverManager.init(extension);
  addDisposable(kernelManager, serverManager);

  ///// Commands /////

  // These commands all operate on a marimo .py file
  commands.registerCommand(Commands.edit, () =>
    withController(extension, async (controller) => {
      await Launcher.start({ controller, mode: "edit" });
      controller.open();
    }),
  );
  commands.registerCommand(Commands.restart, async () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      await maybeKernel.restart();
      return;
    }

    withController(extension, async (controller) => {
      const mode = controller.currentMode || "edit";
      Launcher.stop(controller);
      await Launcher.start({ controller, mode });
      controller.open();
    });
  });
  commands.registerCommand(Commands.run, () => {
    withController(extension, async (controller) => {
      await Launcher.start({ controller, mode: "run" });
      controller.open();
    });
  });
  commands.registerCommand(Commands.stop, () =>
    withController(extension, async (controller) => {
      Launcher.stop(controller);
    }),
  );

  // These commands operate on the active editor
  // - marimo .py file
  // - notebook editor (marimo-notebook)
  commands.registerCommand(Commands.showCommands, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      showCommands(maybeKernel);
      return;
    }

    withController(extension, async (controller) => {
      showCommands(controller);
    });
  });
  commands.registerCommand(Commands.exportAsCommands, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      exportAsCommands(maybeKernel.fileUri);
      return;
    }

    withController(extension, async (controller) => {
      exportAsCommands(controller.file.uri);
    });
  });
  commands.registerCommand(Commands.openInBrowser, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.openKiosk("system");
      return;
    }

    withController(extension, async (controller) => {
      controller.open("system");
    });
  });
  commands.registerCommand(Commands.reloadBrowser, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.reloadPanel();
      return;
    }

    withController(extension, async (controller) => {
      controller.reloadPanel();
    });
  });

  // These deal with native vscode notebooks
  commands.registerCommand(Commands.createNotebook, async () => {
    await createNotebookDocument();
  });
  commands.registerCommand(Commands.openNotebook, async () => {
    await openNotebookDocument();
  });

  // These commands are standalone
  commands.registerCommand(Commands.openDocumentation, () => {
    env.openExternal(Uri.parse(DOCUMENTATION_URL));
  });
  commands.registerCommand(Commands.newMarimoFile, async () => {
    // create
    await createNewMarimoFile();
    // edit
    withController(extension, async (controller) => {
      await Launcher.start({ controller, mode: "edit" });
      controller.open();
    });
  });

  // These commands operate on an ipynb or md file
  commands.registerCommand(Commands.convertToMarimoApp, async () => {
    // active ipynb file
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const marimoPath = Config.marimoPath;
    if (!marimoPath) {
      window.showErrorMessage("marimo path is not set");
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

  ///// Events /////

  window.onDidCloseTerminal((error) => {
    const controller = Controllers.findWithTerminal(error);
    controller?.dispose();
  });

  window.onDidChangeActiveTextEditor(() => {
    updateStatusBar(extension);
  });

  window.onDidChangeActiveNotebookEditor(() => {
    updateStatusBar(extension);
  });

  workspace.onDidOpenNotebookDocument(async (doc) => {
    await handleOnOpenNotebookDocument(doc, serverManager, kernelManager);
  });

  ///// UI /////

  // Status bar
  updateStatusBar(extension);

  // Sidebar explorer
  new MarimoExplorer(extension);

  // Serializer
  workspace.registerNotebookSerializer(
    NOTEBOOK_TYPE,
    new MarimoNotebookSerializer(kernelManager),
    {
      transientOutputs: true,
    },
  );
}

export async function deactivate() {
  Controllers.disposeAll();
}
