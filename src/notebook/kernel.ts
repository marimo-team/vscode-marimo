import * as vscode from "vscode";
import { MarimoPanelManager } from "../browser/panel";
import { Config, composeUrl } from "../config";
import { logger as l, logger } from "../logger";
import type { ILifecycle } from "../types";
import { Deferred } from "../utils/deferred";
import { invariant } from "../utils/invariant";
import { LogMethodCalls } from "../utils/log";
import { closeNotebookEditor } from "../utils/show";
import { asURL } from "../utils/url";
import type { KernelKey } from "./common/key";
import { getCellMetadata, setCellMetadata } from "./common/metadata";
import { MARKDOWN_LANGUAGE_ID, PYTHON_LANGUAGE_ID } from "./constants";
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
import { maybeMarkdown, toMarkdown } from "./md";
import { toArray } from "../utils/arrays";
import { deepEqual } from "../utils/deepEqual";

const DEFAULT_NAME = "__";

export interface IKernel extends ILifecycle {
  waitForReady(): Promise<KernelReady>;
  handleNotebookChange(e: vscode.NotebookDocumentChangeEvent): Promise<void>;
  start(): Promise<void>;
  interrupt(): Promise<void>;
  readCode(): Promise<string>;
  openKiosk(browser?: "embedded" | "system"): Promise<void>;
  executeAll(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void>;
}

export class Kernel implements IKernel {
  private readonly logger = logger.createLogger("kernel");
  private readonly bridge: MarimoBridge;
  private readonly cells = new Map<CellId, vscode.NotebookCell>();
  private autoSaveInterval: NodeJS.Timeout | undefined;
  private readonly cellExecutions = new Map<
    CellId,
    vscode.NotebookCellExecution
  >();

  private readyTimer: NodeJS.Timeout | undefined;
  private lastCellStatus = new Map<CellId, CellStatus | null | undefined>();
  private keyedMessageQueue = new Map<string, CellOp[]>();

  private panel: MarimoPanelManager;
  private ready = new Deferred<KernelReady>();
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
    const { port, kernelKey, skewToken, notebookDoc } = opts;
    this.bridge = new MarimoBridge(port, kernelKey, skewToken, {
      onCellMessage: this.handleCellMessage.bind(this),
      onKernelReady: this.handleReady.bind(this),
      onCompletedRun: this.handleCompleteRun.bind(this),
      onRestart: () => {
        // Open the browser
        this.openKiosk();
      },
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

  get notebookDoc(): vscode.NotebookDocument {
    return this.opts.notebookDoc;
  }

  waitForReady(): Promise<KernelReady> {
    let retries = 10;
    this.readyTimer = setInterval(() => {
      this.logger.info("Waiting for marimo kernel to be ready...");
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

  @LogMethodCalls()
  async openKiosk(browser = Config.browser): Promise<void> {
    // If already opened, just focus
    if (browser === "embedded" && this.panel.isReady()) {
      this.panel.show();
    }

    const url = asURL(await composeUrl(this.opts.port));
    url.searchParams.set("kiosk", "true");
    url.searchParams.set("file", this.kernelKey);

    if (browser === "system") {
      // Close the panel if opened
      this.panel.dispose();
      try {
        await vscode.env.openExternal(vscode.Uri.parse(url.toString()));
      } catch (err) {
        this.logger.error("Failed to open url", url.toString(), err);
        vscode.window.showErrorMessage(
          `Failed to open Marimo at ${url.toString()}`,
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
      this.logger.info(`Removing ${removedCells.length} cells`);
    }
    for (const removedCell of removedCells) {
      const metadata = getCellMetadata(removedCell);
      if (!metadata.id) {
        continue;
      }
      this.cells.delete(metadata.id);
      this.bridge.delete({ cellId: metadata.id });
      this.logger.info("Removed cell", metadata.id);
    }

    // Handle added cells
    if (removedCells.length > 0) {
      this.logger.info(`Adding ${removedCells.length} cells`);
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
      this.logger.info("Added cell", cellId);
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

    // Update markdown cells to run on change.
    const markdownChanges = e.cellChanges
      .flatMap((change) => (change.document ? change.cell : []))
      .filter((cell) => cell.document.languageId === MARKDOWN_LANGUAGE_ID);

    // Execute the pending markdown cells
    if (markdownChanges.length > 0) {
      const cellIds: CellId[] = [];
      const codes: string[] = [];
      for (const cell of markdownChanges) {
        const metadata = getCellMetadata(cell);
        if (!metadata.id) {
          continue;
        }
        cellIds.push(metadata.id);
        codes.push(toMarkdown(cell.document.getText()));
      }
      await this.bridge.run({ cellIds, codes });
    }
  }

  @LogMethodCalls()
  async start(): Promise<void> {
    await this.opts.controller.updateNotebookAffinity(
      this.opts.notebookDoc,
      vscode.NotebookControllerAffinity.Preferred,
    );
    // Wait for the kernel to be ready
    await this.waitForReady();
    this.logger.info("Kernel is ready");

    // Instantiate the kernel
    if (this.opts.userConfig?.runtime?.auto_instantiate) {
      this.logger.info("Instantiating kernel");
      await this.bridge.instantiate({
        objectIds: [],
        values: [],
      });
    }

    this.logger.info("Started");

    if (this.opts.userConfig.save?.autosave) {
      this.logger.info("Starting auto-save");
      this.startAutoSave(this.opts.userConfig.save.autosave_delay || 1000);
    }
  }

  @LogMethodCalls()
  async restart(): Promise<void> {
    // If there are un-saved changes, force as save
    if (this.opts.notebookDoc.isDirty) {
      const res = await this.opts.notebookDoc.save();
      if (!res) {
        return;
      }
    }

    await this.bridge.restart();
    // Clear cells
    this.ready = new Deferred<KernelReady>();
    this.endAllExecutions();
    this.cells.clear();
    await this.start();
    this.panel.reload();
    this.openKiosk();
  }

  @LogMethodCalls()
  async dispose(): Promise<void> {
    clearInterval(this.readyTimer);
    this.stopAutoSave();
    this.panel.dispose();
    await this.bridge.dispose(); // Ensure bridge is properly disposed
    this.endAllExecutions();
    // Close open NotebookEditor that matches the document
    const editors = vscode.window.visibleNotebookEditors.filter(
      (editor) => editor.notebook === this.opts.notebookDoc,
    );
    for (const editor of editors) {
      await closeNotebookEditor(editor);
    }
  }

  @LogMethodCalls()
  interrupt(): Promise<void> {
    return this.bridge.interrupt();
  }

  @LogMethodCalls()
  save(cellData: vscode.NotebookCellData[]): Promise<string> {
    const cellIds: string[] = [];
    const names: string[] = [];
    const configs: CellConfig[] = [];
    const codes: string[] = [];
    for (const cell of cellData) {
      const metadata = getCellMetadata(cell);
      if (!metadata.id) {
        this.logger.error("Cell has no id", cell);
        continue;
      }

      cellIds.push(metadata.id);
      if (cell.languageId === PYTHON_LANGUAGE_ID) {
        codes.push(cell.value);
      } else if (cell.languageId === MARKDOWN_LANGUAGE_ID) {
        codes.push(toMarkdown(cell.value));
      } else {
        this.logger.error("Unsupported language", cell.languageId);
        codes.push(cell.value);
      }

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

  @LogMethodCalls()
  readCode(): Promise<string> {
    return this.bridge.readCode();
  }

  public async executeAll(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController,
  ): Promise<void> {
    this.logger.info(`Executing ${cells.length} cells`);
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

    const cellIds: string[] = [];
    const codes: string[] = [];

    for (const cell of cells) {
      const metadata = getCellMetadata(cell);
      if (!metadata.id) {
        this.logger.error("Cell has no id", cell);
        continue;
      }

      cellIds.push(metadata.id);
      codes.push(cell.document.getText());
    }

    // Execute the cell in the kernel
    await this.bridge.run({ cellIds, codes });
  }

  private endAllExecutions() {
    // Finish all running cells
    for (const execution of this.cellExecutions.values()) {
      execution.end(true, Date.now());
    }
    this.cellExecutions.clear();
  }

  private async handleCompleteRun(): Promise<void> {
    this.endAllExecutions();
  }

  private async handleReady(payload: KernelReady): Promise<void> {
    // Collect cells
    const { cell_ids, codes, names } = payload;
    const cells: vscode.NotebookCellData[] = [];
    for (let idx = 0; idx < payload.cell_ids.length; idx++) {
      const cellId = cell_ids[idx];
      const name = names[idx];
      const code = codes[idx];
      // TODO: Since markdown is special, it should be tagged in payload, opposed to trying to determine here.
      const markdown = maybeMarkdown(code);
      const cellData =
        markdown === null
          ? new vscode.NotebookCellData(
              vscode.NotebookCellKind.Code,
              code,
              PYTHON_LANGUAGE_ID,
            )
          : new vscode.NotebookCellData(
              vscode.NotebookCellKind.Markup,
              markdown,
              MARKDOWN_LANGUAGE_ID,
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
        this.logger.error("Error handling cell message", err);
      }
    }
    this.isFlushing.set(key, false);
  }

  private startAutoSave(timeout: number) {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.autoSaveInterval = setInterval(async () => {
      if (this.notebookDoc.isDirty) {
        this.notebookDoc.save();
      }
    }, timeout);
  }

  private stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  private async handleCellMessageInternal(message: CellOp): Promise<void> {
    // logger.debug("message: ", JSON.stringify(message))
    const cell_id = message.cell_id as CellId;
    // Update status
    const prevStatus = this.lastCellStatus.get(cell_id) ?? "idle";
    const nextStatus = message.status ?? prevStatus;
    this.lastCellStatus.set(cell_id, nextStatus);

    const cell = this.cells.get(cell_id);
    if (!cell) {
      const possibleValues = Array.from(this.cells.keys());
      this.logger.error("No cell found for cell", cell_id);
      this.logger.debug("Possible values", possibleValues.join(", "));
      return;
    }

    const cellMetadata = getCellMetadata(cell);
    invariant(cellMetadata.id, "Cell id is not set");

    this.logger.debug(
      "transitioning cell",
      cell_id,
      "from",
      prevStatus,
      "to",
      nextStatus,
    );

    const hasError = toArray(message.output || []).some(
      (item) => item.channel === "marimo-error",
    );

    if (hasError) {
      // Start and stop an execution to show the error
      const execution =
        this.cellExecutions.get(cellMetadata.id) ||
        this.opts.controller.createNotebookCellExecution(cell);
      try {
        await execution.start(Date.now());
      } catch {
        // Do nothing
      }
      await execution.replaceOutput([
        handleCellOutput(message.output, "marimo-error"),
      ]);
      await execution.end(false, Date.now());
      return;
    }

    // If it went from queued to queued, do nothing
    if (prevStatus === "queued" && nextStatus === "queued") {
      return;
    }

    // If it went from not queued to queued, create the execution
    if (prevStatus !== "queued" && nextStatus === "queued") {
      this.logger.debug("starting execution for cell", cellMetadata.id);
      const execution = this.opts.controller.createNotebookCellExecution(cell);
      execution.token.onCancellationRequested(() => {
        this.logger.info("interrupting cell", cellMetadata.id);
      });
      this.cellExecutions.set(cellMetadata.id, execution);
      return;
    }

    const execution = this.cellExecutions.get(cellMetadata.id);
    if (!execution) {
      this.logger.error("Execution not found for cell", cellMetadata.id);
      return;
    }

    // If it went from queued to running, start the execution
    if (prevStatus === "queued" && nextStatus === "running") {
      this.logger.debug("updating output for cell", cellMetadata.id);
      await execution.start(Date.now());
      // Clear the outputs
      await execution.clearOutput();
    }

    const endExecution = async (success: boolean): Promise<void> => {
      execution.end(success, Date.now());
      this.cellExecutions.delete(cell_id);
      this.logger.debug("ended execution for cell", cellMetadata.id);
    };

    // If it is running or idle, update the output
    // Merge the console outputs
    if (nextStatus === "idle" || nextStatus === "running") {
      this.logger.debug("updating output for cell", cellMetadata.id);

      let stdOutContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stdout",
      );
      let stdErrContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stderr",
      );
      let stdInContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "stdin",
      );
      let marimoErrorContainer = cell.outputs.find(
        (output) => output.metadata?.channel === "marimo-error",
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
        const marimoErrors = toArray(message.output).filter(
          (item) => item.channel === "marimo-error",
        );
        marimoErrorContainer = handleCellOutput(marimoErrors, "marimo-error");
      }
      const items = [
        marimoErrorContainer,
        stdOutContainer,
        stdErrContainer,
        stdInContainer,
      ].filter((v): v is vscode.NotebookCellOutput => !!v);

      try {
        await execution.replaceOutput(items);
      } catch (err) {
        this.logger.error("Failed to update output", err);
        await execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(err as Error),
          ]),
        ]);
        endExecution(false);
        return;
      }
    }

    // Should end
    const hasConsoleOrOutput = !!message.console || !!message.output;
    const isEnd = nextStatus === "idle" && hasConsoleOrOutput;
    if (isEnd) {
      endExecution(true);
    }
  }
}

function handleCellOutput(
  output: CellOutput | CellOutput[] | undefined,
  channel: CellChannel,
  prevItems: vscode.NotebookCellOutputItem[] = [],
): vscode.NotebookCellOutput {
  if (!output) {
    return new vscode.NotebookCellOutput(prevItems, {
      channel: channel,
    });
  }

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

  return new vscode.NotebookCellOutput([...prevItems, ...items], {
    channel: channel,
  });
}
