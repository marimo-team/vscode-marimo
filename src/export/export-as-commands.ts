import { type QuickPickItem, type Uri, window } from "vscode";
import { exportNotebookAs } from "./export-as";

interface CommandPickItem extends QuickPickItem {
  handler: () => void;
  if?: boolean;
}

export async function exportAsCommands(file: Uri) {
  const commands: CommandPickItem[] = [
    {
      label: "$(browser) Export as HTML",
      async handler() {
        await exportNotebookAs(file.fsPath, "html");
      },
    },
    {
      label: "$(markdown) Export as Markdown",
      async handler() {
        await exportNotebookAs(file.fsPath, "md");
      },
    },
    {
      label: "$(notebook) Export as Jupyter Notebook",
      async handler() {
        await exportNotebookAs(file.fsPath, "ipynb");
      },
    },
    {
      label: "$(file-code) Export as a flat Python Script",
      async handler() {
        await exportNotebookAs(file.fsPath, "script");
      },
    },
  ];

  const filteredCommands = commands.filter((index) => index.if !== false);
  const result = await window.showQuickPick<CommandPickItem>(filteredCommands);

  if (result) {
    result.handler();
  }
}
