export class MarimoCmdBuilder {
  private cmd: string[] = ["marimo"];

  debug(value: boolean) {
    if (value) {
      this.cmd.push("-d");
    }
    return this;
  }

  mode(mode: "edit" | "run") {
    this.cmd.push(mode);
    return this;
  }

  fileOrDir(fileOrDir: string) {
    if (fileOrDir.includes(" ")) {
      this.cmd.push(`"${fileOrDir}"`);
    }
    this.cmd.push(fileOrDir);
    return this;
  }

  host(host: string) {
    if (host) {
      this.cmd.push(`--host=${host}`);
    }

    return this;
  }

  port(port: number) {
    this.cmd.push(`--port=${port}`);
    return this;
  }

  headless(value: boolean) {
    if (value) {
      this.cmd.push("--headless");
    }
    return this;
  }

  enableToken(value: boolean) {
    if (!value) {
      this.cmd.push("--no-token");
    }
    return this;
  }

  tokenPassword(password: string | undefined) {
    if (password) {
      this.cmd.push(`--token-password=${password}`);
    }

    return this;
  }

  build() {
    return this.cmd.join(" ");
  }
}
