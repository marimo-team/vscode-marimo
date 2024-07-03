import { readTextDocument } from "jest-mock-vscode";
import { vi } from "vitest";
import {
  type ExtensionContext,
  NotebookController,
  type NotebookDocument,
  Uri,
  workspace,
} from "vscode";
import { setExtension } from "../ctx";
import { MarimoController } from "../launcher/controller";
import type { KernelKey } from "../notebook/common/key";
import { NOTEBOOK_TYPE } from "../notebook/constants";
import { createNotebookController } from "../notebook/createMarimoNotebookController";
import { Kernel } from "../notebook/kernel";
import type { SkewToken } from "../notebook/marimo/types";

const appFixture = new URL(
  "../__fixtures__/app.py",
  import.meta.url,
).toString();
export const appFixtureUri = Uri.parse(appFixture);
export const markdownFixtureUri = Uri.parse(
  new URL("../__fixtures__/mock.md", import.meta.url).toString(),
);
export const ipynbFixtureUri = Uri.parse(
  new URL("../__fixtures__/mock.ipynb", import.meta.url).toString(),
);

setExtension({
  subscriptions: [],
  workspaceState: {
    get: vi.fn(),
    update: vi.fn(),
  },
  globalState: {
    get: vi.fn(),
    update: vi.fn(),
  },
} as unknown as ExtensionContext);

export const controller = createNotebookController();
export const mockNotebookDocument: NotebookDocument = {
  uri: Uri.parse(appFixture),
  notebookType: NOTEBOOK_TYPE,
  version: 1,
  isDirty: false,
  isUntitled: false,
  isClosed: false,
  metadata: {},
  cellCount: 0,
  cellAt: vi.fn(),
  getCells: vi.fn(),
  save: vi.fn(),
};

export const mockKernel = new Kernel({
  port: 100,
  fileUri: Uri.parse(appFixture),
  kernelKey: "kernel-key" as KernelKey,
  skewToken: "skew-token" as SkewToken,
  version: "1.0.0",
  userConfig: {},
  controller,
  notebookDoc: mockNotebookDocument,
});

export async function createMockController(file: Uri = Uri.parse(appFixture)) {
  return new MarimoController(await readTextDocument(file));
}
