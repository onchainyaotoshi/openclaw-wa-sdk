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
 * Recipient + ownership context shared by {@link ReplyArgs}, {@link SendReactionArgs}
 * and {@link ReactArgs}. Drives the `self` flag semantics.
 */
export interface TargetContext {
  /**
   * Recipient.
   * - Personal chat: E.164 phone number, e.g. `"+6281234567890"`.
   * - Group: group JID, e.g. `"120363xxxxxxxxxx@g.us"`.
   */
  to: string;
  /**
   * The sender of the target message — a **phone number** (e.g. `"+6281234567890"`)
   * or a JID (`…@s.whatsapp.net`). **Required for group targets unless `self` is `true`.**
   * A phone is normalized to a JID by the runtime; the SDK does not over-validate the format.
   */
  participant?: string;
  /**
   * `true` when the target message is **your own** outgoing message. Sets `fromMe: true`
   * and (for groups) auto-fills `participant` with `to` — a filler that sends correctly
   * for self-actions. Omit (or `false`) for someone else's (inbound) message: `fromMe`
   * becomes `false` and `participant` is required for groups.
   */
  self?: boolean;
}

/**
 * Arguments for {@link WaClient.sendMessage}.
 */
export interface SendMessageArgs {
  /** Recipient. E.164 phone for a personal chat, or a group JID (`…@g.us`). */
  to: string;
  /** Message text body. Must be non-empty. */
  message: string;
  /** Optional media URL or local path (image/document/etc). */
  mediaUrl?: string;
}

/**
 * Arguments for {@link WaClient.reply}.
 */
export interface ReplyArgs extends TargetContext {
  /** ID of the message being replied to. */
  messageId: string;
  /** Message text body. Must be non-empty. */
  message: string;
  /** Optional media URL or local path. */
  mediaUrl?: string;
  /** Optional preview text shown in the quote bubble. */
  quotedText?: string;
}

/**
 * Result of a successful {@link WaClient.sendMessage} / {@link WaClient.reply}.
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
export interface SendReactionArgs extends TargetContext {
  /** ID of the message to react to (from a {@link SendMessageResult} or an inbound event). */
  messageId: string;
  /** Emoji to set. An empty string `""` **removes** the existing reaction. */
  emoji: string;
}

/**
 * Arguments for {@link WaClient.reactSuccess} / {@link WaClient.reactFailed} / {@link WaClient.reactRemove}.
 */
export interface ReactArgs extends TargetContext {
  /** ID of the message to react to. */
  messageId: string;
}
