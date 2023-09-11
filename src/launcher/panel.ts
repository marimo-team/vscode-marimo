import { ViewColumn, WebviewPanel, window } from 'vscode';

export class MarimoPanelManager {
  private nativePanel: WebviewPanel | undefined;

  constructor(private appName: string) {}

  isReady() {
    return !!this.nativePanel;
  }

  isActive() {
    return this.nativePanel?.active ?? false;
  }

  async create(url: string) {
    // Skip if already created
    if (this.nativePanel) {
      return;
    }

    this.nativePanel = window.createWebviewPanel('marimo', `marimo: ${this.appName}`, ViewColumn.Beside, {
      enableScripts: true,
      enableCommandUris: true,
    });

    this.nativePanel.webview.html = getWebviewContent(url);

    this.nativePanel.onDidDispose(() => {
      this.nativePanel = undefined;
    });
  }

  show() {
    this.nativePanel?.reveal();
  }

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
            src="${url}" frameborder="0" style="flex: 1;"
          ></iframe>
      </body>
      </html>`;
}
