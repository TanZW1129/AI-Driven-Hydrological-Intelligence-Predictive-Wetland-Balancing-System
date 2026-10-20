/**
 * @file fetchWithTimeout.ts
 * @description Minimal HTTP helper with abortable timeout and bounded retries.
 */

export type FetchImplementation = typeof fetch;

export interface FetchWithTimeoutOptions {
  timeoutMs: number;
  /** Retries after the first failed attempt (network error, timeout or 5xx). */
  maxRetries?: number;
  fetchImpl?: FetchImplementation;
  headers?: Record<string, string>;
}

export class HttpRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HttpRequestError';
    this.status = status;
  }
}

function resolveFetch(fetchImpl?: FetchImplementation): FetchImplementation {
  if (fetchImpl) {
    return fetchImpl;
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new HttpRequestError('Global fetch API is not available in this runtime.', null);
  }
  return globalThis.fetch.bind(globalThis);
}

async function attempt(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchImplementation,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response.ok) {
      throw new HttpRequestError(`HTTP ${response.status} ${response.statusText} from ${url}`, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw error;
    }
    const isAbort = error instanceof Error && error.name === 'AbortError';
    throw new HttpRequestError(
      isAbort ? `Request timed out after ${timeoutMs} ms: ${url}` : `Network error requesting ${url}: ${String(error)}`,
      null,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch `url` and return the parsed JSON body. Retries on network errors,
 * timeouts and 5xx responses; 4xx responses fail immediately.
 */
export async function fetchJsonWithTimeout(url: string, options: FetchWithTimeoutOptions): Promise<unknown> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  const maxRetries = Math.max(0, options.maxRetries ?? 0);
  const headers = { Accept: 'application/json', ...options.headers };
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex += 1) {
    try {
      const response = await attempt(url, options.timeoutMs, fetchImpl, headers);
      try {
        return await response.json();
      } catch (parseError) {
        throw new HttpRequestError(`Response from ${url} is not valid JSON.`, response.status, { cause: parseError });
      }
    } catch (error) {
      lastError = error;
      const status = error instanceof HttpRequestError ? error.status : null;
      const retryable = status === null || status >= 500;
      if (!retryable) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new HttpRequestError(String(lastError), null);
}
