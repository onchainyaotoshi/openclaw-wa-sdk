import { afterEach, describe, expect, it, vi } from "vitest";
import { createWaClient, fromEnv, WaSdkError } from "../src/index.js";

const BASE = "https://gw.example.com";
const GROUP = "120363070193023059@g.us";

function json(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(fetchImpl: (...a: any[]) => Promise<Response>) {
  vi.stubGlobal("fetch", fetchImpl);
  return createWaClient({ baseUrl: BASE, apiToken: "tok" });
}

/** Captures the POST body sent to the gateway. */
function captureBody(): { body: any; wa: ReturnType<typeof createWaClient> } {
  let body: any;
  const wa = clientWith(async (_u: string, init: any) => {
    body = JSON.parse(init.body);
    return json({ success: true, data: { messageId: "m", toJid: "j" } });
  });
  return { body: () => body, wa };
}

afterEach(() => vi.unstubAllGlobals());

describe("createWaClient — config validation", () => {
  it("throws MISSING_CONFIG when baseUrl is empty", () => {
    try {
      createWaClient({ baseUrl: "", apiToken: "tok" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(WaSdkError);
      expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
      expect((e as Error).message).toMatch(/baseUrl/);
    }
  });

  it("throws MISSING_CONFIG when apiToken is empty", () => {
    try {
      createWaClient({ baseUrl: BASE, apiToken: "" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
      expect((e as Error).message).toMatch(/apiToken/);
    }
  });

  it("rejects baseUrl without http(s) scheme", () => {
    try {
      createWaClient({ baseUrl: "gw.example.com", apiToken: "tok" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
      expect((e as Error).message).toMatch(/http/);
    }
  });

  it("rejects baseUrl with a trailing slash", () => {
    try {
      createWaClient({ baseUrl: "https://gw.example.com/", apiToken: "tok" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
      expect((e as Error).message).toMatch(/trailing slash/);
    }
  });
});

describe("sendMessage", () => {
  it("POSTs to /camis-openclaw/send-message and unwraps data", async () => {
    let captured: { url: string; init: any } | undefined;
    const wa = clientWith(async (url: string, init: any) => {
      captured = { url, init };
      return json({ success: true, data: { messageId: "m1", toJid: "j1" } });
    });
    const res = await wa.sendMessage({ to: "+6281234567890", message: "hi" });
    expect(res).toEqual({ messageId: "m1", toJid: "j1" });
    expect(captured!.url).toBe(`${BASE}/camis-openclaw/send-message`);
    expect(captured!.init.method).toBe("POST");
    expect(captured!.init.headers.authorization).toBe("Bearer tok");
    expect(captured!.init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(captured!.init.body)).toEqual({ to: "+6281234567890", message: "hi" });
  });

  it("includes mediaUrl when provided and NEVER sends replyTo", async () => {
    const { body, wa } = captureBody();
    await wa.sendMessage({ to: "+62", message: "x", mediaUrl: "https://img/x.png" });
    expect(body()).toEqual({ to: "+62", message: "x", mediaUrl: "https://img/x.png" });
    expect(body().replyTo).toBeUndefined();
  });

  it("throws INVALID_REQUEST without to", async () => {
    const wa = clientWith(async () => json({}));
    await expect(wa.sendMessage({ to: "", message: "x" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("throws INVALID_REQUEST without message", async () => {
    const wa = clientWith(async () => json({}));
    await expect(wa.sendMessage({ to: "+62", message: "" } as any)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});

describe("reply", () => {
  it("sends replyTo{messageId, fromMe:false} for a personal reply", async () => {
    const { body, wa } = captureBody();
    await wa.reply({ to: "+62", messageId: "q1", message: "noted" });
    expect(body()).toEqual({
      to: "+62",
      message: "noted",
      replyTo: { messageId: "q1", fromMe: false },
    });
  });

  it("requires participant for a group reply unless self:true", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.reply({ to: GROUP, messageId: "q1", message: "x" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("auto-fills participant=to and fromMe:true for a group self-reply", async () => {
    const { body, wa } = captureBody();
    await wa.reply({ to: GROUP, messageId: "q1", message: "x", self: true });
    expect(body().replyTo).toEqual({ messageId: "q1", fromMe: true, participant: GROUP });
  });

  it("sends explicit participant + fromMe:false for a group incoming reply", async () => {
    const { body, wa } = captureBody();
    await wa.reply({ to: GROUP, messageId: "q1", message: "x", participant: "+6281234567890" });
    expect(body().replyTo).toEqual({
      messageId: "q1",
      fromMe: false,
      participant: "+6281234567890",
    });
  });

  it("includes mediaUrl and quotedText when provided", async () => {
    const { body, wa } = captureBody();
    await wa.reply({
      to: "+62",
      messageId: "q1",
      message: "x",
      mediaUrl: "https://img/a.png",
      quotedText: "orig",
    });
    expect(body().mediaUrl).toBe("https://img/a.png");
    expect(body().replyTo.quotedText).toBe("orig");
  });

  it("throws INVALID_REQUEST without messageId", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.reply({ to: "+62", messageId: "", message: "x" } as any),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("sendReaction", () => {
  it("POSTs to /camis-openclaw/send-reaction with fromMe:false and resolves void", async () => {
    let captured: { url: string; body: any } | undefined;
    const wa = clientWith(async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return json({ success: true, data: { ok: true } });
    });
    await expect(
      wa.sendReaction({ to: "+62", messageId: "m1", emoji: "👍" }),
    ).resolves.toBeUndefined();
    expect(captured!.url).toBe(`${BASE}/camis-openclaw/send-reaction`);
    expect(captured!.body).toEqual({ to: "+62", messageId: "m1", emoji: "👍", fromMe: false });
  });

  it("sends fromMe:true when self:true", async () => {
    const { body, wa } = captureBody();
    await wa.sendReaction({ to: "+62", messageId: "m1", emoji: "👍", self: true });
    expect(body().fromMe).toBe(true);
  });

  it("sends an empty emoji (remove reaction)", async () => {
    const { body, wa } = captureBody();
    await wa.sendReaction({ to: "+62", messageId: "m1", emoji: "" });
    expect(body().emoji).toBe("");
  });

  it("requires participant for a group target unless self:true", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendReaction({ to: GROUP, messageId: "m1", emoji: "👍" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("auto-fills participant=to for a group self-react", async () => {
    const { body, wa } = captureBody();
    await wa.sendReaction({ to: GROUP, messageId: "m1", emoji: "👍", self: true });
    expect(body().participant).toBe(GROUP);
    expect(body().fromMe).toBe(true);
  });

  it("throws INVALID_REQUEST without messageId", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendReaction({ to: "+62", messageId: "", emoji: "👍" } as any),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("reactSuccess / reactFailed / reactRemove", () => {
  it("reactSuccess sends ✅ with fromMe:false", async () => {
    const { body, wa } = captureBody();
    await wa.reactSuccess({ to: "+62", messageId: "m1" });
    expect(body()).toEqual({ to: "+62", messageId: "m1", emoji: "✅", fromMe: false });
  });

  it("reactFailed sends ❌", async () => {
    const { body, wa } = captureBody();
    await wa.reactFailed({ to: "+62", messageId: "m1" });
    expect(body().emoji).toBe("❌");
  });

  it("reactRemove sends an empty emoji", async () => {
    const { body, wa } = captureBody();
    await wa.reactRemove({ to: "+62", messageId: "m1" });
    expect(body().emoji).toBe("");
  });

  it("require participant for groups unless self:true", async () => {
    const wa = clientWith(async () => json({}));
    await expect(wa.reactSuccess({ to: GROUP, messageId: "m1" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(wa.reactFailed({ to: GROUP, messageId: "m1" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(wa.reactRemove({ to: GROUP, messageId: "m1" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("group self-react auto-fills participant and fromMe", async () => {
    const { body, wa } = captureBody();
    await wa.reactSuccess({ to: GROUP, messageId: "m1", self: true });
    expect(body()).toEqual({
      to: GROUP,
      messageId: "m1",
      emoji: "✅",
      fromMe: true,
      participant: GROUP,
    });
  });
});

describe("error mapping", () => {
  it("maps 401 to AUTH_ERROR", async () => {
    const wa = clientWith(async () => json({ success: false, error: "Unauthorized" }, 401));
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "AUTH_ERROR",
      status: 401,
      message: "Unauthorized",
    });
  });

  it("maps a 500 envelope to API_ERROR with the server message", async () => {
    const wa = clientWith(async () =>
      json({ success: false, error: "WhatsApp disconnected" }, 500),
    );
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "API_ERROR",
      status: 500,
      message: "WhatsApp disconnected",
    });
  });

  it("maps a 400 envelope to API_ERROR with status 400", async () => {
    const wa = clientWith(async () => json({ success: false, error: "bad input" }, 400));
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "API_ERROR",
      status: 400,
    });
  });

  it("falls back to HTTP status text when body is not the envelope", async () => {
    const wa = clientWith(async () => json({ unrelated: true }, 502));
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "API_ERROR",
      status: 502,
    });
  });

  it("maps an AbortError to TIMEOUT", async () => {
    const wa = clientWith(async () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    });
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });

  it("maps a generic fetch failure to NETWORK_ERROR", async () => {
    const wa = clientWith(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(wa.sendMessage({ to: "+62", message: "x" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});

describe("fromEnv", () => {
  function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
    const old: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      old[k] = process.env[k];
      if (vars[k] === undefined) delete process.env[k];
      else process.env[k] = vars[k];
    }
    return Promise.resolve(fn()).finally(() => {
      for (const k of Object.keys(vars)) {
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
      }
    });
  }

  it("builds a client from OPENCLAW_WA_SDK_BASE_URL + OPENCLAW_WA_SDK_TOKEN", async () => {
    await withEnv(
      { OPENCLAW_WA_SDK_BASE_URL: "https://env.example.com", OPENCLAW_WA_SDK_TOKEN: "envtok" },
      async () => {
        let capturedUrl = "";
        vi.stubGlobal("fetch", async (url: string) => {
          capturedUrl = url;
          return json({ success: true, data: { ok: true } });
        });
        const wa = fromEnv();
        await wa.sendReaction({ to: "+62", messageId: "m", emoji: "👍" });
        expect(capturedUrl).toBe("https://env.example.com/camis-openclaw/send-reaction");
        vi.unstubAllGlobals();
      },
    );
  });

  it("throws MISSING_CONFIG listing the missing vars", async () => {
    await withEnv(
      { OPENCLAW_WA_SDK_BASE_URL: undefined, OPENCLAW_WA_SDK_TOKEN: undefined },
      () => {
        try {
          fromEnv();
          throw new Error("should have thrown");
        } catch (e) {
          expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
          expect((e as Error).message).toMatch(/OPENCLAW_WA_SDK_BASE_URL/);
          expect((e as Error).message).toMatch(/OPENCLAW_WA_SDK_TOKEN/);
        }
      },
    );
  });
});
