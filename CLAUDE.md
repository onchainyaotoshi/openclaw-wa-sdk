# CLAUDE.md — openclaw-wa-sdk

> This file is the handoff context for the LLM that continues coding here (humans won't — that's why it's thorough). Read it first.

## What this is

`@yaotoshi/openclaw-wa-sdk` — a tiny, fully-typed, **zero-dependency** TypeScript SDK that wraps the two WhatsApp messaging HTTP endpoints exposed by the **camis-openclaw** OpenClaw plugin. Consumers install it from **public npm** and send WhatsApp messages/reactions through the gateway, authenticating with `API_TOKEN_WA`.

It is intentionally minimal: 2 methods (`sendMessage`, `sendReaction`), strict types, fail-fast validation, a single typed error class. "LLM-friendly" here means **great DX for a coding LLM** (clear names, rich JSDoc, copy-paste README, errors that say how to fix things) — *not* tool-schemas or MCP.

## Current status

- ✅ Implemented: `src/` (client, types, validate, error, index).
- ✅ Builds: `npm run build` → `dist/` (dual ESM/CJS + `.d.ts`/`.d.cts`).
- ✅ Tests: `npm run test` → 22 passing (vitest, fetch stubbed).
- ✅ Verified dual package: `arethetypeswrong` "No problems found" (node10/node16-CJS/node16-ESM/bundler), `publint` clean, and runtime `require` + `import` both load + execute.
- ⏳ **Not yet published.** Needs the manual steps below (`NPM_TOKEN`, GitHub repo, first `v*` tag).

## Exact server contract (source of truth)

The SDK must match these **exactly**. Verified against the gateway source (`routes/sendMessage.ts`, `routes/sendReaction.ts` in the camis-openclaw repo). If the gateway changes, update `src/validate.ts` + `src/client.ts` + this file.

- **Auth:** header `Authorization: Bearer <API_TOKEN_WA>` (server also accepts a bare token). Compared with `===` to the gateway's `API_TOKEN_WA` env var.
- **`POST {BASE_URL}/camis-openclaw/send-message`**
  - Body: `{ to, message, mediaUrl?, accountId?, replyTo?: { messageId?, fromMe?, participant?, quotedText? } }`
  - Rules: `to` + `message` required. If `replyTo` set → `replyTo.messageId` required; if `to` ends with `@g.us` → `replyTo.participant` required.
  - Success `200`: `{ success:true, data:{ messageId, toJid } }`.
- **`POST {BASE_URL}/camis-openclaw/send-reaction`**
  - Body: `{ to, messageId, emoji, fromMe?, participant?, accountId? }`
  - Rules: `to`, `messageId`, `emoji` (must be `string`) required; empty `emoji` = remove. If `to` ends with `@g.us` → `participant` required.
  - Success `200`: `{ success:true, data:{ ok:true } }`.
- **Envelope:** success `{ success:true, data }`; error `{ success:false, error:string }`, status `400/401/405/500`.
- **`to`:** E.164 phone for a DM (e.g. `+6281234567890`) **or** a group JID (`…@g.us`). Do **not** over-validate the format — the runtime normalizes E.164.

`accountId` exists on the server (defaults to `"default"`) but is **intentionally not exposed** by the SDK (never used in practice).

## Locked design decisions

| Decision | Choice |
| --- | --- |
| Env vars | `OPENCLAW_WA_SDK_BASE_URL` + `OPENCLAW_WA_SDK_TOKEN` (no `accountId`) |
| LLM-friendly = | DX for coding-LLM (types, JSDoc, validation, errors) |
| Wraps | send-message + send-reaction only |
| Registry | Public npm, scoped `@yaotoshi/openclaw-wa-sdk` |
| Publish | GitHub repo + Actions (`NPM_TOKEN`, provenance) on `v*` tag |
| API style | Functional factory `createWaClient()` + `fromEnv()` |

## Architecture

```
src/
  index.ts     # public exports (factory + types + WaSdkError)
  client.ts    # createWaClient(), fromEnv(), HTTP core (fetch + AbortController + envelope parse + error mapping)
  types.ts     # all request/response types (exported)
  validate.ts  # fail-fast guards mirroring server rules → WaSdkError(INVALID_REQUEST)
  error.ts     # WaSdkError (code/status/cause) + WaErrorCode union
test/client.test.ts   # vitest, fetch stubbed via vi.stubGlobal
```

- **Zero runtime deps.** Validation is hand-written (no zod). HTTP is the global `fetch`. Dev deps only: tsup, typescript, vitest, @types/node, publint, attw.
- **Stateless** — `createWaClient()` returns a fresh object; no module-level state, so the dual CJS/ESM "package hazard" can't occur.
- **Errors:** single `WaSdkError`, discriminated by `code`: `MISSING_CONFIG | INVALID_REQUEST | TIMEOUT | AUTH_ERROR | API_ERROR | NETWORK_ERROR`. 401 → `AUTH_ERROR`; other non-2xx with envelope → `API_ERROR` (+`status`); abort → `TIMEOUT`; fetch throw → `NETWORK_ERROR`.

## Commands

```bash
npm install            # install dev deps
npm run build          # tsup → dist/ (ESM + CJS + d.ts)
npm run test           # vitest run (22 tests)
npm run test:watch     # vitest watch
npm run lint:pub       # publint + arethetypeswrong --pack  (run before every publish)
```

## Remaining manual steps to first publish

1. **npm scope** — `@yaotoshi` is the publisher's existing npm user scope (all other `@yaotoshi/*` packages live there). **No org creation needed.**
2. **Create the GitHub repo** `onchainyaotoshi/openclaw-wa-sdk` (name should match the package's unscoped name; see "Naming" below). Push this folder.
3. **Create an npm access token** (granular, publish permission on `@yaotoshi/*`) → add as GitHub Actions secret **`NPM_TOKEN`**.
4. **Tag + push** to publish:
   ```bash
   npm version patch        # bumps 0.1.0 → 0.1.1, creates v0.1.1 tag
   git push --follow-tags
   ```
   The `publish.yml` workflow runs build → test → `npm publish --provenance --access public`.
5. (Provenance requires the GitHub repo to be **public** + the npm package public — both true here.)

## Gotchas & conventions

- **`"type": "module"`** → the ESM build is `dist/index.js` (not `.mjs`); CJS is `dist/index.cjs`; types are `dist/index.d.ts` + `dist/index.d.cts`. The `exports` map reflects this exact layout — don't "fix" it to `.mjs`.
- **`keepNames: true`** in `tsup.config.ts` preserves `WaSdkError.name` (otherwise minification renames it). Keep it.
- **`arethetypeswrong`:** pin a recent version (≥0.18). **0.17.4 crashes on `--pack`** with "Cannot read properties of undefined (reading 'filename')" — a tool bug, not a package defect.
- **`fromEnv()` is Node-only** (reads `process.env`); the core client works in any `fetch` runtime. Don't add top-level env reads (import side-effects break tests + browsers).
- **No module-level mutable state** (keeps the dual package safe).
- **Validate before fetch** (mirror server rules) — fail-fast with actionable `INVALID_REQUEST` messages.

## Naming

Everything is standardized on `openclaw-wa-sdk`:
- **Folder (local):** `openclaw-wa-sdk`
- **npm package:** `@yaotoshi/openclaw-wa-sdk`
- **GitHub repo:** `onchainyaotoshi/openclaw-wa-sdk`

Note: the npm package name is **immutable once published** — finalize it before the first `npm publish`.

## Where to verify the contract

The gateway source lives in the **camis-openclaw** repo (the OpenClaw plugin this wraps):
- `routes/sendMessage.ts`, `routes/sendReaction.ts` — exact body/validation/envelope.
- The local clone may be at `/home/firman/camis-openclaw` (this machine) or under `/root/workspace/camis-openclaw(-dev)` on the server. If the paths differ, grep the repo for `registerHttpRoute` and `sendMessageWhatsApp`.

## Self-improvement

Keep this file accurate. If a build/test/lint command breaks, a contract field changes, or a gotcha is discovered, update this file before moving on.
