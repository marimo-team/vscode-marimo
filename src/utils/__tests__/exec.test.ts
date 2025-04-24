import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import * as child_process from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspace } from "vscode";
import {
  execMarimoCommand,
  execPythonFile,
  execPythonModule,
  hasExecutable,
  hasPythonModule,
} from "../exec";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("exec utilities", () => {
  describe("execMarimoCommand", () => {
    it("should use marimoPath when set", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "/path/to/marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "/path/to/marimo",
        ["edit", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle uv command in marimoPath", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "uv run marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uv",
        ["run", "marimo", "edit", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle uvx command in marimoPath", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "uvx run marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uvx",
        ["run", "marimo", "edit", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should fallback to python -m marimo when marimoPath is default", async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "marimo");
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["-m", "marimo", "edit", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle spaces in marimoPath", async () => {
      workspace
        .getConfiguration()
        .set("marimo.marimoPath", "/path with spaces/marimo");
      await execMarimoCommand(["edit", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "/path with spaces/marimo",
        ["edit", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });
  });

  describe("execPythonModule", () => {
    it("should handle regular python path", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["-m", "marimo", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle python path with spaces", async () => {
      workspace
        .getConfiguration()
        .set("marimo.pythonPath", "/path with spaces/python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "/path with spaces/python",
        ["-m", "marimo", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle uv run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uv",
        ["run", "python", "-m", "marimo", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle uvx run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uvx run python");
      await execPythonModule(["marimo", "--version"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uvx",
        ["run", "python", "-m", "marimo", "--version"],
        { shell: false, encoding: "utf8" },
      );
    });
  });

  describe("execPythonFile", () => {
    it("should handle regular python path", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await execPythonFile(["script.py", "--arg"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["script.py", "--arg"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle uv run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      await execPythonFile(["script.py", "--arg"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uv",
        ["run", "python", "script.py", "--arg"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle spaces in script path", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await execPythonFile(["/path with spaces/script.py", "--arg"]);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["/path with spaces/script.py", "--arg"],
        { shell: false, encoding: "utf8" },
      );
    });
  });

  describe("hasPythonModule", () => {
    it("should handle hasPythonModule with uv run python", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      await hasPythonModule("marimo");
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "uv",
        ["run", "python", "-c", "import marimo"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should handle module with spaces", async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "python");
      await hasPythonModule("module with spaces");
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["-c", "import module with spaces"],
        { shell: false, encoding: "utf8" },
      );
    });
  });

  describe("hasExecutable", () => {
    it("should return true when executable exists", async () => {
      (child_process.execFileSync as any).mockReturnValue(Buffer.from(""));
      const result = await hasExecutable("python");
      expect(result).toBe(true);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "python",
        ["--help"],
        { shell: false, encoding: "utf8" },
      );
    });

    it("should return false when executable doesn't exist", async () => {
      (child_process.execFileSync as any).mockImplementation(() => {
        throw new Error("Command failed");
      });
      const result = await hasExecutable("nonexistent");
      expect(result).toBe(false);
    });

    it("should handle executable with spaces", async () => {
      (child_process.execFileSync as any).mockReturnValue(Buffer.from(""));
      const result = await hasExecutable("/path with spaces/executable");
      expect(result).toBe(true);
      expect(child_process.execFileSync).toHaveBeenCalledWith(
        "/path with spaces/executable",
        ["--help"],
        { shell: false, encoding: "utf8" },
      );
    });
  });
});
