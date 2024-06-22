import * as vscode from "vscode";
import { logger } from "../logger";
import {
  type NotebookMetadata,
  getNotebookMetadata,
  setNotebookMetadata,
} from "./common/metadata";
import {
  NOTEBOOK_CONTROLLER_ID,
  NOTEBOOK_TYPE,
  PYTHON_LANGUAGE_ID,
} from "./constants";
import { KernelManager } from "./kernel-manager";
import { ServerManager } from "../launcher/server-manager";
import { updateStatusBar } from "../ui/status-bar";

export function createNotebookController() {
  const controller = vscode.notebooks.createNotebookController(
    NOTEBOOK_CONTROLLER_ID,
    NOTEBOOK_TYPE,
    "marimo kernel",
  );
  return controller;
}

export async function createNotebookDocument() {
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
  updateStatusBar();
}

export async function openNotebookDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor!");
    return;
  }

  const document = editor.document;
  if (document.languageId !== PYTHON_LANGUAGE_ID) {
    vscode.window.showErrorMessage("Not a Python file!");
    return;
  }
  const containsMarimoApp = document.getText().includes("marimo.App");
  if (!containsMarimoApp) {
    vscode.window.showErrorMessage("No marimo.App found!");
    return;
  }

  // Create data
  const data = new vscode.NotebookData([]);
  setNotebookMetadata(data, {
    isNew: false,
    loaded: false,
    file: document.uri.fsPath,
  });

  // Open notebook
  logger.log("Opening existing marimo notebook");
  const doc = await vscode.workspace.openNotebookDocument(document.uri);
  // Show the notebook, if not shown
  try {
    await vscode.window.showNotebookDocument(doc);
    updateStatusBar();
  } catch {
    // Do nothing
  }

  // Open the panel if the kernel is still active
  const kernel = KernelManager.instance.getKernelByUri(document.uri);
  if (kernel) {
    await kernel.openKiosk();
  }
}

export async function handleOnOpenNotebookDocument(doc: vscode.NotebookDocument,
  serverManager: ServerManager, kernelManager: KernelManager
) {
  logger.log("Opened notebook document", doc.notebookType);
  if (doc.notebookType !== NOTEBOOK_TYPE) {
    logger.log("Not a marimo notebook", doc.notebookType);
    return;
  }

  const metadata = getNotebookMetadata(doc);

  if (metadata.loaded) {
    logger.log("Notebook already loaded", metadata);
    return;
  }

  // Show the notebook, if not shown
  try {
    await vscode.window.showNotebookDocument(doc);
    updateStatusBar();
  } catch {
    // Do nothing
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Starting marimo server...",
      cancellable: false,
    },
    async (progress) => {
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

      // Edit metadata
      const nextMetadata: NotebookMetadata = {
        ...metadata,
        port: port,
        key: kernel.kernelKey,
        loaded: true,
      };
      const nbEdit =
        vscode.NotebookEdit.updateNotebookMetadata(nextMetadata);
      const edit2 = new vscode.WorkspaceEdit();
      edit2.set(doc.uri, [nbEdit]);
      await vscode.workspace.applyEdit(edit2);

      // Start the kernel
      progress.report({ message: "Starting the kernel..." });
      await kernel.start();
      await kernel.openKiosk();
    },
  );
}

