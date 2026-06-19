import { WaSdkError } from "./error.js";
import {
  validateConfig,
  validateSendMessage,
  validateSendReaction,
} from "./validate.js";
import type {
  SendMessageArgs,
  SendMessageResult,
  SendReactionArgs,
  WaClientOptions,
} from "./types.js";

/** Gateway route paths (hardcoded by the server; do not change without a server change). */
const SEND_MESSAGE_PATH = "/camis-openclaw/send-message";
const SEND_REACTION_PATH = "/camis-openclaw/send-reaction";

const DEFAULT_TIMEOUT_MS = 30_000;

/** A stateless WhatsApp messaging client returned by {@link createWaClient}. */
export interface WaClient {
  /** Send a text message (optionally with media / as a reply). Returns the sent message id + JID. */
  sendMessage(args: SendMessageArgs): Promise<SendMessageResult>;
  /** Set (or remove, with `emoji: ""`) a reaction on a message. Resolves on success. */
  sendReaction(args: SendReactionArgs): Promise<void>;
}

interface GatewayEnvelopeOk<T> {
  success: true;
  data: T;
}
interface GatewayEnvelopeErr {
  success: false;
  error: string;
}

/**
 * Create a client with explicit configuration. Prefer this in tests and any
 * non-Node runtime; use {@link fromEnv} for the Node convenience path.
 *
 * @example
 * ```ts
 * const wa = createWaClient({
 *   baseUrl: "https://example.com",
 *   apiToken: process.env.API_TOKEN_WA!,
 * });
 * ```
 */
export function createWaClient(options: WaClientOptions): WaClient {
  const baseUrl = (options?.baseUrl ?? "").trim();
  const apiToken = options?.apiToken ?? "";
  validateConfig(baseUrl, apiToken);
  const timeoutMs =
    typeof options?.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new WaSdkError(
          "TIMEOUT",
          `Request to ${path} timed out after ${timeoutMs}ms.`,
        );
      }
      throw new WaSdkError(
        "NETWORK_ERROR",
        `Network error calling ${path}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    clearTimeout(timer);

    let payload: GatewayEnvelopeOk<unknown> | GatewayEnvelopeErr | undefined;
    try {
      payload = (await response.json()) as
        | GatewayEnvelopeOk<unknown>
        | GatewayEnvelopeErr
        | undefined;
    } catch {
      payload = undefined;
    }

    if (response.ok && payload && payload.success === true) {
      return payload.data;
    }

    const message =
      (payload && payload.success === false && payload.error) ||
      `HTTP ${response.status} ${response.statusText || ""}`.trim();

    if (response.status === 401) {
      throw new WaSdkError("AUTH_ERROR", message, { status: 401 });
    }
    throw new WaSdkError("API_ERROR", message, { status: response.status });
  }

  return {
    async sendMessage(args: SendMessageArgs): Promise<SendMessageResult> {
      validateSendMessage(args);
      const data = (await post(SEND_MESSAGE_PATH, {
        to: args.to,
        message: args.message,
        ...(args.mediaUrl !== undefined ? { mediaUrl: args.mediaUrl } : {}),
        ...(args.replyTo !== undefined ? { replyTo: args.replyTo } : {}),
      })) as { messageId: string; toJid: string };

      return { messageId: data.messageId, toJid: data.toJid };
    },

    async sendReaction(args: SendReactionArgs): Promise<void> {
      validateSendReaction(args);
      await post(SEND_REACTION_PATH, {
        to: args.to,
        messageId: args.messageId,
        emoji: args.emoji,
        ...(args.fromMe !== undefined ? { fromMe: args.fromMe } : {}),
        ...(args.participant !== undefined ? { participant: args.participant } : {}),
      });
    },
  };
}

/**
 * Build a client from environment variables. Reads `BASE_URL` and `API_TOKEN_WA`.
 * Node-only convenience (the core client works in any `fetch`-capable runtime).
 *
 * @example
 * ```ts
 * // .env
 * // BASE_URL=https://example.com
 * // API_TOKEN_WA=xxxxx
 * import { fromEnv } from "@onchainyaotoshi/openclaw-wa-sdk";
 * const wa = fromEnv();
 * ```
 */
export function fromEnv(
  env: Record<string, string | undefined> = process.env,
): WaClient {
  const baseUrl = (env.BASE_URL ?? "").trim();
  const apiToken = (env.API_TOKEN_WA ?? "").trim();
  if (!baseUrl || !apiToken) {
    const missing = [
      !baseUrl && "BASE_URL",
      !apiToken && "API_TOKEN_WA",
    ].filter(Boolean) as string[];
    throw new WaSdkError(
      "MISSING_CONFIG",
      `Missing required environment variable(s): ${missing.join(", ")}. Set them in your .env, or construct the client explicitly with createWaClient({ baseUrl, apiToken }).`,
    );
  }
  return createWaClient({ baseUrl, apiToken });
}
