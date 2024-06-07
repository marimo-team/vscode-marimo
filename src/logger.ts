import { window } from "vscode";

const channel = window.createOutputChannel("marimo");

class Logger {
  constructor(private prefix: string) {}

  debug(...args: unknown[]) {
    if (this.prefix) {
      channel.appendLine(`${this.prefix}: ${args.join(" ")}`);
    } else {
      channel.appendLine(args.join(" "));
    }
  }

  log(...args: unknown[]) {
    if (this.prefix) {
      channel.appendLine(`${this.prefix}: ${args.join(" ")}`);
    } else {
      channel.appendLine(args.join(" "));
    }
  }

  error(...args: unknown[]) {
    if (this.prefix) {
      channel.appendLine(`[error] [${this.prefix}] ${args.join(" ")}`);
    } else {
      channel.appendLine(args.join(" "));
    }
  }

  warn(...args: unknown[]) {
    if (this.prefix) {
      channel.appendLine(`[warn] [${this.prefix}] ${args.join(" ")}`);
    } else {
      channel.appendLine(args.join(" "));
    }
  }

  createLogger(prefix: string) {
    if (!this.prefix) {
      return new Logger(prefix);
    }
    return new Logger(`${this.prefix} > ${prefix}`);
  }
}

export const logger = new Logger("");
