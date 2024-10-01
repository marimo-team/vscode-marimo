import { commands } from "vscode";

export class VscodeContextManager {
  private setContext(
    context: string,
    value: string | boolean | undefined | null,
  ) {
    void commands.executeCommand("setContext", context, value);
  }

  public setMarimoServerRunning(value: true | false | "null") {
    this.setContext("marimo.isMarimoServerRunning", value);
  }

  public setMarimoApp(value: boolean) {
    this.setContext("marimo.isMarimoApp", value);
  }
}
