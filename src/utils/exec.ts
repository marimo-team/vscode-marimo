import { execFile, execSync } from "node:child_process";
import { workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { getInterpreterDetails } from "./python";

export async function execMarimoCommand(command: string[]) {
  // When marimoPath is set, use that directly
  let cmd = Config.marimoPath;
  if (cmd && cmd !== "marimo") {
    cmd = maybeQuotes(cmd);
    return execSync(`${cmd} ${command.join(" ")}`);
  }
  // Otherwise, use python -m marimo
  return execPythonModule(["marimo", ...command]);
}

/**
 * Execute a python module
 * e.g. /usr/bin/python -m marimo edit
 * or
 * e.g. uv run python -m marimo edit
 */
export async function execPythonModule(command: string[]) {
  // Otherwise use python interpreter
  let interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);
  // Maybe quote if it has spaces
  interpreter = maybeQuotes(interpreter);
  return execSync(`${interpreter} -m ${command.join(" ")}`);
}

export async function execPythonFile(command: string[]) {
  let interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);
  // Maybe quote if it has spaces
  interpreter = maybeQuotes(interpreter);
  return execSync(`${interpreter} ${command.join(" ")}`);
}

export async function hasPythonModule(module: string) {
  let interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);
  // Maybe quote if it has spaces
  interpreter = maybeQuotes(interpreter);
  return execSync(`${interpreter} -c 'import ${module}'`);
}

// Quote if it has spaces and is not a command like "uv run"
export function maybeQuotes(command: string) {
  if (
    command.includes(" ") &&
    !command.startsWith("uv ") &&
    !command.startsWith("uvx ")
  ) {
    return `"${command}"`;
  }
  return command;
}

export async function hasExecutable(executable: string): Promise<boolean> {
  try {
    await execFile(executable, ["--help"]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function getInterpreter(): Promise<string | undefined> {
  try {
    if (Config.pythonPath) {
      return Config.pythonPath;
    }
    const activeWorkspace = workspace.workspaceFolders?.[0];

    if (activeWorkspace) {
      const interpreters = (await getInterpreterDetails(activeWorkspace.uri))
        .path;

      if (!interpreters) {
        logger.error("No interpreters found");
        return undefined;
      }

      logger.debug("Found interpreters", interpreters);

      if (interpreters.length > 0) {
        return interpreters[0];
      }
    }
  } catch (error) {
    logger.error("Error getting interpreter: ", error);
  }

  return undefined;
}
