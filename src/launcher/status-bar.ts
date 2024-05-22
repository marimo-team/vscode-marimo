import {
  type ExtensionContext,
  StatusBarAlignment,
  type StatusBarItem,
  ThemeColor,
  commands,
  window,
} from "vscode";
import { Controllers } from "./controller";
import { getCurrentFile, isMarimoApp } from "./utils";

let statusBar: StatusBarItem;

export function ensureStatusBar() {
  if (!statusBar) {
    statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
    statusBar.command = "vscode-marimo.showCommands";
    statusBar.show();
  }
}

export function disposeStatusBar() {
  statusBar?.dispose();
  statusBar = undefined!;
}

export function updateStatusBar(extension: ExtensionContext) {
  ensureStatusBar();

  const file = getCurrentFile(false);
  commands.executeCommand(
    "setContext",
    "marimo.isMarimoApp",
    isMarimoApp(file),
  );

  if (!file) {
    statusBar.hide();
    return;
  }
  statusBar.show();

  const activeController =
    Controllers.getControllerForActivePanel() ||
    Controllers.getOrCreate(file, extension);
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
