# Design — `@onchainyaotoshi/openclaw-wa-sdk`

Date: 2026-06-19
Status: Implemented (pre-publish)

## Goal

A tiny, fully-typed, LLM-friendly TypeScript SDK that wraps the WhatsApp
messaging HTTP endpoints exposed by the **camis-openclaw** OpenClaw plugin, and
auto-publishes to **public npm** from a GitHub repo.

## Locked decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Env vars | `BASE_URL` + `API_TOKEN_WA` only | Match the real gateway exactly; `accountId` is never used in practice (server defaults to `"default"`). |
| "LLM-friendly" = | DX for a **coding** LLM | Strict types, rich JSDoc, fail-fast validation, actionable errors, copy-paste examples. (Not tool-schemas / MCP.) |
| Wraps | `POST /camis-openclaw/send-message` + `/camis-openclaw/send-reaction` | The only messaging endpoints. |
| Registry | **Public npm**, scoped `@onchainyaotoshi/openclaw-wa-sdk` | Zero consumer friction (no PAT/`.npmrc`); SDK holds no secrets (they live in each consumer's env). |
| Publish | New GitHub repo + GitHub Actions (`NPM_TOKEN`, provenance) on `v*` tag | Standard, free, automatic. |
| API style | Functional factory `createWaClient()` + `fromEnv()` helper | No `new`, tree-shakeable, reads naturally, no import side-effects. |
| `accountId` | **Not exposed** | Never used; server defaults. |

## Exact server contract (source of truth)

Verified against the gateway source:

- `routes/sendMessage.ts` → `POST /camis-openclaw/send-message`
- `routes/sendReaction.ts` → `POST /camis-openclaw/send-reaction`

**Auth:** header `Authorization: Bearer <API_TOKEN_WA>` (server also accepts a bare token). Plain `===` compare against the gateway's `API_TOKEN_WA` env var.

**send-message body:** `{ to, message, mediaUrl?, accountId?, replyTo?: { messageId?, fromMe?, participant?, quotedText? } }`
- `to` + `message` required.
- If `replyTo` is provided: `replyTo.messageId` required (non-empty); if `to` ends with `@g.us`, `replyTo.participant` required.

**send-reaction body:** `{ to, messageId, emoji, fromMe?, participant?, accountId? }`
- `to`, `messageId`, `emoji` (must be a `string`) required; empty `emoji` removes the reaction.
- If `to` ends with `@g.us`, `participant` required.

**Response envelope:** success `{ success:true, data:{…} }`; error `{ success:false, error:string }` with status `400/401/405/500`.

`to` for a personal chat is an **E.164 phone number** (e.g. `+628…`), for a group a **JID** (`…@g.us`).

## Architecture

```
src/
  index.ts     # public exports
  client.ts    # createWaClient(), fromEnv(), the HTTP core (fetch + abort + envelope parse)
  types.ts     # request/response types (all exported)
  validate.ts  # fail-fast guards mirroring server rules → WaSdkError(INVALID_REQUEST)
  error.ts     # WaSdkError (code/status/cause) + WaErrorCode union
```

- **Zero runtime deps.** Validation is hand-written (no zod); HTTP is global `fetch`.
- **Stateless** — each `createWaClient()` returns a fresh object; no module-level state (so the dual CJS/ESM "package hazard" cannot occur).
- **Dual build** via `tsup` → `dist/index.{mjs,cjs}` + `.d.ts`, with an `exports` map. Verified with `arethetypeswrong` + `publint`.

## Error model

Single `WaSdkError` class, discriminated by `code`:
`MISSING_CONFIG | INVALID_REQUEST | TIMEOUT | AUTH_ERROR | API_ERROR | NETWORK_ERROR`.
401 → `AUTH_ERROR`; other non-2xx with envelope → `API_ERROR` (carries `status` + server `error`); fetch abort → `TIMEOUT`; fetch throw → `NETWORK_ERROR`.

## Testing

`vitest` with the global `fetch` stubbed (`vi.stubGlobal`). Covers: config validation, per-method validation (incl. group `participant` rule), success unwrap + exact request body/headers/path, every error mapping (401/400/500/non-envelope/abort/network), and `fromEnv` (happy + missing-var message).

## Out of scope (YAGNI)

`accountId`, tool schemas / MCP, phone-number → JID normalization, retry/backoff, rate limiting, logging hooks. Add later if needed.
