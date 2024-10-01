import {
  type NotebookDocument,
  type NotebookEditor,
  commands,
  window,
} from "vscode";
import { logger } from "../logger";

export async function showNotebookDocument(
  document: NotebookDocument,
): Promise<NotebookEditor | undefined> {
  // If existing editor is found, focus it
  const existingEditor = window.visibleNotebookEditors.find(
    (editor) => editor.notebook === document,
  );
  try {
    if (existingEditor) {
      logger.info("Focusing an existing marimo notebook");
    } else {
      logger.info("Showing a new marimo notebook");
    }
    return await window.showNotebookDocument(document, {
      viewColumn: existingEditor?.viewColumn,
    });
  } catch {
    // Do nothing
  }

  return undefined;
}

export async function closeNotebookEditor(editor: NotebookEditor) {
  // Focus the editor
  await window.showNotebookDocument(editor.notebook, {
    preview: false,
    viewColumn: editor.viewColumn,
  });
  // Close the editor
  await commands.executeCommand("workbench.action.closeActiveEditor");
}
