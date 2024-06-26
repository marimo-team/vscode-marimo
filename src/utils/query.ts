import { type TextDocument, window } from "vscode";

export function isMarimoApp(
  document: TextDocument | undefined,
  includeEmpty = true,
) {
  if (!document || !["python", "markdown"].includes(document.languageId)) {
    return false;
  }

  // If it's empty, return true.
  // This is so we can create a new file and start the server.
  if (includeEmpty && document.getText().trim() === "") {
    return true;
  }

  // Cheap way of checking if it's a marimo app
  const fileName = document.fileName;
  const text = document.getText();
  return (
    (text.includes("app = marimo.App(") && fileName.endsWith(".py")) ||
    (text.includes("marimo-version") && fileName.endsWith(".md"))
  );
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
