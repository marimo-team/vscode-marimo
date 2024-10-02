import { describe, expect, it, vi } from "vitest";

import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import type { Uri } from "vscode";
import { appFixtureUri } from "../../__fixtures__/mocks";
import { exportNotebookAs, getUniqueFilename } from "../export-as";

vi.mock("node:fs");

describe("export-as", () => {
  it("should export as html", async () => {
    const newUri = await exportNotebookAs(appFixtureUri.fsPath, "html");
    expect(newUri).toBeDefined();
    expect((newUri as Uri).fsPath).toMatch(/\.html$/);
    // Clean up
    await unlink((newUri as Uri).fsPath);
  });

  it.skip("should export as ipynb", async () => {
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

describe("getUniqueFilename", () => {
  it("should return the original filename if it doesn't exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = getUniqueFilename("/test/dir", "file", "txt");

    expect(result).toBe("file.txt");
    expect(existsSync).toHaveBeenCalledWith("/test/dir/file.txt");
  });

  it("should append a number if the file already exists", () => {
    vi.mocked(existsSync).mockImplementation((filePath) => {
      return (
        filePath === "/test/dir/file.txt" || filePath === "/test/dir/file_1.txt"
      );
    });

    const result = getUniqueFilename("/test/dir", "file", "txt");

    expect(result).toBe("file_2.txt");
    expect(existsSync).toHaveBeenCalledWith("/test/dir/file.txt");
    expect(existsSync).toHaveBeenCalledWith("/test/dir/file_1.txt");
    expect(existsSync).toHaveBeenCalledWith("/test/dir/file_2.txt");
  });

  it("should handle existing postfix", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = getUniqueFilename("/test/dir", "file", "txt", 5);

    expect(result).toBe("file_5.txt");
    expect(existsSync).toHaveBeenCalledWith("/test/dir/file_5.txt");
  });
});
