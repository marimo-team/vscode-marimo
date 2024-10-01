import { describe, expect, it, vi } from "vitest";

import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { unlink } from "node:fs/promises";
import type { Uri } from "vscode";
import { ipynbFixtureUri, markdownFixtureUri } from "../../__fixtures__/mocks";
import { convertIPyNotebook } from "../convert";

describe("convert", () => {
  it("should convertIPyNotebook", async () => {
    const newUri = await convertIPyNotebook(ipynbFixtureUri.fsPath);
    expect(newUri).toBeDefined();
    // Clean up
    expect((newUri as Uri).fsPath).toMatch(/\.py$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it("should export as ipynb", async () => {
    const newUri = await convertIPyNotebook(markdownFixtureUri.fsPath);
    expect(newUri).toBeDefined();
    // Clean up
    expect((newUri as Uri).fsPath).toMatch(/\.py$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });
});
