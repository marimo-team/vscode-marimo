import type { Uri } from "vscode";
import { SessionId, type TypedString } from "../marimo/types";

export type KernelKey = TypedString<"KernelKey">;

export function toKernelKey(uriOrNew: Uri | `__new__`): KernelKey {
  if (typeof uriOrNew === "string") {
    return `__new__${SessionId.create()}` as KernelKey;
  }
  return uriOrNew.fsPath as KernelKey;
}
