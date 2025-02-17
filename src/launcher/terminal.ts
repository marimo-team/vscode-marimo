import path from "node:path";
import {
  type CancellationToken,
  type Disposable,
  type Terminal,
  type Uri,
  window,
} from "vscode";
import { Config } from "../config";
import { getGlobalState } from "../ctx";
import { logger } from "../logger";
import { LogMethodCalls } from "../utils/log";
import { wait } from "../utils/wait";

export interface IMarimoTerminal extends Disposable {
  show(): void;
  relativePathFor(file: Uri): string;
  is(term: Terminal): boolean;
  tryRecoverTerminal(): Promise<boolean>;
  executeCommand(cmd: string, token?: CancellationToken): Promise<void>;
}

export class MarimoTerminal implements IMarimoTerminal {
  private terminal: Terminal | undefined;
  private logger = logger.createLogger(this.appName);

  constructor(
    private fsPath: string,
    private cwd: string | undefined,
    private appName: string,
  ) {}

  private async ensureTerminal() {
    if (this.isTerminalActive()) {
      return;
    }

    this.terminal = window.createTerminal({
      name: `marimo ${this.appName}`,
      cwd: this.cwd,
    });
    // Wait 1s for the terminal to 'source' the virtualenv
    await wait(1000);
  }

  relativePathFor(file: Uri): string {
    if (this.cwd && file.fsPath.startsWith(this.cwd)) {
      return path.relative(this.cwd, file.fsPath);
    }
    return file.fsPath;
  }

  private isTerminalActive() {
    return this.terminal && this.terminal.exitStatus === undefined;
  }

  @LogMethodCalls()
  dispose() {
    this.endProcess();
    this.terminal?.dispose();
    this.terminal = undefined;
    this.logger.info("terminal disposed");
  }

  @LogMethodCalls()
  async show() {
    await this.ensureTerminal();
    this.terminal?.show(true);
  }

  private endProcess() {
    if (this.isTerminalActive()) {
      this.terminal?.sendText("\u0003");
      this.terminal?.sendText("\u0003");
    }
    getGlobalState().update(this.keyFor("pid"), undefined);
  }

  is(term: Terminal) {
    return this.terminal === term;
  }

  @LogMethodCalls()
  async tryRecoverTerminal(): Promise<boolean> {
    if (this.terminal) {
      return false;
    }

    const pid = getGlobalState().get(this.keyFor("pid"));
    if (!pid) {
      return false;
    }
    this.logger.debug("recovered pid", pid);

    const terminals = await Promise.all(
      window.terminals.map(async (index) =>
        pid === (await index.processId) ? index : undefined,
      ),
    );

    const terminal = terminals.find(Boolean);

    if (terminal) {
      this.terminal = terminal;
      return true;
    }
    return false;
  }

  @LogMethodCalls()
  async executeCommand(cmd: string, token?: CancellationToken) {
    await this.ensureTerminal();
    if (!this.terminal) {
      this.logger.error("terminal not found");
      return;
    }

    // Set up abort handler
    if (token) {
      if (token.isCancellationRequested) {
        throw new Error("Command aborted before execution");
      }
      token.onCancellationRequested(() => {
        this.logger.info("Command aborted");
        this.endProcess();
      });
    }

    try {
      this.terminal.sendText(cmd);

      if (Config.showTerminal) {
        this.terminal.show(true);
      }
      await wait(2_000);
      const pid = await this.terminal.processId;
      if (pid) {
        getGlobalState().update(this.keyFor("pid"), pid);
      }
    } catch (error) {
      this.terminal.show(true);
      window.showErrorMessage(`Command failed: ${error}`);
      throw error;
    }
  }

  private keyFor(key: string) {
    return `marimo.${this.fsPath}.${key}`;
  }
}
