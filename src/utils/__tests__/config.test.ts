import { type Mock, beforeEach, describe, expect, test, vi } from "vitest";
import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));

import * as vscode from "vscode";
import { Config, composeUrl, composeWsUrl, getConfig } from "../../config";

describe("Config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("getConfig returns correct values", () => {
    const mockGet = vi.fn();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });

    mockGet.mockReturnValueOnce("test-value");
    expect(getConfig("testKey")).toBe("test-value");

    mockGet.mockReturnValueOnce(undefined);
    expect(getConfig("testKey", "default")).toBe("default");
  });

  test("Config.root returns correct value", () => {
    expect(Config.root).toBe("");
  });

  test("Config properties return correct values", () => {
    const mockGet = vi.fn();
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });

    mockGet.mockReturnValueOnce("system");
    expect(Config.browser).toBe("system");

    mockGet.mockReturnValueOnce(3000);
    expect(Config.port).toBe(3000);

    mockGet.mockReturnValueOnce("127.0.0.1");
    expect(Config.host).toBe("127.0.0.1");

    mockGet.mockReturnValueOnce(true);
    expect(Config.https).toBe(true);

    mockGet.mockReturnValueOnce(true);
    expect(Config.enableToken).toBe(true);

    mockGet.mockReturnValueOnce("secret");
    expect(Config.tokenPassword).toBe("secret");

    mockGet.mockReturnValueOnce(true);
    expect(Config.debug).toBe(true);

    mockGet.mockReturnValueOnce("/usr/bin/python");
    expect(Config.pythonPath).toBe("/usr/bin/python");

    mockGet.mockReturnValueOnce("custom-marimo");
    expect(Config.marimoPath).toBe("custom-marimo");

    mockGet.mockReturnValueOnce(true);
    expect(Config.showTerminal).toBe(true);
  });

  test("Config.readPort returns correct value", () => {
    const mockGet = vi.fn().mockReturnValue(3000);
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });

    expect(Config.readPort).toBe(3010);
  });
});

describe("URL composition functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("composeUrl returns correct URL", async () => {
    const mockGet = vi.fn().mockReturnValue(false); // https: false
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });
    (vscode.env.asExternalUri as Mock).mockResolvedValue({
      toString: () => "http://external-host:3000/",
    });

    const url = await composeUrl(3000);
    expect(url).toBe("http://external-host:3000/");
  });

  test("composeWsUrl returns correct WebSocket URL", async () => {
    const mockGet = vi.fn().mockReturnValue(true); // https: true
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });
    (vscode.env.asExternalUri as Mock).mockResolvedValue({
      toString: () => "wss://external-host:3000/",
    });

    const url = await composeWsUrl(3000);
    expect(url).toBe("wss://external-host:3000/");
  });

  test("composeUrl and composeWsUrl handle errors", async () => {
    const mockGet = vi.fn().mockReturnValue(false); // https: false
    (vscode.workspace.getConfiguration as Mock).mockReturnValue({
      get: mockGet,
    });
    (vscode.env.asExternalUri as Mock).mockRejectedValue(
      new Error("Test error"),
    );

    const httpUrl = await composeUrl(3000);
    expect(httpUrl).toBe("http://localhost:3000/");

    const wsUrl = await composeWsUrl(3000);
    expect(wsUrl).toBe("ws://localhost:3000/");
  });
});
