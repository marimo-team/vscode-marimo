export const Strings = {
  indent: (str: string, indent: string) => {
    if (str.length === 0) {
      return str;
    }
    return str
      .split("\n")
      .map((line) => `${indent}${line}`)
      .join("\n");
  },
  FOUR_SPACES: "    ",
  dedent: (str: string) => {
    const match = str.match(/^[ \t]*(?=\S)/gm);
    if (!match) {
      return str; // If no indentation, return original string
    }
    const minIndent = Math.min(...match.map((el) => el.length));
    const re = new RegExp(`^[ \t]{${minIndent}}`, "gm");
    return str.replace(re, "");
  },
};
