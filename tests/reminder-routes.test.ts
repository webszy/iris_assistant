import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { apiFetch, readJson, seedIdentity } from "./helpers";
import { reminderFixture, NOW } from "./reminder-fixture";
const body = { title: "提交资料", starts_at: "2026-09-24T15:00:00+08:00", timezone: "Asia/Shanghai" };
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => vi.restoreAllMocks());
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ success: false, error: { code } });
}
describe("Reminder HTTP contract", () => {
  it("requires Bearer on root and nested paths", async () => {
    for (const path of ["/api/v1/reminders", "/api/v1/reminders/x", "/api/v1/reminders/x/occurrences", "/api/v1/reminders/x/occurrences/y/done"]) {
      await error(await apiFetch(path, { method: path.endsWith("done") ? "POST" : "GET" }), 401, "UNAUTHORIZED");
    }
  });
  it("creates snake_case requests with camelCase response, filters and nested routing", async () => {
    const identity = await seedIdentity();
    const token = identity.rawToken;
    const result = await apiFetch("/api/v1/reminders", { method: "POST", token, body });
    expect(result.status).toBe(201);
    const payload = await readJson<{ success: boolean; data: { id: string; startsAt: string; nextTriggerAt: string; scheduleVersion: number } }>(result);
    expect(payload).toMatchObject({ success: true, data: { startsAt: "2026-09-24T07:00:00.000Z", nextTriggerAt: "2026-09-24T07:00:00.000Z", scheduleVersion: 1 } });
    expect(payload.data).not.toHaveProperty("starts_at");
    expect(payload.data).not.toHaveProperty("userId");
    expect(await (await apiFetch("/api/v1/reminders?status=active", { token })).json()).toMatchObject({ data: [{ id: payload.data.id }] });
    expect((await apiFetch(`/api/v1/reminders/${payload.data.id}/occurrences?status=pending`, { token })).status).toBe(200);
    expect((await apiFetch(`/api/v1/reminders/${payload.data.id}`, { token })).status).toBe(200);
  });
  it.each([
    [{ startsAt: body.starts_at }, 400, "BAD_REQUEST"], [{ task_id: "x" }, 400, "BAD_REQUEST"],
    [{ status: "completed" }, 400, "BAD_REQUEST"], [{ user_id: "x" }, 400, "BAD_REQUEST"],
    [{ starts_at: "tomorrow" }, 400, "BAD_REQUEST"], [{ starts_at: "2026-09-23T12:00:00" }, 400, "BAD_REQUEST"],
    [{ timezone: "GMT-5" }, 422, "INVALID_TIMEZONE"], [{ rrule: "FREQ=WEEKLY;BYDAY=MO" }, 422, "INVALID_RRULE"],
  ] as const)("rejects invalid create %j", async (patch, status, code) => {
    const user = await seedIdentity();
    await error(await apiFetch("/api/v1/reminders", { method: "POST", token: user.rawToken, body: { ...body, ...patch } }), status, code);
  });
  it("covers actions with empty bodies, rejects unknown fields, and preserves envelopes", async () => {
    const f = await reminderFixture();
    const token = f.identity.rawToken;
    const base = `/api/v1/reminders/${f.reminder.id}`;
    const occurrence = `${base}/occurrences/${f.occurrence.id}`;
    await error(await apiFetch(`${occurrence}/delay`, { method: "POST", token, body: { until: "2026-09-24T00:00:00Z", x: 1 } }), 400, "BAD_REQUEST");
    await error(await apiFetch(`${occurrence}/done`, { method: "POST", token, body: { x: 1 } }), 400, "BAD_REQUEST");
    await error(await apiFetch(base, { method: "PATCH", token, body: { schedule_version: 2 } }), 400, "BAD_REQUEST");
    expect((await apiFetch(base, { method: "PATCH", token, body: { title: "Changed" } })).status).toBe(200);
    expect(await (await apiFetch(`${occurrence}/delay`, { method: "POST", token, body: { until: "2026-09-24T00:00:00Z" } })).json()).toMatchObject({ success: true, data: { triggerVersion: 2 } });
    expect(await (await apiFetch(`${occurrence}/done`, { method: "POST", token })).json()).toMatchObject({ success: true, data: { status: "done" } });
    expect((await apiFetch(`${occurrence}/done`, { method: "POST", token, body: {} })).status).toBe(200);
    await error(await apiFetch(`${occurrence}/skip`, { method: "POST", token }), 409, "INVALID_OCCURRENCE_STATE");
    expect((await apiFetch(`${base}/cancel`, { method: "POST", token })).status).toBe(200);
    await error(await apiFetch(base, { method: "DELETE", token }), 404, "NOT_FOUND");
    await error(await apiFetch(`${occurrence}/snooze`, { method: "POST", token }), 404, "NOT_FOUND");
  });
  it("supports SKIP, rejects reversed ranges, isolates users and nested parents", async () => {
    const f = await reminderFixture();
    const other = await reminderFixture();
    const base = `/api/v1/reminders/${f.reminder.id}`;
    await error(await apiFetch(base, { token: other.identity.rawToken }), 404, "REMINDER_NOT_FOUND");
    await error(await apiFetch(`${base}/occurrences/${other.occurrence.id}`, { token: f.identity.rawToken }), 404, "REMINDER_OCCURRENCE_NOT_FOUND");
    await error(await apiFetch(`${base}/occurrences?from=2026-09-25T00:00:00Z&to=2026-09-20T00:00:00Z`, { token: f.identity.rawToken }), 400, "BAD_REQUEST");
    expect(await (await apiFetch(`${base}/occurrences/${f.occurrence.id}/skip`, { method: "POST", token: f.identity.rawToken })).json()).toMatchObject({ data: { status: "skipped" } });
  });
  it("OpenAPI documents all ten operations, version fields and strict schemas", async () => {
    const res = await createApp().request("/openapi.json");
    const doc = await readJson<{ paths: Record<string, Record<string, { security?: unknown }>>; components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean }> } }>(res);
    const reminderPaths = Object.entries(doc.paths).filter(([p]) => p.startsWith("/api/v1/reminders"));
    expect(reminderPaths.flatMap(([, p]) => Object.keys(p))).toHaveLength(10);
    for (const [, path] of reminderPaths) for (const operation of Object.values(path)) expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.components.schemas.Reminder?.properties).toHaveProperty("scheduleVersion");
    expect(doc.components.schemas.ReminderOccurrence?.properties).toHaveProperty("triggerVersion");
    expect(doc.components.schemas.CreateReminderRequest?.additionalProperties).toBe(false);
  });
});
