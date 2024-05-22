import path from "node:path";
import {
  type Disposable,
  type ExtensionContext,
  type Terminal,
  window,
} from "vscode";
import { logger } from "../logger";
import { Config } from "./config";
import { wait } from "./utils";

export class MarimoTerminal implements Disposable {
  private terminal: Terminal | undefined;
  private logger = logger.createLogger(this.appName);

  constructor(
    private extension: ExtensionContext,
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

  relativePathFor(file: string) {
    if (this.cwd && file.startsWith(this.cwd)) {
      return path.relative(this.cwd, file);
    }
    return file;
  }

  private isTerminalActive() {
    return this.terminal && this.terminal.exitStatus === undefined;
  }

  dispose() {
    this.logger.log("killing terminal");
    this.endProcess();
    this.terminal?.dispose();
    this.terminal = undefined!;
    this.logger.log("terminal disposed");
  }

  async show() {
    this.logger.log("showing terminal");
    await this.ensureTerminal();
    this.terminal?.show(true);
  }

  private endProcess() {
    if (this.isTerminalActive()) {
      this.terminal?.sendText("\u0003");
      this.terminal?.sendText("\u0003");
    }
    this.extension.globalState.update(this.keyFor("pid"), undefined);
  }

  is(term: Terminal) {
    return this.terminal === term;
  }

  async tryRecoverTerminal() {
    this.logger.log("trying to recover terminal");
    if (this.terminal) {
      return;
    }

    const pid = this.extension.globalState.get(this.keyFor("pid"));
    this.logger.log("recovered pid", pid);
    if (!pid) {
      return;
    }

    const terminals = await Promise.all(
      window.terminals.map(async (index) =>
        pid === (await index.processId) ? index : undefined,
      ),
    );

    const terminal = terminals.find(Boolean);

    if (terminal) {
      this.logger.log("recovered terminal");
      this.terminal = terminal;
      return true;
    }
    return false;
  }

  async executeCommand(cmd: string) {
    await this.ensureTerminal();
    this.terminal?.sendText(cmd);

    if (Config.showTerminal) {
      this.terminal?.show(false);
    }
    await wait(2000);
    const pid = await this.terminal?.processId;
    if (pid) {
      this.extension.globalState.update(this.keyFor("pid"), pid);
    }
  }

  private keyFor(key: string) {
    return `marimo.${this.fsPath}.${key}`;
  }
}
