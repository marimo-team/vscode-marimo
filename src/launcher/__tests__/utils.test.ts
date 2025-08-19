import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../../__mocks__/vscode";

vi.mock("vscode", () => createVSCodeMock(vi));

import { parse } from "node-html-parser";
import { composeUrl } from "../../config";
import { fetchMarimoStartupValues } from "../utils";

vi.mock("node-html-parser");
vi.mock("../../config");

describe("fetchMarimoStartupValues", () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch and parse marimo startup values correctly", async () => {
    // Mock the composeUrl function
    vi.mocked(composeUrl).mockResolvedValue("http://localhost:1234");

    // Mock the fetch response
    const mockScriptContent = `window.__MARIMO_MOUNT_CONFIG__ = {
            "version": "1.0.0",
            "serverToken": "mock-skew-token",
            "config": {"key": "value"},
        };`;
    const mockHtml = `
      <html>
        <script data-marimo="true">
          ${mockScriptContent}
        </script>
      </html>
    `;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
      url: "http://localhost:1234",
    });

    // Mock the parse function
    const mockRoot = {
      querySelectorAll: (selector: string) => [
        {
          getAttribute: (attr: string) => {
            if (selector === "script" && attr === "data-marimo") return "true";
            return null;
          },
          innerHTML: mockScriptContent,
        },
      ],
    };
    vi.mocked(parse).mockReturnValue(mockRoot as any);

    const result = await fetchMarimoStartupValues({ port: 1234, backoff: 1 });

    expect(result).toEqual({
      skewToken: "mock-skew-token",
      version: "1.0.0",
      userConfig: { key: "value" },
    });

    expect(composeUrl).toHaveBeenCalledWith(1234);
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:1234/", {
      headers: {
        Accept: "text/html",
      },
    });
    expect(parse).toHaveBeenCalledWith(mockHtml);
  });

  it("should throw an error if fetch fails", async () => {
    vi.mocked(composeUrl).mockResolvedValue("http://localhost:1234");
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      fetchMarimoStartupValues({ port: 1234, backoff: 1 }),
    ).rejects.toThrow(
      "Could not fetch http://localhost:1234/. Is http://localhost:1234/ healthy?",
    );
  });

  it("should throw an error if redirected to auth/login", async () => {
    vi.mocked(composeUrl).mockResolvedValue("http://localhost:1234");
    mockFetch.mockResolvedValue({
      ok: true,
      url: "http://localhost:1234/auth/login",
    });

    await expect(
      fetchMarimoStartupValues({ port: 1234, backoff: 1 }),
    ).rejects.toThrow(
      "An existing marimo server created outside of vscode is running at this url: http://localhost:1234/",
    );
  });

  it("should throw an error if required elements are missing", async () => {
    vi.mocked(composeUrl).mockResolvedValue("http://localhost:1234");
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
      url: "http://localhost:1234/",
    });

    vi.mocked(parse).mockReturnValue({
      querySelectorAll: () => [],
    } as any);

    await expect(
      fetchMarimoStartupValues({ port: 1234, backoff: 1 }),
    ).rejects.toThrow(
      "Could not find marimo mounted config. Is http://localhost:1234/ healthy?",
    );
  });

  it("should throw an error if some fields of mounted config are missing", async () => {
    vi.mocked(composeUrl).mockResolvedValue("http://localhost:1234");
    const mockScriptContent = `window.__MARIMO_MOUNT_CONFIG__ = {
            "version": "1.0.0",
            "config": {"key": "value"},
        };`;
    const mockHtml = `
      <html>
        <script data-marimo="true">
          ${mockScriptContent}
        </script>
      </html>
    `;
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
      url: "http://localhost:1234",
    });

    const mockRoot = {
      querySelectorAll: (selector: string) => [
        {
          getAttribute: (attr: string) => {
            if (selector === "script" && attr === "data-marimo") return "true";
            return null;
          },
          innerHTML: mockScriptContent,
        },
      ],
    };
    vi.mocked(parse).mockReturnValue(mockRoot as any);

    await expect(
      fetchMarimoStartupValues({ port: 1234, backoff: 1 }),
    ).rejects.toThrow(
      "Could not find serverToken in marimo mounted config. Is http://localhost:1234/ healthy?",
    );
  });
});
