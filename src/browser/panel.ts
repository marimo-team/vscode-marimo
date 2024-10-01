import { Uri, ViewColumn, type WebviewPanel, env, window } from "vscode";
import { logger } from "../logger";
import { LogMethodCalls } from "../utils/log";

export class MarimoPanelManager {
  private static readonly WEBVIEW_TYPE = "marimo";
  private static readonly VSCODE_PARAM = "vscode";

  public nativePanel: WebviewPanel | undefined;
  private url: string | undefined;
  private readonly logger = logger.createLogger(this.appName);

  constructor(private readonly appName: string) {}

  public isReady(): boolean {
    return !!this.nativePanel;
  }

  public isActive(): boolean {
    return this.nativePanel?.active ?? false;
  }

  @LogMethodCalls()
  public reload(): void {
    if (this.nativePanel && this.url) {
      this.nativePanel.webview.html = MarimoPanelManager.getWebviewContent(
        this.url,
      );
    } else {
      this.logger.warn("Cannot reload: panel or URL not set");
    }
  }

  public async create(url: string): Promise<void> {
    this.logger.info("Creating panel at", url);

    if (this.nativePanel) {
      this.logger.warn("Panel already exists");
      return;
    }

    this.nativePanel = window.createWebviewPanel(
      MarimoPanelManager.WEBVIEW_TYPE,
      `marimo: ${this.appName}`,
      ViewColumn.Beside,
      {
        enableScripts: true,
        enableCommandUris: true,
      },
    );

    this.nativePanel.webview.html = MarimoPanelManager.getWebviewContent(url);
    this.url = url;

    this.nativePanel.onDidDispose(() => {
      this.nativePanel = undefined;
    });

    this.setupMessageHandler();
  }

  @LogMethodCalls()
  public show(): void {
    if (!this.nativePanel) {
      this.logger.warn("Panel not created yet");
    }
    this.nativePanel?.reveal();
  }

  @LogMethodCalls()
  public dispose(): void {
    this.nativePanel?.dispose();
  }

  private setupMessageHandler(): void {
    if (!this.nativePanel) {
      this.logger.error("Cannot setup message handler: panel not created");
      return;
    }

    this.nativePanel.webview.onDidReceiveMessage(
      this.handleWebviewMessage,
      undefined,
    );
  }

  private handleWebviewMessage = async (message: {
    command: string;
    text?: string;
    url?: string;
  }): Promise<void> => {
    switch (message.command) {
      case "copy":
      case "cut":
        if (!message.text) {
          break;
        }
        await env.clipboard.writeText(message.text);
        break;
      case "paste": {
        const text = await env.clipboard.readText();
        this.nativePanel?.webview.postMessage({ command: "paste", text });
        break;
      }
      case "external_link":
        if (!message.url) {
          break;
        }
        await env.openExternal(Uri.parse(message.url));
        break;
      case "context_menu":
        // Context menu is not supported yet
        break;
      default:
        this.logger.info("Unknown message", message.command);
    }
  };

  private static getWebviewContent(urlString: string): string {
    const url = new URL(urlString);
    url.searchParams.set(MarimoPanelManager.VSCODE_PARAM, "true");

    const styles = `
      position: absolute;
      padding: 0;
      margin: 0;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
    `;

    const iframeStyles = `
      flex: 1;
      border: none;
    `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>marimo</title>
      </head>
      <body style="${styles}">
          <iframe
            id="preview-panel"
            allow="clipboard-read; clipboard-write;"
            src="${url.toString()}"
            style="${iframeStyles}"
          ></iframe>

          <script>
          (function() {
            const vscode = acquireVsCodeApi();
            const iframe = document.getElementById('preview-panel');

            function focusIframe() {
              setTimeout(() => iframe.contentWindow.focus(), 100);
            }

            window.onfocus = focusIframe;
            iframe.onload = focusIframe;

            window.addEventListener('message', (event) => {
              if (event.source === iframe.contentWindow) {
                vscode.postMessage(event.data);
              } else if (event.origin.startsWith('vscode-webview://')) {
                iframe.contentWindow.postMessage(event.data, '*');
              } else {
                console.log('Message from unknown source', event.origin);
              }
            }, false);
          })();
          </script>
      </body>
      </html>`;
  }
}
