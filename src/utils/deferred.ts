export class Deferred<T> {
  promise: Promise<T>;
  hasCompleted = false;
  hasResolved = false;
  hasRejected = false;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  constructor(
    private opts: {
      onRejected?: (reason?: unknown) => void;
      onResolved?: (value: T | PromiseLike<T>) => void;
    } = {},
  ) {
    this.promise = new Promise<T>((resolve, reject) => {
      this.reject = (reason) => {
        this.hasRejected = true;
        this.hasCompleted = true;
        this.opts.onRejected?.(reason);
        reject(reason);
      };
      this.resolve = (value) => {
        this.hasResolved = true;
        this.hasCompleted = true;
        this.opts.onResolved?.(value);
        resolve(value);
      };
    });
  }
}
