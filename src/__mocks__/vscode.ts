import { spawn } from "node:child_process";
import { createVSCodeMock as create } from "jest-mock-vscode";
import type { VitestUtils } from "vitest";
import type { NotebookController } from "vscode";

export function createVSCodeMock(vi: VitestUtils) {
  // biome-ignore lint/suspicious/noExplicitAny: any is ok
  const vscode = create(vi) as any;

  vscode.window.createWebviewPanel.mockImplementation(() => {
    return {
      webview: {
        html: "",
        onDidReceiveMessage: vi.fn(),
      },
      onDidDispose: vi.fn(),
    };
  });

  vscode.workspace = vscode.workspace || {};
  let configMap: Record<string, unknown> = {};

  // Add createTerminal mock
  vscode.window.createTerminal = vi.fn().mockImplementation(() => {
    return {
      processId: Promise.resolve(1),
      dispose: vi.fn(),
      sendText: vi.fn().mockImplementation((args: string) => {
        const proc = spawn(args, { shell: true });
        proc.on("data", (data) => {
          console.log(data.toString());
        });
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
