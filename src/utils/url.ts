import { logger } from "../logger";

export function asURL(url: string): URL {
  try {
    return new URL(url);
  } catch (e) {
    logger.error("Failed to parse url", url, e);
    throw e;
  }
}

/**
 * Similar to path.join, but for URLs.
 * We cannot use node:path.join because it messes up the URL scheme on windows.
 */
export function urlJoin(...paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }
  if (paths.length === 1) {
    return paths[0];
  }
  let normalized = [...paths];

  // Process the first path to remove its trailing slash
  normalized = normalized.map((path, index) => {
    // first
    if (index === 0) {
      return withoutTrailingSlash(path);
    }
    // last
    if (index === normalized.length - 1) {
      return withoutLeadingSlash(path);
    }
    // middle
    return withoutLeadingSlash(withoutTrailingSlash(path));
  });

  return normalized.join("/");
}

function withoutLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function withoutTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
