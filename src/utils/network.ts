import http from "node:http";
import https from "node:https";

function isPortFree(port: number) {
  return new Promise((resolve) => {
    const server = http
      .createServer()
      .listen(port, () => {
        server.close();
        resolve(true);
      })
      .on("error", () => {
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

export function ping(url: string): Promise<boolean> {
  const promise = new Promise<boolean>((resolve) => {
    const useHttps = url.indexOf("https") === 0;
    const module_ = useHttps ? https.request : http.request;

    const pingRequest = module_(url, () => {
      resolve(true);
      pingRequest.destroy();
    });

    pingRequest.on("error", () => {
      resolve(false);
      pingRequest.destroy();
    });

    pingRequest.write("");
    pingRequest.end();
  });
  return promise;
}
