import { StatusBarAlignment, StatusBarItem, ThemeColor, commands, window } from 'vscode';
import { Controllers } from './controller';
import { getCurrentFile, isMarimoApp } from './utils';

let statusBar: StatusBarItem;

export function ensureStatusBar() {
  if (!statusBar) {
    statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
    statusBar.command = 'vscode-marimo.showCommands';
    statusBar.show();
  }
}

export function updateStatusBar() {
  ensureStatusBar();

  const file = getCurrentFile(false);
  commands.executeCommand('setContext', 'marimo.isMarimoApp', isMarimoApp(file));
  const activeController = Controllers.getControllerForActivePanel() || Controllers.get(file);

  if (!file) {
    statusBar.hide();
    return;
  }
  statusBar.show();

  if (activeController?.active) {
    statusBar.text = activeController.currentMode === 'run' ? '$(zap) marimo (run)' : '$(zap) marimo';
    statusBar.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
    statusBar.color = new ThemeColor('statusBarItem.warningForeground');
  } else {
    statusBar.text = '$(play) Start marimo';
    statusBar.backgroundColor = undefined;
    statusBar.color = undefined;
  }
}
