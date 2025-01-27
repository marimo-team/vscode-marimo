import { describe, expect, it } from "vitest";
import { Strings } from "../strings";

describe("Strings", () => {
  describe("indent", () => {
    it("should indent each line with given string", () => {
      const input = "line1\nline2\nline3";
      const expected = "  line1\n  line2\n  line3";
      expect(Strings.indent(input, "  ")).toBe(expected);
    });

    it("should handle empty string", () => {
      expect(Strings.indent("", "  ")).toBe("");
    });
  });

  describe("dedent", () => {
    it("should remove common leading whitespace", () => {
      const input = "    line1\n    line2\n    line3";
      const expected = "line1\nline2\nline3";
      expect(Strings.dedent(input)).toBe(expected);
    });

    it("should handle mixed indentation", () => {
      const input = "    line1\n  line2\n      line3";
      const expected = "  line1\nline2\n    line3";
      expect(Strings.dedent(input)).toBe(expected);
    });

    it("should handle empty string", () => {
      expect(Strings.dedent("")).toBe("");
    });
  });

  it("should have FOUR_SPACES constant", () => {
    expect(Strings.FOUR_SPACES).toBe("    ");
  });
});
