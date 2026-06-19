/**
 * Configuration for the WhatsApp messaging client.
 *
 * @example
 * ```ts
 * const wa = createWaClient({
 *   baseUrl: "https://example.com",
 *   apiToken: process.env.OPENCLAW_WA_SDK_TOKEN!,
 * });
 * ```
 */
export interface WaClientOptions {
  /**
   * Base URL of the OpenClaw gateway, e.g. `"https://example.com"`.
   * Must start with `http://` or `https://` and must NOT have a trailing slash.
   */
  baseUrl: string;
  /**
   * API token. Sent as `Authorization: Bearer <apiToken>`. Must match the
   * gateway's `API_TOKEN_WA` env var.
   */
  apiToken: string;
  /** Request timeout in milliseconds. Defaults to `30000` (matches the gateway). */
  timeoutMs?: number;
}

/**
 * Target of a `sendMessage` reply. Only meaningful when {@link SendMessageArgs.replyTo} is set.
 */
export interface ReplyTarget {
  /** ID of the message being replied to. Required when `replyTo` is provided. */
  messageId: string;
  /** `true` if replying to your own outgoing message. Defaults to `true`. */
  fromMe?: boolean;
  /**
   * Required for group targets (`…@g.us`): the JID of the original sender of the
   * message you are replying to.
   */
  participant?: string;
  /** Optional quoted text shown in the reply bubble. */
  quotedText?: string;
}

/**
 * Arguments for {@link WaClient.sendMessage}.
 */
export interface SendMessageArgs {
  /**
   * Recipient.
   * - Personal chat: E.164 phone number, e.g. `"+6281234567890"`.
   * - Group: group JID, e.g. `"120363xxxxxxxxxx@g.us"`.
   */
  to: string;
  /** Message text body. Must be non-empty. */
  message: string;
  /** Optional media URL or local path (image/document/etc). */
  mediaUrl?: string;
  /** Optional: reply to a specific message. */
  replyTo?: ReplyTarget;
}

/**
 * Result of a successful {@link WaClient.sendMessage}.
 */
export interface SendMessageResult {
  /** ID of the sent message (assigned by WhatsApp). */
  messageId: string;
  /** Final destination JID (internal WhatsApp format). */
  toJid: string;
}

/**
 * Arguments for {@link WaClient.sendReaction}.
 */
export interface SendReactionArgs {
  /**
   * Recipient. E.164 phone for a personal chat, or `…@g.us` for a group.
   */
  to: string;
  /** ID of the message to react to (from a {@link SendMessageResult} or an inbound event). */
  messageId: string;
  /** Emoji to set. An empty string `""` **removes** the existing reaction. */
  emoji: string;
  /** `true` if reacting to your own outgoing message. Defaults to `true`. */
  fromMe?: boolean;
  /** Required for group targets (`…@g.us`): the JID of the original sender. */
  participant?: string;
}
