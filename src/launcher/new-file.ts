import path from "node:path";
import { Uri, window, workspace } from "vscode";

export async function createNewMarimoFile() {
  const editor = window.activeTextEditor;
  // fallback to the first workspace folder
  const workspaceFolder = workspace.workspaceFolders?.[0];

  // prompt for file name
  const name = await window.showInputBox({
    prompt: "Enter a name for the new marimo file",
  });

  if (!name) {
    window.showErrorMessage("No name provided");
    return;
  }

  // ' ' -> '_'
  // add py extension
  let fileName = name.replaceAll(" ", "_");
  if (!fileName.endsWith(".py")) {
    fileName += ".py";
  }

  // Get the directory of the current file
  const currentFilePath = editor
    ? editor.document.uri.fsPath
    : workspaceFolder?.uri.fsPath;

  if (!currentFilePath) {
    window.showErrorMessage("No active editor or workspace");
    return;
  }

  const directoryPath = path.dirname(currentFilePath);

  // create file
  const newFilePath = path.join(directoryPath, fileName);
  const newFileUri = Uri.file(newFilePath);

  const encoder = new TextEncoder();
  await workspace.fs.writeFile(newFileUri, encoder.encode(NEW_FILE_CONTENT));

  const document = await workspace.openTextDocument(newFileUri);
  await window.showTextDocument(document);
}

const NEW_FILE_CONTENT = `
import marimo

app = marimo.App()

@app.cell
def __():
    return

if __name__ == "__main__":
    app.run()
`.trim();
