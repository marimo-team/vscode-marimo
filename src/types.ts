import type { Disposable } from "vscode";
import type { MarimoConfig, SkewToken } from "./notebook/marimo/types";

export interface ILifecycle<Options = never> extends Disposable {
  start?(opts: Options): Promise<void>;
  restart?(opts: Options): Promise<void>;
}

export type ServerStatus = "stopped" | "starting" | "started";

export interface StartupResult {
  port: number;
  skewToken: SkewToken;
  version: string;
  userConfig: MarimoConfig;
}
