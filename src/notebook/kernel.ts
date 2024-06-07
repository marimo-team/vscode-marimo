import * as vscode from "vscode";
import { logger as l } from "../logger";
import type { KernelKey } from "./common/key";
import { getCellMetadata, setCellMetadata } from "./common/metadata";
import { MarimoBridge } from "./marimo/bridge";
import { Deferred } from "./utils/deferred";
import { invariant } from "./utils/invariant";
import { CellId, CellOp, CellStatus, KernelReady, MarimoConfig, SkewToken } from "./marimo/types";

const logger = l.createLogger("kernel");

const DEFAULT_NAME = "__";

export class Kernel implements vscode.Disposable {
  private readyTimer: NodeJS.Timeout | undefined;
  private executingCells = new Map<CellId, vscode.NotebookCellExecution>();
  private lastCellStatus = new Map<
    CellId,
    CellStatus | null | undefined
  >();

  private readonly bridge: MarimoBridge;
  private readonly ready = new Deferred<KernelReady>();
  private readonly cells = new Map<CellId, vscode.NotebookCell>();

  constructor(
    readonly port: number,
    public readonly kernelKey: KernelKey,
    readonly skewToken: SkewToken,
    readonly userConfig: MarimoConfig,
    private controller: vscode.NotebookController,
    private notebookDoc: vscode.NotebookDocument,
  ) {
    this.bridge = new MarimoBridge(port, kernelKey, skewToken, userConfig, {
      onCellMessage: this.handleCellMessage.bind(this),
      onKernelReady: this.handleReady.bind(this),
    });
  }

  waitForReady(): Promise<KernelReady> {
    let retries = 10;
    this.readyTimer = setInterval(() => {
      logger.log("Waiting for marimo kernel to be ready...");
      retries--;
      if (retries <= 0) {
        clearInterval(this.readyTimer);
        this.ready.reject(
          new Error("Timeout waiting for marimo kernel to be ready"),
        );
      }
    }, 1000);
    return this.ready.promise.finally(() => {
      clearInterval(this.readyTimer);
    });
  }

  async handleNotebookChange(
    e: vscode.NotebookDocumentChangeEvent,
  ): Promise<void> {
    const removedCells = e.contentChanges.flatMap(
      (change) => change.removedCells,
    );
    const addedCells = e.contentChanges.flatMap((change) => change.addedCells);

    // Handle removed cells
    if (removedCells.length > 0) {
      logger.log(`Removing ${removedCells.length} cells`);
    }
    for (const removedCell of removedCells) {
      const metadata = getCellMetadata(removedCell);
      if (!metadata.id) {
        continue;
      }
      this.cells.delete(metadata.id);
      this.bridge.delete({ cellId: metadata.id });
      logger.log("Removed cell", metadata.id);
    }

    // Handle added cells
    if (removedCells.length > 0) {
      logger.log(`Adding ${removedCells.length} cells`);
    }
    for (const addedCell of addedCells) {
      const metadata = getCellMetadata(addedCell);
      let cellId = metadata.id;
      // Assign ID to new cells
      if (!cellId) {
        cellId = CellId.create();
        await setCellMetadata(addedCell, {
          id: cellId,
          name: DEFAULT_NAME,
        });
      }
      this.cells.set(cellId, addedCell);
      logger.log("Added cell", cellId);
    }
  }

  async start(): Promise<void> {
    logger.log("Starting notebook");
    await this.controller.updateNotebookAffinity(
      this.notebookDoc,
      vscode.NotebookControllerAffinity.Preferred,
    );

    // Wait for the kernel to be ready
    await this.waitForReady();

    // Instantiate the kernel
    // TODO: use auto-instantiate config
    await this.bridge.instantiate({
      objectIds: [],
      values: [],
    });
    logger.log("Started");
  }

  dispose(): void {
    clearInterval(this.readyTimer);
    this.bridge.dispose();
  }

  interrupt(): Promise<void> {
    logger.log("Interrupting notebook");
    return this.bridge.interrupt();
  }

  public async executeAll(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController,
  ): Promise<void> {
    logger.log(`Executing ${cells.length} cells`);
    this.controller = _controller;
    // If no id, then it's a new cell
    for (const cell of cells) {
      const metadata = getCellMetadata(cell);
      if (!metadata.id) {
        const cellId = CellId.create();
        await setCellMetadata(cell, {
          id: cellId,
          name: DEFAULT_NAME,
        });
        this.cells.set(cellId, cell);
      }
    }

    // Execute the cell in the kernel
    await this.bridge.run({
      cellIds: cells.map((cell) => getCellMetadata(cell).id!),
      codes: cells.map((cell) => cell.document.getText()),
    });
  }

  private async handleReady(payload: KernelReady): Promise<void> {
    // Collect cells
    const { cell_ids, codes, names } = payload;
    const cells: vscode.NotebookCellData[] = [];
    for (let idx = 0; idx < payload.cell_ids.length; idx++) {
      const cellId = cell_ids[idx];
      const name = names[idx];
      const code = codes[idx];
      const cellData = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        code,
        "python",
      );
      cellData.metadata = {
        custom: {
          id: cellId,
          name: name,
        },
      };
      cells.push(cellData);
    }

    // Add cells
    const cellEdit = vscode.NotebookEdit.replaceCells(
      new vscode.NotebookRange(0, 0),
      cells,
    );
    const edit1 = new vscode.WorkspaceEdit();
    edit1.set(this.notebookDoc.uri, [cellEdit]);
    await vscode.workspace.applyEdit(edit1);

    this.ready.resolve(payload);
  }

  private async handleCellMessage(message: CellOp): Promise<void> {
    const cell_id = message.cell_id as CellId;
    // Update status
    const prevStatus = this.lastCellStatus.get(cell_id);
    const nextStatus = message.status;
    this.lastCellStatus.set(cell_id, nextStatus);

    const cell = this.cells.get(cell_id);
    if (!cell) {
      const possibleValues = Array.from(this.cells.keys());
      logger.error("No cell found for cell", cell_id);
      logger.debug("Possible values", possibleValues.join(", "));
      return;
    }
    const cellMetadata = getCellMetadata(cell);
    invariant(cellMetadata.id, "Cell id is not set");

    if (prevStatus === "queued") {
      try {
        // TODO: fix this getting `Error: notebook controller is NOT associated to notebook:`
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.start(Date.now());
        this.executingCells.set(cellMetadata.id, execution);
      } catch {
        logger.error("Failed to create execution for cell", cellMetadata.id);
      }
    }

    // if (nextStatus === 'queued' || nextStatus === 'running') {
    //   return;
    // }

    if (message.output == null) {
      // execution.clearOutput();
      return;
    }

    const execution = this.executingCells.get(cell_id);
    if (!execution) {
      logger.error("No execution found for cell", cell_id);
      return;
    }
    // const stdErr = toArray(message.logger).filter(
    //   (item) => item.channel === 'stderr' && item.mimetype === 'text/plain'
    // );
    // const stdOut = toArray(message.logger).filter(
    //   (item) => item.channel === 'stdout' && item.mimetype === 'text/plain'
    // );
    const htmlOutputs = toArray(message.output).filter(
      (item) => item.mimetype === "text/html",
    );
    const textOutputs = toArray(message.output).filter(
      (item) => item.mimetype === "text/plain",
    );
    const jsonOutputs = toArray(message.output).filter(
      (item) => item.mimetype === "application/json",
    );

    const consoleOutputs = toArray(message.console).flatMap((item) => {
      if (!item) {
        return [];
      }
      invariant(typeof item.data === 'string', 'Expected string');
      if (item.mimetype === 'text/html' && item.channel === 'stderr') {
        return vscode.NotebookCellOutputItem.text(item.data, 'text/html');
      }
      if (item.channel === 'stdout') {
        return vscode.NotebookCellOutputItem.stdout(item.data);
      }
      if (item.channel === 'stdin') {
        return vscode.NotebookCellOutputItem.stdout(item.data);
      }
      logger.warn('Unknown console output', item);
      return vscode.NotebookCellOutputItem.stderr('Unknown console output');
    });

    try {
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          ...consoleOutputs,
          // vscode.NotebookCellOutputItem.stdout(stdOut.map((item) => item.data).join('\n')),
          // vscode.NotebookCellOutputItem.stderr(stdErr.map((item) => item.data).join('\n')),
          ...htmlOutputs.map((item) =>
            vscode.NotebookCellOutputItem.text(
              addIslandsScript(item.data as string),
              item.mimetype,
            ),
          ),
          ...textOutputs.map((item) =>
            vscode.NotebookCellOutputItem.text(
              item.data as string,
              item.mimetype,
            ),
          ),
          ...jsonOutputs.map((item) =>
            vscode.NotebookCellOutputItem.json(item.data),
          ),
        ]),
      ]);

      execution.end(true, Date.now());
    } catch (err) {
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(err as Error),
        ]),
      ]);
      execution.end(false, Date.now());
    }
  }
}

function addIslandsScript(html: string) {
  const isDark =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  return `
  <span style="min-height: 70px;" class="${
    isDark ? "dark dark-theme" : "light light-theme"
  }">
    <script type="module" src="https://cdn.jsdelivr.net/npm/@marimo-team/islands@0.6.2/dist/main.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/@marimo-team/islands@0.6.2/dist/style.css" rel="stylesheet" crossorigin="anonymous">
    ${html}
  </span>
  `;
}

function toArray<T>(value: T | T[] | null): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}
