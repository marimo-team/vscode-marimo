import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Disposable } from "vscode";
import { Config } from "../../launcher/config";
import { logger } from "../../logger";

export async function marimoEdit(
  port: number,
  callbacks: { onClose: () => void },
): Promise<Disposable> {
  let marimo: ChildProcessWithoutNullStreams | undefined;

  try {
    logger.log(`Starting Marimo server at port ${port}...`);

    // Start Marimo server and log output
    const marimo = spawn("marimo", [
      "-d",
      "edit",
      "--no-token",
      "--port",
      port.toString(),
      "--headless",
      Config.root,
    ]);
    marimo.stdout.on("data", (data) => {
      String(data)
        .split("\n")
        .forEach((line) => {
          logger.log(`> ${line}`);
        });
    });
    marimo.stderr.on("data", (data) => {
      String(data)
        .split("\n")
        .forEach((line) => {
          logger.log(`> ${line}`);
        });
      callbacks.onClose();
    });
    marimo.on("close", (code) => {
      logger.log(`marimo server exited with code ${code}`);
      callbacks.onClose();
    });

    // sleep 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error: any) {
    logger.log(`Status Code: ${error.status} with '${error.message}'`);
  }

  return new Disposable(() => {
    logger.log(`Stopping marimo server at port ${port}...`);
    const succeeded = marimo?.kill() || marimo?.kill();
    if (!succeeded) {
      logger.error(`Failed to stop marimo server at port ${port}`);
    } else {
      callbacks.onClose();
    }
  });
}
