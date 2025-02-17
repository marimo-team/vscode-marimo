import { type ChildProcess, spawn } from "node:child_process";
import { createVSCodeMock as create } from "jest-mock-vscode";
import { type VitestUtils, afterAll } from "vitest";
import type { NotebookController } from "vscode";

const openProcesses: ChildProcess[] = [];

export async function createVSCodeMock(vi: VitestUtils) {
  // biome-ignore lint/suspicious/noExplicitAny: any is ok
  const vscode = create(vi) as any;

  vscode.workspace = vscode.workspace || {};
  let configMap: Record<string, unknown> = {};

  // Add createTerminal mock
  vscode.window.createTerminal = vi.fn().mockImplementation(() => {
    let proc: ChildProcess | undefined;
    return {
      processId: Promise.resolve(1),
      dispose: vi.fn().mockImplementation(() => {
        proc?.kill();
      }),
      sendText: vi.fn().mockImplementation((args: string) => {
        proc = spawn(args, { shell: true });
        proc.stdout?.on("data", (data) => {
          const line = data.toString();
          if (line) {
            console.warn(line);
          }
        });
        proc.stderr?.on("data", (data) => {
          const line = data.toString();
          if (line) {
            console.warn(line);
          }
        });
        proc.on("error", (error) => {
          if (error) {
            console.warn(error);
          }
        });
        proc.on("close", (code) => {
          console.warn(`Process exited with code ${code}`);
        });
        openProcesses.push(proc);
      }),
      show: vi.fn(),
    };
  });

  vscode.workspace.getConfiguration = vi.fn().mockImplementation(() => {
    return {
      get: vi.fn().mockImplementation((key) => configMap[key]),
      update: vi.fn().mockImplementation((key, value) => {
        configMap[key] = value;
      }),
      set: vi.fn().mockImplementation((key, value) => {
        configMap[key] = value;
      }),
      reset: vi.fn().mockImplementation(() => {
        configMap = {};
      }),
    };
  });

  vscode.window.createOutputChannel.mockImplementation(() => {
    return {
      debug: vi.fn().mockImplementation((...args) => console.log(...args)),
      info: vi.fn().mockImplementation((...args) => console.log(...args)),
      error: vi.fn().mockImplementation((...args) => console.error(...args)),
      warn: vi.fn().mockImplementation((...args) => console.warn(...args)),
      createLogger: vi.fn(),
    };
  });

  vscode.env = vscode.env || {};
  vscode.env.asExternalUri = vi.fn().mockImplementation(async (uri) => uri);
  enum QuickPickItemKind {
    Separator = -1,
    Default = 0,
  }
  vscode.QuickPickItemKind = QuickPickItemKind;
  vscode.window.createWebviewPanel = vi.fn().mockImplementation(() => {
    return {
      webview: {
        onDidReceiveMessage: vi.fn(),
        html: "",
      },
      onDidDispose: vi.fn(),
      dispose: vi.fn(),
    };
  });

  vscode.notebooks = vscode.notebooks || {};
  vscode.notebooks.createNotebookController = vi
    .fn()
    .mockImplementation((id, notebookType, label) => {
      const mockNotebookController: NotebookController = {
        id,
        notebookType,
        supportedLanguages: [],
        label,
        supportsExecutionOrder: false,
        createNotebookCellExecution: vi.fn(),
        executeHandler: vi.fn(),
        interruptHandler: vi.fn(),
        onDidChangeSelectedNotebooks: vi.fn(),
        updateNotebookAffinity: vi.fn(),
        dispose: vi.fn(),
      };
      return mockNotebookController;
    });

  return vscode;
}

afterAll(() => {
  openProcesses.forEach((proc) => proc.kill());
});
