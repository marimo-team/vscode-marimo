import * as vscode from "vscode";
import { logger } from "../logger";
import {
  type NotebookMetadata,
  getNotebookMetadata,
  setNotebookMetadata,
} from "./common/metadata";
import { KernelManager, NOTEBOOK_TYPE } from "./kernel-manager";
import { MarimoNotebookSerializer } from "./serializer";
import { ServerManager } from "./server-manager";

const PYTHON_LANGUAGE = "python";

const Commands = {
  createNotebook: "vscode-marimo.createVSCodeNotebook",
  openNotebook: "vscode-marimo.openAsVSCodeNotebook",
};

export function activate(context: vscode.ExtensionContext) {
  const addDisposable = (...disposable: vscode.Disposable[]) =>
    context.subscriptions.push(...disposable);

  logger.log("Creating notebook controller");
  const nbController = vscode.notebooks.createNotebookController(
    "marimo-kernel",
    NOTEBOOK_TYPE,
    "marimo kernel",
  );
  addDisposable(nbController);

  const kernelManager = new KernelManager(nbController);
  const serverManager = new ServerManager();
  addDisposable(kernelManager, serverManager);

  // Register a command that creates a new Notebook
  addDisposable(
    vscode.commands.registerCommand(Commands.createNotebook, async () => {
      const data = new vscode.NotebookData([]);
      setNotebookMetadata(data, {
        isNew: true,
        loaded: false,
      });

      // Create NotebookDocument and open it
      const doc = await vscode.workspace.openNotebookDocument(
        NOTEBOOK_TYPE,
        data,
      );

      // Open Notebook
      logger.log("Opening new marimo notebook");
      await vscode.window.showNotebookDocument(doc);
    }),
  );

  // Register a command that opens an existing Notebook
  addDisposable(
    vscode.commands.registerCommand(Commands.openNotebook, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return;
      }

      const document = editor.document;
      if (document.languageId !== PYTHON_LANGUAGE) {
        vscode.window.showErrorMessage("Not a Python file!");
        return;
      }
      const containsMarimoApp = document.getText().includes("marimo.App");
      if (!containsMarimoApp) {
        vscode.window.showErrorMessage("No marimo.App found!");
        return;
      }

      // If we had a special ipynb
      // const filePath = document.uri.fsPath;
      // // Open notebook document
      // const doc = await vscode.workspace.openNotebookDocument(
      //   vscode.Uri.file(filePath),
      // );

      // If doesn't end in mo.py, create a temporary file in /var/folders
      // let filePath = document.uri.fsPath;
      // if (!document.fileName.endsWith("mo.py")) {
      //   const tempy = await import("tempy");
      //   const tempFilePath = tempy.temporaryFile({ extension: "mo.py" });
      //   console.log("Creating temporary file", tempFilePath);
      //   await vscode.workspace.fs.copy(
      //     document.uri,
      //     vscode.Uri.file(tempFilePath),
      //   );
      //   filePath = tempFilePath;
      // }

      // Create data
      const data = new vscode.NotebookData([]);
      setNotebookMetadata(data, {
        isNew: false,
        loaded: false,
        file: document.uri.fsPath,
      });

      // Open notebook
      logger.log("Opening existing marimo notebook");
      await vscode.workspace.openNotebookDocument(document.uri);
    }),
  );

  addDisposable(
    vscode.workspace.onDidOpenNotebookDocument(async (doc) => {
      logger.log("Opened notebook document", doc.notebookType);
      if (doc.notebookType !== NOTEBOOK_TYPE) {
        logger.warn("Not a marimo notebook", doc.notebookType);
        return;
      }

      const metadata = getNotebookMetadata(doc);

      // Show the notebook, if not shown
      try {
        await vscode.window.showNotebookDocument(doc);
      } catch {
        // Do nothing
      }

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Starting marimo server...",
        cancellable: false,
      }, async (progress) => {
        // Start Marimo server
        logger.log("Checking server...");
        const { port, skewToken, userConfig, version } =
          await serverManager.start();
        // Create Kernel
        const kernel = kernelManager.createKernel({
          port,
          uri: metadata.isNew ? "__new__" : doc.uri,
          skewToken,
          version,
          userConfig,
          notebookDoc: doc,
        });
        addDisposable(kernel);

        // Edit metadata
        const nextMetadata: NotebookMetadata = {
          ...metadata,
          port: port,
          key: kernel.kernelKey,
          loaded: true,
        };
        const nbEdit = vscode.NotebookEdit.updateNotebookMetadata(nextMetadata);
        const edit2 = new vscode.WorkspaceEdit();
        edit2.set(doc.uri, [nbEdit]);
        await vscode.workspace.applyEdit(edit2);

        progress.report({ message: "Initializing kernel..." });
        // Start the kernel
        await kernel.start();
      });
    }),
  );

  // Register the Notebook serializer
  addDisposable(
    vscode.workspace.registerNotebookSerializer(
      NOTEBOOK_TYPE,
      new MarimoNotebookSerializer(kernelManager),
      {
        transientOutputs: true,
      },
    ),
  );
}
