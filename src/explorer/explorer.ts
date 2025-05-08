import { join } from "node:path";
import type { Disposable, FileSystemWatcher } from "vscode";

import {
  EventEmitter,
  type ExtensionContext,
  FileType,
  type NotebookDocument,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  commands,
  window,
  workspace,
} from "vscode";
import { Config } from "../config";
import { CommandsKeys } from "../constants";
import type { ControllerManager } from "../launcher/controller";
import { Launcher } from "../launcher/start";
import { logger } from "../logger";
import { openMarimoNotebookDocument } from "../notebook/extension";
import type { Kernel } from "../notebook/kernel";
import { KernelManager } from "../notebook/kernel-manager";
import type { MarimoFile } from "../notebook/marimo/types";
import type { ServerManager } from "../services/server-manager";
import { trackEvent } from "../telemetry";
import { LogMethodCalls } from "../utils/log";
import { showNotebookDocument } from "../utils/show";

interface Entry {
  uri: Uri;
  type: FileType;
}

interface WithCommands<T> {
  getCommands(): Record<string, (arg: T) => void | Promise<void>>;
}

export class MarimoAppProvider
  implements TreeDataProvider<Entry>, WithCommands<Entry>
{
  private static _onDidChangeTreeData = new EventEmitter<Entry | undefined>();
  readonly onDidChangeTreeData = MarimoAppProvider._onDidChangeTreeData.event;

  private fileWatcher: FileSystemWatcher;
  private cachedEntries: Entry[] | null = null;
  private isRefreshing = false;

  constructor(private controllerManager: ControllerManager) {
    this.fileWatcher = this.setupFileWatcher();
  }

  private setupFileWatcher() {
    const fileWatcher = workspace.createFileSystemWatcher("**/*.py");
    fileWatcher.onDidCreate(() => this.invalidateCache());
    fileWatcher.onDidDelete(() => this.invalidateCache());
    fileWatcher.onDidChange(() => this.invalidateCache());
    return fileWatcher;
  }

  private invalidateCache() {
    this.cachedEntries = null;
    // No need to refresh optimistically, we can be lazy
    // this.debouncedRefresh();
    // MarimoAppProvider.refresh()
  }

  @LogMethodCalls()
  static refresh(): void {
    MarimoAppProvider._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(): Promise<Entry[]> {
    if (this.cachedEntries && !this.isRefreshing) {
      return this.cachedEntries;
    }

    if (this.isRefreshing) {
      return this.cachedEntries || [];
    }

    this.isRefreshing = true;
    try {
      const pythonFiles = await workspace.findFiles(
        "**/*.py",
        "{**/venv/**,**/node_modules/**,**/__pycache__/**,**/.*/**}", // Excluded folders, including all .dot folders
        1000, // Limit the number of files to search
      );

      const entries: Entry[] = [];

      await Promise.all(
        pythonFiles.map(async (file) => {
          const stats = await workspace.fs.stat(file);
          if (stats.type === FileType.File) {
            const content = await workspace.fs.readFile(file);
            if (content.toString().includes("app = marimo.App(")) {
              entries.push({ uri: file, type: FileType.File });
            }
          }
        }),
      );

      entries.sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
      this.cachedEntries = entries;
      return entries;
    } finally {
      this.isRefreshing = false;
    }
  }

  getCommands(): Record<string, (arg: Entry) => void | Promise<void>> {
    return {
      "marimo-explorer.openFile": (element: Entry) =>
        this.openResource(element.uri),
      "marimo-explorer.openAsVSCodeNotebook": async (element: Entry) => {
        const didFocus = this.focusIfActive(element.uri);
        if (didFocus) {
          return;
        }

        await openMarimoNotebookDocument(element.uri);
      },
      "marimo-explorer.edit": async (element: Entry) => {
        const didFocus = this.focusIfActive(element.uri);
        if (didFocus) {
          return;
        }

        const textDocument = await workspace.openTextDocument(element.uri);
        const controller = this.controllerManager.getOrCreate(textDocument);
        await Launcher.start({ controller, mode: "edit" });
        controller.open();
      },
    };
  }

  private focusIfActive(uri: Uri): boolean {
    // Try controller
    const controller = this.controllerManager.get(uri);
    if (controller?.isWebviewActive()) {
      controller.open();
      return true;
    }

    // Try kernel
    const kernel = KernelManager.instance.getKernelByUri(uri);
    if (kernel) {
      showNotebookDocument(kernel.notebookDoc);
      return true;
    }

    return false;
  }

  getTreeItem(element: Entry): TreeItem {
    const treeItem = new TreeItem(
      element.uri,
      element.type === FileType.Directory
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
    );
    if (element.type === FileType.File) {
      treeItem.command = {
        command: "marimo-explorer.openFile",
        title: "Open File",
        arguments: [element],
      };
      treeItem.contextValue = "app";
      const filePath = element.uri.fsPath;
      const relativePath = workspace.asRelativePath(element.uri);
      treeItem.label = relativePath;
      treeItem.iconPath = new ThemeIcon("file");
      treeItem.tooltip = filePath;
    }
    return treeItem;
  }

  @LogMethodCalls()
  private openResource(resource: Uri): void {
    window.showTextDocument(resource);
  }

  dispose() {
    this.fileWatcher.dispose();
  }
}

export class MarimoRunningKernelsProvider
  implements TreeDataProvider<MarimoFile>, WithCommands<MarimoFile>, Disposable
{
  private static _onDidChangeTreeData = new EventEmitter<
    MarimoFile | undefined
  >();
  readonly onDidChangeTreeData =
    MarimoRunningKernelsProvider._onDidChangeTreeData.event;

  constructor(private serverManager: ServerManager) {}

  @LogMethodCalls()
  static refresh(): void {
    MarimoRunningKernelsProvider._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(): Promise<MarimoFile[]> {
    const sessions = this.serverManager.getActiveSessions();
    return sessions;
  }

  getTreeItem(element: MarimoFile): TreeItem {
    const treeItem = new TreeItem(element.path);
    const kernel = this.findKernelByUri(element);
    if (kernel) {
      treeItem.command = {
        command: "marimo-explorer.openNotebook",
        title: "Focus notebook",
        arguments: [element, kernel],
      };
    }
    treeItem.contextValue = "app";
    try {
      const relativePath = workspace.asRelativePath(element.path);
      treeItem.label = relativePath;
    } catch (error) {
      treeItem.label = element.path;
    }
    treeItem.iconPath = new ThemeIcon("server-process");
    treeItem.tooltip = element.path;
    return treeItem;
  }

  getCommands(): Record<string, (arg: MarimoFile) => void | Promise<void>> {
    return {
      "marimo-explorer.openNotebook": (element: MarimoFile) =>
        this.openNotebook(element),
      "marimo-explorer.restartKernel": (element: MarimoFile) =>
        this.restartKernel(element),
      "marimo-explorer.stopKernel": (element: MarimoFile) =>
        this.stopKernel(element),
    };
  }

  private findKernelByUri(element: MarimoFile): Kernel | undefined {
    try {
      const uri = Uri.file(join(Config.root, element.path));
      return KernelManager.instance.getKernelByUri(uri);
    } catch (error) {
      logger.error("Error finding kernel by uri", error);
      return;
    }
  }

  @LogMethodCalls()
  private async openNotebook(file: MarimoFile): Promise<void> {
    const kernel = this.findKernelByUri(file);
    if (kernel) {
      showNotebookDocument(kernel.notebookDoc);
    }
  }

  @LogMethodCalls()
  private async restartKernel(file: MarimoFile): Promise<void> {
    const fullPath = join(Config.root, file.path);
    const kernel = KernelManager.instance.getKernelByUri(Uri.file(fullPath));
    if (kernel) {
      kernel.restart();
    }
  }

  @LogMethodCalls()
  private async stopKernel(file: MarimoFile): Promise<void> {
    const fullPath = join(Config.root, file.path);
    const kernel = KernelManager.instance.getKernelByUri(Uri.file(fullPath));
    if (kernel) {
      await kernel.dispose();
    }
    await this.serverManager.shutdownSession(file);
    MarimoRunningKernelsProvider.refresh();
  }

  dispose() {
    // No-op
  }
}

export class MarimoExplorer implements Disposable {
  private runningKernelsProvider: MarimoRunningKernelsProvider;
  private marimoFilesProvider: MarimoAppProvider;
  private disposables: Disposable[] = [];

  constructor(
    serverManager: ServerManager,
    controllerManager: ControllerManager,
  ) {
    this.marimoFilesProvider = new MarimoAppProvider(controllerManager);
    this.runningKernelsProvider = new MarimoRunningKernelsProvider(
      serverManager,
    );

    this.registerViews();
    this.registerCommands();
    this.registerEventListeners();
  }

  private registerViews() {
    this.disposables.push(
      window.createTreeView("marimo-explorer-applications", {
        treeDataProvider: this.marimoFilesProvider,
      }),
      window.createTreeView("marimo-explorer-running-applications", {
        treeDataProvider: this.runningKernelsProvider,
      }),
    );
  }

  private registerCommands() {
    this.disposables.push(
      commands.registerCommand(
        CommandsKeys.refresh,
        () => {
          trackEvent("vscode-command", { command: CommandsKeys.refresh });
          MarimoRunningKernelsProvider.refresh();
        },
        MarimoAppProvider.refresh(),
      ),
    );

    const explorerCommands = {
      ...this.marimoFilesProvider.getCommands(),
      ...this.runningKernelsProvider.getCommands(),
    };
    for (const [command, handler] of Object.entries(explorerCommands)) {
      this.disposables.push(
        commands.registerCommand(command, (arg) => {
          trackEvent("vscode-command", { command });
          handler(arg);
        }),
      );
    }
  }

  private registerEventListeners() {
    this.disposables.push(
      workspace.onDidOpenNotebookDocument(() => {
        MarimoRunningKernelsProvider.refresh();
      }),
      workspace.onDidCloseNotebookDocument(() => {
        MarimoRunningKernelsProvider.refresh();
      }),
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.marimoFilesProvider.dispose();
    this.runningKernelsProvider.dispose();
  }
}
