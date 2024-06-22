export function invariant(
  condition: boolean,
  message: string,
): asserts condition;
export function invariant<T>(
  condition: T,
  message: string,
): asserts condition is NonNullable<T>;
export function invariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function logNever(obj: never): never {
  throw new Error("Unexpected object", obj);
}
