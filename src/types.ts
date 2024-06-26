import type { Disposable } from "vscode";

export interface ILifecycle<Options = never> extends Disposable {
  start(opts: Options): Promise<void>;
  restart(opts: Options): Promise<void>;
}
