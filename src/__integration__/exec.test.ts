import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { workspace } from "vscode";
import { execMarimoCommand, execPythonModule } from "../utils/exec";

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
});
