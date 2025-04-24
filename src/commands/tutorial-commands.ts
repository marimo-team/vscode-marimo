import { type QuickPickItem, ThemeIcon, Uri, env, window } from "vscode";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
}

const TUTORIALS = [
  // Get started with marimo basics
  ["Intro", "https://links.marimo.app/tutorial-intro", "book"],
  // Learn how cells interact with each other
  ["Dataflow", "https://links.marimo.app/tutorial-dataflow", "repo-forked"],
  // Create interactive UI components
  ["UI Elements", "https://links.marimo.app/tutorial-ui", "layout"],
  // Format text with parameterized markdown
  ["Markdown", "https://links.marimo.app/tutorial-markdown", "markdown"],
  // Create interactive visualizations
  ["Plotting", "https://links.marimo.app/tutorial-plotting", "graph"],
  // Query databases directly in marimo
  ["SQL", "https://links.marimo.app/tutorial-sql", "database"],
  // Customize the layout of your cells' output
  ["Layout", "https://links.marimo.app/tutorial-layout", "layout-panel-left"],
  // Understand marimo's pure-Python file format
  ["File Format", "https://links.marimo.app/tutorial-fileformat", "file"],
  // Transiting from Jupyter to marimo
  ["Coming from Jupyter", "https://links.marimo.app/tutorial-jupyter", "code"],
];

export async function tutorialCommands() {
  const commands: CommandPickItem[] = TUTORIALS.map(([label, url, icon]) => ({
    label,
    description: url,
    iconPath: new ThemeIcon(icon),
    handler: () => env.openExternal(Uri.parse(url)),
  }));

  const result = await window.showQuickPick<CommandPickItem>(commands);
  if (result) {
    result.handler();
  }
}
