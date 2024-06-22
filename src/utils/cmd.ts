// import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
// import { Disposable } from "vscode";
// import { Config } from "../../config";
// import { logger } from "../../logger";

// // export async function marimoEdit(
// //   port: number,
// //   callbacks: { onClose: () => void },
// // ): Promise<Disposable> {
// //   return marimoCmd(port, "edit", callbacks);
// // }

// // export async function marimoRun(
// //   port: number,
// //   callbacks: { onClose: () => void },
// // ): Promise<Disposable> {
// //   return marimoCmd(port, "run", callbacks);
// // }

// // async function marimoCmd(
// //   port: number,
// //   mode: "edit" | "run",
// //   callbacks: { onClose: () => void },
// // ): Promise<Disposable> {
// //   let marimo: ChildProcessWithoutNullStreams | undefined;

// //   try {
// //     logger.log(`Starting Marimo server at port ${port}...`);

// //     // Start Marimo server and log output
// //     const marimo = spawn("marimo", [
// //       Config.debug ? "-d" : "",
// //       mode,
// //       "--port",
// //       port.toString(),
// //       Config.host ? `--host=${Config.host}` : "",
// //       Config.enableToken ? "" : "--no-token",
// //       Config.tokenPassword ? `--token-password=${Config.tokenPassword}` : "",
// //       "--headless",
// //       Config.root,
// //     ].filter(Boolean));

// //     marimo.stdout.on("data", (data) => {
// //       String(data)
// //         .split("\n")
// //         .forEach((line) => {
// //           logger.log(`> ${line}`);
// //         });
// //     });
// //     marimo.stderr.on("data", (data) => {
// //       String(data)
// //         .split("\n")
// //         .forEach((line) => {
// //           logger.log(`> ${line}`);
// //         });
// //       callbacks.onClose();
// //     });
// //     marimo.on("close", (code) => {
// //       logger.log(`marimo server exited with code ${code}`);
// //       callbacks.onClose();
// //     });

// //     // sleep 1 second
// //     await new Promise((resolve) => setTimeout(resolve, 1000));
// //   } catch (error: any) {
// //     logger.log(`Status Code: ${error.status} with '${error.message}'`);
// //   }

// //   return new Disposable(() => {
// //     logger.log(`Stopping marimo server at port ${port}...`);
// //     const succeeded = marimo?.kill() || marimo?.kill();
// //     if (!succeeded) {
// //       logger.error(`Failed to stop marimo server at port ${port}`);
// //     } else {
// //       callbacks.onClose();
// //     }
// //   });
// // }


export class MarimoCmdBuilder {
  private cmd: string[] = ["marimo"];

  constructor() {}

  debug(value: boolean) {
    if (value) {
      this.cmd.push("-d");
    }
    return this;
  }

  mode(mode: "edit" | "run") {
    this.cmd.push(mode);
    return this;
  }

  fileOrDir(fileOrDir: string) {
    if (fileOrDir.includes(" ")) {
      this.cmd.push(`"${fileOrDir}"`);
    }
    this.cmd.push(fileOrDir);
    return this;
  }

  host(host: string) {
    if (host) {
      this.cmd.push(`--host=${host}`);
    }

    return this;
  }

  port(port: number) {
    this.cmd.push(`--port=${port}`);
    return this;
  }

  headless(value: boolean) {
    if (value) {
      this.cmd.push("--headless");
    }
    return this;
  }

  enableToken(value: boolean) {
    if (!value) {
      this.cmd.push("--no-token");
    }
    return this;
  }

  tokenPassword(password: string | undefined) {
    if (password) {
      this.cmd.push(`--token-password=${password}`);
    }

    return this;
  }

  build() {
    return this.cmd.join(" ");
  }
}
