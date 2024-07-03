export const DOCUMENTATION_URL = "https://docs.marimo.io";

export const EXTENSION_PACKAGE = {
  publisher: "marimo-team",
  name: "vscode-marimo",
  get fullName(): string {
    return `${this.publisher}.${this.name}`;
  },
};

export const EXTENSION_DISPLAY_NAME = "marimo";

export const CONFIG_KEY = "marimo";
