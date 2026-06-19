# @yaotoshi/openclaw-wa-sdk

[![CI](https://github.com/onchainyaotoshi/openclaw-wa-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/onchainyaotoshi/openclaw-wa-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@yaotoshi%2Fopenclaw-wa-sdk?logo=npm)](https://www.npmjs.com/package/@yaotoshi/openclaw-wa-sdk)

A tiny, fully-typed TypeScript SDK for sending **WhatsApp messages and reactions** through the [OpenClaw](https://github.com/onchainyaotoshi) CAMIS gateway.

- **Zero runtime dependencies** — uses the global `fetch` (Node 18+, browsers, Bun, Deno).
- **Dual ESM / CommonJS** — works with `import` and `require`.
- **Strict types + fail-fast validation** — invalid payloads never reach the network.
- **Typed, actionable errors** — discriminate on `WaSdkError.code`.

> Designed to be easy for a coding LLM (or human) to use correctly: obvious method names, rich JSDoc, copy-paste examples, errors that say how to fix the problem.

## Install

```bash
npm install @yaotoshi/openclaw-wa-sdk
```

## Quick start

```ts
import { fromEnv, createWaClient } from "@yaotoshi/openclaw-wa-sdk";

// (a) from environment — reads BASE_URL + API_TOKEN_WA
const wa = fromEnv();

// (b) explicit — testable, no env magic
const wa = createWaClient({
  baseUrl: "https://example.com",
  apiToken: process.env.API_TOKEN_WA!,
});
```

Works in CommonJS too:

```js
const { fromEnv } = require("@yaotoshi/openclaw-wa-sdk");
const wa = fromEnv();
```

### Environment variables (for `fromEnv`)

```bash
# .env
BASE_URL=https://example.com   # gateway base URL (no trailing slash)
API_TOKEN_WA=xxxxx                                  # must match the gateway's API_TOKEN_WA
```

## Methods

| Method | Args | Returns |
| --- | --- | --- |
| `wa.sendMessage(args)` | `{ to, message, mediaUrl?, replyTo? }` | `{ messageId, toJid }` |
| `wa.sendReaction(args)` | `{ to, messageId, emoji, fromMe?, participant? }` | `void` |

`to` is an **E.164 phone number** for a personal chat (e.g. `"+6281234567890"`) or a **group JID** (e.g. `"120363…@g.us"`).

## Examples

### Send a text message

```ts
const { messageId } = await wa.sendMessage({
  to: "+6281234567890",
  message: "Pesanan Anda dalam pengiriman 🚚",
});
```

### Send media

```ts
await wa.sendMessage({
  to: "+6281234567890",
  message: "Surat jalan terlampir",
  mediaUrl: "https://example.com/surat-jalan.pdf",
});
```

### Reply (in a group, `participant` is required)

```ts
await wa.sendMessage({
  to: "120363xxxxxxxxxx@g.us",
  message: "Noted 👍",
  replyTo: { messageId: "<inbound-msg-id>", participant: "62xxx@s.whatsapp.net" },
});
```

### React / remove a reaction

```ts
await wa.sendReaction({ to: "+6281234567890", messageId, emoji: "👍" });
await wa.sendReaction({ to: "+6281234567890", messageId, emoji: "" }); // remove
```

## Error handling

All failures throw a single {@link WaSdkError} class. Discriminate on `code`:

```ts
import { WaSdkError } from "@yaotoshi/openclaw-wa-sdk";

try {
  await wa.sendMessage({ to: "+62…", message: "hi" });
} catch (e) {
  if (e instanceof WaSdkError) {
    switch (e.code) {
      case "AUTH_ERROR":      console.error("bad token"); break;
      case "TIMEOUT":         console.error("gateway slow"); break;
      case "NETWORK_ERROR":   console.error("cannot reach gateway"); break;
      case "API_ERROR":       console.error("gateway:", e.message, e.status); break;
      case "INVALID_REQUEST": console.error("bad args:", e.message); break;
      case "MISSING_CONFIG":  console.error("config:", e.message); break;
    }
  }
}
```

| `code` | meaning |
| --- | --- |
| `MISSING_CONFIG` | `baseUrl`/`apiToken` missing or malformed, or env vars unset |
| `INVALID_REQUEST` | client-side validation failed (missing field, group without `participant`) |
| `TIMEOUT` | request exceeded `timeoutMs` |
| `AUTH_ERROR` | gateway returned `401` (bad token) |
| `API_ERROR` | gateway returned a non-2xx with `{ success:false, error }` |
| `NETWORK_ERROR` | request could not reach the gateway (DNS, connection) |

## Configuration

```ts
createWaClient({ baseUrl, apiToken, timeoutMs: 30_000 }); // timeoutMs defaults to 30000
```

## Requirements

- A runtime with global `fetch` (Node ≥ 18, modern browsers, Bun, Deno).
- `fromEnv()` is Node-only (reads `process.env`); the core client works anywhere.

## License

MIT © onchainyaotoshi
