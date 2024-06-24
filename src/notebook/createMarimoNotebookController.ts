import * as vscode from "vscode";
import { NOTEBOOK_CONTROLLER_ID, NOTEBOOK_TYPE } from "./constants";

export function createNotebookController() {
  const controller = vscode.notebooks.createNotebookController(
    NOTEBOOK_CONTROLLER_ID,
    NOTEBOOK_TYPE,
    "marimo kernel",
  );
  return controller;
}
