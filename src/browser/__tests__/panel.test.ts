import { describe, expect, it, vi } from "vitest";
import { createVSCodeMock } from "../../__mocks__/vscode";
import { MarimoPanelManager } from "../panel";

vi.mock("vscode", async () => {
  return createVSCodeMock(vi);
});

describe("Panel", () => {
  it("should be created", async () => {
    const panel = new MarimoPanelManager("app");
    expect(panel).toBeDefined();
  });

  it("should show panel", async () => {
    const panel = new MarimoPanelManager("app");
    await panel.create("https://example.com");
    const nativePanel = panel.nativePanel;
    expect(nativePanel).toBeDefined();
    expect(nativePanel?.webview.html).toMatchInlineSnapshot(`
      "
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>marimo</title>
            </head>
            <body style="
            position: absolute;
            padding: 0;
            margin: 0;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
          ">
                <iframe
                  id="preview-panel"
                  allow="clipboard-read; clipboard-write;"
                  src="https://example.com/?vscode=true"
                  style="
            flex: 1;
            border: none;
          "
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
            </html>"
    `);
  });
});
