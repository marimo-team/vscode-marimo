import { execFileSync } from "node:child_process";
import { workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { getInterpreterDetails } from "./python";

function execWithLogger(command: string, args: string[]) {
  const cleanedArgs = args.map((arg) => arg.trim()).filter(Boolean);
  logger.info(`Executing: ${command} ${JSON.stringify(cleanedArgs)}`);
  return execFileSync(command, cleanedArgs, {
    shell: false,
    encoding: "utf8",
  });
}

export async function execMarimoCommand(command: string[]): Promise<string> {
  // When marimoPath is set, use that directly
  const cmd = Config.marimoPath;
  if (cmd && cmd !== "marimo") {
    if (cmd.startsWith("uv ") || cmd.startsWith("uvx ")) {
      const [uvCmd, ...uvArgs] = cmd.split(" ");
      return execWithLogger(uvCmd, [...uvArgs, ...command]);
    }
    return execWithLogger(cmd, command);
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
  const interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);

  // Handle uv/uvx commands specially
  if (interpreter.startsWith("uv ") || interpreter.startsWith("uvx ")) {
    const [uvCmd, ...uvArgs] = interpreter.split(" ");
    return execWithLogger(uvCmd, [...uvArgs, "-m", ...command]);
  }

  return execWithLogger(interpreter, ["-m", ...command]);
}

export async function execPythonFile(command: string[]) {
  const interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);

  // Handle uv/uvx commands specially
  if (interpreter.startsWith("uv ") || interpreter.startsWith("uvx ")) {
    const [uvCmd, ...uvArgs] = interpreter.split(" ");
    return execWithLogger(uvCmd, [...uvArgs, ...command]);
  }

  return execWithLogger(interpreter, command);
}

export async function hasPythonModule(module: string) {
  const interpreter = (await getInterpreter()) || "python";
  logger.info(`Using interpreter: ${interpreter}`);

  // Handle uv/uvx commands specially
  if (interpreter.startsWith("uv ") || interpreter.startsWith("uvx ")) {
    const [uvCmd, ...uvArgs] = interpreter.split(" ");
    return execWithLogger(uvCmd, [...uvArgs, "-c", `import ${module}`]);
  }

  return execWithLogger(interpreter, ["-c", `import ${module}`]);
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
    await execWithLogger(executable, ["--help"]);
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
