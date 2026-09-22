import { Temporal } from "@js-temporal/polyfill";
import * as rruleModule from "rrule";
import { ServiceError } from "../lib/service-error";

// Node export scripts resolve the CJS entry; Workers bundlers resolve the ESM entry.
const RRule = rruleModule.RRule ?? (Reflect.get(rruleModule, "default") as typeof rruleModule).RRule;

export interface ReminderSchedule { startsAt: number; timezone: string; rrule: string | null }
const invalid = () => new ServiceError("INVALID_RRULE", "循环规则或起始时间无效。");

export function validateTimezone(timezone: string): void {
  try {
    // Temporal also accepts numeric offsets, which are not IANA zone identifiers.
    if (/^[+-]/.test(timezone)) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone);
  } catch { throw new ServiceError("INVALID_TIMEZONE", "请提供有效的 IANA 时区。"); }
}

const keys = ["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "COUNT", "UNTIL"];
function partsOf(input: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of input.trim().toUpperCase().split(";")) {
    const [key, value, extra] = part.split("=");
    if (!key || !value || extra !== undefined || !keys.includes(key) || parts.has(key)) throw invalid();
    parts.set(key, value);
  }
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(parts.get("FREQ") ?? "")) throw invalid();
  for (const key of ["COUNT", "INTERVAL"]) {
    const value = parts.get(key);
    if (value !== undefined) {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value < 1) throw invalid();
      parts.set(key, String(+value));
    }
  }
  if (parts.get("INTERVAL") === "1") parts.delete("INTERVAL");
  for (const [key, max, negative] of [["BYMONTH", 12, false], ["BYMONTHDAY", 31, true]] as const) {
    const value = parts.get(key);
    if (value === undefined) continue;
    const values = value.split(",");
    if (values.some(v => !/^[+-]?\d+$/.test(v) || +v === 0 || +v > max || +v < (negative ? -max : 1))) throw invalid();
    parts.set(key, [...new Set(values.map(Number))].sort((a, b) => a - b).join(","));
  }
  if (parts.has("BYDAY")) {
    const days = parts.get("BYDAY")!.split(",");
    for (const day of days) {
      const match = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(day);
      if (!match || (match[1] !== undefined && (+match[1] === 0 || Math.abs(+match[1]) > 53
        || !["MONTHLY", "YEARLY"].includes(parts.get("FREQ")!)))) throw invalid();
    }
    parts.set("BYDAY", [...new Set(days.map(d => d.replace(/^([+-]?\d+)/, n => String(Number(n)))))].sort().join(","));
  }
  if (parts.get("FREQ") === "WEEKLY" && parts.has("BYMONTHDAY")) throw invalid();
  if (parts.has("COUNT") && parts.has("UNTIL")) throw invalid();
  if (parts.has("UNTIL")) parseUntil(parts.get("UNTIL")!);
  return parts;
}

function parseUntil(value: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) throw invalid();
  try {
    return Temporal.Instant.from(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`).epochMilliseconds;
  } catch { throw invalid(); }
}

function wallTime(instant: number, timezone: string): number {
  const wall = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timezone).toPlainDateTime();
  return Date.parse(`${wall.toString()}Z`);
}

/** Floating UTC dates are only a transport for wall-clock fields, never actual instants. */
function resolveWall(wall: number, timezone: string): number | null {
  const plain = Temporal.PlainDateTime.from(new Date(wall).toISOString().slice(0, -1));
  const zoned = plain.toZonedDateTime(timezone, { disambiguation: "earlier" });
  return zoned.toPlainDateTime().equals(plain) ? zoned.epochMilliseconds : null;
}

function engine(schedule: ReminderSchedule) {
  const parts = partsOf(schedule.rrule!);
  const count = parts.has("COUNT") ? Number(parts.get("COUNT")) : null;
  const until = parts.has("UNTIL") ? parseUntil(parts.get("UNTIL")!) : null;
  parts.delete("COUNT");
  parts.delete("UNTIL");
  const start = wallTime(schedule.startsAt, schedule.timezone);
  const milliseconds = ((start % 1000) + 1000) % 1000;
  const options = RRule.parseString([...parts].map(([k, v]) => `${k}=${v}`).join(";"));
  const rule = new RRule({ ...options, dtstart: new Date(start - milliseconds) }, true);
  return { rule, count, until, milliseconds };
}

export function validateSchedule(schedule: ReminderSchedule): ReminderSchedule {
  validateTimezone(schedule.timezone);
  if (schedule.rrule === null) return schedule;
  try {
    const parts = partsOf(schedule.rrule);
    const canonical = keys.filter(k => parts.has(k)).map(k => `${k}=${parts.get(k)}`).join(";");
    const normalized = { ...schedule, rrule: canonical };
    // COUNT/UNTIL apply to the valid logical sequence, including its first member.
    if (nextRecurrence(normalized, schedule.startsAt - 1) !== schedule.startsAt) throw invalid();
    return normalized;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw invalid();
  }
}

/** Strictly after an absolute instant. Gaps don't consume COUNT; valid missed dates do. */
export function nextRecurrence(schedule: ReminderSchedule, after: number): number | null {
  if (schedule.rrule === null) return schedule.startsAt > after ? schedule.startsAt : null;
  const { rule, count, until, milliseconds } = engine(schedule);
  if (until !== null && after >= until) return null;
  let answer: number | null = null;
  if (count !== null) {
    let valid = 0;
    rule.all(date => {
      const instant = resolveWall(date.getTime() + milliseconds, schedule.timezone);
      if (instant === null) return true;
      if (until !== null && instant > until) return false;
      valid++;
      if (valid > count) return false;
      if (instant > after) { answer = instant; return false; }
      return valid < count;
    });
    return answer;
  }
  // Include nearby wall times across offset changes; filter by actual absolute time below.
  let cursor = new Date(wallTime(Math.max(after, schedule.startsAt - 1), schedule.timezone) - 172800000);
  for (;;) {
    const date = rule.after(cursor, false);
    if (date === null) return null;
    cursor = date;
    const instant = resolveWall(date.getTime() + milliseconds, schedule.timezone);
    if (instant === null) continue;
    if (until !== null && instant > until) return null;
    if (instant > after) return instant;
  }
}
