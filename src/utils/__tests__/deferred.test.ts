import { describe, expect, it, test, vi } from "vitest";
import { Deferred } from "../deferred";

describe("Deferred", () => {
  test("should resolve correctly", async () => {
    const deferred = new Deferred<string>();
    expect(deferred.hasCompleted).toBe(false);
    expect(deferred.hasResolved).toBe(false);
    expect(deferred.hasRejected).toBe(false);

    const value = "test";
    deferred.resolve(value);
    const result = await deferred.promise;

    expect(result).toBe(value);
    expect(deferred.hasCompleted).toBe(true);
    expect(deferred.hasResolved).toBe(true);
    expect(deferred.hasRejected).toBe(false);
  });

  test("should reject correctly", async () => {
    const deferred = new Deferred<string>();
    const error = new Error("test error");

    deferred.reject(error);

    await expect(deferred.promise).rejects.toThrow(error);
    expect(deferred.hasCompleted).toBe(true);
    expect(deferred.hasResolved).toBe(false);
    expect(deferred.hasRejected).toBe(true);
  });

  test("should work with async resolution", async () => {
    const deferred = new Deferred<number>();
    const value = 42;

    setTimeout(() => {
      deferred.resolve(value);
    }, 10);

    const result = await deferred.promise;
    expect(result).toBe(value);
    expect(deferred.hasCompleted).toBe(true);
    expect(deferred.hasResolved).toBe(true);
  });

  test("should handle promise-like values", async () => {
    const deferred = new Deferred<number>();
    const promiseValue = Promise.resolve(42);

    deferred.resolve(promiseValue);
    const result = await deferred.promise;

    expect(result).toBe(42);
    expect(deferred.hasCompleted).toBe(true);
    expect(deferred.hasResolved).toBe(true);
  });

  it("should call onResolved when resolved", async () => {
    const onResolved = vi.fn();
    const deferred = new Deferred<number>({
      onResolved,
    });
    const value = 42;

    deferred.resolve(value);
    expect(onResolved).toHaveBeenCalledWith(value);
  });

  it("should call onRejected when rejected", async () => {
    const onRejected = vi.fn();
    const deferred = new Deferred<number>({
      onRejected,
    });
    const error = new Error("test error");

    deferred.reject(error);
    await expect(() => deferred.promise).rejects.toThrow(error);
    expect(onRejected).toHaveBeenCalledWith(error);
  });
});
