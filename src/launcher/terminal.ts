import { Disposable, ExtensionContext, Terminal, window } from 'vscode';
import { Config } from './config';
import { wait } from './utils';

export class MarimoTerminal implements Disposable {
  private terminal: Terminal | undefined;

  constructor(private extension: ExtensionContext, private fsPath: string, private appName: string) {}

  private ensureTerminal() {
    if (this.isTerminalActive()) {
      return;
    }

    this.terminal = window.createTerminal(`marimo ${this.appName}`);
  }

  private isTerminalActive() {
    return this.terminal && this.terminal.exitStatus == undefined;
  }

  dispose() {
    this.endProcess();
    this.terminal?.dispose();
    this.terminal = undefined!;
  }

  show() {
    this.ensureTerminal();
    this.terminal?.show(true);
  }

  private endProcess() {
    if (this.isTerminalActive()) {
      this.terminal?.sendText('\u0003');
      this.terminal?.sendText('\u0003');
    }
    // eslint-disable-next-line unicorn/no-useless-undefined
    this.extension.globalState.update(this.keyFor('pid'), undefined);
  }

  is(term: Terminal) {
    return this.terminal === term;
  }

  async tryRecoverTerminal() {
    if (this.terminal) {
      return;
    }

    const pid = this.extension.globalState.get(this.keyFor('pid'));
    if (!pid) {
      return;
    }

    const terminals = await Promise.all(
      window.terminals.map(async (index) => (pid === (await index.processId) ? index : undefined))
    );

    const terminal = terminals.find(Boolean);

    if (terminal) {
      this.terminal = terminal;
      return true;
    }
    return false;
  }

  async executeCommand(cmd: string) {
    this.ensureTerminal();
    this.terminal?.sendText(cmd);
    if (Config.showTerminal) {
      this.terminal?.show(false);
    }
    await wait(2000);
    const pid = await this.terminal?.processId;
    if (pid) {
      this.extension.globalState.update(this.keyFor('pid'), pid);
    }
  }

  private keyFor(key: string) {
    return `marimo.${this.fsPath}.${key}`;
  }
}
