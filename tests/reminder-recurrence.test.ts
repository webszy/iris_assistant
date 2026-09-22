import { describe, expect, it } from "vitest";
import { nextRecurrence, validateSchedule } from "../src/services/recurrence";
const ms = Date.parse;
const schedule = (starts: string, rrule: string, timezone = "Asia/Shanghai") => validateSchedule({ startsAt: ms(starts), rrule, timezone });
const next = (s: ReturnType<typeof schedule>, after: string) => { const n = nextRecurrence(s, ms(after)); return n === null ? null : new Date(n).toISOString(); };
describe("Reminder logical recurrence in Workers", () => {
  it.each([
    ["FREQ=DAILY", "2026-09-24T12:00:00.000Z"],
    ["FREQ=WEEKLY;BYDAY=WE", "2026-09-30T12:00:00.000Z"],
    ["FREQ=MONTHLY;BYMONTHDAY=23", "2026-10-23T12:00:00.000Z"],
    ["FREQ=YEARLY;BYMONTH=9", "2027-09-23T12:00:00.000Z"],
    ["FREQ=DAILY;INTERVAL=2", "2026-09-25T12:00:00.000Z"],
  ])("supports %s", (rrule, expected) => {
    expect(next(schedule("2026-09-23T20:00:00+08:00", rrule), "2026-09-23T12:00:00Z")).toBe(expected);
  });
  it("skips spring gaps without consuming COUNT", () => {
    const s = schedule("2026-03-07T02:30:00-05:00", "FREQ=DAILY;COUNT=3", "America/New_York");
    expect(next(s, "2026-03-07T07:30:00Z")).toBe("2026-03-09T06:30:00.000Z");
    expect(next(s, "2026-03-09T06:30:00Z")).toBe("2026-03-10T06:30:00.000Z");
    expect(next(s, "2026-03-10T06:30:00Z")).toBeNull();
  });
  it("uses the first fall-back instant and rejects the second as anchor", () => {
    const s = schedule("2026-10-31T01:30:00-04:00", "FREQ=DAILY", "America/New_York");
    expect(next(s, "2026-10-31T05:30:00Z")).toBe("2026-11-01T05:30:00.000Z");
    expect(next(s, "2026-11-01T05:30:00Z")).toBe("2026-11-02T06:30:00.000Z");
    expect(() => schedule("2026-11-01T01:30:00-05:00", "FREQ=DAILY", "America/New_York")).toThrow();
  });
  it("skips nonexistent month days, supports ordinals and leap years", () => {
    expect(next(schedule("2026-01-31T20:00:00+08:00", "FREQ=MONTHLY;COUNT=2"), "2026-01-31T12:00:00Z")).toBe("2026-03-31T12:00:00.000Z");
    expect(next(schedule("2026-09-28T20:00:00+08:00", "FREQ=MONTHLY;BYDAY=-1MO"), "2026-09-28T12:00:00Z")).toBe("2026-10-26T12:00:00.000Z");
    expect(next(schedule("2024-02-29T20:00:00+08:00", "FREQ=YEARLY;COUNT=2"), "2024-02-29T12:00:00Z")).toBe("2028-02-29T12:00:00.000Z");
  });
  it("COUNT counts valid missed dates, UNTIL is inclusive absolute time", () => {
    expect(next(schedule("2026-09-20T20:00:00+08:00", "FREQ=DAILY;COUNT=3"), "2026-09-23T00:00:00Z")).toBeNull();
    const s = schedule("2026-09-23T20:00:00+08:00", "FREQ=DAILY;UNTIL=20260924T120000Z");
    expect(next(s, "2026-09-23T12:00:00Z")).toBe("2026-09-24T12:00:00.000Z");
    expect(next(s, "2026-09-24T12:00:00Z")).toBeNull();
  });
  it("preserves milliseconds and accepts Z even for another zone", () => {
    const s = schedule("2026-09-23T12:00:00.123Z", "FREQ=DAILY");
    expect(next(s, "2026-09-23T12:00:00.123Z")).toBe("2026-09-24T12:00:00.123Z");
  });
  it.each(["FREQ=HOURLY", "FREQ=WEEKLY;BYDAY=MO", "FREQ=DAILY;COUNT=0", "FREQ=DAILY;COUNT=2;UNTIL=20260924T120000Z", "FREQ=DAILY;BYMONTH=13", "FREQ=DAILY;X=1", "FREQ=DAILY;FREQ=DAILY", "FREQ=DAILY;UNTIL=20260230T000000Z", "FREQ=DAILY;UNTIL=20260922T000000Z"])("rejects invalid rule or anchor %s", rrule => {
    expect(() => schedule("2026-09-23T12:00:00Z", rrule)).toThrow();
  });
  it("validates zones and normalizes equivalent RRULE order/defaults", () => {
    expect(() => schedule("2026-09-23T12:00:00Z", "FREQ=DAILY", "UTC+8")).toThrow();
    expect(schedule("2026-09-23T12:00:00Z", "interval=01;freq=daily").rrule).toBe("FREQ=DAILY");
  });
});
