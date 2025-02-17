import { window } from "vscode";
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
      channel.debug(`[${this.prefix}]: ${args.map(stringify).join(" ")}`);
    } else {
      channel.debug(args.map(stringify).join(" "));
    }
  }

  info(...args: unknown[]) {
    if (this.prefix) {
      channel.info(`[${this.prefix}]: ${args.map(stringify).join(" ")}`);
    } else {
      channel.info(args.map(stringify).join(" "));
    }
  }

  error(...args: unknown[]) {
    if (this.prefix) {
      channel.error(`[${this.prefix}] ${args.map(stringify).join(" ")}`);
    } else {
      channel.error(args.map(stringify).join(" "));
    }
  }

  warn(...args: unknown[]) {
    if (this.prefix) {
      channel.warn(
        `[⚠️ warn] [${this.prefix}] ${args.map(stringify).join(" ")}`,
      );
    } else {
      channel.warn(args.map(stringify).join(" "));
    }
  }

  createLogger(prefix: string) {
    if (!this.prefix) {
      return new Logger(prefix);
    }
    return new Logger(`${this.prefix} > ${prefix}`);
  }
}

function stringify(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export const logger = new Logger("");
