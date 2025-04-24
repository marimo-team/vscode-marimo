import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { workspace } from "vscode";
import {
  execMarimoCommand,
  execPythonFile,
  execPythonModule,
  hasExecutable,
  hasPythonModule,
} from "../utils/exec";

beforeEach(() => {
  workspace.getConfiguration().reset();
});

describe("execMarimoCommand integration tests", () => {
  it("should work out of the box", async () => {
    const output = await execMarimoCommand(["--version"]);
    expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
  });

  it.each(["python", "uv run python"])(
    "should run marimo --version with %s",
    async (interpreter) => {
      workspace.getConfiguration().set("marimo.pythonPath", interpreter);
      const output = await execMarimoCommand(["--version"]);
      expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
    },
  );

  it.each(["uv run marimo", "uvx marimo", "uv tool run marimo"])(
    "should run marimo --version with %s",
    async (interpreter) => {
      workspace.getConfiguration().set("marimo.marimoPath", interpreter);
      const output = await execMarimoCommand(["--version"]);
      expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
    },
  );

  it("path path gets overridden by marimoPath", async () => {
    workspace.getConfiguration().set("marimo.pythonPath", "doesnotexist");
    expect(() => execMarimoCommand(["--version"])).rejects.toThrow(
      /doesnotexist/,
    );

    workspace.getConfiguration().set("marimo.marimoPath", "uv run marimo");
    const output = await execMarimoCommand(["--version"]);
    expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
  });

  it("should handle spaces in marimoPath", async () => {
    workspace
      .getConfiguration()
      .set("marimo.marimoPath", "/path with spaces/marimo");
    await expect(execMarimoCommand(["--version"])).rejects.toThrow(/ENOENT/);
  });

  it("should handle invalid marimoPath", async () => {
    workspace.getConfiguration().set("marimo.marimoPath", "nonexistent");
    await expect(execMarimoCommand(["--version"])).rejects.toThrow(/ENOENT/);
  });
});

describe("execPythonModule integration tests", () => {
  it("should work out of the box", async () => {
    const output = await execPythonModule(["marimo", "--version"]);
    expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
  });

  it.each(["python", "uv run python"])(
    "should run python -m marimo --version with %s",
    async (interpreter) => {
      workspace.getConfiguration().set("marimo.pythonPath", interpreter);
      const output = await execPythonModule(["marimo", "--version"]);
      expect(output.toString()).toMatch(/\d+\.\d+\.\d+/);
    },
  );

  it("should handle spaces in pythonPath", async () => {
    workspace
      .getConfiguration()
      .set("marimo.pythonPath", "/path with spaces/python");
    await expect(execPythonModule(["marimo", "--version"])).rejects.toThrow(
      /ENOENT/,
    );
  });

  it("should handle invalid pythonPath", async () => {
    workspace.getConfiguration().set("marimo.pythonPath", "nonexistent");
    await expect(execPythonModule(["marimo", "--version"])).rejects.toThrow(
      /ENOENT/,
    );
  });
});

describe("execPythonFile integration tests", () => {
  it("should execute a python file", async () => {
    const output = await execPythonFile(["-c", "print('hello')"]);
    expect(output.toString().trim()).toBe("hello");
  });

  it("should handle spaces in file path", async () => {
    await expect(
      execPythonFile(["/path with spaces/script.py"]),
    ).rejects.toThrow(/python: can't open file/);
  });

  it("should handle invalid file path", async () => {
    await expect(execPythonFile(["nonexistent.py"])).rejects.toThrow(
      /python: can't open file/,
    );
  });
});

describe("hasPythonModule integration tests", () => {
  it("should detect installed module", async () => {
    const output = await hasPythonModule("sys");
    expect(output).toBeDefined();
  });

  it("should handle non-existent module", async () => {
    await expect(hasPythonModule("nonexistentmodule")).rejects.toThrow(
      /ModuleNotFoundError/,
    );
  });

  it("should handle module with spaces", async () => {
    await expect(hasPythonModule("module with spaces")).rejects.toThrow(
      /SyntaxError/,
    );
  });
});

describe("hasExecutable integration tests", () => {
  it("should detect existing executable", async () => {
    const exists = await hasExecutable("python");
    expect(exists).toBe(true);
  });

  it("should handle non-existent executable", async () => {
    const exists = await hasExecutable("nonexistent");
    expect(exists).toBe(false);
  });

  it("should handle executable with spaces", async () => {
    const exists = await hasExecutable("/path with spaces/executable");
    expect(exists).toBe(false);
  });
});
