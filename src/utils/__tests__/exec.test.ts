import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import * as child_process from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execPython, hasPythonModule } from "../exec";
import { workspace } from "vscode";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exec utilities", () => {
  it("should handle regular python path", async () => {
    workspace.getConfiguration().set("marimo.pythonPath", "python");

    await execPython(["marimo", "--version"]);
    expect(child_process.execSync).toHaveBeenCalledWith(
      "python -m marimo --version",
    );
  });

  it("should quote python path with spaces", async () => {
    workspace
      .getConfiguration()
      .set("marimo.pythonPath", "/path with spaces/python");
    await execPython(["marimo", "--version"]);
    expect(child_process.execSync).toHaveBeenCalledWith(
      '"/path with spaces/python" -m marimo --version',
    );
  });

  it("should not quote uv run python", async () => {
    workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
    await execPython(["marimo", "--version"]);
    expect(child_process.execSync).toHaveBeenCalledWith(
      "uv run python -m marimo --version",
    );
  });

  it("should handle hasPythonModule with uv run python", async () => {
    workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
    await hasPythonModule("marimo");
    expect(child_process.execSync).toHaveBeenCalledWith(
      "uv run python -c 'import marimo'",
    );
  });
});
