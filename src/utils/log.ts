import { logger as defaultLogger } from "../logger";
import { invariant } from "./invariant";

/**
 * Decorator that logs method calls.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is ok
export function LogMethodCalls<T extends (...args: any[]) => any>() {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> => {
    const originalMethod = descriptor.value;
    invariant(originalMethod, "Method not found");

    // @ts-expect-error ignore
    descriptor.value = function (...args: Parameters<T>) {
      // biome-ignore lint/suspicious/noExplicitAny: any is ok
      const logger = (this as any).logger;
      if (logger && "debug" in logger) {
        logger.debug(`-> ${String(propertyKey)}()`);
      } else {
        defaultLogger.debug(
          `[${this.constructor.name}] -> ${String(propertyKey)}()`,
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
