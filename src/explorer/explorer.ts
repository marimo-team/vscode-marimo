import { join } from "node:path";
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
import { Controllers } from "../launcher/controller";
import { ServerManager } from "../launcher/server-manager";
import { Launcher } from "../launcher/start";
import { logger } from "../logger";
import { openMarimoNotebookDocument } from "../notebook/extension";
import type { Kernel } from "../notebook/kernel";
import { KernelManager } from "../notebook/kernel-manager";
import type { MarimoFile } from "../notebook/marimo/types";
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

  @LogMethodCalls()
  static refresh(): void {
    MarimoAppProvider._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(): Promise<Entry[]> {
    // Get all Python files in the workspace
    const pythonFiles = await workspace.findFiles(
      "**/*.py",
      // ignore venv, node_modules, .git, __pycache__
      "{**/venv/**,**/node_modules/**,**/.git/**,**/.venv/**,**/__pycache__/**}",
    );

    const entries: Entry[] = [];

    for (const file of pythonFiles) {
      // Open the file as a text document
      const document = await workspace.openTextDocument(file);
      if (document.getText().includes("app = marimo.App(")) {
        entries.push({ uri: file, type: FileType.File });
      }
    }

    // Sort the entries by name
    entries.sort((a, b) => {
      return a.uri.fsPath.localeCompare(b.uri.fsPath);
    });

    return entries;
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
        const controller = Controllers.getOrCreate(textDocument);
        await Launcher.start({ controller, mode: "edit" });
        controller.open();
      },
    };
  }

  private focusIfActive(uri: Uri): boolean {
    // Try controller
    const controller = Controllers.get(uri);
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
}

export class MarimoRunningKernelsProvider
  implements TreeDataProvider<MarimoFile>, WithCommands<MarimoFile>
{
  private static _onDidChangeTreeData = new EventEmitter<
    MarimoFile | undefined
  >();
  readonly onDidChangeTreeData =
    MarimoRunningKernelsProvider._onDidChangeTreeData.event;

  @LogMethodCalls()
  static refresh(): void {
    MarimoRunningKernelsProvider._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(): Promise<MarimoFile[]> {
    const serverManager = ServerManager.instance;
    const sessions = serverManager.getActiveSessions();
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
    treeItem.label = element.name;
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
    await ServerManager.instance.shutdownSession(file);
    MarimoRunningKernelsProvider.refresh();
  }
}

export class MarimoExplorer {
  private runningKernelsProvider: MarimoRunningKernelsProvider;
  private marimoFilesProvider: MarimoAppProvider;

  constructor(context: ExtensionContext) {
    this.marimoFilesProvider = new MarimoAppProvider();
    this.runningKernelsProvider = new MarimoRunningKernelsProvider();

    context.subscriptions.push(
      // Tree views
      window.createTreeView("marimo-explorer-applications", {
        treeDataProvider: this.marimoFilesProvider,
      }),
      window.createTreeView("marimo-explorer-running-applications", {
        treeDataProvider: this.runningKernelsProvider,
      }),
      commands.registerCommand(
        "vscode-marimo.refresh",
        () => MarimoRunningKernelsProvider.refresh(),
        MarimoAppProvider.refresh(),
      ),
      workspace.onDidOpenNotebookDocument(() => {
        MarimoRunningKernelsProvider.refresh();
      }),
      workspace.onDidCloseNotebookDocument(() => {
        MarimoRunningKernelsProvider.refresh();
      }),
    );

    const explorerCommands = {
      ...this.marimoFilesProvider.getCommands(),
      ...this.runningKernelsProvider.getCommands(),
    };
    for (const [command, handler] of Object.entries(explorerCommands)) {
      context.subscriptions.push(commands.registerCommand(command, handler));
    }
  }
}
