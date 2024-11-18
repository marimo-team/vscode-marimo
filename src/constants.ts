export const DOCUMENTATION_URL = "https://docs.marimo.io";
export const DISCORD_URL = "https://marimo.io/discord?ref=vscode";

export const EXTENSION_PACKAGE = {
  publisher: "marimo-team",
  name: "vscode-marimo",
  get fullName(): string {
    return `${this.publisher}.${this.name}`;
  },
};

export const EXTENSION_DISPLAY_NAME = "marimo";

export const CONFIG_KEY = "marimo";

export const CommandsKeys = {
  // Start marimo kernel (edit)
  edit: "vscode-marimo.edit",
  // Start marimo kernel (run)
  run: "vscode-marimo.run",
  // Restart marimo kernel
  restartKernel: "vscode-marimo.restartKernel",
  // Stop kernel
  stopKernel: "vscode-marimo.stopKernel",
  // Show marimo commands
  showCommands: "vscode-marimo.showCommands",
  // Export notebook as...
  exportAsCommands: "vscode-marimo.exportAsCommands",
  // Open in system browser
  openInBrowser: "vscode-marimo.openInBrowser",
  // Show documentation
  openDocumentation: "vscode-marimo.openDocumentation",
  // Create new marimo file
  newMarimoFile: "vscode-marimo.newMarimoFile",
  // Reload browser
  reloadBrowser: "vscode-marimo.reloadBrowser",
  // Convert Jupyter notebook to marimo notebook
  convertToMarimoApp: "vscode-marimo.convertToMarimoApp",

  // Start server
  startServer: "vscode-marimo.startServer",
  // Stop server
  stopServer: "vscode-marimo.stopServer",

  // Native vscode notebook commands
  openNotebook: "vscode-marimo.openAsVSCodeNotebook",

  // Show marimo status
  showStatus: "vscode-marimo.showStatus",
};
