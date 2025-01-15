import { beforeEach, describe, expect, it } from "vitest";
import { MarimoCmdBuilder } from "../cmd";

let b = new MarimoCmdBuilder();

describe("MarimoCmdBuilder", () => {
  beforeEach(() => {
    b = new MarimoCmdBuilder();
  });

  it("happy path", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .tokenPassword("")
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes edit path/to/file --host=localhost --port=2718 --headless --no-token --watch"`,
    );
  });

  it("should correctly handle debug mode", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(true)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(true)
      .tokenPassword("secret")
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes -d edit path/to/file --host=localhost --port=2718 --headless --token-password=secret --watch"`,
    );
  });

  it("it can handle run mode", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(false)
      .mode("run")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .tokenPassword("")
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes run path/to/file --host=localhost --port=2718 --headless --no-token --watch"`,
    );
  });

  it("should correctly handle fileOrDir with and without spaces", () => {
    const b = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/some file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .tokenPassword("")
      .build();

    expect(b).toMatchInlineSnapshot(
      `"marimo --yes edit "path/to/some file" --host=localhost --port=2718 --headless --no-token --watch"`,
    );
  });

  it("should correctly handle host", () => {
    const b = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("0.0.0.0")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .tokenPassword("")
      .build();

    expect(b).toMatchInlineSnapshot(
      `"marimo --yes edit path/to/file --host=0.0.0.0 --port=2718 --headless --no-token --watch"`,
    );
  });

  it("should support sandbox mode", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .sandbox(true)
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes edit path/to/file --host=localhost --port=2718 --headless --no-token --sandbox --watch"`,
    );
  });

  it("should support watch mode", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .watch(true)
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes edit path/to/file --host=localhost --port=2718 --headless --no-token --watch"`,
    );
  });

  it("should support disabling watch mode", () => {
    const cmd = new MarimoCmdBuilder()
      .debug(false)
      .mode("edit")
      .fileOrDir("path/to/file")
      .host("localhost")
      .port(2718)
      .headless(true)
      .enableToken(false)
      .watch(false)
      .build();
    expect(cmd).toMatchInlineSnapshot(
      `"marimo --yes edit path/to/file --host=localhost --port=2718 --headless --no-token"`,
    );
  });
});
