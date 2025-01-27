export function toArray<T>(value: T | ReadonlyArray<T>): T[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value == null) {
    return [];
  }
  return [value] as T[];
}
