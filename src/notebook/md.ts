import { Strings } from "../utils/strings";

export function toMarkdown(text: string): string {
  // Trim
  const value = text.trim();

  const isMultiline = value.includes("\n");
  if (!isMultiline) {
    return `mo.md(r"${value}")`;
  }

  return `mo.md(\n${Strings.FOUR_SPACES}r"""\n${Strings.indent(value, Strings.FOUR_SPACES)}\n${Strings.FOUR_SPACES}"""\n)`;
}

export function maybeMarkdown(text: string): string | null {
  // TODO: Python can safely extract the string value with the
  // AST, anything done here is a bit of a hack, data should come from server.
  const value = text.trim();
  // Regular expression to match the function calls
  const regex = /^mo\.md\(\s*r?((["'])(?:\2\2)?)(.*?)\1\s*\)$/gms; // 'g' flag to check all occurrences
  const matches = [...value.matchAll(regex)];

  // Check if there is exactly one match
  if (matches.length === 1) {
    const extractedString = matches[0][3]; // Extract the string content
    return Strings.dedent(extractedString).trim();
  }
  return null;
}
