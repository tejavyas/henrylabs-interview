/**
 * Retry helper with exponential backoff.
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  maxRetries = 3,
  baseDelay = 500
): Promise<T> {
  let lastResult: T;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await fn();
    if (!shouldRetry(lastResult)) return lastResult;
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      console.log(`Retrying... attempt ${attempt + 2}/${maxRetries + 1}`);
    }
  }
  return lastResult!;
}
