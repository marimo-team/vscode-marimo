import {
  type ExtensionContext,
  StatusBarAlignment,
  type StatusBarItem,
  ThemeColor,
  commands,
  window,
} from "vscode";
import { Controllers } from "../launcher/controller";
import { KernelManager } from "../notebook/kernel-manager";
import { getFocusedMarimoTextEditor, isMarimoApp } from "../utils/query";
import { extension } from "../ctx";

let statusBar: StatusBarItem | undefined;

export function ensureStatusBar() {
  if (!statusBar) {
    statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
    statusBar.command = "vscode-marimo.showCommands";
    statusBar.show();
  }
  return statusBar;
}

export function disposeStatusBar() {
  statusBar?.dispose();
  statusBar = undefined;
}

export function updateStatusBar(ext: ExtensionContext = extension) {
  const statusBar = ensureStatusBar();

  // Update if looking at a NotebookEditor
  const kernel = KernelManager.getFocusedMarimoKernel();
  if (kernel) {
    statusBar.show();
    statusBar.text = "$(zap) marimo";
    statusBar.backgroundColor = new ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBar.color = new ThemeColor("statusBarItem.warningForeground");
    commands.executeCommand("setContext", "marimo.isMarimoApp", false);
    return;
  }

  // Update if looking at a TextEditor
  const editor = getFocusedMarimoTextEditor({ toast: false });
  commands.executeCommand(
    "setContext",
    "marimo.isMarimoApp",
    isMarimoApp(editor?.document),
  );

  if (!editor?.document) {
    statusBar.hide();
    return;
  }
  statusBar.show();

  const activeController =
    Controllers.getControllerForActivePanel() ||
    Controllers.getOrCreate(editor.document, ext);
  if (activeController.active) {
    statusBar.text =
      activeController.currentMode === "run"
        ? "$(zap) marimo (run)"
        : "$(zap) marimo";
    statusBar.backgroundColor = new ThemeColor(
      "statusBarItem.warningBackground",
    );
    statusBar.color = new ThemeColor("statusBarItem.warningForeground");
  } else {
    statusBar.text = "$(play) Start marimo";
    statusBar.backgroundColor = undefined;
    statusBar.color = undefined;
  }
}
