interface Body {
  json<T = unknown>(): Promise<T>;
}

interface JSON {
  parse(
    text: string,
    reviver?: (this: any, key: string, value: any) => any,
  ): unknown;
}

interface Array<T> {
  filter(predicate: BooleanConstructor): Array<NonNullable<T>>;
}
