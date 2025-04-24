import { describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { createMockController, mockKernel } from "../../__fixtures__/mocks";
import { Config } from "../../config";
import { ServerManager } from "../../services/server-manager";
import {
  miscCommands,
  showKernelCommands,
  showMarimoControllerCommands,
} from "../show-commands";

describe("showCommands", () => {
  const serverManager = ServerManager.getInstance(Config);

  it("should show commands for Kernel", async () => {
    const commands = await showKernelCommands(mockKernel);
    expect(commands.map((c) => c.label)).toMatchInlineSnapshot(`
      [
        "$(split-horizontal) Open outputs in embedded browser",
        "$(link-external) Open outputs in system browser",
        "",
        "$(refresh) Restart kernel",
        "$(export) Export notebook as...",
        "",
      ]
    `);
  });

  it("should show commands for non active Controller", async () => {
    const commands = (
      await showMarimoControllerCommands(await createMockController())
    ).filter((index) => index.if !== false);
    expect(commands.map((c) => c.label)).toMatchInlineSnapshot(`
      [
        "$(notebook) Start as VSCode notebook",
        "$(zap) Start in marimo editor (edit)",
        "$(preview) Start in marimo editor (run)",
        "",
        "$(export) Export notebook as...",
        "",
      ]
    `);
  });

  it("should show commands for active Controller for run", async () => {
    const controller = await createMockController();
    controller.active = true;
    controller.currentMode = "run";
    const commands = (await showMarimoControllerCommands(controller)).filter(
      (index) => index.if !== false,
    );
    expect(commands.map((c) => c.label)).toMatchInlineSnapshot(`
      [
        "",
        "$(split-horizontal) Open in embedded browser",
        "$(link-external) Open in system browser",
        "$(refresh) Restart marimo kernel",
        "$(package) Switch to edit mode",
        "$(terminal) Show Terminal",
        "$(close) Stop kernel",
        "$(export) Export notebook as...",
        "",
      ]
    `);
  });

  it("should show commands for active Controller for edit", async () => {
    const controller = await createMockController();
    controller.active = true;
    controller.currentMode = "edit";
    const commands = (await showMarimoControllerCommands(controller)).filter(
      (index) => index.if !== false,
    );
    expect(commands.map((c) => c.label)).toMatchInlineSnapshot(`
      [
        "",
        "$(split-horizontal) Open in embedded browser",
        "$(link-external) Open in system browser",
        "$(refresh) Restart marimo kernel",
        "$(package) Switch to run mode",
        "$(terminal) Show Terminal",
        "$(close) Stop kernel",
        "$(export) Export notebook as...",
        "",
      ]
    `);
  });

  it("should show commands for active empty", async () => {
    const commands = miscCommands(serverManager).filter(
      (index) => index.if !== false,
    );
    expect(commands.map((c) => c.label)).toMatchInlineSnapshot(`
      [
        "$(question) View marimo documentation",
        "$(bookmark) View tutorials",
        "$(comment-discussion) Join Discord community",
        "$(settings) Edit settings",
        "$(info) Server status: stopped",
        "$(info) View extension logs",
      ]
    `);
  });
});
