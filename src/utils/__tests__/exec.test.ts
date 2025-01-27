import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import * as child_process from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspace } from "vscode";
import { execMarimoCommand, execPythonModule, hasPythonModule } from "../exec";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exec utilities", () => {
  describe("execMarimoCommand", () => {
    it("should use marimoPath when set", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "/path/to/marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        "/path/to/marimo edit --version",
      );
    });

    it("should fallback to python -m marimo when marimoPath is default", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "marimo");
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        "python -m marimo edit --version",
      );
    });

    it("should handle spaces in marimoPath", async () => {
      workspace
        .getConfiguration()
        .set("marimo.marimoPath", "/path with spaces/marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        '"/path with spaces/marimo" edit --version',
      );
    });
  });

  describe("execPythonModule", () => {
    it("should handle regular python path", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "python");

      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        "python -m marimo --version",
      );
    });

    it("should quote python path with spaces", async () => {
      workspace
        .getConfiguration()
        .set("marimo.pythonPath", "/path with spaces/python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        '"/path with spaces/python" -m marimo --version',
      );
    });

    it("should not quote uv run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execSync).toHaveBeenCalledWith(
        "uv run python -m marimo --version",
      );
    });
  });

  describe("hasPythonModule", () => {
    it("should handle hasPythonModule with uv run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      await hasPythonModule("marimo");
      expect(child_process.execSync).toHaveBeenCalledWith(
        "uv run python -c 'import marimo'",
      );
    });
  });
});
