import path from "node:path";
import {
  type Disposable,
  type Terminal,
  type TextDocument,
  Uri,
  env,
  window,
  workspace,
} from "vscode";
import { MarimoPanelManager } from "../browser/panel";
import { Config, composeUrl } from "../config";
import { getGlobalState } from "../ctx";
import { MarimoRunningKernelsProvider } from "../explorer/explorer";
import { logger } from "../logger";
import type { ServerManager } from "../services/server-manager";
import { StatusBar } from "../ui/status-bar";
import { MarimoCmdBuilder } from "../utils/cmd";
import { getInterpreter, maybeQuotes } from "../utils/exec";
import { ping } from "../utils/network";
import { getFocusedMarimoTextEditor } from "../utils/query";
import { asURL } from "../utils/url";
import { type IMarimoTerminal, MarimoTerminal } from "./terminal";

export type AppMode = "edit" | "run";

export interface IMarimoController {
  currentMode: AppMode | undefined;
  active: boolean;
  port: number | undefined;
  terminal: MarimoTerminal;
  start(mode: AppMode, port: number): Promise<void>;
  open(browser?: "embedded" | "system"): Promise<void>;
  reloadPanel(): void;
  dispose(): void;
}

/**
 * Controller for a marimo app.
 * Manages a running marimo server, the terminal, and the webview panel.
 */
export class MarimoController implements Disposable {
  public terminal: IMarimoTerminal;
  private panel: MarimoPanelManager;

  public currentMode: AppMode | undefined;
  public active = false;
  public port: number | undefined;
  private logger = logger.createLogger(this.appName);

  constructor(
    public file: TextDocument,
    public serverManager: ServerManager,
  ) {
    this.file = file;
    const workspaceFolder = workspace.workspaceFolders?.find((folder) =>
      file.uri.fsPath.startsWith(folder.uri.fsPath),
    )?.uri.fsPath;

    this.terminal = new MarimoTerminal(
      file.uri.fsPath,
      workspaceFolder,
      this.appName,
    );
    this.panel = new MarimoPanelManager(this.appName);

    // Try to recover state
    this.tryRecoverState();
  }

  hasTerminal(term: Terminal) {
    return this.terminal.is(term);
  }

  async start(mode: AppMode, port: number) {
    // If edit mode, use the existing server
    if (mode === "edit") {
      const { port } = await this.serverManager.start();
      this.active = true;
      this.port = port;
      this.currentMode = mode;
      this.onUpdate();
      return;
    }

    getGlobalState().update(this.keyFor("mode"), mode);
    this.currentMode = mode;
    getGlobalState().update(this.keyFor("port"), port);
    this.port = port;
    const filePath = this.terminal.relativePathFor(this.file.uri);

    const cmd = new MarimoCmdBuilder()
      .debug(Config.debug)
      .mode(mode)
      .fileOrDir(filePath)
      .host(Config.host)
      .port(port)
      .headless(true)
      .enableToken(Config.enableToken)
      .tokenPassword(Config.tokenPassword)
      .build();

    const interpreter = await getInterpreter();
    if (Config.marimoPath) {
      logger.info(`Using marimo path ${Config.marimoPath}`);
      await this.terminal.executeCommand(
        `${maybeQuotes(Config.marimoPath)} ${cmd}`,
      );
    } else if (interpreter) {
      logger.info(`Using interpreter ${interpreter}`);
      await this.terminal.executeCommand(
        `${maybeQuotes(interpreter)} -m marimo ${cmd}`,
      );
    } else {
      logger.info("Using default interpreter");
      await this.terminal.executeCommand(cmd);
    }

    this.active = true;
    this.onUpdate();
  }

  private onUpdate() {
    StatusBar.update();
  }

  isWebviewActive() {
    return this.panel.isActive();
  }

  async open(browser = Config.browser) {
    // If already opened, just focus
    if (browser === "embedded" && this.panel.isReady()) {
      this.panel.show();
    }

    const url = await this.url();
    if (browser === "system") {
      // Close the panel if opened
      this.panel.dispose();
      await env.openExternal(Uri.parse(url));
    } else if (browser === "embedded") {
      await this.panel.create(url);
      this.panel.show();
    }

    // Wait 1s and refresh connections
    setTimeout(() => {
      MarimoRunningKernelsProvider.refresh();
    }, 1000);
  }

  reloadPanel() {
    this.panel.reload();
  }

  async tryRecoverState() {
    if (!(await this.terminal.tryRecoverTerminal())) {
      return;
    }
    this.logger.info("terminal recovered");

    const port = +(getGlobalState().get<number>(this.keyFor("port")) || 0);
    if (!port) {
      return;
    }

    const url = await composeUrl(port);

    if (!(await ping(url))) {
      return;
    }

    this.active = true;
    this.port = port;
    this.currentMode = getGlobalState().get(this.keyFor("mode")) || "edit";
    this.logger.info("state recovered");

    this.onUpdate();
    return true;
  }

  dispose() {
    this.panel.dispose();
    this.terminal.dispose();
    this.active = false;
    this.port = undefined;
    getGlobalState().update(this.keyFor("mode"), undefined);
    getGlobalState().update(this.keyFor("port"), undefined);
    this.onUpdate();
  }

  public get appName() {
    const filePath = this.file.uri.fsPath;
    const fileName = path.basename(filePath) || "app.py";
    const folderName = path.basename(path.dirname(filePath));
    return folderName ? `${folderName}/${fileName}` : fileName;
  }

  public async url(): Promise<string> {
    if (!this.port) {
      return "";
    }
    const url = asURL(await composeUrl(this.port));
    if (this.currentMode === "edit") {
      url.searchParams.set("file", this.file.uri.fsPath);
    }
    return url.toString();
  }

  private keyFor(key: string) {
    return `marimo.${this.file.uri.fsPath}.${key}`;
  }
}

export class ControllerManager implements Disposable {
  private controllers: Map<string, MarimoController> = new Map();

  constructor(private serverManager: ServerManager) {}

  getControllerForActivePanel(): MarimoController | undefined {
    return [...this.controllers.values()].find((c) => c.isWebviewActive());
  }

  getOrCreate(file: TextDocument): MarimoController {
    const key = file.uri.fsPath;
    let controller = this.controllers.get(key);
    if (controller) {
      return controller;
    }
    controller = new MarimoController(file, this.serverManager);
    this.controllers.set(key, controller);
    return controller;
  }

  get(uri: Uri | undefined): MarimoController | undefined {
    if (!uri) {
      return;
    }
    return this.controllers.get(uri.fsPath);
  }

  findWithTerminal(term: Terminal): MarimoController | undefined {
    return [...this.controllers.values()].find((c) => c.terminal.is(term));
  }

  dispose() {
    for (const c of this.controllers.values()) c.dispose();
    this.controllers.clear();
  }

  // Run a function an active or new controller
  run<T>(fn: (controller: MarimoController) => T) {
    return this.runOptional((c) => {
      if (c) {
        return fn(c);
      }
      return undefined;
    });
  }

  runOptional<T>(fn: (controller: MarimoController | undefined) => T) {
    // If we are focused on a panel, use that controller
    const activePanelController = this.getControllerForActivePanel();
    if (activePanelController) {
      return fn(activePanelController);
    }

    // If the active file is a marimo file, use that controller
    const file = getFocusedMarimoTextEditor({ toast: false });
    if (!file) {
      return fn(undefined);
    }

    const controller = this.getOrCreate(file.document);
    return fn(controller);
  }
}
