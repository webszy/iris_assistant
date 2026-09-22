import { env } from "cloudflare:test";
import { asc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/db";
import { exchangeRates } from "../src/db/schema";
import worker from "../src/index";
import { FrankfurterExchangeRateProvider } from "../src/providers/frankfurter";
import { listExchangeRates, syncExchangeRates } from "../src/services/exchange-rates";
import { financeFixture, seedRate } from "./finance-fixture";

const row = (base = "CNY", quote = "USD", rate = 0.1404, date = "2026-09-21") => ({ base, quote, rate, date });
const snapshot = () => createDb(env.DB).select().from(exchangeRates).orderBy(asc(exchangeRates.baseCurrency), asc(exchangeRates.quoteCurrency));
function provider(payload: unknown, status = 200) {
  const request = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  return { provider: new FrankfurterExchangeRateProvider(request), request };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-22T20:00:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected live FX request"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Frankfurter v2 provider", () => {
  it("uses /v2/rates?base, no API key, and preserves each row's date", async () => {
    const p = provider([row(), row("CNY", "JPY", 20, "2026-09-18")]);
    expect(await p.provider.getLatestRates("cny")).toEqual([
      { baseCurrency: "CNY", quoteCurrency: "USD", rate: "0.1404", rateDate: "2026-09-21" },
      { baseCurrency: "CNY", quoteCurrency: "JPY", rate: "20", rateDate: "2026-09-18" },
    ]);
    expect(p.request).toHaveBeenCalledOnce();
    expect(p.request.mock.calls[0]?.[0]).toBe("https://api.frankfurter.dev/v2/rates?base=CNY");
    expect(p.request.mock.calls[0]?.[1]?.headers).toEqual({ Accept: "application/json" });
    expect(p.request.mock.calls[0]?.[1]?.signal).toBeDefined();
  });
  it.each([400, 404, 422, 429, 500])("rejects provider HTTP %s without exposing body", async (status) => {
    const p = provider({ message: "private provider detail" }, status);
    await expect(p.provider.getLatestRates("CNY")).rejects.toThrow("FX provider HTTP failure");
  });
  it.each([
    [], { rates: { USD: 0.14 } }, [row("USD")], [row("CNY", "CNY")], [row(), row()],
    [row(), row("CNY", "EUR", 0)], [row("CNY", "USD", -1)], [row("CNY", "USD", 1, "2026-02-30")],
    [{ ...row(), rate: "0.14" }], [{ ...row(), quote: "USDD" }], [{ base: "CNY", quote: "USD", rate: 0.14 }],
  ].map((payload) => ({ payload })))("rejects malformed, duplicate or partial-invalid response $payload", async ({ payload }) => {
    await expect(provider(payload).provider.getLatestRates("CNY")).rejects.toThrow();
  });
});

describe("FX sync failure safety", () => {
  it("does not fetch when there are no settings", async () => {
    const p = provider([row()]);
    expect(await syncExchangeRates(createDb(env.DB), p.provider)).toEqual({ succeeded: 0, failed: 0, rateCount: 0 });
    expect(p.request).not.toHaveBeenCalled();
  });
  it("deduplicates users' reporting currencies and atomically upserts inverted current rates", async () => {
    const f = await financeFixture();
    await financeFixture();
    await seedRate("USD", "CNY", "7");
    const p = provider([row(), row("CNY", "JPY", 20, "2026-09-18")]);
    const before = Date.now();
    expect(await syncExchangeRates(f.db, p.provider)).toEqual({ succeeded: 1, failed: 0, rateCount: 2 });
    expect(p.request).toHaveBeenCalledOnce();
    const saved = await snapshot();
    expect(saved).toHaveLength(2);
    const usd = saved.find((r) => r.baseCurrency === "USD");
    expect(usd).toMatchObject({ quoteCurrency: "CNY", rateScaled: 712250712, source: "frankfurter", rateDate: "2026-09-21" });
    expect(usd?.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(usd?.updatedAt).toBe(usd?.fetchedAt);
    expect(saved.find((r) => r.baseCurrency === "JPY")).toMatchObject({ quoteCurrency: "CNY", rateScaled: 5000000, rateDate: "2026-09-18" });
    const read = await listExchangeRates(f.db, { base_currency: "USD", quote_currency: "CNY" });
    expect(read[0]?.rate).toBe("7.12250712");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"event":"fx_sync_success"'));
  });
  it("requests each distinct reporting currency once", async () => {
    const f = await financeFixture();
    await financeFixture("USD");
    await financeFixture("USD");
    const request = vi.fn<typeof fetch>(async (url) => Response.json(String(url).endsWith("base=CNY") ? [row()] : [row("USD", "CNY", 7.12)]));
    expect(await syncExchangeRates(f.db, new FrankfurterExchangeRateProvider(request))).toMatchObject({ succeeded: 2, failed: 0 });
    expect(request.mock.calls.map(([url]) => url)).toEqual(["https://api.frankfurter.dev/v2/rates?base=CNY", "https://api.frankfurter.dev/v2/rates?base=USD"]);
    expect(await snapshot()).toHaveLength(2);
  });
  it.each([
    { kind: "HTTP", payload: { message: "provider private detail" }, status: 500 },
    { kind: "invalid shape", payload: { rates: [] }, status: 200 },
    { kind: "empty", payload: [], status: 200 },
    { kind: "invalid second row", payload: [row(), row("CNY", "EUR", 0)], status: 200 },
    { kind: "unrepresentable inverse", payload: [row(), row("CNY", "EUR", 1e-300)], status: 200 },
    { kind: "zero after rounding", payload: [row(), row("CNY", "EUR", 1e20)], status: 200 },
  ])("$kind failure leaves the complete previous cache unchanged", async ({ payload, status }) => {
    const f = await financeFixture();
    await seedRate();
    await seedRate("EUR", "CNY", "8");
    const before = await snapshot();
    expect(await syncExchangeRates(f.db, provider(payload, status).provider)).toEqual({ succeeded: 0, failed: 1, rateCount: 0 });
    expect(await snapshot()).toEqual(before);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"event":"fx_sync_failure"'));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("provider private detail");
  });
  it("network failure and malformed JSON preserve cached rates", async () => {
    const f = await financeFixture();
    await seedRate();
    const before = await snapshot();
    const requests = [
      vi.fn<typeof fetch>(async () => { throw new Error("network unavailable"); }),
      vi.fn<typeof fetch>(async () => new Response("{malformed")),
    ];
    for (const request of requests) {
      expect(await syncExchangeRates(f.db, new FrankfurterExchangeRateProvider(request))).toMatchObject({ failed: 1 });
      expect(await snapshot()).toEqual(before);
    }
  });
  it("failure for one reporting currency retains its rates and still syncs another", async () => {
    const f = await financeFixture();
    await financeFixture("USD");
    await seedRate();
    const before = (await snapshot())[0];
    const request = vi.fn<typeof fetch>(async (url) => String(url).endsWith("base=CNY")
      ? Response.json({ message: "unavailable" }, { status: 500 }) : Response.json([row("USD", "CNY", 7.12)]));
    expect(await syncExchangeRates(f.db, new FrankfurterExchangeRateProvider(request))).toEqual({ succeeded: 1, failed: 1, rateCount: 1 });
    expect((await snapshot()).find((r) => r.baseCurrency === "USD")).toEqual(before);
    expect((await snapshot()).find((r) => r.baseCurrency === "CNY")).toBeDefined();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not regress a cache entry to an older provider date", async () => {
    const f = await financeFixture();
    await seedRate();
    const before = await snapshot();
    await syncExchangeRates(f.db, provider([row("CNY", "USD", 0.1, "2026-09-20")]).provider);
    expect(await snapshot()).toEqual(before);
  });
  it("a D1 failure on the second pair rolls back the first upsert", async () => {
    const f = await financeFixture();
    await seedRate();
    const before = await snapshot();
    await env.DB.exec("CREATE TRIGGER reject_test_fx BEFORE INSERT ON exchange_rates WHEN NEW.base_currency = 'EUR' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    try {
      expect(await syncExchangeRates(f.db, provider([row(), row("CNY", "EUR", 0.125)]).provider)).toMatchObject({ failed: 1 });
      expect(await snapshot()).toEqual(before);
    } finally {
      await env.DB.exec("DROP TRIGGER reject_test_fx;");
    }
  });
});

describe("scheduled entrypoint (mocked fetch only)", () => {
  it("runs sync against local test D1 while retaining the Hono fetch handler", async () => {
    await financeFixture();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json([row()])));
    await worker.scheduled({ cron: "0 20 * * *" } as ScheduledController, env);
    expect(await snapshot()).toHaveLength(1);
    const response = await worker.fetch(new Request("https://iris.test/health"), env);
    expect(response.status).toBe(200);
  });
  it("marks scheduled invocation failed after retaining old rates", async () => {
    await financeFixture();
    await seedRate();
    const before = await snapshot();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ message: "down" }, { status: 500 })));
    await expect(worker.scheduled({ cron: "0 20 * * *" } as ScheduledController, env)).rejects.toThrow("FX sync failed");
    expect(await snapshot()).toEqual(before);
  });
});
