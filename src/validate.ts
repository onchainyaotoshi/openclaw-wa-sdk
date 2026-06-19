import { WaSdkError } from "./error.js";
import type { SendMessageArgs, ReplyArgs, SendReactionArgs, ReactArgs } from "./types.js";

/** A group JID ends with `@g.us` (matches the gateway's own check). */
export function isGroupTarget(to: string): boolean {
  return typeof to === "string" && to.endsWith("@g.us");
}

const GROUP_PARTICIPANT_REQUIRED =
  '"participant" is required for group targets (@g.us). Pass the sender\'s phone/JID (e.g. "+6281234567890"), or set "self": true if the target is your own message.';

/**
 * Validates client configuration. Throws {@link WaSdkError} (`MISSING_CONFIG`)
 * with an actionable message if anything is wrong. Mirrors the expectations of
 * `createWaClient`.
 */
export function validateConfig(baseUrl: string, apiToken: string): void {
  if (!baseUrl) {
    throw new WaSdkError(
      "MISSING_CONFIG",
      'baseUrl is required. Pass it to createWaClient({ baseUrl, apiToken }) or set the OPENCLAW_WA_SDK_BASE_URL env var.',
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
      'apiToken is required. Pass it to createWaClient({ baseUrl, apiToken }) or set the OPENCLAW_WA_SDK_TOKEN env var.',
    );
  }
}

/**
 * Validates {@link SendMessageArgs}. Throws {@link WaSdkError} (`INVALID_REQUEST`)
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
}

/**
 * Validates {@link ReplyArgs}, including the group `participant` rule.
 * Throws {@link WaSdkError} (`INVALID_REQUEST`) before any network call.
 */
export function validateReply(args: ReplyArgs): void {
  if (!args || typeof args.to !== "string" || !args.to) {
    throw new WaSdkError(
      "INVALID_REQUEST",
      '"to" is required. Use an E.164 phone number for a personal chat, or a group JID (…@g.us).',
    );
  }
  if (typeof args.messageId !== "string" || !args.messageId.trim()) {
    throw new WaSdkError("INVALID_REQUEST", '"messageId" is required.');
  }
  if (typeof args.message !== "string" || !args.message) {
    throw new WaSdkError("INVALID_REQUEST", '"message" is required (non-empty text).');
  }
  if (isGroupTarget(args.to) && !args.self && !args.participant) {
    throw new WaSdkError("INVALID_REQUEST", GROUP_PARTICIPANT_REQUIRED);
  }
}

/**
 * Validates {@link SendReactionArgs}, including the group `participant` rule.
 * Throws {@link WaSdkError} (`INVALID_REQUEST`) before any network call.
 */
export function validateSendReaction(args: SendReactionArgs): void {
  if (!args || typeof args.to !== "string" || !args.to) {
    throw new WaSdkError("INVALID_REQUEST", '"to" is required.');
  }
  if (typeof args.messageId !== "string" || !args.messageId) {
    throw new WaSdkError("INVALID_REQUEST", '"messageId" is required.');
  }
  if (typeof args.emoji !== "string") {
    throw new WaSdkError(
      "INVALID_REQUEST",
      '"emoji" is required (use the empty string "" to remove a reaction).',
    );
  }
  if (isGroupTarget(args.to) && !args.self && !args.participant) {
    throw new WaSdkError("INVALID_REQUEST", GROUP_PARTICIPANT_REQUIRED);
  }
}

/**
 * Validates {@link ReactArgs} (for `reactSuccess` / `reactFailed` / `reactRemove`),
 * including the group `participant` rule. Throws {@link WaSdkError} (`INVALID_REQUEST`).
 */
export function validateReact(args: ReactArgs): void {
  if (!args || typeof args.to !== "string" || !args.to) {
    throw new WaSdkError("INVALID_REQUEST", '"to" is required.');
  }
  if (typeof args.messageId !== "string" || !args.messageId) {
    throw new WaSdkError("INVALID_REQUEST", '"messageId" is required.');
  }
  if (isGroupTarget(args.to) && !args.self && !args.participant) {
    throw new WaSdkError("INVALID_REQUEST", GROUP_PARTICIPANT_REQUIRED);
  }
}
