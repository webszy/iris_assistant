import { ERROR_CODES } from "./error-codes";
import { ServiceError } from "./service-error";

export const FX_RATE_SCALE = 100_000_000;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const DECIMAL = /^\d+(?:\.\d+)?$/;

// ISO-style contract: unlisted three-letter codes use two decimal places.
// No network/provider lookup is needed to interpret an already recorded amount.
const ZERO_DECIMAL = new Set("BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF".split(" "));
const THREE_DECIMAL = new Set("BHD IQD JOD KWD LYD OMR TND".split(" "));
const FOUR_DECIMAL = new Set(["CLF", "UYW"]);

export function normalizeCurrency(value: string): string {
  if (typeof value !== "string" || value.length !== 3 || !/^[A-Za-z]{3}$/.test(value)) {
    throw new ServiceError(ERROR_CODES.INVALID_CURRENCY, "币种必须是三个 ASCII 字母。");
  }
  return value.toUpperCase();
}

export function currencyMinorUnits(currency: string): number {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  if (FOUR_DECIMAL.has(code)) return 4;
  return 2;
}

function parsePositiveScaled(value: string, decimals: number, code: "INVALID_MONEY_AMOUNT" | "INVALID_EXCHANGE_RATE"): number {
  const invalid = () => new ServiceError(code, "数值必须为正十进制字符串，且精度和大小在支持范围内。");
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value || !DECIMAL.test(value)) throw invalid();
  const [whole = "", fraction = ""] = value.split(".");
  // Reject excess precision, even trailing zeroes; never silently round user input.
  if (fraction.length > decimals) throw invalid();
  const scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (scaled <= 0n || scaled > MAX_SAFE_INTEGER) throw invalid();
  // D1 binds numbers; conversion is exact only after this integer range check.
  return Number(scaled);
}

export function parseMoneyAmount(amount: string, currency: string): number {
  return parsePositiveScaled(amount, currencyMinorUnits(currency), ERROR_CODES.INVALID_MONEY_AMOUNT);
}

export function parseExchangeRate(rate: string): number {
  return parsePositiveScaled(rate, 8, ERROR_CODES.INVALID_EXCHANGE_RATE);
}

export function formatScaled(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, "0");
  return decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

export function formatMoneyAmount(amountMinor: bigint, currency: string): string {
  return formatScaled(amountMinor, currencyMinorUnits(currency));
}

export function formatExchangeRate(rateScaled: number): string {
  return formatScaled(BigInt(rateScaled), 8);
}

/** Positive rational -> nearest integer, ties upwards. Used for FX and each expense. */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error("Invalid positive rational");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function reportingAmountMinor(amountMinor: number, currency: string, reportingCurrency: string, rateScaled: number): bigint {
  return roundHalfUp(
    BigInt(amountMinor) * BigInt(rateScaled) * 10n ** BigInt(currencyMinorUnits(reportingCurrency)),
    BigInt(FX_RATE_SCALE) * 10n ** BigInt(currencyMinorUnits(currency)),
  );
}

/** Provider decimal (including JSON number exponent notation) -> inverse at 1e8. */
export function invertProviderRate(decimal: string): number {
  const invalid = () => new ServiceError(ERROR_CODES.INVALID_EXCHANGE_RATE, "汇率数据无法转换为有效定点值。");
  if (decimal.length > 128) throw invalid();
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(decimal);
  if (match === null || match[0] !== decimal) throw invalid();
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0") - fraction.length;
  if (Math.abs(exponent) > 400) throw invalid();
  let numerator = BigInt(`${match[1]}${fraction}`);
  let denominator = 1n;
  if (numerator <= 0n) throw invalid();
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  const inverse = roundHalfUp(BigInt(FX_RATE_SCALE) * denominator, numerator);
  if (inverse <= 0n || inverse > MAX_SAFE_INTEGER) throw invalid();
  return Number(inverse);
}
