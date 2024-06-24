import * as vscode from "vscode";
import { logger } from "../logger";
import { LogMethodCalls } from "../utils/log";
import { type KernelKey, toKernelKey } from "./common/key";
import { getNotebookMetadata } from "./common/metadata";
import { NOTEBOOK_TYPE, PYTHON_LANGUAGE_ID } from "./constants";
import { createNotebookController } from "./createMarimoNotebookController";
import { Kernel } from "./kernel";
import type { MarimoConfig, SkewToken } from "./marimo/types";

// Global state
const kernelMap = new Map<KernelKey, Kernel>();

interface CreateKernelOptions {
  port: number;
  uri: vscode.Uri | "__new__";
  skewToken: SkewToken;
  version: string;
  userConfig: MarimoConfig;
  notebookDoc: vscode.NotebookDocument;
}

interface IKernelManager extends vscode.Disposable {
  createKernel(opts: CreateKernelOptions): Kernel;
  getKernel(key: KernelKey | undefined): Kernel | undefined;
  getKernelByUri(uri: vscode.Uri): Kernel | undefined;
}

/**
 * Keeps track of running marimo kernels.
 * A kernel is associated with a port, notebook, and file.
 *
 * Multiple kernels could belong to the same server (and thus the same port),
 * but they are not required to.
 */
export class KernelManager implements IKernelManager {
  private readonly supportedLanguages = [PYTHON_LANGUAGE_ID];
  public static instance: KernelManager = new KernelManager();

  private controller: vscode.NotebookController;

  private otherDisposables: vscode.Disposable[] = [];

  private constructor() {
    this.controller = createNotebookController();
    this.otherDisposables.push(this.controller);

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

  static getFocusedMarimoKernel(): Kernel | undefined {
    const activeNb = vscode.window.activeNotebookEditor?.notebook;
    // Directly active notebook
    if (activeNb && activeNb.notebookType === NOTEBOOK_TYPE) {
      const metadata = getNotebookMetadata(activeNb);
      if (metadata.key) {
        return kernelMap.get(metadata.key);
      }
    }

    // Active webview
    for (const kernel of kernelMap.values()) {
      if (kernel.isWebviewActive()) {
        return kernel;
      }
    }

    return;
  }

  @LogMethodCalls()
  createKernel(opts: CreateKernelOptions): Kernel {
    const { port, uri, skewToken, version, userConfig, notebookDoc } = opts;
    const key = toKernelKey(uri);
    const kernel = new Kernel({
      port: port,
      kernelKey: key,
      skewToken: skewToken,
      fileUri: notebookDoc.uri,
      version: version,
      userConfig: userConfig,
      controller: this.controller,
      notebookDoc: notebookDoc,
    });
    kernelMap.set(key, kernel);
    return kernel;
  }

  getKernel(key: KernelKey | undefined): Kernel | undefined {
    if (!key) {
      return undefined;
    }
    return kernelMap.get(key);
  }

  getKernelByUri(uri: vscode.Uri): Kernel | undefined {
    const key = toKernelKey(uri);
    const found = this.getKernel(key);
    if (found) {
      return found;
    }
    return;
  }

  @LogMethodCalls()
  private async unregisterKernel(kernel: Kernel): Promise<void> {
    await kernel.dispose();
    kernelMap.delete(kernel.kernelKey);
  }

  async clearAllKernels(): Promise<void> {
    for (const kernel of kernelMap.values()) {
      await kernel.dispose();
    }
  }

  async dispose(): Promise<void> {
    this.otherDisposables.forEach((d) => d.dispose());
    await this.clearAllKernels();
  }

  private listenForNotebookChanges(): void {
    // Listen for added/removed cells
    this.otherDisposables.push(
      vscode.workspace.onDidChangeNotebookDocument((e) => {
        const kernel = this.getKernelForNotebook(e.notebook);
        kernel?.handleNotebookChange(e);
      }),
    );

    // Listen for closed notebooks
    this.otherDisposables.push(
      vscode.workspace.onDidCloseNotebookDocument((nb) => {
        const kernel = this.getKernelForNotebook(nb);
        if (!kernel) {
          return;
        }
        this.unregisterKernel(kernel);
      }),
    );

    // Listen for saved notebooks
    this.otherDisposables.push(
      vscode.workspace.onWillSaveNotebookDocument((e) => {
        const kernel = this.getKernelForNotebook(e.notebook);
        if (!kernel) {
          return;
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
    const kernel = this.getKernelForNotebook(notebook);
    kernel?.executeAll(cells, notebook, controller);
  }

  private getKernelForNotebook(
    notebook: vscode.NotebookDocument,
  ): Kernel | undefined {
    if (notebook.notebookType !== NOTEBOOK_TYPE) {
      return;
    }

    const key = getNotebookMetadata(notebook).key;
    if (!key) {
      logger.error("No key found in notebook metadata");
      return;
    }
    if (!kernelMap.has(key)) {
      logger.error("No kernel found for key", key);
      return;
    }
    return this.getKernel(key);
  }
}
