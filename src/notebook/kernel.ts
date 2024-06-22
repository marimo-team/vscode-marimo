import * as vscode from "vscode";
import { MarimoPanelManager } from "../browser/panel";
import { Config, composeUrl } from "../config";
import { logger as l } from "../logger";
import { Deferred } from "../utils/deferred";
import { invariant } from "../utils/invariant";
import type { KernelKey } from "./common/key";
import { getCellMetadata, setCellMetadata } from "./common/metadata";
import { PYTHON_LANGUAGE_ID } from "./constants";
import { MarimoBridge } from "./marimo/bridge";
import {
  type CellChannel,
  type CellConfig,
  CellId,
  type CellOp,
  type CellOutput,
  type CellStatus,
  type KernelReady,
  type MarimoConfig,
  type SkewToken,
  type UpdateCellIdsRequest,
} from "./marimo/types";

const logger = l.createLogger("kernel");

const DEFAULT_NAME = "__";

export interface IKernel extends vscode.Disposable {
  waitForReady(): Promise<KernelReady>;
  handleNotebookChange(e: vscode.NotebookDocumentChangeEvent): Promise<void>;
  start(user: MarimoConfig): Promise<void>;
  interrupt(): Promise<void>;
  save(): Promise<string>;
  readCode(): Promise<string>;
  openKiosk(browser?: "embedded" | "system"): Promise<void>;
  executeAll(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void>;
}

export class Kernel implements IKernel {
  private readyTimer: NodeJS.Timeout | undefined;
  // private executingCells = new Map<CellId, Deferred<void>>();
  private lastCellStatus = new Map<CellId, CellStatus | null | undefined>();
  private cellStartTimes = new Map<CellId, number>();
  private keyedMessageQueue = new Map<string, CellOp[]>();
  private panel: MarimoPanelManager;

  private readonly bridge: MarimoBridge;
  private ready = new Deferred<KernelReady>();
  private readonly cells = new Map<CellId, vscode.NotebookCell>();
  private prevCellIds: CellId[] = [];

  constructor(
    private opts: {
      readonly port: number;
      readonly fileUri: vscode.Uri;
      readonly kernelKey: KernelKey;
      readonly skewToken: SkewToken;
      readonly version: string;
      readonly userConfig: MarimoConfig;
      controller: vscode.NotebookController;
      readonly notebookDoc: vscode.NotebookDocument;
    },
  ) {
    const { port, kernelKey, skewToken, userConfig, notebookDoc } = opts;
    this.bridge = new MarimoBridge(port, kernelKey, skewToken, userConfig, {
      onCellMessage: this.handleCellMessage.bind(this),
      onKernelReady: this.handleReady.bind(this),
    });
    this.bridge.start();
    const basename = vscode.workspace.asRelativePath(notebookDoc.uri);
    this.panel = new MarimoPanelManager(basename);
  }

  isWebviewActive() {
    return this.panel.isActive();
  }

  reloadPanel() {
    this.panel.reload();
  }

  get relativePath(): string {
    return vscode.workspace.asRelativePath(this.opts.fileUri);
  }

  get kernelKey(): KernelKey {
    return this.opts.kernelKey;
  }
  get fileUri(): vscode.Uri {
    return this.opts.fileUri;
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

  async openKiosk(browser = Config.browser): Promise<void> {
    // If already opened, just focus
    if (browser === "embedded" && this.panel.isReady()) {
      this.panel.show();
    }

    const url = new URL(composeUrl(this.opts.port));
    url.searchParams.set("kiosk", "true");
    url.searchParams.set("file", this.kernelKey);

    if (browser === "system") {
      // Close the panel if opened
      this.panel.dispose();
      try {
        await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      } catch (err) {
        logger.error("Failed to open url", url.toString(), err);
        vscode.window.showErrorMessage(
          "Failed to open Marimo at " + url.toString(),
        );
      }
    } else if (browser === "embedded") {
      this.panel.create(url.toString());
      this.panel.show();
    }
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

    // Get all cell ids
    const cellIds = Array.from(e.notebook.getCells())
      .map((cell) => {
        const metadata = getCellMetadata(cell);
        return metadata.id;
      })
      .filter(Boolean);

    if (!deepEqual(this.prevCellIds, cellIds)) {
      this.prevCellIds = cellIds;
      await this.bridge.updateCellIds({
        cell_ids: cellIds as CellId[],
        // name is not needed
      } as unknown as UpdateCellIdsRequest);
    }
  }

  async start(): Promise<void> {
    logger.log("Starting notebook");
    await this.opts.controller.updateNotebookAffinity(
      this.opts.notebookDoc,
      vscode.NotebookControllerAffinity.Preferred,
    );
    // Wait for the kernel to be ready
    await this.waitForReady();
    logger.log("Kernel is ready");

    // Instantiate the kernel
    if (this.opts.userConfig?.runtime?.auto_instantiate) {
      logger.log("Instantiating kernel");
      await this.bridge.instantiate({
        objectIds: [],
        values: [],
      });
    }

    logger.log("Started");
  }

  async restart(): Promise<void> {
    logger.log("Restarting notebook");
    await this.bridge.closeSession();
    // Clear cells
    this.ready = new Deferred<KernelReady>();
    this.cells.clear();
    await this.start();
    this.panel.reload();
  }

  dispose(): void {
    logger.log("Disposing notebook");
    clearInterval(this.readyTimer);
    this.panel.dispose();
    this.bridge.dispose();
  }

  interrupt(): Promise<void> {
    logger.log("Interrupting notebook");
    return this.bridge.interrupt();
  }

  save(): Promise<string> {
    logger.log("Saving notebook");
    const cellIds: string[] = [];
    const codes: string[] = [];
    const names: string[] = [];
    const configs: CellConfig[] = [];

    for (const cell of this.cells.values()) {
      const metadata = getCellMetadata(cell);
      if (!metadata.id) {
        logger.error("Cell has no id", cell);
        continue;
      }
      cellIds.push(metadata.id);
      codes.push(cell.document.getText());
      names.push(metadata.name || DEFAULT_NAME);
      configs.push({
        hide_code: false,
        disabled: false,
      });
    }

    return this.bridge.save({
      cellIds,
      codes,
      configs,
      names,
      filename: this.opts.notebookDoc.uri.fsPath,
      persist: false,
    });
  }

  readCode(): Promise<string> {
    return this.bridge.readCode();
  }

  public async executeAll(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void> {
    logger.log(`Executing ${cells.length} cells`);
    this.opts.controller = controller;
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
        PYTHON_LANGUAGE_ID,
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
    const end = this.opts.notebookDoc.cellCount;
    const cellEdit = vscode.NotebookEdit.replaceCells(
      new vscode.NotebookRange(0, end),
      cells,
    );
    const edit1 = new vscode.WorkspaceEdit();
    edit1.set(this.opts.notebookDoc.uri, [cellEdit]);
    await vscode.workspace.applyEdit(edit1);

    this.ready.resolve(payload);
  }

  private isFlushing = new Map<string, boolean>();

  private async handleCellMessage(message: CellOp): Promise<void> {
    // await initializePromise;
    // Push onto the queue
    const key = message.cell_id;
    const queue = this.keyedMessageQueue.get(key) || [];
    queue.push(message);
    this.keyedMessageQueue.set(key, queue);

    // Flush the queue
    await this.flushCellMessageQueue(key);
  }

  private async flushCellMessageQueue(key: string): Promise<void> {
    if (this.isFlushing.get(key)) {
      return;
    }
    this.isFlushing.set(key, true);
    const queue = this.keyedMessageQueue.get(key) || [];
    while (queue.length > 0) {
      try {
        const message = queue.shift();
        if (!message) {
          continue;
        }
        await this.handleCellMessageInternal(message);
      } catch (err) {
        logger.error("Error handling cell message", err);
      }
    }
    this.isFlushing.set(key, false);
  }

  private async handleCellMessageInternal(message: CellOp): Promise<void> {
    logger.debug(
      "message: ",
      JSON.stringify({
        cell_id: message.cell_id,
        status: message.status,
        channel: message.output?.channel,
        mimetype: message.output?.mimetype,
        consoleLength: toArray(message.console).length,
        consoleMimeTypes: toArray(message.console).map(
          (item) => item?.mimetype,
        ),
      }),
    );
    const cell_id = message.cell_id as CellId;
    // Update status
    const prevStatus = this.lastCellStatus.get(cell_id);
    const nextStatus = message.status ?? "idle";
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

    // If its not running, or idle, ignore
    if (nextStatus !== "running" && nextStatus !== "idle") {
      return;
    }

    let execution: vscode.NotebookCellExecution;

    // // Wait for other executions to finish
    // if (this.executingCells.has(cellMetadata.id)) {
    //   logger.log("Waiting for previous execution to finish for cell", cellMetadata.id);
    //   await this.executingCells.get(cellMetadata.id)?.promise;
    // }

    // Create execution
    try {
      logger.debug("Creating execution for cell", cellMetadata.id);
      execution = this.opts.controller.createNotebookCellExecution(cell);
    } catch (err) {
      logger.error("Failed to create execution", err);
      return;
    }

    const endExecution = async (success: boolean): Promise<void> => {
      execution.end(success, Date.now());
      logger.debug("ended execution for cell", cellMetadata.id);
    };

    execution.token.onCancellationRequested(() => {
      logger.log("Cancelling cell", cellMetadata.id);
      endExecution(false);
    });

    logger.debug(
      "transitioning cell",
      cellMetadata.id,
      "from",
      prevStatus,
      "to",
      nextStatus,
    );

    // If going from queued to running, remove the console output
    let cellStartTime = this.cellStartTimes.get(cellMetadata.id) || Date.now();

    if (execution && prevStatus === "queued" && nextStatus === "running") {
      logger.debug("clearing console outputs for cell", cellMetadata.id);
      const nonConsoleOutputs = cell.outputs.filter((output) => {
        const channel = output.metadata?.channel;
        return ["stdout", "stderr", "stdin", "marimo-error"].includes(channel);
      });
      cellStartTime = Date.now();
      this.cellStartTimes.set(cellMetadata.id, cellStartTime);
      execution.start(Date.now());
      await execution.replaceOutput(nonConsoleOutputs);
      endExecution(false);
      return;
    }

    execution.start(cellStartTime);

    // If it is running or idle, update the output
    // Merge the console outputs
    if (nextStatus === "idle" || nextStatus === "running") {
      logger.debug("updating output for cell", cellMetadata.id);

      let stdOutContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stdout",
      );
      let stdErrContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stderr",
      );
      let stdInContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stdin",
      );
      let outputContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "output",
      );
      let marimoErrorContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "marimo-error",
      );
      let pdbContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "pdb",
      );
      let mediaContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "media",
      );

      // If new console output, append to existing
      if (message.console) {
        const stdOut = toArray(message.console).filter(
          (item) => item.channel === "stdout",
        );
        const stdErr = toArray(message.console).filter(
          (item) => item.channel === "stderr",
        );
        const stdIn = toArray(message.console).filter(
          (item) => item.channel === "stdin",
        );

        stdOutContainer = handleCellOutput(
          stdOut,
          "stdout",
          stdOutContainer?.items,
        );
        stdErrContainer = handleCellOutput(
          stdErr,
          "stderr",
          stdErrContainer?.items,
        );
        stdInContainer = handleCellOutput(
          stdIn,
          "stdin",
          stdInContainer?.items,
        );
      }

      // If new output, replace
      if (message.output) {
        const outputs = toArray(message.output).filter(
          (item) => item.channel === "output",
        );
        const marimoErrors = toArray(message.output).filter(
          (item) => item.channel === "marimo-error",
        );
        const pdb = toArray(message.output).filter(
          (item) => item.channel === "pdb",
        );
        const media = toArray(message.output).filter(
          (item) => item.channel === "media",
        );

        outputContainer = handleCellOutput(outputs, "output");
        marimoErrorContainer = handleCellOutput(
          marimoErrors,

          "marimo-error",
        );
        pdbContainer = handleCellOutput(pdb, "pdb");
        mediaContainer = handleCellOutput(media, "media");
      }

      const items = [
        // outputContainer,
        marimoErrorContainer,
        // pdbContainer,
        // mediaContainer,
        stdOutContainer,
        stdErrContainer,
        stdInContainer,
      ].filter((v): v is vscode.NotebookCellOutput => !!v);

      try {
        logger.debug(
          "updating output with items",
          items.length,
          " each with ",
          items
            .map((item) => `${item.metadata?.channel}:${item.items.length}`)
            .join(", "),
        );
        await execution.replaceOutput(items);
      } catch (err) {
        logger.error("Failed to update output", err);
        await execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(err as Error),
          ]),
        ]);
        endExecution(false);
        return;
      }
    }

    endExecution(true);
  }
}

function handleCellOutput(
  output: CellOutput | CellOutput[],
  channel: CellChannel,
  prevItems: vscode.NotebookCellOutputItem[] = [],
): vscode.NotebookCellOutput {
  const items = toArray(output).flatMap((item) => {
    if (item.mimetype === "text/plain" && item.channel === "stderr") {
      return vscode.NotebookCellOutputItem.stderr(item.data as string);
    }
    if (item.mimetype === "text/plain" && item.channel === "stdout") {
      return vscode.NotebookCellOutputItem.stdout(item.data as string);
    }

    if (item.mimetype === "text/html") {
      return vscode.NotebookCellOutputItem.text(
        item.data as string,
        item.mimetype,
      );
    }
    if (item.mimetype === "application/vnd.marimo+error") {
      invariant(Array.isArray(item.data), "Marimo error data is not an array");
      return item.data.map((error) => {
        const { type, ...rest } = error;
        const message = Object.entries(rest)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(", ");
        return vscode.NotebookCellOutputItem.error(
          new Error(`${type}: ${message}`),
        );
      });
    }
    return vscode.NotebookCellOutputItem.text(
      item.data as string,
      item.mimetype,
    );
  });

  // const flattenByMimetype = [...prevItems, ...items].reduce((acc, item) => {
  //   const existing = acc.find((i) => i.mime === item.mime);
  //   if (existing) {
  //     return acc.map((i) => {
  //       if (i === existing) {
  //         const combinedUInt8Array = new Uint8Array(
  //           i.data.buffer.byteLength + item.data.buffer.byteLength,
  //         );
  //         combinedUInt8Array.set(new Uint8Array(i.data.buffer), 0);
  //         combinedUInt8Array.set(new Uint8Array(item.data.buffer), i.data.buffer.byteLength);
  //         return new vscode.NotebookCellOutputItem(
  //           combinedUInt8Array,
  //           i.mime,
  //         );
  //       }
  //       return i;
  //     });
  //   }
  //   return [...acc, item];
  // }, [] as vscode.NotebookCellOutputItem[]);

  // return new vscode.NotebookCellOutput(flattenByMimetype, {
  //   channel: channel,
  // });
  return new vscode.NotebookCellOutput([...prevItems, ...items], {
    channel: channel,
  });
}

// function maybeInitialize() {
//   const version = "0.6.20-dev9";
//   const mod = import(
//     `https://cdn.jsdelivr.net/npm/@marimo-team/islands@${version}/dist/main.js`
//   );
//   mod.then((m) => {
//     m.initialize();
//   });
// }

// const initializePromise = maybeInitialize();

// function addIslandsScript(html: string, version: string): string {
//   version = "0.6.20-dev9";
//   const isDark =
//     vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
//     vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
//   return `
//   <span class="marimo" style="display: contents;">
//     <span style="min-height: 70px;" class="${isDark ? "dark" : "light"}">
//       <script type="module" src="https://cdn.jsdelivr.net/npm/@marimo-team/islands@0.6.20-dev9/dist/main.js"></script>
//       <link href="https://cdn.jsdelivr.net/npm/@marimo-team/islands@0.6.20-dev9/dist/style.css" rel="stylesheet" crossorigin="anonymous">
//       ${html}
//     </span>
//   </span>
//   `;
// }

function toArray<T>(value: T | ReadonlyArray<T>): T[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value == null) {
    return [];
  }
  return [value] as T[];
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (const key in a) {
    if (!(key in b)) {
      return false;
    }
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}
