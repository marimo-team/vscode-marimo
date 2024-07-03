import { describe, expect, it, vi } from "vitest";

import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));

import { unlink } from "node:fs/promises";
import type { Uri } from "vscode";
import { appFixtureUri } from "../../__fixtures__/mocks";
import { exportNotebookAs } from "../export-as";

describe("export-as", () => {
  it("should export as html", async () => {
    const newUri = await exportNotebookAs(appFixtureUri.fsPath, "html");
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.html$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it("should export as ipynb", async () => {
    const newUri = await exportNotebookAs(appFixtureUri.fsPath, "ipynb");
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.ipynb$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it("should export as md", async () => {
    const newUri = await exportNotebookAs(appFixtureUri.fsPath, "md");
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.md$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it("should export as script", async () => {
    const newUri = await exportNotebookAs(appFixtureUri.fsPath, "script");
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.py$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it("should export as html without code", async () => {
    const newUri = await exportNotebookAs(
      appFixtureUri.fsPath,
      "html-without-code",
    );
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.html$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });
});
