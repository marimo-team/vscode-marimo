import { type TextDocument, window } from "vscode";

export function isMarimoApp(
  document: TextDocument | undefined,
  includeEmpty = true,
) {
  if (!document) {
    return false;
  }

  // If ends in .py and is empty, return true
  // This is so we can create a new file and start the server
  if (
    includeEmpty &&
    document.fileName.endsWith(".py") &&
    document.getText().trim() === ""
  ) {
    return true;
  }

  // Cheap way of checking if it's a marimo app
  return document.getText().includes("app = marimo.App(");
}

/**
 * Get the current text editor if it's a marimo file
 */
export function getFocusedMarimoTextEditor({
  toast = true,
}: { toast?: boolean } = {}) {
  const editor = [window.activeTextEditor]
    .filter(Boolean)
    .find((editor) => isMarimoApp(editor.document, false));
  if (!editor) {
    if (toast) {
      window.showInformationMessage("No marimo file is open.");
    }
    return;
  }
  return editor;
}
