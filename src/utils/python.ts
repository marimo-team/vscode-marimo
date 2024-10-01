import {
  PythonExtension,
  type ResolvedEnvironment,
} from "@vscode/python-extension";
import {
  Disposable,
  type Event,
  EventEmitter,
  type Uri,
  commands,
} from "vscode";
import { extension } from "../ctx";
import { logger } from "../logger";

// Adapted from https://github.com/astral-sh/ruff-vscode/blob/d5d4acf3b63eacbe5a4b2e2f4da56f74cb494889/src/common/python.ts

export interface IInterpreterDetails {
  path?: string[];
  resource?: Uri;
}

const onDidChangePythonInterpreterEvent =
  new EventEmitter<IInterpreterDetails>();
export const onDidChangePythonInterpreter: Event<IInterpreterDetails> =
  onDidChangePythonInterpreterEvent.event;

let _api: PythonExtension | undefined;
async function getPythonExtensionAPI(): Promise<PythonExtension | undefined> {
  if (_api) {
    return _api;
  }
  _api = await PythonExtension.api();
  return _api;
}

export async function initializePython(): Promise<void> {
  try {
    const api = await getPythonExtensionAPI();

    if (api) {
      extension.subscriptions.push(
        api.environments.onDidChangeActiveEnvironmentPath((e) => {
          onDidChangePythonInterpreterEvent.fire({
            path: [e.path],
            resource: e.resource?.uri,
          });
        }),
      );

      logger.info("Waiting for interpreter from python extension.");
      onDidChangePythonInterpreterEvent.fire(await getInterpreterDetails());
    }
  } catch (error) {
    logger.error("Error initializing python: ", error);
  }
}

export async function resolveInterpreter(
  interpreter: string[],
): Promise<ResolvedEnvironment | undefined> {
  const api = await getPythonExtensionAPI();
  return api?.environments.resolveEnvironment(interpreter[0]);
}

export async function getInterpreterDetails(
  resource?: Uri,
): Promise<IInterpreterDetails> {
  const api = await getPythonExtensionAPI();
  const environment = await api?.environments.resolveEnvironment(
    api?.environments.getActiveEnvironmentPath(resource),
  );
  if (environment?.executable.uri && checkVersion(environment)) {
    return { path: [environment?.executable.uri.fsPath], resource };
  }
  return { path: undefined, resource };
}

export async function getDebuggerPath(): Promise<string | undefined> {
  const api = await getPythonExtensionAPI();
  return api?.debug.getDebuggerPackagePath();
}

export async function runPythonExtensionCommand(
  command: string,
  ...rest: any[]
) {
  await getPythonExtensionAPI();
  return await commands.executeCommand(command, ...rest);
}

export function checkVersion(resolved: ResolvedEnvironment): boolean {
  const version = resolved.version;
  if (version?.major === 3 && version?.minor >= 9) {
    return true;
  }
  logger.error(
    `Python version ${version?.major}.${version?.minor} is not supported.`,
  );
  logger.error(`Selected python path: ${resolved.executable.uri?.fsPath}`);
  logger.error("Supported versions are 3.9 and above.");
  return false;
}
