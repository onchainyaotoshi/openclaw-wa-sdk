import { WaSdkError } from "./error.js";
import type { SendMessageArgs, SendReactionArgs } from "./types.js";

/** A group JID ends with `@g.us` (matches the gateway's own check). */
export function isGroupTarget(to: string): boolean {
  return typeof to === "string" && to.endsWith("@g.us");
}

/**
 * Validates client configuration. Throws {@link WaSdkError} (`MISSING_CONFIG`)
 * with an actionable message if anything is wrong. Mirrors the expectations of
 * `createWaClient`.
 */
export function validateConfig(baseUrl: string, apiToken: string): void {
  if (!baseUrl) {
    throw new WaSdkError(
      "MISSING_CONFIG",
      'baseUrl is required. Pass it to createWaClient({ baseUrl, apiToken }) or set the BASE_URL env var.',
    );
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new WaSdkError(
      "MISSING_CONFIG",
      `baseUrl must start with "http://" or "https://" (got "${baseUrl}").`,
    );
  }
  if (baseUrl.endsWith("/")) {
    throw new WaSdkError(
      "MISSING_CONFIG",
      `baseUrl must not have a trailing slash (got "${baseUrl}").`,
    );
  }
  if (!apiToken) {
    throw new WaSdkError(
      "MISSING_CONFIG",
      'apiToken is required. Pass it to createWaClient({ baseUrl, apiToken }) or set the API_TOKEN_WA env var.',
    );
  }
}

/**
 * Validates {@link SendMessageArgs}, mirroring the gateway's server-side rules
 * (`routes/sendMessage.ts`). Throws {@link WaSdkError} (`INVALID_REQUEST`)
 * before any network call.
 */
export function validateSendMessage(args: SendMessageArgs): void {
  if (!args || typeof args.to !== "string" || !args.to) {
    throw new WaSdkError(
      "INVALID_REQUEST",
      '"to" is required. Use an E.164 phone number (e.g. "+6281234567890") for a personal chat, or a group JID (e.g. "120363…@g.us").',
    );
  }
  if (typeof args.message !== "string" || !args.message) {
    throw new WaSdkError("INVALID_REQUEST", '"message" is required (non-empty text).');
  }
  if (args.replyTo !== undefined) {
    const r = args.replyTo;
    if (!r || typeof r.messageId !== "string" || !r.messageId.trim()) {
      throw new WaSdkError(
        "INVALID_REQUEST",
        '"replyTo.messageId" is required when replyTo is provided.',
      );
    }
    if (isGroupTarget(args.to) && !r.participant) {
      throw new WaSdkError(
        "INVALID_REQUEST",
        '"replyTo.participant" is required when replying in a group (@g.us).',
      );
    }
  }
}

/**
 * Validates {@link SendReactionArgs}, mirroring `routes/sendReaction.ts`.
 * Throws {@link WaSdkError} (`INVALID_REQUEST`) before any network call.
 */
export function validateSendReaction(args: SendReactionArgs): void {
  if (!args || typeof args.to !== "string" || !args.to) {
    throw new WaSdkError("INVALID_REQUEST", '"to" is required.');
  }
  if (!args.messageId || typeof args.messageId !== "string") {
    throw new WaSdkError("INVALID_REQUEST", '"messageId" is required.');
  }
  if (typeof args.emoji !== "string") {
    throw new WaSdkError(
      "INVALID_REQUEST",
      '"emoji" is required (use the empty string "" to remove a reaction).',
    );
  }
  if (isGroupTarget(args.to) && !args.participant) {
    throw new WaSdkError(
      "INVALID_REQUEST",
      '"participant" is required for group targets (@g.us).',
    );
  }
}
