// import { execSync } from "child_process";
// import type { ICell, INotebookContent } from "@jupyterlab/nbformat";
// import * as vscode from "vscode";
// import { logger } from "../logger";

// export class MarimoNotebookSerializer implements vscode.NotebookSerializer {
//   public async deserializeNotebook(
//     data: Uint8Array,
//     token: vscode.CancellationToken,
//   ): Promise<vscode.NotebookData> {
//     // const content = Buffer.from(data).toString('utf-8');
//     // // Create a temporary ipynb file to help convert to json
//     // const tempy = await import('tempy');
//     // const tempFilePath = tempy.temporaryFile({ extension: 'py' });
//     // logger.log('Creating temporary file', tempFilePath);
//     // await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFilePath), Buffer.from(content));

//     // const response = execSync(`marimo export ipynb ${tempFilePath}`);
//     // const nbContent: INotebookContent = JSON.parse(response.toString());
//     // // Create data and notebook
//     // const cells = nbContent.cells.map((code) => {
//     //   let cellData: vscode.NotebookCellData;
//     //   if (code.cell_type === 'markdown') {
//     //     cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, flattenSource(code.source), 'markdown');
//     //   } else {
//     //     cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, flattenSource(code.source), 'python');
//     //   }
//     //   cellData.metadata = {
//     //     custom: {
//     //       id: code.id,
//     //       name: '__',
//     //     },
//     //   };
//     //   return cellData;
//     // });

//     const nbData = new vscode.NotebookData([]);
//     nbData.metadata = {};

//     return new vscode.NotebookData([]);
//   }

//   public async serializeNotebook(
//     data: vscode.NotebookData,
//     token: vscode.CancellationToken,
//   ): Promise<Uint8Array> {
//     // Convert to nbformat
//     const cells: ICell[] = data.cells.map((cell) => {
//       const cellMetadata = cell.metadata?.custom || {};
//       const cellType =
//         cell.kind === vscode.NotebookCellKind.Markup ? "markdown" : "code";
//       return {
//         id: cellMetadata.id,
//         cell_type: cellType,
//         metadata: {},
//         source: cell.value.split("\n"),
//       };
//     });
//     const nbContent: INotebookContent = {
//       metadata: {},
//       nbformat_minor: 5,
//       nbformat: 4,
//       cells,
//     };
//     // Create a temporary file
//     const tempFile = "/tmp/marimo-notebook.ipynb";
//     execSync(`echo '${JSON.stringify(nbContent)}' > ${tempFile}`);
//     const result = execSync(`marimo convert ipynb ${tempFile}`);
//     return Buffer.from(result);
//   }
// }

// function flattenSource(source: string | string[]): string {
//   if (typeof source === "string") {
//     return source;
//   }
//   return source.join("\n");
// }

import * as vscode from "vscode";

export class MarimoNotebookSerializer implements vscode.NotebookSerializer {
  public async deserializeNotebook(
    _data: Uint8Array,
    _token: vscode.CancellationToken,
  ): Promise<vscode.NotebookData> {
    // const content = Buffer.from(data).toString('utf-8');
    // // TODO: exec(marimo parse <file>)
    // const codes = getCellContents(content);
    // console.log(`Parsed ${codes.length} cells`);

    // // Create data and notebook
    // const cells = codes.map((code, idx) => {
    //   const id = idx.toString();
    //   const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, code, 'python');
    //   cellData.metadata = {
    //     custom: {
    //       id: id,
    //       name: '__',
    //     },
    //   };
    //   return cellData;
    // });

    // const nbData = new vscode.NotebookData(cells);
    // nbData.metadata = {};

    return new vscode.NotebookData([]);
  }

  public async serializeNotebook(
    _data: vscode.NotebookData,
    _token: vscode.CancellationToken,
  ): Promise<Uint8Array> {
    console.error("Not implemented");
    // TODO: exec(marimo serialize <file>)
    return new Uint8Array([]);
  }
}

function getCellContents(fileContent: string): string[] {
  const cellContentRegex =
    /@app\.cell\s*def\s*__\(.*?\):\s*([\s\S]*?)(?=@app\.cell|$)/g;
  const matches = [...fileContent.matchAll(cellContentRegex)];

  const cellContents = matches.map((match) => match[1].trim());

  return cellContents;
}
