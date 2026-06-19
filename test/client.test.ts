import { afterEach, describe, expect, it, vi } from "vitest";
import { createWaClient, fromEnv, WaSdkError } from "../src/index.js";

const BASE = "https://gw.example.com";

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

  it("includes mediaUrl and replyTo only when provided", async () => {
    let body: any;
    const wa = clientWith(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return json({ success: true, data: { messageId: "m", toJid: "j" } });
    });
    await wa.sendMessage({
      to: "+62",
      message: "x",
      mediaUrl: "https://img/x.png",
      replyTo: { messageId: "q1", participant: "p@x" },
    });
    expect(body).toEqual({
      to: "+62",
      message: "x",
      mediaUrl: "https://img/x.png",
      replyTo: { messageId: "q1", participant: "p@x" },
    });

    // bare message omits mediaUrl/replyTo entirely
    let body2: any;
    vi.stubGlobal("fetch", async (_u: string, init: any) => {
      body2 = JSON.parse(init.body);
      return json({ success: true, data: { messageId: "m", toJid: "j" } });
    });
    await wa.sendMessage({ to: "+62", message: "x" });
    expect(body2).toEqual({ to: "+62", message: "x" });
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

  it("throws INVALID_REQUEST when replyTo lacks messageId", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendMessage({ to: "+62", message: "x", replyTo: {} as any }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("throws INVALID_REQUEST for a group reply without participant", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendMessage({
        to: "120363@g.us",
        message: "x",
        replyTo: { messageId: "q1" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("sendReaction", () => {
  it("POSTs to /camis-openclaw/send-reaction and resolves void", async () => {
    let captured: { url: string; body: any } | undefined;
    const wa = clientWith(async (url: string, init: any) => {
      captured = { url, body: JSON.parse(init.body) };
      return json({ success: true, data: { ok: true } });
    });
    await expect(
      wa.sendReaction({ to: "+62", messageId: "m1", emoji: "👍" }),
    ).resolves.toBeUndefined();
    expect(captured!.url).toBe(`${BASE}/camis-openclaw/send-reaction`);
    expect(captured!.body).toEqual({ to: "+62", messageId: "m1", emoji: "👍" });
  });

  it("sends an empty emoji (remove reaction)", async () => {
    let body: any;
    const wa = clientWith(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return json({ success: true, data: { ok: true } });
    });
    await wa.sendReaction({ to: "+62", messageId: "m1", emoji: "" });
    expect(body.emoji).toBe("");
  });

  it("requires participant for a group target", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendReaction({ to: "120363@g.us", messageId: "m1", emoji: "👍" }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("throws INVALID_REQUEST without messageId", async () => {
    const wa = clientWith(async () => json({}));
    await expect(
      wa.sendReaction({ to: "+62", messageId: "", emoji: "👍" } as any),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
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
    const wa = clientWith(async () =>
      json({ success: false, error: "bad input" }, 400),
    );
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

  it("builds a client from BASE_URL + API_TOKEN_WA", async () => {
    await withEnv(
      { BASE_URL: "https://env.example.com", API_TOKEN_WA: "envtok" },
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
    await withEnv({ BASE_URL: undefined, API_TOKEN_WA: undefined }, () => {
      try {
        fromEnv();
        throw new Error("should have thrown");
      } catch (e) {
        expect((e as WaSdkError).code).toBe("MISSING_CONFIG");
        expect((e as Error).message).toMatch(/BASE_URL/);
        expect((e as Error).message).toMatch(/API_TOKEN_WA/);
      }
    });
  });
});
