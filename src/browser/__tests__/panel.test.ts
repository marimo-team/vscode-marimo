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
    const nativePanel = (panel as any).nativePanel;
    expect(nativePanel).toBeDefined();
    expect(nativePanel.webview.html).toMatchInlineSnapshot(`
      "
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
                  src="https://example.com" frameborder="0" style="flex: 1;"
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
            </html>"
    `);
  });
});
