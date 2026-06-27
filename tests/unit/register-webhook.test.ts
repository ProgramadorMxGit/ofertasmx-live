import { describe, expect, it, vi } from "vitest";

import {
  WEBHOOK_ALLOWED_UPDATES,
  buildWebhookUrl,
  runRegister,
  type RegisterFetchFn,
  type RegisterResponseLike,
} from "@/lib/telegram/register";

/**
 * Unit tests for the webhook registration core (Task 15.2, R2.4, R2.7).
 *
 * The network sits behind an injected `fetch` and the output behind an injected
 * `log` sink, so no real bot is contacted and no real secret is used. The key
 * assertions: the Bot Token and the `secret_token` never appear in any printed
 * line (R2.4), the correct `setWebhook`/`getWebhookInfo` calls + params are made
 * (R2.2, R2.3, R2.5), and a missing token aborts before any request (R2.7).
 */

// Clearly-fake sentinels — never real credentials. If either appears in printed
// output, a secret leaked (R2.4).
const FAKE_TOKEN = "123456:FAKE-bot-token-FOR-TESTS-DO-NOT-LOG";
const FAKE_SECRET = "fake-webhook-secret-FOR-TESTS-only";
const SITE_URL = "https://programadormx.online";
const API_BASE = "https://api.telegram.example";

interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  json?: unknown;
  throwJson?: boolean;
}

function fakeResponse(init: FakeResponseInit): RegisterResponseLike {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => {
      if (init.throwJson === true) throw new Error("bad json");
      return init.json;
    },
  };
}

interface FetchCall {
  url: string;
  init: { method: string; headers?: Record<string, string>; body?: string };
}

/** Records every fetch and answers with `responder(url)`. */
function makeFetch(responder: (url: string) => RegisterResponseLike): {
  fetch: RegisterFetchFn;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetch = vi.fn<RegisterFetchFn>(async (url, init) => {
    calls.push({ url, init });
    return responder(url);
  });
  return { fetch, calls };
}

/** A log sink that collects every emitted line. */
function makeLog(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

function setOk(url: string): RegisterResponseLike {
  if (url.includes("/setWebhook")) {
    return fakeResponse({ json: { ok: true, result: true, description: "Webhook was set" } });
  }
  return fakeResponse({ json: { ok: true, result: true } });
}

function statusOk(_url: string): RegisterResponseLike {
  return fakeResponse({
    json: {
      ok: true,
      result: {
        url: `${SITE_URL}/api/telegram/webhook`,
        pending_update_count: 3,
        last_error_message: "wrong response from the webhook",
        last_error_date: 1_700_000_000,
      },
    },
  });
}

describe("buildWebhookUrl", () => {
  it("appends the webhook path and trims trailing slashes", () => {
    expect(buildWebhookUrl(SITE_URL)).toBe(`${SITE_URL}/api/telegram/webhook`);
    expect(buildWebhookUrl(`${SITE_URL}/`)).toBe(`${SITE_URL}/api/telegram/webhook`);
  });
});

describe("runRegister — missing token aborts (R2.7)", () => {
  it("aborts with exit code 1 and never contacts Telegram when the token is undefined", async () => {
    const { fetch, calls } = makeFetch(setOk);
    const { log, lines } = makeLog();

    const result = await runRegister({
      mode: "set",
      token: undefined,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
    });

    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(0);
    // A clear error names the variable, never a secret value.
    expect(lines.join("\n")).toContain("TELEGRAM_BOT_TOKEN");
    expect(lines.join("\n")).not.toContain(FAKE_SECRET);
  });

  it("treats an empty/whitespace token as missing", async () => {
    const { fetch, calls } = makeFetch(setOk);
    const { log } = makeLog();

    const result = await runRegister({
      mode: "set",
      token: "   ",
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
    });

    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(0);
  });
});

describe("runRegister — set mode (R2.2, R2.3)", () => {
  it("calls setWebhook with the URL, secret_token and the minimal allowed_updates", async () => {
    const { fetch, calls } = makeFetch(setOk);
    const { log } = makeLog();

    const result = await runRegister({
      mode: "set",
      token: FAKE_TOKEN,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
      apiBaseUrl: API_BASE,
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);

    // The token IS used to build the API URL (server-side, in memory)...
    expect(calls[0].url).toBe(`${API_BASE}/bot${FAKE_TOKEN}/setWebhook`);
    expect(calls[0].init.method).toBe("POST");

    const body = JSON.parse(calls[0].init.body ?? "{}") as {
      url: string;
      secret_token: string;
      allowed_updates: string[];
    };
    expect(body.url).toBe(`${SITE_URL}/api/telegram/webhook`);
    // The secret_token IS sent to Telegram (that is the whole point, R2.2)...
    expect(body.secret_token).toBe(FAKE_SECRET);
    // ...with only the minimal update types (R2.3).
    expect(body.allowed_updates).toEqual([...WEBHOOK_ALLOWED_UPDATES]);
    expect(body.allowed_updates).toEqual([
      "message",
      "edited_message",
      "channel_post",
      "edited_channel_post",
    ]);
  });

  it("never prints the bot token nor the secret_token (R2.4)", async () => {
    const { fetch } = makeFetch(setOk);
    const { log, lines } = makeLog();

    await runRegister({
      mode: "set",
      token: FAKE_TOKEN,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
      apiBaseUrl: API_BASE,
    });

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(FAKE_TOKEN);
      expect(line).not.toContain(FAKE_SECRET);
    }
    // It does confirm success + the (safe) public URL.
    const joined = lines.join("\n");
    expect(joined).toContain("successfully");
    expect(joined).toContain(`${SITE_URL}/api/telegram/webhook`);
  });

  it("reports a non-zero exit code and a reason when Telegram rejects the call", async () => {
    const { fetch } = makeFetch(() =>
      fakeResponse({ ok: false, status: 401, json: { ok: false, description: "Unauthorized" } }),
    );
    const { log, lines } = makeLog();

    const result = await runRegister({
      mode: "set",
      token: FAKE_TOKEN,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
    });

    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("Failed to set webhook");
    for (const line of lines) {
      expect(line).not.toContain(FAKE_TOKEN);
      expect(line).not.toContain(FAKE_SECRET);
    }
  });
});

describe("runRegister — status mode (R2.5)", () => {
  it("calls getWebhookInfo and prints URL, pending count and last error without secrets", async () => {
    const { fetch, calls } = makeFetch(statusOk);
    const { log, lines } = makeLog();

    const result = await runRegister({
      mode: "status",
      token: FAKE_TOKEN,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
      apiBaseUrl: API_BASE,
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_BASE}/bot${FAKE_TOKEN}/getWebhookInfo`);
    expect(calls[0].init.method).toBe("GET");

    const joined = lines.join("\n");
    expect(joined).toContain(`${SITE_URL}/api/telegram/webhook`);
    expect(joined).toContain("3"); // pending_update_count
    expect(joined).toContain("wrong response from the webhook"); // last error
    for (const line of lines) {
      expect(line).not.toContain(FAKE_TOKEN);
      expect(line).not.toContain(FAKE_SECRET);
    }
  });
});

describe("runRegister — unknown mode", () => {
  it("prints usage and exits non-zero without contacting Telegram", async () => {
    const { fetch, calls } = makeFetch(setOk);
    const { log, lines } = makeLog();

    const result = await runRegister({
      mode: undefined,
      token: FAKE_TOKEN,
      webhookSecret: FAKE_SECRET,
      siteUrl: SITE_URL,
      fetch,
      log,
    });

    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(0);
    expect(lines.join("\n")).toContain("Usage");
  });
});
