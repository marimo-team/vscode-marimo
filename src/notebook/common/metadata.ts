import * as vscode from "vscode";
import type { CellId } from "../marimo/types";
import type { KernelKey } from "./key";

interface CellMetadata {
  id?: CellId;
  name?: string;
}

export function getCellMetadata(
  cell: vscode.NotebookCell | vscode.NotebookCellData,
): CellMetadata {
  return cell.metadata?.custom || {};
}

export async function setCellMetadata(
  cell: vscode.NotebookCell,
  metadata: CellMetadata,
): Promise<void> {
  // create workspace edit to update metadata
  // TODO: could batch these edits
  const edit = new vscode.WorkspaceEdit();
  const nbEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, {
    ...cell.metadata,
    custom: {
      ...cell.metadata?.custom,
      ...metadata,
    },
  });
  edit.set(cell.notebook.uri, [nbEdit]);
  await vscode.workspace.applyEdit(edit);
}

export interface NotebookMetadata {
  port?: number;
  file?: string;
  isNew: boolean;
  key?: KernelKey;
  loaded?: boolean;
}

export function getNotebookMetadata(
  notebook: vscode.NotebookDocument | vscode.NotebookData,
): NotebookMetadata {
  return notebook.metadata as NotebookMetadata;
}

export function setNotebookMetadata(
  notebook: vscode.NotebookDocument | vscode.NotebookData,
  metadata: NotebookMetadata,
): void {
  if (!notebook.metadata) {
    // @ts-ignore
    notebook.metadata = {};
  }
  notebook.metadata.port = metadata.port;
  notebook.metadata.file = metadata.file;
  notebook.metadata.isNew = metadata.isNew;
}
