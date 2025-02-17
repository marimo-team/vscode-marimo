import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));
vi.mock("@vscode/python-extension", () => ({}));

import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExtensionContext, type Memento, window, workspace } from "vscode";
import type { Config } from "../config";
import { setExtension } from "../ctx";
import { ServerManager } from "../services/server-manager";
import { sleep } from "../utils/async";

const TEST_TIMEOUT = 10_000;

describe("ServerManager integration tests", () => {
  let config: Config;
  let manager: ServerManager;

  beforeEach(() => {
    const tmpDir = tmpdir();
    workspace.getConfiguration().reset();
    config = {
      root: join(tmpDir, "nb.py"),
      browser: "system",
      port: 2918,
      readPort: 2919,
      host: "localhost",
      https: false,
      enableToken: false,
      tokenPassword: "",
      debug: false,
      sandbox: false,
      watch: false,
    } as Config;
    manager = ServerManager.getInstance(config);
    const globalState = new Map();
    setExtension({
      globalState: {
        get: vi.fn().mockImplementation((key) => globalState.get(key)),
        update: vi
          .fn()
          .mockImplementation((key, value) => globalState.set(key, value)),
        keys: vi.fn().mockImplementation(() => Array.from(globalState.keys())),
      } as unknown as Memento,
    } as unknown as ExtensionContext);
    manager.init();
  });

  afterEach(async () => {
    await manager.stopServer();
  });

  it(
    "should start and stop server",
    async () => {
      expect(manager.getStatus()).toBe("stopped");

      const result = await manager.start();
      expect(result.port).toBeGreaterThan(0);
      expect(result.skewToken).toBeDefined();
      expect(result.version).toMatch(/\d+\.\d+\.\d+/);
      expect(manager.getStatus()).toBe("started");

      await manager.stopServer();
      expect(manager.getStatus()).toBe("stopped");
    },
    TEST_TIMEOUT,
  );

  it(
    "should start and stop a server with custom python path",
    async () => {
      workspace.getConfiguration().set("marimo.pythonPath", "uv run python");
      const result = await manager.start();
      expect(result.port).toBeGreaterThan(0);
      expect(result.skewToken).toBeDefined();
      expect(result.version).toMatch(/\d+\.\d+\.\d+/);
      expect(manager.getStatus()).toBe("started");

      await manager.stopServer();
      expect(manager.getStatus()).toBe("stopped");
    },
    TEST_TIMEOUT,
  );

  it(
    "should start and stop a server with custom marimo path",
    async () => {
      workspace.getConfiguration().set("marimo.marimoPath", "uv run marimo");
      const result = await manager.start();
      expect(result.port).toBeGreaterThan(0);
      expect(result.skewToken).toBeDefined();
      expect(result.version).toMatch(/\d+\.\d+\.\d+/);
      expect(manager.getStatus()).toBe("started");

      await manager.stopServer();
      expect(manager.getStatus()).toBe("stopped");
    },
    TEST_TIMEOUT,
  );

  it(
    "should reuse existing server if healthy",
    async () => {
      console.warn("Starting server");
      const firstStart = await manager.start();
      console.warn("Starting server again");
      const secondStart = await manager.start();

      expect(secondStart.port).toBe(firstStart.port);
      expect(secondStart.skewToken).toBe(firstStart.skewToken);

      // Check if healthy
      const isHealthy = await manager.isHealthy(firstStart.port);
      expect(isHealthy).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it.skip(
    "should start a server and cancel it",
    async () => {
      const subscribers = new Set<() => void>();
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn().mockImplementation((fn) => {
          subscribers.add(fn);
        }),
        cancel: vi.fn().mockImplementation(() => {
          subscribers.forEach(async (fn) => {
            try {
              fn();
            } catch (e) {
              // pass
            }
          });
        }),
      };

      await expect(async () => {
        await Promise.all([manager.start(token), token.cancel(), sleep(100)]);
      }).rejects.toThrow("Server start was cancelled");
      expect(token.onCancellationRequested).toHaveBeenCalledTimes(1);
      expect(manager.getStatus()).toBe("stopped");
    },
    TEST_TIMEOUT,
  );

  it(
    "should restart unhealthy server",
    async () => {
      const firstStart = await manager.start();

      // Force server into unhealthy state by stopping it directly
      await manager.stopServer();

      // Should detect unhealthy state and restart
      const secondStart = await manager.start();
      expect(secondStart.port).not.toBe(firstStart.port);
    },
    TEST_TIMEOUT,
  );

  it(
    "should handle multiple start requests while starting",
    async () => {
      const startPromise1 = manager.start();
      const startPromise2 = manager.start();

      const [result1, result2] = await Promise.all([
        startPromise1,
        startPromise2,
      ]);
      expect(result1.port).toBe(result2.port);
    },
    TEST_TIMEOUT,
  );

  it(
    "should get active sessions",
    async () => {
      await manager.start();
      const sessions = await manager.getActiveSessions();
      expect(Array.isArray(sessions)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it.skip("should show warning and handle restart on unhealthy server", async () => {
    await manager.start();
    const showWarningMock = vi.spyOn(window, "showWarningMessage");

    // Simulate health check failure
    vi.spyOn(global, "fetch").mockRejectedValueOnce(
      new Error("Connection failed"),
    );

    // Trigger health check
    await sleep(100);

    expect(showWarningMock).toHaveBeenCalledWith(
      "The marimo server is not responding. What would you like to do?",
      "Restart Server",
      "Ignore",
    );
  });
});
