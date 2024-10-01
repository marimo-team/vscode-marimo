import {
  type Disposable,
  type ExtensionContext,
  ProgressLocation,
  Uri,
  commands,
  env,
  window,
  workspace,
} from "vscode";
import { showCommands } from "./commands/show-commands";
import { Config } from "./config";
import { CommandsKeys, DOCUMENTATION_URL } from "./constants";
import { convertIPyNotebook, convertMarkdownNotebook } from "./convert/convert";
import { setExtension } from "./ctx";
import {
  MarimoExplorer,
  MarimoRunningKernelsProvider,
} from "./explorer/explorer";
import { exportAsCommands } from "./export/export-as-commands";
import { ControllerManager } from "./launcher/controller";
import { createNewMarimoFile } from "./launcher/new-file";
import { Launcher } from "./launcher/start";
import { logger } from "./logger";
import { NOTEBOOK_TYPE } from "./notebook/constants";
import {
  getActiveMarimoFile,
  handleOnOpenNotebookDocument,
  openMarimoNotebookDocument,
} from "./notebook/extension";
import { KernelManager } from "./notebook/kernel-manager";
import { MarimoNotebookSerializer } from "./notebook/serializer";
import { HealthService } from "./services/health";
import { ServerManager } from "./services/server-manager";
import { StatusBar } from "./ui/status-bar";

class MarimoExtension {
  private extension: ExtensionContext;
  private kernelManager: KernelManager;
  private serverManager: ServerManager;
  private statusBar: StatusBar;
  private explorer: MarimoExplorer;
  private controllerManager: ControllerManager;
  private healthService: HealthService;

  constructor(extension: ExtensionContext) {
    this.extension = extension;
    this.kernelManager = KernelManager.instance;
    this.serverManager = ServerManager.getInstance(Config);
    this.controllerManager = new ControllerManager(this.serverManager);
    this.healthService = new HealthService(this.serverManager);
    this.statusBar = new StatusBar(this.controllerManager, this.healthService);
    // Sidebar explorer
    this.explorer = new MarimoExplorer(
      this.serverManager,
      this.controllerManager,
    );
  }

  public async activate() {
    setExtension(this.extension);
    logger.info("marimo extension is now active!");

    this.serverManager.init();
    this.addDisposable(this.kernelManager, this.serverManager, this.explorer);

    this.registerCommands();
    this.registerEventListeners();

    // Serializer
    this.registerNotebookSerializer();
  }

  private addDisposable(...disposable: Disposable[]) {
    this.extension.subscriptions.push(...disposable);
  }

  private async refreshUI() {
    MarimoRunningKernelsProvider.refresh();
    await this.statusBar.update();
  }

  private registerCommands() {
    commands.registerCommand(CommandsKeys.startServer, () =>
      this.startServer(),
    );
    commands.registerCommand(CommandsKeys.stopServer, () => this.stopServer());
    commands.registerCommand(CommandsKeys.edit, () => this.edit());
    commands.registerCommand(CommandsKeys.run, () => this.run());
    commands.registerCommand(CommandsKeys.restartKernel, () =>
      this.restartKernel(),
    );
    commands.registerCommand(CommandsKeys.stopKernel, () => this.stopKernel());
    commands.registerCommand(CommandsKeys.showCommands, () =>
      this.showCommands(),
    );
    commands.registerCommand(CommandsKeys.exportAsCommands, () =>
      this.exportAsCommands(),
    );
    commands.registerCommand(CommandsKeys.openInBrowser, () =>
      this.openInBrowser(),
    );
    commands.registerCommand(CommandsKeys.reloadBrowser, () =>
      this.reloadBrowser(),
    );
    commands.registerCommand(CommandsKeys.openNotebook, () =>
      this.openNotebook(),
    );
    commands.registerCommand(CommandsKeys.openDocumentation, () =>
      this.openDocumentation(),
    );
    commands.registerCommand(CommandsKeys.newMarimoFile, () =>
      this.newMarimoFile(),
    );
    commands.registerCommand(CommandsKeys.convertToMarimoApp, () =>
      this.convertToMarimoApp(),
    );
    commands.registerCommand(CommandsKeys.showStatus, () =>
      this.healthService.showStatus(),
    );
  }

  private async startServer() {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Starting marimo server...",
        cancellable: false,
      },
      async () => {
        const response = await this.serverManager.start();
        await this.kernelManager.hydrateExistingNotebooks(response);
      },
    );
  }

  private async stopServer() {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Stopping marimo server...",
        cancellable: false,
      },
      async () => {
        await this.closeAllMarimoNotebookEditors();
        await this.serverManager.stopServer();
        this.kernelManager.clearAllKernels();
        await this.refreshUI();
      },
    );
  }

  private async closeAllMarimoNotebookEditors() {
    const editors = window.visibleNotebookEditors.filter(
      (editor) => editor.notebook.notebookType === NOTEBOOK_TYPE,
    );
    for (const editor of editors) {
      await window.showTextDocument(editor.notebook.uri, { preview: false });
      await commands.executeCommand("workbench.action.closeActiveEditor");
    }
  }

  private edit() {
    this.controllerManager.run(async (controller) => {
      await Launcher.start({ controller, mode: "edit" });
      controller.open();
    });
  }

  private run() {
    this.controllerManager.run(async (controller) => {
      await Launcher.start({ controller, mode: "run" });
      controller.open();
    });
  }

  private async restartKernel() {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Restarting marimo kernel...",
          cancellable: false,
        },
        async () => {
          await this.serverManager.start();
          await maybeKernel.restart();
          await maybeKernel.openKiosk();
        },
      );
      return;
    }

    this.controllerManager.run(async (controller) => {
      const mode = controller.currentMode || "edit";
      Launcher.stop(controller);
      await Launcher.start({ controller, mode });
      controller.open();
    });
  }

  private stopKernel() {
    this.controllerManager.run(async (controller) => {
      Launcher.stop(controller);
    });
  }

  private showCommands() {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      showCommands(maybeKernel, this.serverManager);
      return;
    }

    this.controllerManager.runOptional(async (controller) => {
      showCommands(controller, this.serverManager);
    });
  }

  private exportAsCommands() {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      exportAsCommands(maybeKernel.fileUri);
      return;
    }

    this.controllerManager.run(async (controller) => {
      exportAsCommands(controller.file.uri);
    });
  }

  private openInBrowser() {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.openKiosk("system");
      return;
    }

    this.controllerManager.run(async (controller) => {
      controller.open("system");
    });
  }

  private reloadBrowser() {
    const maybeKernel = KernelManager.getFocusedMarimoKernel();
    if (maybeKernel) {
      maybeKernel.reloadPanel();
      return;
    }

    this.controllerManager.run(async (controller) => {
      controller.reloadPanel();
    });
  }

  private async openNotebook() {
    await openMarimoNotebookDocument(await getActiveMarimoFile());
  }

  private openDocumentation() {
    env.openExternal(Uri.parse(DOCUMENTATION_URL));
  }

  private async newMarimoFile() {
    await createNewMarimoFile();
    await openMarimoNotebookDocument(await getActiveMarimoFile());
  }

  private async convertToMarimoApp() {
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage("No active editor");
      return;
    }

    const filePath = editor.document.uri.fsPath;
    if (filePath.endsWith(".ipynb")) {
      await convertIPyNotebook(filePath);
      return;
    }
    if (filePath.endsWith(".md")) {
      const content = editor.document.getText();
      if (!content.includes("marimo-version:")) {
        await convertMarkdownNotebook(filePath);
        return;
      }
    }

    window.showErrorMessage("Not a notebook file");
  }

  private registerEventListeners() {
    window.onDidCloseTerminal(async (terminal) => {
      if (this.serverManager.terminal.is(terminal)) {
        await this.serverManager.dispose();
        await this.kernelManager.clearAllKernels();
        await this.refreshUI();
      }

      const controller = this.controllerManager.findWithTerminal(terminal);
      controller?.dispose();
    });

    workspace.onDidOpenNotebookDocument(async (doc) => {
      await handleOnOpenNotebookDocument(
        doc,
        this.serverManager,
        this.kernelManager,
      );
    });
  }

  private registerNotebookSerializer() {
    workspace.registerNotebookSerializer(
      NOTEBOOK_TYPE,
      new MarimoNotebookSerializer(this.kernelManager),
      {
        transientOutputs: true,
      },
    );
  }
}

export async function activate(extension: ExtensionContext) {
  const marimoExtension = new MarimoExtension(extension);
  await marimoExtension.activate();
}

export async function deactivate() {
  logger.info("marimo extension is now deactivated!");
}
