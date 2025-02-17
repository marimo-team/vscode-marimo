import { parse } from "node-html-parser";
import type { CancellationToken } from "vscode";
import { composeUrl } from "../config";
import { logger } from "../logger";
import type { MarimoConfig, SkewToken } from "../notebook/marimo/types";
import { retry } from "../utils/retry";
import { asURL } from "../utils/url";

/**
 * Grabs the index.html of the marimo server and extracts
 * various startup values.
 * - skewToken
 * - version
 * - userConfig
 */
export async function fetchMarimoStartupValues({
  port,
  backoff,
  cancellationToken,
}: {
  port: number;
  backoff?: number;
  cancellationToken?: CancellationToken;
}): Promise<{
  skewToken: SkewToken;
  version: string;
  userConfig: MarimoConfig;
}> {
  const url = asURL(await composeUrl(port));
  let response: Response;
  try {
    response = await retry(
      async () => {
        if (cancellationToken?.isCancellationRequested) {
          throw new Error("Cancelled");
        }
        const resp = await fetch(url.toString(), {
          headers: {
            Accept: "text/html",
          },
        });
        if (!resp.ok) {
          throw new Error(`HTTP error ${resp.status}`);
        }
        return resp;
      },
      5, // retries
      backoff ?? 1000, // 1s exponential backoff
    );
  } catch (e) {
    logger.error(`Could not fetch ${url}. Is ${url} healthy?`);
    throw new Error(`Could not fetch ${url}. Is ${url} healthy?`);
  }

  if (!response.ok) {
    throw new Error(
      `Could not fetch ${url}. Is ${url} healthy? ${response.status} ${response.statusText}`,
    );
  }

  // If was redirected to /auth/login, then show a message that an existing server is running
  if (asURL(response.url).pathname.startsWith("/auth/login")) {
    const msg = `An existing marimo server created outside of vscode is running at this url: ${url.toString()}`;
    logger.warn(msg);
    throw new Error(msg);
  }

  const html = await response.text();
  const root = parse(html);
  const getDomValue = (tagName: string, datasetKey: string) => {
    const element = root.querySelector(tagName);
    if (!element) {
      throw new Error(`Could not find ${tagName}. Is ${url} healthy?`);
    }
    const value = element.getAttribute(`data-${datasetKey}`);
    if (value === undefined) {
      throw new Error(`${datasetKey} is undefined`);
    }

    return value;
  };

  const skewToken = getDomValue("marimo-server-token", "token") as SkewToken;
  const userConfig = JSON.parse(
    getDomValue("marimo-user-config", "config"),
  ) as MarimoConfig;
  const marimoVersion = getDomValue("marimo-version", "version");

  return {
    skewToken,
    version: marimoVersion,
    userConfig,
  };
}
