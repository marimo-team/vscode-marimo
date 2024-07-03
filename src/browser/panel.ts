import { Uri, ViewColumn, type WebviewPanel, env, window } from "vscode";
import { logger } from "../logger";
import { LogMethodCalls } from "../utils/log";

export class MarimoPanelManager {
  public nativePanel: WebviewPanel | undefined;
  private url: string | undefined;
  private logger = logger.createLogger(this.appName);

  constructor(private appName: string) {}

  isReady() {
    return !!this.nativePanel;
  }

  isActive() {
    return this.nativePanel?.active ?? false;
  }

  @LogMethodCalls()
  reload() {
    if (this.nativePanel && this.url) {
      this.nativePanel.webview.html = "";
      this.nativePanel.webview.html = getWebviewContent(this.url);
    }
  }

  async create(url: string) {
    this.logger.log("creating panel at", url);

    // Skip if already created
    if (this.nativePanel) {
      return;
    }

    this.nativePanel = window.createWebviewPanel(
      "marimo",
      `marimo: ${this.appName}`,
      ViewColumn.Beside,
      {
        enableScripts: true,
        enableCommandUris: true,
      },
    );

    this.nativePanel.webview.html = getWebviewContent(url);
    this.url = url;

    this.nativePanel.onDidDispose(() => {
      this.nativePanel = undefined;
    });

    // Handle messages from the webview
    this.nativePanel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "copy": {
          env.clipboard.writeText(message.text);
          return;
        }
        case "cut": {
          env.clipboard.writeText(message.text);
          return;
        }
        case "paste": {
          env.clipboard.readText().then((text) => {
            this.nativePanel?.webview.postMessage({
              command: "paste",
              text: text,
            });
          });
          return;
        }
        case "external_link": {
          env.openExternal(Uri.parse(message.url));
          return;
        }
        case "context_menu": {
          // Context menu is not supported yet
          return;
        }
        default: {
          this.logger.log("unknown message", message.command);
          return;
        }
      }
    }, undefined);
  }

  @LogMethodCalls()
  show() {
    if (!this.nativePanel) {
      logger.warn("Panel not created yet");
    }
    this.nativePanel?.reveal();
  }

  @LogMethodCalls()
  dispose() {
    this.nativePanel?.dispose();
  }
}

function getWebviewContent(url: string) {
  return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>marimo</title>
      </head>
      <body style="position: absolute; padding: 0; margin: 0; top: 0; bottom: 0; left: 0; right: 0; display: flex;">
          <iframe
            id="preview-panel"
            allow="clipboard-read; clipboard-write;"
            src="${url}" frameborder="0" style="flex: 1;"
          ></iframe>

          <script>
          // When the iframe loads, or when the tab gets focus again later, move the
          // the focus to the iframe.
          let iframe = document.getElementById('preview-panel');
          window.onfocus = iframe.onload = () => {
            // doesn't work immediately
            setTimeout(() => iframe.contentWindow.focus(), 100);
          };

          const vscode = acquireVsCodeApi();

          // Message proxy from parent (vscode webview) to child (iframe)
          window.addEventListener(
            "message",
            (e) => {
              // If its from the child, post it to vscode
              if (e.source === iframe.contentWindow) {
                vscode.postMessage(e.data);
                return;
              }
              // If its from vscode, post it to the child
              if (e.origin.startsWith("vscode-webview://")) {
                iframe.contentWindow.postMessage(e.data, "*");
                return;
              }
              console.log("Message from unknown source", e.origin);
            },
            false
          );
          </script>
      </body>
      </html>`;
}
