import { describe, expect, it } from "vitest";
import { maybeMarkdown, toMarkdown } from "../md";

describe("markdown utils", () => {
  describe("toMarkdown", () => {
    it("should wrap single line in mo.md()", () => {
      expect(toMarkdown("hello")).toBe('mo.md(r"hello")');
    });

    it("should handle empty string", () => {
      expect(toMarkdown("")).toBe('mo.md(r"")');
    });

    it("should handle whitespace", () => {
      expect(toMarkdown("  hello  ")).toBe('mo.md(r"hello")');
    });

    it("should indent multiline content with 4 spaces", () => {
      const input = `line 1
line 2
line 3`;
      expect(toMarkdown(input)).toMatchInlineSnapshot(`
        "mo.md(
            r"""
            line 1
            line 2
            line 3
            """
        )"
      `);
    });

    it("should preserve existing indentation in multiline", () => {
      const input = `line 1
  line 2
    line 3`;
      expect(toMarkdown(input)).toMatchInlineSnapshot(`
        "mo.md(
            r"""
            line 1
              line 2
                line 3
            """
        )"
      `);
    });
    it("should handle multiline with empty lines", () => {
      const input = `line 1

line 2

line 3`;
      expect(trimEmptyLines(toMarkdown(input))).toMatchInlineSnapshot(`
        "mo.md(
            r"""
            line 1

            line 2

            line 3
            """
        )"
      `);
    });

    it("should handle multiline starting with empty line", () => {
      const input = `
line 1
line 2`;
      expect(toMarkdown(input)).toMatchInlineSnapshot(`
        "mo.md(
            r"""
            line 1
            line 2
            """
        )"
      `);
    });

    it("should handle multiline ending with empty line", () => {
      const input = `line 1
line 2

`;
      expect(toMarkdown(input)).toMatchInlineSnapshot(`
        "mo.md(
            r"""
            line 1
            line 2
            """
        )"
      `);
    });
  });

  describe("maybeMarkdown", () => {
    it("should extract content from mo.md() call", () => {
      expect(maybeMarkdown('mo.md("hello")')).toBe("hello");
    });

    it("should handle empty mo.md()", () => {
      expect(maybeMarkdown('mo.md("")')).toBe("");
    });

    it("should handle multiline mo.md()", () => {
      const input = `mo.md("""
    line 1
    line 2
    line 3
""")`;
      expect(maybeMarkdown(input)).toBe("line 1\nline 2\nline 3");
    });

    it("should handle raw strings", () => {
      expect(maybeMarkdown('mo.md(r"hello")')).toBe("hello");
    });

    it("should handle triple quotes", () => {
      expect(maybeMarkdown('mo.md("""hello""")')).toBe("hello");
    });

    it("should return null for invalid markdown", () => {
      expect(maybeMarkdown("not markdown")).toBe(null);
      expect(maybeMarkdown('mo.md("unclosed')).toBe(null);
      expect(maybeMarkdown('mo.md(hello")')).toBe(null);
      expect(maybeMarkdown('md("hello")')).toBe(null);
    });

    it("should dedent multiline content", () => {
      const input = `mo.md("""
    line 1
      line 2
        line 3
""")`;
      expect(maybeMarkdown(input)).toBe("line 1\n  line 2\n    line 3");
    });

    it("should handle mixed quotes", () => {
      expect(maybeMarkdown(`mo.md('hello')`)).toBe("hello");
      expect(maybeMarkdown(`mo.md("'hello'")`)).toBe("'hello'");
    });

    it("should handle whitespace", () => {
      expect(maybeMarkdown('  mo.md("hello")  ')).toBe("hello");
      expect(maybeMarkdown('mo.md(  "hello"  )')).toBe("hello");
    });
  });
});

function trimEmptyLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? line : ""))
    .join("\n")
    .trim();
}
