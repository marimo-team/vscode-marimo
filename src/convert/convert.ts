import path from "node:path";
import { Uri, window, workspace } from "vscode";
import { Config } from "../config";
import { getUniqueFilename } from "../export/export-as";
import { logger } from "../logger";
import { printError } from "../utils/errors";
import { execPython } from "../utils/exec";

export async function convertIPyNotebook(filePath: string) {
  return convertNotebook(filePath, "ipynb");
}

export async function convertMarkdownNotebook(filePath: string) {
  return convertNotebook(filePath, "md");
}

async function convertNotebook(
  filePath: string,
  ext: "ipynb" | "md",
): Promise<Uri | boolean> {
  try {
    // convert
    const directory = path.dirname(filePath);
    // Execute marimo via python
    const response = await execPython([
      Config.marimoPath,
      "convert",
      `'${filePath}'`, // Wrap in single quotes to handle spaces in path
    ]);
    const appCode = response.toString();

    try {
      // try to save to file system
      const currentFilename = path.basename(filePath, `.${ext}`);
      const newFilename = getUniqueFilename(directory, currentFilename, "py");
      const newFilePath = Uri.file(path.join(directory, newFilename));

      await workspace.fs.writeFile(newFilePath, Buffer.from(appCode));

      // open file
      workspace.openTextDocument(newFilePath).then(() => {
        // Get relative path if possible
        const relativePath = workspace.asRelativePath(newFilePath);
        window.showInformationMessage(`Saved to ${relativePath}`);
      });
      return newFilePath;
    } catch {
      // if fails to save to file system, open in new tab
      workspace
        .openTextDocument({ content: appCode, language: "python" })
        .then((doc) => {
          window.showTextDocument(doc);
        });
      return true;
    }
  } catch (error) {
    logger.info(error);
    window.showErrorMessage(
      `Failed to convert notebook: \n${printError(error)}`,
    );
    return false;
  }
}
