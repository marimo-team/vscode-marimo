import { type QuickPickItem, ThemeIcon, Uri, env, window } from "vscode";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
}

const TUTORIALS = [
  ["Intro", "https://marimo.app/l/c7h6pz", "book"],
  ["Dataflow", "https://marimo.app/l/grhuve", "repo-forked"],
  ["UI Elements", "https://marimo.app/l/ia3872", "layout"],
  ["Markdown", "https://marimo.app/l/pzxdmn", "markdown"],
  ["Plotting", "https://marimo.app/l/lxp1jk", "graph"],
  ["SQL", "https://marimo.app/l/7n5flc", "database"],
  ["Layout", "https://marimo.app/l/14ovyr", "layout-panel-left"],
  ["File Format", "https://marimo.app/l/8n55fd", "file"],
  ["Coming from Jupyter", "https://marimo.app/l/z0aerp", "code"],
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
