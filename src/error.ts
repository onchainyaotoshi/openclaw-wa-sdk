/**
 * Discriminated error codes thrown by this SDK. Catch on {@link WaSdkError.code}
 * to handle each failure mode precisely.
 *
 * | code           | meaning                                                        |
 * | -------------- | ------------------------------------------------------------- |
 * | `MISSING_CONFIG`  | `baseUrl`/`apiToken` missing or malformed, or env vars unset |
 * | `INVALID_REQUEST` | client-side validation failed (missing field, group without `participant`) |
 * | `TIMEOUT`         | the request exceeded `timeoutMs`                             |
 * | `AUTH_ERROR`      | the gateway returned `401 Unauthorized` (bad token)          |
 * | `API_ERROR`       | the gateway returned a non-2xx with `{ success:false, error }` |
 * | `NETWORK_ERROR`   | the request could not reach the gateway (DNS, connection)    |
 */
export type WaErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "AUTH_ERROR"
  | "API_ERROR"
  | "NETWORK_ERROR";

export interface WaErrorOptions {
  /** HTTP status from the gateway, when available. */
  status?: number;
  /** Original error, when this wraps a lower-level failure. */
  cause?: unknown;
}

/**
 * The single error class thrown by this SDK. Discriminate on {@link code}.
 *
 * @example
 * ```ts
 * try {
 *   await wa.sendMessage({ to: "+62…", message: "hi" });
 * } catch (e) {
 *   if (e instanceof WaSdkError) {
 *     if (e.code === "AUTH_ERROR") console.error("bad token");
 *     if (e.code === "TIMEOUT")    console.error("slow gateway");
 *   }
 * }
 * ```
 */
export class WaSdkError extends Error {
  readonly code: WaErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(code: WaErrorCode, message: string, options?: WaErrorOptions) {
    super(message);
    this.name = "WaSdkError";
    this.code = code;
    if (typeof options?.status === "number") this.status = options.status;
    if (options?.cause !== undefined) this.cause = options.cause;
    // Restore prototype chain (TS→ES5 compilation edge case for Error subclasses).
    Object.setPrototypeOf(this, WaSdkError.prototype);
  }
}
