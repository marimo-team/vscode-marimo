import { JSDOM } from "jsdom";
import { composeUrl } from "../config";
import type { MarimoConfig, SkewToken } from "../notebook/marimo/types";

/**
 * Grabs the index.html of the marimo server and extracts
 * various startup values.
 * - skewToken
 * - version
 * - userConfig
 */
export async function fetchMarimoStartupValues(port: number): Promise<{
  skewToken: SkewToken;
  version: string;
  userConfig: MarimoConfig;
}> {
  const response = await fetch(`${composeUrl(port)}`);
  const html = await response.text();
  const doc = new JSDOM(html).window.document;
  const getDomValue = (tagName: string, datasetKey: string) => {
    const element = Array.from(doc.getElementsByTagName(tagName))[0] as
      | HTMLElement
      | undefined;
    if (!element) {
      throw new Error(`Could not find ${tagName}`);
    }
    if (element.dataset[datasetKey] === undefined) {
      throw new Error(`${datasetKey} is undefined`);
    }

    return element.dataset[datasetKey] as string;
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
