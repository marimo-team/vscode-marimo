import {
  type Disposable,
  EventEmitter,
  StatusBarAlignment,
  type StatusBarItem,
  type TextDocument,
  type TextEditor,
  ThemeColor,
  commands,
  window,
} from "vscode";
import { CommandsKeys } from "../constants";
import type {
  ControllerManager,
  MarimoController,
} from "../launcher/controller";
import type { Kernel } from "../notebook/kernel";
import { KernelManager } from "../notebook/kernel-manager";
import { VscodeContextManager } from "../services/context-manager";
import type { HealthService } from "../services/health";
import type { ILifecycle } from "../types";
import { LogMethodCalls } from "../utils/log";
import { getFocusedMarimoTextEditor, isMarimoApp } from "../utils/query";

enum StatusBarState {
  Idle = 0,
  Kernel = 1,
  ActiveRun = 2,
  ActiveEdit = 3,
  Inactive = 4,
}

// Dumb component that handles UI updates
class StatusBarView implements Disposable {
  private statusBar: StatusBarItem;

  constructor() {
    this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
    this.statusBar.command = CommandsKeys.showCommands;
  }

  update(state: StatusBarState) {
    switch (state) {
      case StatusBarState.Idle:
        this.setIdleAppearance();
        break;
      case StatusBarState.Kernel:
      case StatusBarState.ActiveRun:
      case StatusBarState.ActiveEdit:
        this.setActiveAppearance(state);
        break;
      case StatusBarState.Inactive:
        this.setInactiveAppearance();
        break;
    }
  }

  updateTooltip(tooltip: string) {
    this.statusBar.tooltip = tooltip;
  }

  private setIdleAppearance() {
    this.statusBar.show();
    this.statusBar.text = "$(notebook) marimo";
    this.statusBar.backgroundColor = undefined;
    this.statusBar.color = undefined;
  }

  private setActiveAppearance(state: StatusBarState) {
    this.statusBar.show();
    this.statusBar.text = this.getStatusText(state);
    this.statusBar.backgroundColor = new ThemeColor(
      "statusBarItem.warningBackground",
    );
    this.statusBar.color = new ThemeColor("statusBarItem.warningForeground");
  }

  private setInactiveAppearance() {
    this.statusBar.show();
    this.statusBar.text = "$(play) Start marimo";
    this.statusBar.backgroundColor = undefined;
    this.statusBar.color = undefined;
  }

  private getStatusText(state: StatusBarState): string {
    switch (state) {
      case StatusBarState.Kernel:
      case StatusBarState.ActiveEdit:
        return "$(zap) marimo";
      case StatusBarState.ActiveRun:
        return "$(zap) marimo (run)";
      default:
        return "";
    }
  }

  dispose() {
    this.statusBar.dispose();
  }
}

// Smart component that manages state and logic
export class StatusBar implements ILifecycle {
  private view: StatusBarView;
  private otherDisposables: Disposable[] = [];
  private currentState: StatusBarState = StatusBarState.Idle;
  private contextManager = new VscodeContextManager();

  private static _onUpdate = new EventEmitter();

  @LogMethodCalls()
  static update(): void {
    StatusBar._onUpdate.fire(undefined);
  }

  constructor(
    private readonly controllerManager: ControllerManager,
    private readonly healthService: HealthService,
  ) {
    this.view = new StatusBarView();
    this.update();
    this.registerListeners();
  }

  async restart(): Promise<void> {
    this.update();
  }

  private registerListeners() {
    const updateEvents = [
      window.onDidChangeActiveTextEditor,
      window.onDidChangeActiveNotebookEditor,
      window.onDidChangeTextEditorViewColumn,
    ];

    this.otherDisposables.push(
      ...updateEvents.map((event) => event(() => this.update())),
    );

    this.otherDisposables.push(StatusBar._onUpdate.event(() => this.update()));
  }

  dispose() {
    this.otherDisposables.forEach((d) => d.dispose());
    this.view.dispose();
  }

  async update() {
    const kernel = KernelManager.getFocusedMarimoKernel();
    const editor = getFocusedMarimoTextEditor({ toast: false });
    const activeController =
      this.controllerManager.getControllerForActivePanel() ||
      (editor?.document && this.controllerManager.getOrCreate(editor.document));

    this.updateState(kernel, editor, activeController);
    this.view.update(this.currentState);
    this.contextManager.setMarimoApp(isMarimoApp(editor?.document));

    const status = await this.healthService.printStatus();
    this.view.updateTooltip(status);
  }

  private updateState(
    kernel: Kernel | undefined,
    editor: TextEditor | undefined,
    activeController: MarimoController | undefined,
  ) {
    if (kernel) {
      // We are connected from a VSCode notebook to a kernel
      this.currentState = StatusBarState.Kernel;
    } else if (!editor?.document) {
      // Not a marimo file or notebook
      this.currentState = StatusBarState.Idle;
    } else if (activeController?.active) {
      // Marimo file is active: either running or editing
      this.currentState =
        activeController.currentMode === "run"
          ? StatusBarState.ActiveRun
          : StatusBarState.ActiveEdit;
    } else {
      // Marimo file is not active
      this.currentState = StatusBarState.Inactive;
    }
  }
}
