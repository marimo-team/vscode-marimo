import * as vscode from "vscode";
import { logger } from "../logger";
import { type KernelKey, toKernelKey } from "./common/key";
import { getNotebookMetadata } from "./common/metadata";
import { Kernel } from "./kernel";
import type { MarimoConfig, SkewToken } from "./marimo/types";

export const NOTEBOOK_TYPE = "marimo-notebook";

/**
 * Keeps track of running marimo kernels.
 * A kernel is associated with a port, notebook, and file.
 *
 * Multiple kernels could belong to the same server (and thus the same port),
 * but they are not required to.
 */
export class KernelManager implements vscode.Disposable {
  private readonly supportedLanguages = ["python"];

  private controller: vscode.NotebookController;
  private readonly kernelMap = new Map<KernelKey, Kernel>();

  private otherDisposables: vscode.Disposable[] = [];

  constructor(controller: vscode.NotebookController) {
    this.controller = controller;

    this.controller.supportedLanguages = this.supportedLanguages;
    this.controller.supportsExecutionOrder = false;
    this.controller.executeHandler = this.executeAll.bind(this);
    this.controller.interruptHandler = async (notebook) => {
      const key = getNotebookMetadata(notebook).key;
      const kernel = this.getKernel(key);
      if (!kernel) {
        return logger.error("No kernel found for key", key);
      }
      await kernel.interrupt();
    };
    this.listenForNotebookChanges();
  }

  createKernel({
    port,
    uri,
    skewToken,
    version,
    userConfig,
    notebookDoc,
  }: {
    port: number;
    uri: vscode.Uri | "__new__";
    skewToken: SkewToken;
    version: string;
    userConfig: MarimoConfig;
    notebookDoc: vscode.NotebookDocument;
  }): Kernel {
    const key = toKernelKey(uri);
    const kernel = new Kernel(
      port,
      key,
      skewToken,
      version,
      userConfig,
      this.controller,
      notebookDoc,
    );
    this.kernelMap.set(key, kernel);
    return kernel;
  }

  getKernel(key: KernelKey | undefined): Kernel | undefined {
    if (!key) {
      return undefined;
    }
    return this.kernelMap.get(key);
  }

  unregisterKernel(key: KernelKey): void {
    const kernel = this.kernelMap.get(key);
    if (!kernel) {
      logger.error("No kernel found for key", key);
      return;
    }
    kernel.dispose();
    this.kernelMap.delete(key);
  }

  dispose(): void {
    this.kernelMap.forEach((kernel) => kernel.dispose());
    this.otherDisposables.forEach((d) => d.dispose());
  }

  private listenForNotebookChanges(): void {
    // Listen for added/removed cells
    this.otherDisposables.push(
      vscode.workspace.onDidChangeNotebookDocument((e) => {
        if (e.notebook.notebookType !== NOTEBOOK_TYPE) {
          logger.log("Ignoring non-marimo notebook");
          return;
        }
        const key = getNotebookMetadata(e.notebook).key;
        if (!key) {
          return logger.error("No key found in notebook metadata");
        }
        const kernel = this.getKernel(key);
        if (!kernel) {
          return logger.error("No kernel found for key", key);
        }
        kernel.handleNotebookChange(e);
      }),
    );

    // Listen for closed notebooks
    this.otherDisposables.push(
      vscode.workspace.onDidCloseNotebookDocument((e) => {
        if (e.notebookType !== NOTEBOOK_TYPE) {
          logger.log("Ignoring non-marimo notebook");
          return;
        }
        const key = getNotebookMetadata(e).key;
        if (!key) {
          return logger.error("No key found in notebook metadata");
        }
        this.unregisterKernel(key);
      }),
    );

    // Listen for saved notebooks
    this.otherDisposables.push(
      vscode.workspace.onWillSaveNotebookDocument((e) => {
        if (e.notebook.notebookType !== NOTEBOOK_TYPE) {
          logger.log("Ignoring non-marimo notebook");
          return;
        }
        const key = getNotebookMetadata(e.notebook).key;
        if (!key) {
          throw Error("No key found in notebook metadata");
        }
        const kernel = this.getKernel(key);
        if (!kernel) {
          throw Error("No kernel found for key: " + key);
        }
      }),
    );
  }

  private executeAll(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): void {
    this.controller = controller;
    const key = getNotebookMetadata(notebook).key;
    const kernel = this.getKernel(key);
    if (!kernel) {
      logger.error("No kernel found for key", key);
      return;
    }

    kernel.executeAll(cells, notebook, controller);
  }
}
