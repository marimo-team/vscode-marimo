export function toArray<T>(value: T | ReadonlyArray<T>): T[] {
  if (Array.isArray(value)) {
    return [...value];
  }
  if (value == null) {
    return [];
  }
  return [value] as T[];
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
