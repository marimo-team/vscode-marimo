import { logger } from "../logger";

export function asURL(url: string): URL {
  try {
    return new URL(url);
  } catch (e) {
    logger.error("Failed to parse url", url, e);
    throw e;
  }
}
