import { type LogOutputChannel, window } from "vscode";
import { Config } from "./config";
import { EXTENSION_DISPLAY_NAME } from "./constants";

/**
 * Logger is a utility class for logging messages with different levels (debug, info, error, warn).
 * It supports optional prefixing to provide context for log messages and integrates with the
 * VS Code Output Channel for displaying logs. This class is designed to be used throughout
 * the extension to ensure consistent and structured logging.
 */
class Logger {
  private channel: LogOutputChannel;

  constructor(private prefix: string) {
    this.channel = window.createOutputChannel(EXTENSION_DISPLAY_NAME, {
      log: true,
    });
  }

  debug(...args: unknown[]) {
    if (!Config.debug) {
      return;
    }
    if (this.prefix) {
      this.channel.debug(`[${this.prefix}]: ${args.map(stringify).join(" ")}`);
    } else {
      this.channel.debug(args.map(stringify).join(" "));
    }
  }

  info(...args: unknown[]) {
    if (this.prefix) {
      this.channel.info(`[${this.prefix}]: ${args.map(stringify).join(" ")}`);
    } else {
      this.channel.info(args.map(stringify).join(" "));
    }
  }

  error(...args: unknown[]) {
    if (this.prefix) {
      this.channel.error(`[${this.prefix}] ${args.map(stringify).join(" ")}`);
    } else {
      this.channel.error(args.map(stringify).join(" "));
    }
  }

  warn(...args: unknown[]) {
    if (this.prefix) {
      this.channel.warn(
        `[⚠️ warn] [${this.prefix}] ${args.map(stringify).join(" ")}`,
      );
    } else {
      this.channel.warn(args.map(stringify).join(" "));
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
