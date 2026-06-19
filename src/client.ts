import { WaSdkError } from "./error.js";
import {
  validateConfig,
  validateSendMessage,
  validateReply,
  validateSendReaction,
  validateReact,
} from "./validate.js";
import type {
  SendMessageArgs,
  SendMessageResult,
  ReplyArgs,
  SendReactionArgs,
  ReactArgs,
  WaClientOptions,
} from "./types.js";

/** Gateway route paths (hardcoded by the server; do not change without a server change). */
const SEND_MESSAGE_PATH = "/camis-openclaw/send-message";
const SEND_REACTION_PATH = "/camis-openclaw/send-reaction";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Resolves the `fromMe` + `participant` context shared by reply/reaction methods.
 * `self: true` → `fromMe: true` and, for groups, `participant` filled with `to`.
 * Callers must have validated that `participant` is present when required.
 */
function resolveContext(
  to: string,
  participant: string | undefined,
  self: boolean | undefined,
): { fromMe: boolean; participant: string | undefined } {
  const isGroup = typeof to === "string" && to.endsWith("@g.us");
  return {
    fromMe: self ? true : false,
    participant: participant ?? (isGroup && self ? to : undefined),
  };
}

/** A stateless WhatsApp messaging client returned by {@link createWaClient}. */
export interface WaClient {
  /** Send a text message (optionally with media). Returns the sent message id + JID. */
  sendMessage(args: SendMessageArgs): Promise<SendMessageResult>;
  /**
   * Reply to a message. For group targets pass the sender's `participant`, or set
   * `self: true` to reply to your own message (participant auto-filled). Returns
   * the sent message id + JID.
   */
  reply(args: ReplyArgs): Promise<SendMessageResult>;
  /** Set (or remove, with `emoji: ""`) a reaction with any emoji. */
  sendReaction(args: SendReactionArgs): Promise<void>;
  /** React ✅ (success). Same `participant` / `self` rules as {@link sendReaction}. */
  reactSuccess(args: ReactArgs): Promise<void>;
  /** React ❌ (failed). Same `participant` / `self` rules as {@link sendReaction}. */
  reactFailed(args: ReactArgs): Promise<void>;
  /** Remove the existing reaction. Same `participant` / `self` rules as {@link sendReaction}. */
  reactRemove(args: ReactArgs): Promise<void>;
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
 *   apiToken: process.env.OPENCLAW_WA_SDK_TOKEN!,
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

  /** Builds + sends a reply (send-message with replyTo). Shared by `reply`. */
  async function sendReplyMessage(
    args: ReplyArgs,
  ): Promise<{ messageId: string; toJid: string }> {
    const { fromMe, participant } = resolveContext(args.to, args.participant, args.self);
    return (await post(SEND_MESSAGE_PATH, {
      to: args.to,
      message: args.message,
      ...(args.mediaUrl !== undefined ? { mediaUrl: args.mediaUrl } : {}),
      replyTo: {
        messageId: args.messageId,
        fromMe,
        ...(participant !== undefined ? { participant } : {}),
        ...(args.quotedText !== undefined ? { quotedText: args.quotedText } : {}),
      },
    })) as { messageId: string; toJid: string };
  }

  /** Builds + sends a reaction with a fixed/resolved emoji. Shared by all reaction methods. */
  async function postReaction(
    to: string,
    messageId: string,
    emoji: string,
    participant: string | undefined,
    self: boolean | undefined,
  ): Promise<void> {
    const ctx = resolveContext(to, participant, self);
    await post(SEND_REACTION_PATH, {
      to,
      messageId,
      emoji,
      fromMe: ctx.fromMe,
      ...(ctx.participant !== undefined ? { participant: ctx.participant } : {}),
    });
  }

  return {
    async sendMessage(args: SendMessageArgs): Promise<SendMessageResult> {
      validateSendMessage(args);
      const data = (await post(SEND_MESSAGE_PATH, {
        to: args.to,
        message: args.message,
        ...(args.mediaUrl !== undefined ? { mediaUrl: args.mediaUrl } : {}),
      })) as { messageId: string; toJid: string };
      return { messageId: data.messageId, toJid: data.toJid };
    },

    async reply(args: ReplyArgs): Promise<SendMessageResult> {
      validateReply(args);
      const data = await sendReplyMessage(args);
      return { messageId: data.messageId, toJid: data.toJid };
    },

    async sendReaction(args: SendReactionArgs): Promise<void> {
      validateSendReaction(args);
      await postReaction(args.to, args.messageId, args.emoji, args.participant, args.self);
    },

    async reactSuccess(args: ReactArgs): Promise<void> {
      validateReact(args);
      await postReaction(args.to, args.messageId, "✅", args.participant, args.self);
    },

    async reactFailed(args: ReactArgs): Promise<void> {
      validateReact(args);
      await postReaction(args.to, args.messageId, "❌", args.participant, args.self);
    },

    async reactRemove(args: ReactArgs): Promise<void> {
      validateReact(args);
      await postReaction(args.to, args.messageId, "", args.participant, args.self);
    },
  };
}

/**
 * Build a client from environment variables. Reads `OPENCLAW_WA_SDK_BASE_URL` and `OPENCLAW_WA_SDK_TOKEN`.
 * Node-only convenience (the core client works in any `fetch`-capable runtime).
 *
 * @example
 * ```ts
 * // .env
 * // OPENCLAW_WA_SDK_BASE_URL=https://example.com
 * // OPENCLAW_WA_SDK_TOKEN=xxxxx
 * import { fromEnv } from "@yaotoshi/openclaw-wa-sdk";
 * const wa = fromEnv();
 * ```
 */
export function fromEnv(
  env: Record<string, string | undefined> = process.env,
): WaClient {
  const baseUrl = (env.OPENCLAW_WA_SDK_BASE_URL ?? "").trim();
  const apiToken = (env.OPENCLAW_WA_SDK_TOKEN ?? "").trim();
  if (!baseUrl || !apiToken) {
    const missing = [
      !baseUrl && "OPENCLAW_WA_SDK_BASE_URL",
      !apiToken && "OPENCLAW_WA_SDK_TOKEN",
    ].filter(Boolean) as string[];
    throw new WaSdkError(
      "MISSING_CONFIG",
      `Missing required environment variable(s): ${missing.join(", ")}. Set them in your .env, or construct the client explicitly with createWaClient({ baseUrl, apiToken }).`,
    );
  }
  return createWaClient({ baseUrl, apiToken });
}
