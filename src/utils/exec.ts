import { execFile, execSync } from "node:child_process";
import { workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { getInterpreterDetails } from "./python";

/**
 * Execute a python executable command
 *
 * We prefix the command with the path to the python executable
 */
export async function execPython(command: string[]) {
  let interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);
  // Only quote if it has spaces and is not a command like "uv run python"
  if (interpreter.includes(" ") && !interpreter.startsWith("uv run")) {
    interpreter = `"${interpreter}"`;
  }
  return execSync(`${interpreter} -m ${command.join(" ")}`);
}

export async function hasPythonModule(module: string) {
  let interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);
  // Only quote if it has spaces and is not a command like "uv run python"
  if (interpreter.includes(" ") && !interpreter.startsWith("uv run")) {
    interpreter = `"${interpreter}"`;
  }
  return execSync(`${interpreter} -c 'import ${module}'`);
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
