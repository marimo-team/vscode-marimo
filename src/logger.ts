import { LogOutputChannel, window } from "vscode";
import { Config } from "./config";
import { EXTENSION_DISPLAY_NAME } from "./constants";

const channel = window.createOutputChannel(EXTENSION_DISPLAY_NAME, {
  log: true,
});

class Logger {
  constructor(private prefix: string) {}

  debug(...args: unknown[]) {
    if (!Config.debug) {
      return;
    }
    if (this.prefix) {
      channel.debug(`[${this.prefix}]: ${args.join(" ")}`);
    } else {
      channel.debug(`${args.join(" ")}`);
    }
  }

  info(...args: unknown[]) {
    if (this.prefix) {
      channel.info(`[${this.prefix}]: ${args.join(" ")}`);
    } else {
      channel.info(args.join(" "));
    }
  }

  error(...args: unknown[]) {
    if (this.prefix) {
      channel.error(`[${this.prefix}] ${args.join(" ")}`);
    } else {
      channel.error(args.join(" "));
    }
  }

  warn(...args: unknown[]) {
    if (this.prefix) {
      channel.warn(`[⚠️ warn] [${this.prefix}] ${args.join(" ")}`);
    } else {
      channel.warn(args.join(" "));
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
