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

  const findMarimoMountedConfig = () => {
    const marimoDataElement = root.querySelectorAll("script").find((el) => {
      return (
        el.getAttribute("data-marimo") === "true" &&
        el.innerHTML.includes("window.__MARIMO_MOUNT_CONFIG__")
      );
    });
    if (!marimoDataElement) {
      throw new Error(
        `Could not find marimo mounted config. Is ${url} healthy?`,
      );
    }

    const scriptContent = marimoDataElement.innerHTML;

    const match = scriptContent.match(
      /window\.__MARIMO_MOUNT_CONFIG__\s*=\s*({[\s\S]*?});/,
    );
    if (!match || !match[1]) {
      throw new Error(
        "Could not parse marimo mount config from script content",
      );
    }

    try {
      // Config object cannot be parsed directly as JSON because it contains trailing commas.
      const configObject = new Function(`return ${match[1]}`)();
      return configObject;
    } catch (e) {
      throw new Error(
        `Failed to parse marimo mount config as JavaScript object: ${e}`,
      );
    }
  };

  const mountedConfig = findMarimoMountedConfig();
  const skewToken = mountedConfig.serverToken as SkewToken | undefined;
  if (!skewToken) {
    throw new Error(
      `Could not find serverToken in marimo mounted config. Is ${url} healthy?`,
    );
  }

  const userConfig = mountedConfig.config as MarimoConfig | undefined;
  if (!userConfig) {
    throw new Error(
      `Could not find userConfig in marimo mounted config. Is ${url} healthy?`,
    );
  }

  const marimoVersion = mountedConfig.version as string | undefined;
  if (!marimoVersion) {
    throw new Error(
      `Could not find marimo version in marimo mounted config. Is ${url} healthy?`,
    );
  }

  return {
    skewToken,
    version: marimoVersion,
    userConfig,
  };
}
