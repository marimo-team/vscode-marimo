import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Uri, ViewColumn, window, workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { printError } from "../utils/errors";
import { execPython } from "../utils/exec";

export type ExportType =
  | "ipynb"
  | "md"
  | "html"
  | "html-without-code"
  | "script";

export type ExportExtension =
  | "html"
  | "ipynb"
  | "md"
  | "script.py"
  | "txt"
  | "py";

function getExportCommand(type: ExportType): string {
  if (type === "html-without-code") {
    return "html";
  }
  return type;
}
function getExportArgs(type: ExportType): string {
  if (type === "html-without-code") {
    return "--no-include-code";
  }
  return "";
}
function getExportExtension(type: ExportType): ExportExtension {
  if (type === "html-without-code") {
    return "html";
  }
  if (type === "ipynb") {
    return "ipynb";
  }
  if (type === "md") {
    return "md";
  }
  if (type === "html") {
    return "html";
  }
  if (type === "script") {
    return "script.py";
  }
  return "txt";
}

export async function exportNotebookAs(
  filePath: string,
  exportType: ExportType,
): Promise<Uri | false> {
  try {
    // Check the requirements are met
    await checkRequirements(exportType);

    // Run export via marimo CLI
    const directory = path.dirname(filePath);
    const response = await execPython([
      Config.marimoPath,
      "export",
      getExportCommand(exportType),
      `'${filePath}'`, // Wrap in single quotes to handle spaces in path
      getExportArgs(exportType),
    ]);

    const appCode = response.toString();

    try {
      // try to save to file system
      const ext = getExportExtension(exportType);
      const currentFilename = path.basename(filePath, ".py");
      const newFilename = getUniqueFilename(directory, currentFilename, ext);
      const newFilePath = Uri.file(path.join(directory, newFilename));

      await workspace.fs.writeFile(newFilePath, Buffer.from(appCode));

      // open file
      await workspace.openTextDocument(newFilePath).then(() => {
        const relativePath = workspace.asRelativePath(newFilePath);
        window.showInformationMessage(`Saved to ${relativePath}`);
        window.showTextDocument(newFilePath, { viewColumn: ViewColumn.Beside });
      });
      return newFilePath;
    } catch {
      // if fails to save to file system, open in new tab
      await workspace.openTextDocument({ content: appCode }).then((doc) => {
        window.showTextDocument(doc);
      });
      return false;
    }
  } catch (error) {
    logger.info(error);
    window.showErrorMessage(
      `Failed to export notebook: \n${printError(error)}`,
    );
    return false;
  }
}

function checkRequirements(format: ExportType) {
  if (format === "ipynb") {
    // Check that nbformat is installed
    try {
      execSync("nbformat --version", { stdio: "ignore" });
    } catch {
      throw new Error(
        "nbformat is not installed. Please install nbformat, e.g. `pip install nbformat`",
      );
    }
  }
}

export function getUniqueFilename(
  directory: string,
  filename: string,
  extension: string,
  postfix?: number,
) {
  const uniqueFilename = postfix
    ? `${filename}_${postfix}.${extension}`
    : `${filename}.${extension}`;

  // If the file already exists, try again with a higher postfix
  if (existsSync(path.join(directory, uniqueFilename))) {
    return getUniqueFilename(
      directory,
      filename,
      extension,
      postfix ? postfix + 1 : 1,
    );
  }

  return uniqueFilename;
}
