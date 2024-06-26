import {
  type Disposable,
  StatusBarAlignment,
  type StatusBarItem,
  ThemeColor,
  commands,
  window,
  workspace,
} from "vscode";
import { Controllers } from "../launcher/controller";
import { KernelManager } from "../notebook/kernel-manager";
import type { ILifecycle } from "../types";
import { invariant } from "../utils/invariant";
import { getFocusedMarimoTextEditor, isMarimoApp } from "../utils/query";

class StatusBarManager implements ILifecycle {
  private statusBar: StatusBarItem | undefined;
  private otherDisposables: Disposable[] = [];

  async restart(): Promise<void> {
    this.update();
  }

  async start(): Promise<void> {
    this.initStatusBar();
    this.update();
    this.addListeners();
  }

  private addListeners() {
    this.otherDisposables.push(
      window.onDidChangeActiveTextEditor(() => {
        this.update();
      }),
    );
    this.otherDisposables.push(
      window.onDidChangeActiveNotebookEditor(() => {
        this.update();
      }),
    );
    this.otherDisposables.push(
      window.onDidChangeTextEditorViewColumn(() => {
        this.update();
      }),
    );
  }

  private initStatusBar() {
    if (!this.statusBar) {
      this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
      this.statusBar.command = "vscode-marimo.showCommands";
      this.statusBar.show();
    }
  }

  dispose() {
    this.otherDisposables.forEach((d) => d.dispose());
    this.statusBar?.dispose();
    this.statusBar = undefined;
  }

  update() {
    this.initStatusBar();

    const kernel = KernelManager.getFocusedMarimoKernel();
    if (kernel) {
      this.updateForKernel();
    } else {
      this.updateForTextEditor();
    }
  }

  private updateForKernel() {
    invariant(this.statusBar, "statusBar should be defined");

    this.statusBar.show();
    this.statusBar.text = "$(zap) marimo";
    this.statusBar.backgroundColor = new ThemeColor(
      "statusBarItem.warningBackground",
    );
    this.statusBar.color = new ThemeColor("statusBarItem.warningForeground");
    void commands.executeCommand("setContext", "marimo.isMarimoApp", false);
  }

  private updateForTextEditor() {
    invariant(this.statusBar, "statusBar should be defined");

    const editor = getFocusedMarimoTextEditor({ toast: false });
    void commands.executeCommand(
      "setContext",
      "marimo.isMarimoApp",
      isMarimoApp(editor?.document),
    );

    if (!editor?.document) {
      this.statusBar.hide();
      return;
    }

    this.statusBar.show();

    const activeController =
      Controllers.getControllerForActivePanel() ||
      Controllers.getOrCreate(editor.document);
    if (activeController.active) {
      this.statusBar.text =
        activeController.currentMode === "run"
          ? "$(zap) marimo (run)"
          : "$(zap) marimo";
      this.statusBar.backgroundColor = new ThemeColor(
        "statusBarItem.warningBackground",
      );
      this.statusBar.color = new ThemeColor("statusBarItem.warningForeground");
    } else {
      this.statusBar.text = "$(play) Start marimo";
      this.statusBar.backgroundColor = undefined;
      this.statusBar.color = undefined;
    }
  }
}

export const statusBarManager = new StatusBarManager();
