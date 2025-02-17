/**
 * Retry a function until it succeeds or the number of retries is reached.
 * @param fn - The function to retry.
 * @param retries - The number of retries.
 * @param backoffMs - The backoff time in milliseconds.
 * @returns A promise that resolves when the function succeeds or the number of retries is reached.
 */
export function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  backoffMs = 100,
): Promise<T> {
  return fn().catch(async (error) => {
    if (retries === 0) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return retry(fn, retries - 1, backoffMs * 2);
  });
}
