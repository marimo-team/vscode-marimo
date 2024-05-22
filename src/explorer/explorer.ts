import path from "node:path";
import {
  type Event,
  EventEmitter,
  type ExtensionContext,
  FileType,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  type Uri,
  commands,
  window,
  workspace,
} from "vscode";
import { logger } from "../logger";

interface Entry {
  uri: Uri;
  type: FileType;
}

export class MarimoAppProvider implements TreeDataProvider<Entry> {
  // eslint-disable-next-line unicorn/prefer-event-target
  private _onDidChangeTreeData = new EventEmitter<Entry | undefined>();
  readonly onDidChangeTreeData: Event<Entry | undefined> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
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
        arguments: [element.uri],
      };
      treeItem.contextValue = "app";
      const filePath = element.uri.fsPath;
      const fileName = path.basename(filePath) || "app.py";
      const folderName = path.basename(path.dirname(filePath));
      treeItem.label = folderName ? `${folderName}/${fileName}` : fileName;
      treeItem.iconPath = new ThemeIcon("book");
      treeItem.tooltip = filePath;
    }
    return treeItem;
  }
}

export class MarimoExplorer {
  constructor(context: ExtensionContext) {
    const treeDataProvider = new MarimoAppProvider();
    logger.log("marimo explorer is now active!");
    context.subscriptions.push(
      window.createTreeView("marimo-explorer-applications", {
        treeDataProvider,
      }),
    );
    commands.registerCommand("marimo-explorer.openFile", (resource) =>
      this.openResource(resource),
    );
    commands.registerCommand("marimo-explorer.refresh", () =>
      treeDataProvider.refresh(),
    );
  }

  private openResource(resource: Uri): void {
    window.showTextDocument(resource);
  }
}
