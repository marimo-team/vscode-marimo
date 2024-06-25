import {
  type Disposable,
  type ExtensionContext,
  ProgressLocation,
  Uri,
  commands,
  env,
  window,
  workspace,
} from "vscode";
import { showCommands } from "./commands/show-commands";
import { DOCUMENTATION_URL } from "./constants";
import { convertIPyNotebook, convertMarkdownNotebook } from "./convert/convert";
import { setExtension } from "./ctx";
import {
  MarimoExplorer,
  MarimoRunningKernelsProvider,
} from "./explorer/explorer";
import { exportAsCommands } from "./export/export-as-commands";
import { Controllers, withController } from "./launcher/controller";
import { createNewMarimoFile } from "./launcher/new-file";
import { ServerManager } from "./launcher/server-manager";
import { Launcher } from "./launcher/start";
import { logger } from "./logger";
import { NOTEBOOK_TYPE } from "./notebook/constants";
import {
  getActiveMarimoFile,
  handleOnOpenNotebookDocument,
  openMarimoNotebookDocument,
} from "./notebook/extension";
import { KernelManager } from "./notebook/kernel-manager";
import { MarimoNotebookSerializer } from "./notebook/serializer";
import { statusBarManager } from "./ui/status-bar";

const Commands = {
  // Start marimo kernel (edit)
  edit: "vscode-marimo.edit",
  // Start marimo kernel (run)
  run: "vscode-marimo.run",
  // Restart marimo kernel
  restartKernel: "vscode-marimo.restartKernel",
  // Stop kernel
  stopKernel: "vscode-marimo.stopKernel",
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

  // Start server
  startServer: "vscode-marimo.startServer",
  // Stop server
  stopServer: "vscode-marimo.stopServer",

  // Native vscode notebook commands
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
  serverManager.init();
  addDisposable(kernelManager, serverManager);

  ///// Commands /////
  // These commands are for the server
  commands.registerCommand(Commands.startServer, async () => {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Starting marimo server...",
        cancellable: false,
      },
      async () => {
        // Start server
        await serverManager.start();
      },
    );
  });
  commands.registerCommand(Commands.stopServer, async () => {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Stopping marimo server...",
        cancellable: false,
      },
      async () => {
        // Close all marimo notebook editors
        const editors = window.visibleNotebookEditors.filter(
          (editor) => editor.notebook.notebookType === NOTEBOOK_TYPE,
        );
        for (const editor of editors) {
          await window.showTextDocument(editor.notebook.uri, {
            preview: false,
          });
          await commands.executeCommand("workbench.action.closeActiveEditor");
        }
        // Stop server
        await serverManager.stopServer();
        // Refresh explorer
        MarimoRunningKernelsProvider.refresh();
      },
    );
  });

  // These commands all operate on a marimo .py file
  commands.registerCommand(Commands.edit, () =>
    withController(async (controller) => {
      await Launcher.start({ controller, mode: "edit" });
      controller.open();
    }),
  );
  commands.registerCommand(Commands.restartKernel, async () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      await maybeKernel.restart();
      await maybeKernel.openKiosk();
      return;
    }

    withController(async (controller) => {
      const mode = controller.currentMode || "edit";
      Launcher.stop(controller);
      await Launcher.start({ controller, mode });
      controller.open();
    });
  });
  commands.registerCommand(Commands.run, () => {
    withController(async (controller) => {
      await Launcher.start({ controller, mode: "run" });
      controller.open();
    });
  });
  commands.registerCommand(Commands.stopKernel, () =>
    withController(async (controller) => {
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

    withController(async (controller) => {
      showCommands(controller);
    });
  });
  commands.registerCommand(Commands.exportAsCommands, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      exportAsCommands(maybeKernel.fileUri);
      return;
    }

    withController(async (controller) => {
      exportAsCommands(controller.file.uri);
    });
  });
  commands.registerCommand(Commands.openInBrowser, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.openKiosk("system");
      return;
    }

    withController(async (controller) => {
      controller.open("system");
    });
  });
  commands.registerCommand(Commands.reloadBrowser, () => {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.reloadPanel();
      return;
    }

    withController(async (controller) => {
      controller.reloadPanel();
    });
  });

  // These deal with native vscode notebooks
  commands.registerCommand(Commands.openNotebook, async () => {
    await openMarimoNotebookDocument(await getActiveMarimoFile());
  });

  // These commands are standalone
  commands.registerCommand(Commands.openDocumentation, () => {
    env.openExternal(Uri.parse(DOCUMENTATION_URL));
  });
  commands.registerCommand(Commands.newMarimoFile, async () => {
    // create
    await createNewMarimoFile();
    // edit
    await openMarimoNotebookDocument(await getActiveMarimoFile());
  });

  // These commands operate on an ipynb or md file
  commands.registerCommand(Commands.convertToMarimoApp, async () => {
    // active ipynb file
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (filePath.endsWith(".ipynb")) {
      await convertIPyNotebook(filePath);
      return;
    }
    if (filePath.endsWith(".md")) {
      // Check 'marimo-version:' is in the markdown file
      const content = editor.document.getText();
      if (!content.includes("marimo-version:")) {
        await convertMarkdownNotebook(filePath);
        return;
      }
    }

    window.showErrorMessage("Not a notebook file");
  });

  ///// Events /////

  window.onDidCloseTerminal((terminal) => {
    const controller = Controllers.findWithTerminal(terminal);
    controller?.dispose();
  });

  workspace.onDidOpenNotebookDocument(async (doc) => {
    await handleOnOpenNotebookDocument(doc, serverManager, kernelManager);
  });

  statusBarManager.start();

  // Sidebar explorer
  const explorer = new MarimoExplorer(extension);

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
