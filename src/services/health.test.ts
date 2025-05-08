import { beforeEach, describe, expect, it, vi } from "vitest";
import { extensions, window, workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { execMarimoCommand, getInterpreter } from "../utils/exec";
import { getExtensionVersion } from "../utils/versions";
import { HealthService } from "./health";
import type { ServerManager } from "./server-manager";

vi.mock("vscode", () => ({
  extensions: {
    getExtension: vi.fn(),
  },
  window: {
    showTextDocument: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
}));

vi.mock("../logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("../utils/exec", () => ({
  execMarimoCommand: vi.fn(),
  getInterpreter: vi.fn(),
}));

describe("HealthService", () => {
  let healthService: HealthService;
  let mockServerManager: ServerManager;

  beforeEach(() => {
    vi.resetAllMocks();
    mockServerManager = {
      getStatus: vi.fn(),
      getPort: vi.fn(),
    } as unknown as ServerManager;
    healthService = new HealthService(mockServerManager);
  });

  describe("isMarimoInstalled", () => {
    it("should return true when marimo is installed", async () => {
      const mockVersion = "1.0.0";
      vi.mocked(execMarimoCommand).mockResolvedValue(mockVersion);
      vi.spyOn(Config, "marimoPath", "get").mockReturnValue("/path/to/marimo");

      const result = await healthService.isMarimoInstalled();

      expect(result).toEqual({
        isInstalled: true,
        version: mockVersion,
        path: "/path/to/marimo",
      });
    });

    it("should return false when marimo is not installed", async () => {
      vi.mocked(execMarimoCommand).mockRejectedValue(
        new Error("Command failed"),
      );
      vi.spyOn(Config, "marimoPath", "get").mockReturnValue("/path/to/marimo");

      const result = await healthService.isMarimoInstalled();

      expect(result).toEqual({
        isInstalled: false,
        version: "unknown",
        path: "/path/to/marimo",
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("isServerRunning", () => {
    it("should return true when server is running", async () => {
      vi.mocked(mockServerManager.getStatus).mockReturnValue("started");
      vi.mocked(mockServerManager.getPort).mockReturnValue(8080);

      const result = await healthService.isServerRunning();

      expect(result).toEqual({
        isRunning: true,
        port: 8080,
      });
    });

    it("should return false when server is not running", async () => {
      vi.mocked(mockServerManager.getStatus).mockReturnValue("stopped");
      vi.mocked(mockServerManager.getPort).mockReturnValue(0);

      const result = await healthService.isServerRunning();

      expect(result).toEqual({
        isRunning: false,
        port: 0,
      });
    });
  });

  describe("showDiagnostics", () => {
    it("should show status in a new document", async () => {
      const mockStatusText = "test status";
      const mockDocument = { uri: "test" };
      vi.mocked(workspace.openTextDocument).mockResolvedValue(
        mockDocument as any,
      );
      vi.spyOn(healthService, "printStatusVerbose").mockResolvedValue(
        mockStatusText,
      );

      const result = await healthService.showDiagnostics();

      expect(workspace.openTextDocument).toHaveBeenCalledWith({
        content: mockStatusText,
        language: "plaintext",
      });
      expect(window.showTextDocument).toHaveBeenCalledWith(mockDocument);
      expect(result).toBe(mockDocument);
    });

    it("should handle errors gracefully", async () => {
      const error = new Error("test error");
      vi.spyOn(healthService, "printStatusVerbose").mockRejectedValue(error);
      const mockDocument = { uri: "test" };
      vi.mocked(workspace.openTextDocument).mockResolvedValue(
        mockDocument as any,
      );

      const result = await healthService.showDiagnostics();

      expect(workspace.openTextDocument).toHaveBeenCalledWith({
        content: `Error showing status: ${error}`,
        language: "plaintext",
      });
      expect(result).toBe(mockDocument);
    });
  });

  describe("printExtensionVersion", () => {
    it("should return extension version", () => {
      const mockVersion = "1.0.0";
      vi.mocked(extensions.getExtension).mockReturnValue({
        packageJSON: { version: mockVersion },
      } as any);

      const result = getExtensionVersion();

      expect(result).toBe(mockVersion);
    });

    it("should return unknown when extension is not found", () => {
      vi.mocked(extensions.getExtension).mockReturnValue(undefined);

      const result = getExtensionVersion();

      expect(result).toBe("unknown");
    });
  });

  describe("printStatus", () => {
    it("should return status when marimo is installed", async () => {
      const mockVersion = "1.0.0";
      const mockPythonPath = "/path/to/python";
      vi.mocked(execMarimoCommand).mockResolvedValue(mockVersion);
      vi.mocked(getInterpreter).mockResolvedValue(mockPythonPath);
      vi.spyOn(Config, "marimoPath", "get").mockReturnValue(
        "/custom/path/to/marimo",
      );
      vi.mocked(mockServerManager.getStatus).mockReturnValue("started");
      vi.mocked(mockServerManager.getPort).mockReturnValue(8080);

      const result = await healthService.printStatus();

      expect(result).toContain("marimo is installed");
      expect(result).toContain(
        "marimo executable path: /custom/path/to/marimo",
      );
      expect(result).toContain("python interpreter: /path/to/python");
      expect(result).toContain("version: 1.0.0");
      expect(result).toContain("server running: port 8080");
    });

    it("should return troubleshooting message when marimo is not installed", async () => {
      vi.mocked(execMarimoCommand).mockRejectedValue(
        new Error("Command failed"),
      );
      vi.mocked(getInterpreter).mockResolvedValue("/path/to/python");
      vi.spyOn(Config, "marimoPath", "get").mockReturnValue("marimo");

      const result = await healthService.printStatus();

      expect(result).toContain("marimo does not appear to be installed");
      expect(result).toContain("python interpreter: /path/to/python");
      expect(result).toContain("Troubleshooting steps:");
    });
  });
});
