import { parse } from "node-html-parser";
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
  const root = parse(html);
  const getDomValue = (tagName: string, datasetKey: string) => {
    const element = root.querySelector(tagName);
    if (!element) {
      throw new Error(`Could not find ${tagName}`);
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
