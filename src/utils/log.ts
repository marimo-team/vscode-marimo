import { logger as defaultLogger } from "../logger";

/**
 * Decorator that logs method calls.
 */
export function LogMethodCalls<T extends any[]>() {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: T) => any>,
  ): TypedPropertyDescriptor<(...args: T) => any> => {
    const originalMethod = descriptor.value!;

    descriptor.value = function (...args: T) {
      const logger = (this as any).logger;
      if (logger && "log" in logger) {
        logger.log(`-> ${String(propertyKey)}()`);
      } else {
        defaultLogger.log(
          `[${this.constructor.name}] -> ${String(propertyKey)}()`,
        );
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
