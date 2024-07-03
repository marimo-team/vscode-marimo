import * as vscode from "vscode";
import type { ServerManager } from "../launcher/server-manager";
import { logger } from "../logger";
import { isMarimoApp } from "../utils/query";
import { showNotebookDocument } from "../utils/show";
import {
  type NotebookMetadata,
  getNotebookMetadata,
  setNotebookMetadata,
} from "./common/metadata";
import { NOTEBOOK_TYPE, PYTHON_LANGUAGE_ID } from "./constants";
import { KernelManager } from "./kernel-manager";

export async function createNotebookDocument() {
  const data = new vscode.NotebookData([]);
  setNotebookMetadata(data, {
    isNew: true,
    loaded: false,
  });

  // Create NotebookDocument and open it
  const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);

  // Open Notebook
  logger.log("Opening new marimo notebook");
  await vscode.window.showNotebookDocument(doc);
}

export async function getActiveMarimoFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor!");
    return;
  }

  const document = editor.document;
  if (!isMarimoApp(document, false)) {
    vscode.window.showErrorMessage("Active editor is not a Marimo file!");
    return;
  }

  return document.uri;
}

export async function openMarimoNotebookDocument(uri: vscode.Uri | undefined) {
  if (!uri) {
    return;
  }
  // Create data
  const data = new vscode.NotebookData([]);
  setNotebookMetadata(data, {
    isNew: false,
    loaded: false,
    file: uri.fsPath,
  });

  // Open notebook
  logger.log("Opening existing marimo notebook");
  const doc = await vscode.workspace.openNotebookDocument(uri);
  // Show the notebook, if not shown
  await showNotebookDocument(doc);

  // Open the panel if the kernel is still active
  const kernel = KernelManager.instance.getKernelByUri(uri);
  if (kernel) {
    await kernel.openKiosk();
  }
}

export async function handleOnOpenNotebookDocument(
  doc: vscode.NotebookDocument,
  serverManager: ServerManager,
  kernelManager: KernelManager,
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
  await showNotebookDocument(doc);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Starting marimo server...",
      cancellable: false,
    },
    async () => {
      // Start Marimo server
      logger.log("Checking server...");
      const { port, skewToken, userConfig, version } =
        await serverManager.start();
      // If not new, try to hydrate existing notebooks
      if (!metadata.isNew) {
        await kernelManager.hydrateExistingNotebooks({
          port,
          skewToken,
          userConfig,
          version,
        });
      }

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
      const nbEdit = vscode.NotebookEdit.updateNotebookMetadata(nextMetadata);
      const edit2 = new vscode.WorkspaceEdit();
      edit2.set(doc.uri, [nbEdit]);
      await vscode.workspace.applyEdit(edit2);

      // Start the kernel
      await kernel.start();
      await kernel.openKiosk();
    },
  );
}
