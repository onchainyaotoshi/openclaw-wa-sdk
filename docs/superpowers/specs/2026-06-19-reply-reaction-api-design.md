# Design — Reply & Reaction ergonomics (v0.2.0)

Date: 2026-06-19
Status: Approved (pre-implementation)
Supersedes: the `replyTo` option on `sendMessage` (v0.1.x).

## Goal

Make replying and reacting **ready-to-use** and hard to misuse, while respecting
the gateway contract. Two pain points in v0.1.x drove this:

1. `replyTo` on `sendMessage` has a *conditional* `participant` (required only
   for groups) and an ambiguous `fromMe` (the gateway defaults it to `true`,
   silently turning every reply into a self-reply).
2. There is no convenience for the common bot pattern of reacting ✅ / ❌ /
   removing a reaction, nor for replying/reacting to the bot's **own** messages
   (where `participant` can be auto-filled).

## Gateway contract (source of truth — unchanged)

Verified against `routes/sendMessage.ts` + `routes/sendReaction.ts` in camis-openclaw:

- **`participant` is required for group targets (`to` ends with `@g.us`)**, for
  both replies and reactions. Not required for personal/DM targets.
- `participant` is the **sender of the quoted/reacted message** — an individual.
  It accepts **a phone number OR a JID**: the runtime's `toWhatsappJid()` passes
  through anything containing `@`, otherwise normalizes an E.164 phone to
  `<digits>@s.whatsapp.net`. The SDK must **not** over-validate the format.
- `fromMe`: gateway defaults `replyTo.fromMe` to `true` and `sendReaction`'s
  `fromMe` to `true`. This default is a footgun — the SDK will always send
  `fromMe` explicitly so the gateway default never applies.

## Public API (6 methods)

```ts
const wa = createWaClient({ baseUrl, apiToken });

wa.sendMessage({ to, message, mediaUrl? })                         // plain send — replyTo REMOVED
wa.reply({ to, messageId, message, participant?, self?, mediaUrl?, quotedText? })
wa.sendReaction({ to, messageId, emoji, participant?, self? })     // generic, any emoji
wa.reactSuccess({ to, messageId, participant?, self? })           // ✅
wa.reactFailed({ to, messageId, participant?, self? })            // ❌
wa.reactRemove({ to, messageId, participant?, self? })            // removes the reaction
```

### The `self` flag (single knob for `fromMe` + `participant`)

`self` expresses intent: "I'm acting on **my own** message". It replaces the
low-level `fromMe` parameter entirely.

| `self` | `fromMe` sent | group (`@g.us`) `participant` | personal `participant` |
| --- | --- | --- | --- |
| `true` | `true` (forced) | auto-filled = `to` *(documented filler)* | omitted |
| omitted / `false` | `false` (forced) | **required** — INVALID_REQUEST if missing | optional |

Rationale for removing `fromMe` from the public surface: `self` fully determines
it (own message ⇒ `true`, someone else's ⇒ `false`). There is no useful
`fromMe` value that `self` doesn't already express, so exposing both would only
re-introduce the footgun. The SDK **always** sends `fromMe` explicitly, so the
gateway's `true` default can never leak through.

The group self-fill (`participant = to`) is a deliberate, documented shortcut:
the runtime accepts any non-empty `participant` for groups, and for a *self*-
reply/react `fromMe:true` dominates attribution, so the group JID as filler
sends correctly (verified by manual test). It is documented as a filler, not a
general substitute for the sender JID.

## Types

```ts
interface SendMessageArgs {
  to: string;          // E.164 phone or group JID
  message: string;
  mediaUrl?: string;
}

interface ReplyArgs {
  to: string;
  messageId: string;
  message: string;
  mediaUrl?: string;
  participant?: string;   // sender phone/JID; required for groups unless self:true
  self?: boolean;
  quotedText?: string;    // optional preview text shown in the quote bubble
}

interface SendReactionArgs {
  to: string;
  messageId: string;
  emoji: string;          // any emoji; "" removes the reaction
  participant?: string;   // required for groups unless self:true
  self?: boolean;
}

interface ReactArgs {       // for reactSuccess / reactFailed / reactRemove
  to: string;
  messageId: string;
  participant?: string;   // required for groups unless self:true
  self?: boolean;
}
```

`ReplyTarget` and the old `fromMe` fields on `ReplyTarget`/`SendReactionArgs`
are removed from the public exports.

## Behavior (resolution rules, applied before the network call)

Let `isGroup = to.endsWith("@g.us")`.

```
fromMe      = self ? true : false
participant =
  args.participant                              // explicit wins
  else if isGroup && self  -> to                // self-fill filler
  else if isGroup          -> INVALID_REQUEST   // incoming group needs the sender
  else                     -> undefined         // personal: omit
```

Emoji presets: `reactSuccess` → `"✅"`, `reactFailed` → `"❌"`, `reactRemove` → `""`.

## HTTP (built from the resolved values)

- `sendMessage` → `POST /camis-openclaw/send-message`, body `{ to, message, mediaUrl? }`
  (no `replyTo`).
- `reply` → `POST /camis-openclaw/send-message`, body
  `{ to, message, mediaUrl?, replyTo: { messageId, fromMe, participant?, quotedText? } }`.
- `sendReaction` / `reactSuccess` / `reactFailed` / `reactRemove` →
  `POST /camis-openclaw/send-reaction`, body
  `{ to, messageId, emoji, fromMe, participant? }`.

All methods reuse the existing HTTP core (fetch + AbortController + envelope
parse + error mapping). No new error codes.

## Validation

Fail-fast with `WaSdkError(INVALID_REQUEST)`, mirroring the gateway:

- `reply`: `to`, `messageId`, `message` required; `participant` per the matrix.
- `sendReaction`: `to`, `messageId`, `emoji` (must be string) required; `participant` per the matrix.
- `reactSuccess` / `reactFailed` / `reactRemove`: `to`, `messageId` required; `participant` per the matrix.

Error messages name the field and the fix (e.g. *"`participant` is required for
group targets. Pass the sender's phone/JID, or set `self: true` for your own
message."*).

## Testing

Vitest, `fetch` stubbed via `vi.stubGlobal` (existing pattern). New coverage:

- `participant` matrix: group×{self, no-self}×{participant given, omitted} and
  personal×{self, no-self}.
- `fromMe` is **always** present in the sent body, equal to `self`.
- self-fill: group + `self:true` with no `participant` → body `participant === to`.
- Emoji presets: `reactSuccess`/`Failed`/`Remove` send `✅`/`❌`/`""`.
- `reply` body shape (replyTo with resolved fromMe/participant/quotedText).
- `sendMessage` body has no `replyTo`.

## Breaking changes → bump to **0.2.0**

- `sendMessage`: `replyTo` option removed. (Plain sends are unaffected.)
- `ReplyTarget` type + `fromMe` on `ReplyTarget`/`SendReactionArgs` removed.
- New `reply` / `reactSuccess` / `reactFailed` / `reactRemove` methods + `self` flag.

Migration: callers using `replyTo` → `reply()`; callers setting `fromMe:true` →
`self:true`; `fromMe:false` is now the default (omit `self`).

## Out of scope (YAGNI)

- Dedicated `selfReply` / `selfReact*` methods (folded into the `self` flag).
- Exposing `fromMe` directly.
- Looking up the bot's own JID (the SDK is stateless; no message store).
- Auto-populating `quotedText` from a message store.
- `accountId` (still intentionally unexposed).
