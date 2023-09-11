import http from 'node:http';
import https from 'node:https';
import { TextDocument, window } from 'vscode';

function isPortFree(port: number) {
  return new Promise((resolve) => {
    const server = http
      .createServer()
      .listen(port, () => {
        server.close();
        resolve(true);
      })
      .on('error', () => {
        resolve(false);
      });
  });
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tryPort(start: number): Promise<number> {
  if (await isPortFree(start)) {
    return start;
  }
  return tryPort(start + 1);
}

export function ping(url: string) {
  const promise = new Promise<boolean>((resolve) => {
    const useHttps = url.indexOf('https') === 0;
    const module_ = useHttps ? https.request : http.request;

    const pingRequest = module_(url, () => {
      resolve(true);
      pingRequest.destroy();
    });

    pingRequest.on('error', () => {
      resolve(false);
      pingRequest.destroy();
    });

    pingRequest.write('');
    pingRequest.end();
  });
  return promise;
}

export function isMarimoApp(document: TextDocument | undefined, includeEmpty = true) {
  if (!document) {
    return false;
  }

  // If ends in .py and is empty, return true
  // This is so we can create a new file and start the server
  if (includeEmpty && document.fileName.endsWith('.py') && document.getText().trim() === '') {
    return true;
  }

  // Cheap way of checking if it's a marimo app
  return document.getText().includes('app = marimo.App(');
}

export function getCurrentFile(toast: boolean = true) {
  const file = [window.activeTextEditor, ...window.visibleTextEditors].find((editor) =>
    isMarimoApp(editor?.document, false)
  );
  if (!file) {
    if (toast) {
      window.showInformationMessage('No marimo file is open.');
    }
    return;
  }
  return file.document;
}
