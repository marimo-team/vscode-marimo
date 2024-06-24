import * as vscode from "vscode";
import { logger } from "../logger";
import { getNotebookMetadata } from "./common/metadata";
import type { KernelManager } from "./kernel-manager";

const LOADING_CELL_ID = "loading";

export class MarimoNotebookSerializer implements vscode.NotebookSerializer {
  constructor(private kernelManager: KernelManager) {}

  public async deserializeNotebook(
    _data: Uint8Array,
    _token: vscode.CancellationToken,
  ): Promise<vscode.NotebookData> {
    // Add a single markdown cell that says Loading...
    const cell = new vscode.NotebookCellData(
      vscode.NotebookCellKind.Markup,
      "### Loading...",
      "markdown",
    );
    cell.metadata = {
      custom: {
        id: LOADING_CELL_ID,
      },
    };
    return new vscode.NotebookData([cell]);
  }

  public async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken,
  ): Promise<Uint8Array> {
    // If there are not cells, throw an error
    // This is likely an error, and don't want to save an empty notebook
    if (data.cells.length === 0) {
      logger.error("No cells found in notebook");
      throw new Error("No cells found in notebook");
    }

    // If the only cell is loading, throw an error
    if (data.cells.length === 1) {
      const cell = data.cells[0];
      const metadata = cell.metadata?.custom;
      if (metadata?.id === LOADING_CELL_ID) {
        logger.error("No cells found in notebook");
        throw new Error("No cells found in notebook");
      }
    }

    const metadata = getNotebookMetadata(data);
    const key = metadata.key;
    const kernel = this.kernelManager.getKernel(key);

    if (!kernel) {
      logger.error("No kernel found for key", key);
      throw new Error(`No kernel found for key: ${key}`);
    }

    const code = await kernel.save(data.cells);
    if (!code) {
      logger.error("No code found for kernel", key);
      throw new Error(`No code found for kernel: ${key}`);
    }

    return Buffer.from(code);
  }
}
