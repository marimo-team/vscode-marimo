import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Uri, ViewColumn, window, workspace } from "vscode";
import { Config } from "../config";
import { logger } from "../logger";
import { printError } from "../utils/errors";

export type ExportType =
  | "ipynb"
  | "md"
  | "html"
  | "html-without-code"
  | "script";

export type ExportExtension = "html" | "ipynb" | "md" | "py" | "txt";

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
    return "py";
  }
  return "txt";
}

export async function exportNotebookAs(
  filePath: string,
  exportType: ExportType,
): Promise<Uri | false> {
  try {
    const marimoPath = Config.marimoPath;
    // export
    const directory = path.dirname(filePath);
    const response = execSync(
      `${marimoPath} export ${getExportCommand(
        exportType,
      )} '${filePath}' ${getExportArgs(exportType)}`.trim(),
    );

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
    logger.log(error);
    window.showErrorMessage(`Failed to export notebook: ${printError(error)}`);
    return false;
  }
}

function getUniqueFilename(
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
