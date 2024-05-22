import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Uri, window, workspace } from "vscode";
import { logger } from "../logger";
import { printError } from "../utils/errors";

export async function convertIPyNotebook(filePath: string, marimoPath: string) {
  return convertNotebook(filePath, marimoPath, "ipynb");
}

export async function convertMarkdownNotebook(
  filePath: string,
  marimoPath: string,
) {
  return convertNotebook(filePath, marimoPath, "md");
}

export async function convertNotebook(
  filePath: string,
  marimoPath: string,
  ext: "ipynb" | "md",
) {
  try {
    // convert
    const directory = path.dirname(filePath);
    const response = execSync(`${marimoPath} convert '${filePath}'`);
    const appCode = response.toString();

    try {
      // try to save to file system
      const currentFilename = path.basename(filePath, `.${ext}`);
      const newFilename = getUniqueFilename(directory, currentFilename);
      const newFilePath = Uri.file(path.join(directory, newFilename));

      await workspace.fs.writeFile(newFilePath, Buffer.from(appCode));

      // open file
      workspace.openTextDocument(newFilePath).then(() => {
        // Get relative path if possible
        const relativePath = workspace.asRelativePath(newFilePath);
        window.showInformationMessage(`Saved to ${relativePath}`);
      });
    } catch {
      // if fails to save to file system, open in new tab
      workspace
        .openTextDocument({ content: appCode, language: "python" })
        .then((doc) => {
          window.showTextDocument(doc);
        });
    }
  } catch (error) {
    logger.log(error);
    window.showErrorMessage(`Failed to convert notebook: ${printError(error)}`);
    return false;
  }
  return true;
}

function getUniqueFilename(
  directory: string,
  filename: string,
  postfix?: number,
) {
  const uniqueFilename = postfix
    ? `${filename}_${postfix}.py`
    : `${filename}.py`;

  // If the file already exists, try again with a higher postfix
  if (existsSync(path.join(directory, uniqueFilename))) {
    return getUniqueFilename(directory, filename, postfix ? postfix + 1 : 1);
  }

  return uniqueFilename;
}
