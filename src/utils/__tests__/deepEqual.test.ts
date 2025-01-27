import { describe, expect, it } from "vitest";
import { deepEqual } from "../deepEqual";

describe("deepEqual", () => {
  it("returns true for identical primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("test", "test")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("returns false for different primitives", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("test", "other")).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("compares objects deeply", () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("compares arrays deeply", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});
