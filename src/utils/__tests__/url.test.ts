import { createVSCodeMock } from "jest-mock-vscode";
import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => createVSCodeMock(vi));

import { asURL, urlJoin } from "../url";

describe("url utils", () => {
  describe("asURL", () => {
    it("should parse valid URLs", () => {
      const url = asURL("https://example.com");
      expect(url.href).toBe("https://example.com/");
    });

    it("should throw on invalid URLs", () => {
      expect(() => asURL("not-a-url")).toThrow();
    });
  });

  describe("urlJoin", () => {
    it("should handle empty array", () => {
      expect(urlJoin()).toBe("");
    });

    it("should handle single path", () => {
      expect(urlJoin("https://example.com")).toBe("https://example.com");
    });

    it("should join two paths", () => {
      expect(urlJoin("https://example.com", "api")).toBe(
        "https://example.com/api",
      );
    });

    it("should handle leading/trailing slashes", () => {
      expect(urlJoin("https://example.com/", "/api")).toBe(
        "https://example.com/api",
      );
      expect(urlJoin("https://example.com/", "/api/")).toBe(
        "https://example.com/api/",
      );
    });

    it("should join multiple paths", () => {
      expect(urlJoin("https://example.com", "api", "v1", "users")).toBe(
        "https://example.com/api/v1/users",
      );
    });

    it("should handle paths with query params", () => {
      expect(urlJoin("https://example.com", "api?foo=bar")).toBe(
        "https://example.com/api?foo=bar",
      );
    });

    it("should handle paths with hash", () => {
      expect(urlJoin("https://example.com", "api#section")).toBe(
        "https://example.com/api#section",
      );
    });
  });
});
