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
  const configMap: Record<string, unknown> = {};

  vscode.workspace.getConfiguration = vi.fn().mockImplementation(() => {
    return {
      get: vi.fn().mockImplementation((key) => configMap[key]),
      update: vi.fn().mockImplementation((key, value) => {
        configMap[key] = value;
      }),
      set: vi.fn().mockImplementation((key, value) => {
        configMap[key] = value;
      }),
    };
  });

  vscode.window.createOutputChannel.mockImplementation(() => {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
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
