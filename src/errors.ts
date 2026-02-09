/**
 * Base error for all Neutron SDK errors.
 */
export class NeutronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeutronError";
  }
}

/**
 * Thrown when the API returns an error response (4xx/5xx).
 */
export class NeutronApiError extends NeutronError {
  /** HTTP status code */
  readonly status: number;
  /** Neutron error code (e.g. "2005") */
  readonly code: string | undefined;
  /** Raw error body from the API */
  readonly body: any;

  constructor(status: number, body: any) {
    const message = body?.error || body?.message || `API error ${status}`;
    super(message);
    this.name = "NeutronApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }

  /** True if this is a rate limit error (429) */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** True if this is an auth error (401/403) */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** True if retrying might help (5xx, 429) */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * Thrown when authentication fails.
 */
export class NeutronAuthError extends NeutronError {
  constructor(message: string = "Authentication failed. Check your API key and secret.") {
    super(message);
    this.name = "NeutronAuthError";
  }
}

/**
 * Thrown when a request times out.
 */
export class NeutronTimeoutError extends NeutronError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "NeutronTimeoutError";
  }
}

/**
 * Thrown for SDK usage errors (bad params, missing fields).
 */
export class NeutronValidationError extends NeutronError {
  constructor(message: string) {
    super(message);
    this.name = "NeutronValidationError";
  }
}
