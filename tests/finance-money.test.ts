import { describe, expect, it } from "vitest";
import { currencyMinorUnits, formatExchangeRate, formatMoneyAmount, invertProviderRate, normalizeCurrency,
  parseExchangeRate, parseMoneyAmount, reportingAmountMinor, roundHalfUp } from "../src/lib/finance-money";

describe("Money / FX deterministic fixed point", () => {
  it.each([
    ["USD", "120.50", 12050, "120.50"], ["CNY", "120", 12000, "120.00"],
    ["JPY", "120", 120, "120"], ["KWD", "1.234", 1234, "1.234"], ["CLF", "1.2345", 12345, "1.2345"],
  ])("%s minor-unit round trip", (currency, amount, expected, formatted) => {
    expect(parseMoneyAmount(amount as string, currency as string)).toBe(expected);
    expect(formatMoneyAmount(BigInt(expected), currency as string)).toBe(formatted);
  });

  it.each(["0", "-1", "+1", "1e2", "NaN", "Infinity", " 1", "1 ", "1\n", "1\r\n", ".5", "1.", "", "1,000", "９", "90071992547409.92"])("reject invalid money %s", (value) => {
    expect(() => parseMoneyAmount(value, "USD")).toThrow(expect.objectContaining({ code: "INVALID_MONEY_AMOUNT" }));
  });
  it.each([["USD", "1.001"], ["CNY", "1.000"], ["JPY", "1.0"], ["KWD", "1.0001"]])("reject excess precision %s %s", (currency, value) => {
    expect(() => parseMoneyAmount(value, currency)).toThrow(expect.objectContaining({ code: "INVALID_MONEY_AMOUNT" }));
  });
  it("binds only exactly representable integers and formats totals beyond JS integer range", () => {
    expect(parseMoneyAmount("90071992547409.91", "USD")).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatMoneyAmount(18014398509481982n, "USD")).toBe("180143985094819.82");
  });
  it("normalizes ASCII only; unlisted 3-letter codes use the documented 2-decimal contract", () => {
    expect(normalizeCurrency("uSd")).toBe("USD");
    expect(currencyMinorUnits("ABC")).toBe(2);
    for (const value of ["$", "人民币", "US Dollar", "USDD", " US", "USD\n", "USD\r\n", "ＵＳＤ", "12A"]) {
      expect(() => normalizeCurrency(value)).toThrow(expect.objectContaining({ code: "INVALID_CURRENCY" }));
    }
  });
  it.each(["0", "-1", "1e2", "1\n", "7.123456789", "0.000000001", "90071992.54740992", "Infinity"])("reject invalid FX %s", (value) => {
    expect(() => parseExchangeRate(value)).toThrow(expect.objectContaining({ code: "INVALID_EXCHANGE_RATE" }));
  });
  it("FX scale and formatting are exactly eight decimals", () => {
    expect(parseExchangeRate("7.12345678")).toBe(712345678);
    expect(formatExchangeRate(parseExchangeRate("7.1843"))).toBe("7.18430000");
    expect(parseExchangeRate("0.00000001")).toBe(1);
  });
  it.each([["0.1404", 712250712], ["0.14", 714285714], ["2", 50000000], ["32", 3125000], ["1e-7", 1000000000000000], ["2e+8", 1]])("inverts %s with half-up rounding", (rate, expected) => {
    expect(invertProviderRate(rate as string)).toBe(expected);
  });
  it.each(["0", "-1", "1\n", "NaN", "Infinity", "1e-324", "1e309", "3e8", "1e999", "1e-999"])("reject invalid/unrepresentable inverse %s", (rate) => {
    expect(() => invertProviderRate(rate)).toThrow(expect.objectContaining({ code: "INVALID_EXCHANGE_RATE" }));
  });
  it("rounds a half-cent upward per expense, independent of input currency units", () => {
    expect(roundHalfUp(1n, 2n)).toBe(1n);
    expect(roundHalfUp(49n, 100n)).toBe(0n);
    expect(reportingAmountMinor(12050, "USD", "CNY", 712000000)).toBe(85796n);
    expect(reportingAmountMinor(1, "USD", "CNY", 150000000)).toBe(2n);
    expect(reportingAmountMinor(100, "JPY", "CNY", 5000000)).toBe(500n);
    expect(reportingAmountMinor(100, "USD", "JPY", 15050000000)).toBe(151n);
    expect(reportingAmountMinor(1234, "KWD", "CNY", 100000000)).toBe(123n);
  });
});
