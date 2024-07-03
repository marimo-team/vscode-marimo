import http from "node:http";
import https from "node:https";
import { composeUrl } from "../config";

/**
 * Check if a port is free
 */
async function isPortFree(port: number) {
  const healthy = await ping(await composeUrl(port));
  return !healthy;
}

export async function tryPort(start: number): Promise<number> {
  if (await isPortFree(start)) {
    return start;
  }
  return tryPort(start + 1);
}

/**
 * Ping a url to see if it is healthy
 */
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
