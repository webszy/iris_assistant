import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../db";
import { reminders, reminderOccurrences, type ReminderRow, type ReminderOccurrenceRow } from "../db/schema";
import { ServiceError } from "../lib/service-error";
import { nowEpochMs, toIso8601Utc } from "../lib/time";
import type { CreateReminder, PatchReminder, ReminderListQuery, OccurrenceListQuery } from "../schemas/reminder";
import { findUserProject } from "./projects";
import { nextRecurrence, validateSchedule } from "./recurrence";

const iso = (n: number | null) => n === null ? null : toIso8601Utc(n);
export const reminderScope = (userId: string, id: string) => and(eq(reminders.userId, userId), eq(reminders.id, id));
export async function requireReminder(db: Database, userId: string, id: string): Promise<ReminderRow> {
  const [row] = await db.select().from(reminders).where(reminderScope(userId, id));
  if (!row) throw new ServiceError("REMINDER_NOT_FOUND", "Reminder 不存在。");
  return row;
}
export async function requireOccurrence(db: Database, userId: string, reminderId: string, id: string): Promise<ReminderOccurrenceRow> {
  const [row] = await db.select().from(reminderOccurrences).where(and(eq(reminderOccurrences.userId, userId),
    eq(reminderOccurrences.reminderId, reminderId), eq(reminderOccurrences.id, id)));
  if (!row) throw new ServiceError("REMINDER_OCCURRENCE_NOT_FOUND", "Reminder occurrence 不存在。");
  return row;
}
function toReminder(row: ReminderRow, next: number | null) {
  return { id: row.id, projectId: row.projectId, title: row.title, description: row.description, status: row.status,
    startsAt: toIso8601Utc(row.startsAt), timezone: row.timezone, rrule: row.rrule, scheduleVersion: row.scheduleVersion,
    nextTriggerAt: iso(next), createdAt: toIso8601Utc(row.createdAt), updatedAt: toIso8601Utc(row.updatedAt),
    completedAt: iso(row.completedAt), cancelledAt: iso(row.cancelledAt) };
}
export function toOccurrence(row: ReminderOccurrenceRow) {
  return { id: row.id, reminderId: row.reminderId, scheduleVersion: row.scheduleVersion, scheduledFor: toIso8601Utc(row.scheduledFor),
    triggerAt: toIso8601Utc(row.triggerAt), triggerVersion: row.triggerVersion, status: row.status, triggerCount: row.triggerCount,
    lastTriggeredAt: iso(row.lastTriggeredAt), handledAt: iso(row.handledAt), createdAt: toIso8601Utc(row.createdAt), updatedAt: toIso8601Utc(row.updatedAt) };
}
const nextTrigger = sql<number | null>`(SELECT min(trigger_at) FROM reminder_occurrences WHERE reminder_id = reminders.id AND user_id = reminders.user_id AND status = 'pending')`;
export async function getReminder(db: Database, userId: string, id: string) {
  const [result] = await db.select({ row: reminders, next: nextTrigger }).from(reminders).where(reminderScope(userId, id));
  if (!result) throw new ServiceError("REMINDER_NOT_FOUND", "Reminder 不存在。");
  return toReminder(result.row, result.next);
}
export async function listReminders(db: Database, userId: string, query: ReminderListQuery) {
  const filters = [eq(reminders.userId, userId)];
  if (query.status) filters.push(eq(reminders.status, query.status));
  if (query.project_id) {
    await verifyProject(db, userId, query.project_id);
    filters.push(eq(reminders.projectId, query.project_id));
  }
  const rows = await db.select({ row: reminders, next: nextTrigger }).from(reminders).where(and(...filters)).orderBy(desc(reminders.createdAt), asc(reminders.id));
  return rows.map(r => toReminder(r.row, r.next));
}
export async function getOccurrence(db: Database, userId: string, reminderId: string, id: string) {
  await requireReminder(db, userId, reminderId);
  return toOccurrence(await requireOccurrence(db, userId, reminderId, id));
}
export async function listOccurrences(db: Database, userId: string, reminderId: string, query: OccurrenceListQuery) {
  await requireReminder(db, userId, reminderId);
  const filters = [eq(reminderOccurrences.userId, userId), eq(reminderOccurrences.reminderId, reminderId)];
  if (query.status) filters.push(eq(reminderOccurrences.status, query.status));
  if (query.from) filters.push(gte(reminderOccurrences.scheduledFor, Date.parse(query.from)));
  if (query.to) filters.push(lte(reminderOccurrences.scheduledFor, Date.parse(query.to)));
  return (await db.select().from(reminderOccurrences).where(and(...filters))
    .orderBy(asc(reminderOccurrences.scheduledFor), asc(reminderOccurrences.scheduleVersion))).map(toOccurrence);
}
async function verifyProject(db: Database, userId: string, projectId: string | null | undefined) {
  if (projectId && !await findUserProject(db, userId, projectId)) throw new ServiceError("PROJECT_NOT_FOUND", "Project 不存在。");
}

/** The fence is acquired and released by the atomic batch itself, never a durable lease. */
export class ReminderMutation {
  readonly token = crypto.randomUUID();
  readonly statements: D1PreparedStatement[];
  readonly predicate: { sql: string; bindings: (string | number | null)[] };
  constructor(readonly db: Database, readonly parent: ReminderRow, readonly now: number) {
    this.predicate = { sql: "EXISTS (SELECT 1 FROM reminders WHERE id = ? AND user_id = ? AND mutation_token = ?)",
      bindings: [parent.id, parent.userId, this.token] };
    this.statements = [db.$client.prepare("UPDATE reminders SET mutation_token = ?, updated_at = ? WHERE id = ? AND user_id = ? AND mutation_token = ?")
      .bind(this.token, now, parent.id, parent.userId, parent.mutationToken)];
  }
  add(text: string, bindings: (string | number | null)[] = []) {
    this.statements.push(this.db.$client.prepare(`${text} AND ${this.predicate.sql}`).bind(...bindings, ...this.predicate.bindings));
  }
  insertOccurrence(time: number, version = this.parent.scheduleVersion) {
    this.add(`INSERT INTO reminder_occurrences
      (id,user_id,reminder_id,schedule_version,scheduled_for,trigger_at,trigger_version,status,trigger_count,created_at,updated_at)
      SELECT ?,?,?,?,?,?,1,'pending',0,?,? WHERE 1=1`,
    [crypto.randomUUID(), this.parent.userId, this.parent.id, version, time, time, this.now, this.now]);
  }
  completeIfSettled() {
    this.add(`UPDATE reminders SET status = 'completed', completed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'active'
      AND NOT EXISTS (SELECT 1 FROM reminder_occurrences WHERE reminder_id = ? AND status IN ('pending','triggered'))`,
    [this.now, this.now, this.parent.id, this.parent.userId, this.parent.id]);
  }
  async commit(): Promise<boolean> {
    const results = await this.db.$client.batch(this.statements);
    return results[0]?.meta.changes === 1;
  }
}

export async function createReminder(db: Database, userId: string, body: CreateReminder) {
  const schedule = validateSchedule({ startsAt: Date.parse(body.starts_at), timezone: body.timezone, rrule: body.rrule ?? null });
  await verifyProject(db, userId, body.project_id);
  const id = crypto.randomUUID();
  const now = nowEpochMs();
  await db.batch([
    db.insert(reminders).values({ id, userId, projectId: body.project_id ?? null, title: body.title, description: body.description ?? null,
      ...schedule, scheduleVersion: 1, mutationToken: crypto.randomUUID(), createdAt: now, updatedAt: now }),
    db.insert(reminderOccurrences).values({ id: crypto.randomUUID(), userId, reminderId: id, scheduleVersion: 1,
      scheduledFor: schedule.startsAt, triggerAt: schedule.startsAt, createdAt: now, updatedAt: now }),
  ]);
  return getReminder(db, userId, id);
}

/** Every writer fences the parent, so a stale read can only cause a harmless retry. */
export async function patchReminder(db: Database, userId: string, id: string, body: PatchReminder) {
  await verifyProject(db, userId, body.project_id);
  for (let retry = 0; retry < 16; retry++) {
    const p = await requireReminder(db, userId, id);
    const schedule = validateSchedule({ startsAt: body.starts_at === undefined ? p.startsAt : Date.parse(body.starts_at),
      timezone: body.timezone ?? p.timezone, rrule: body.rrule === undefined ? p.rrule : body.rrule });
    const changed = schedule.startsAt !== p.startsAt || schedule.timezone !== p.timezone || schedule.rrule !== p.rrule;
    if (changed && p.status !== "active") throw new ServiceError("INVALID_REMINDER_STATE", "已结束或取消的 Reminder 不能重新调度。");
    const title = body.title ?? p.title;
    const description = body.description === undefined ? p.description : body.description;
    const project = body.project_id === undefined ? p.projectId : body.project_id;
    if (!changed && title === p.title && description === p.description && project === p.projectId) return getReminder(db, userId, id);
    const now = nowEpochMs();
    const mutation = new ReminderMutation(db, p, now);
    const version = p.scheduleVersion + (changed ? 1 : 0);
    mutation.add(`UPDATE reminders SET title=?, description=?, project_id=?, starts_at=?, timezone=?, rrule=?, schedule_version=? WHERE id=? AND user_id=?`,
      [title, description, project, schedule.startsAt, schedule.timezone, schedule.rrule, version, id, userId]);
    if (changed) {
      mutation.add("UPDATE reminder_occurrences SET status='cancelled', updated_at=? WHERE reminder_id=? AND user_id=? AND status='pending'", [now, id, userId]);
      const first = schedule.startsAt > now || schedule.rrule === null ? schedule.startsAt : nextRecurrence(schedule, now);
      if (first !== null) mutation.insertOccurrence(first, version);
      mutation.completeIfSettled();
    }
    if (await mutation.commit()) return getReminder(db, userId, id);
  }
  throw new Error("Reminder mutation contention");
}

export async function cancelReminder(db: Database, userId: string, id: string) {
  for (let retry = 0; retry < 16; retry++) {
    const p = await requireReminder(db, userId, id);
    if (p.status === "cancelled") return getReminder(db, userId, id);
    const now = nowEpochMs();
    const m = new ReminderMutation(db, p, now);
    m.add("UPDATE reminders SET status='cancelled', cancelled_at=?, completed_at=NULL WHERE id=? AND user_id=?", [now, id, userId]);
    m.add("UPDATE reminder_occurrences SET status='cancelled', updated_at=? WHERE reminder_id=? AND user_id=? AND status='pending'", [now, id, userId]);
    if (await m.commit()) return getReminder(db, userId, id);
  }
  throw new Error("Reminder mutation contention");
}

/** Advance only the current version's frontier. Existing later history is also a fence. */
export async function prepareAdvance(m: ReminderMutation, current: ReminderOccurrenceRow) {
  const p = m.parent;
  if (p.status !== "active" || p.scheduleVersion !== current.scheduleVersion || p.rrule === null) return;
  const later = await m.db.select({ id: reminderOccurrences.id }).from(reminderOccurrences).where(and(
    eq(reminderOccurrences.reminderId, p.id), eq(reminderOccurrences.scheduleVersion, p.scheduleVersion),
    sql`${reminderOccurrences.scheduledFor} > ${current.scheduledFor}`)).limit(1);
  if (later.length > 0) return;
  const next = nextRecurrence(p, Math.max(m.now, current.scheduledFor));
  if (next !== null) {
    m.insertOccurrence(next);
  }
}

export async function handleOccurrence(db: Database, userId: string, reminderId: string, id: string, action: "done" | "skipped" | "delay", until?: string) {
  for (let retry = 0; retry < 16; retry++) {
    const p = await requireReminder(db, userId, reminderId);
    const o = await requireOccurrence(db, userId, reminderId, id);
    if (action !== "delay" && o.status === action) return toOccurrence(o);
    if (o.status !== "pending" && o.status !== "triggered") throw new ServiceError("INVALID_OCCURRENCE_STATE", "此 occurrence 不能执行该操作。");
    const now = nowEpochMs();
    const m = new ReminderMutation(db, p, now);
    if (action === "delay") {
      if (p.status !== "active" || o.scheduleVersion !== p.scheduleVersion) throw new ServiceError("INVALID_OCCURRENCE_STATE", "旧规则或已取消的 occurrence 不能 DELAY。");
      const target = Date.parse(until ?? "");
      if (!Number.isFinite(target) || target <= now) throw new ServiceError("INVALID_DELAY_TIME", "DELAY 时间必须晚于当前时间。");
      if (target === o.triggerAt) return toOccurrence(o);
      m.add("UPDATE reminder_occurrences SET trigger_at=?, trigger_version=trigger_version+1, status='pending', updated_at=? WHERE id=? AND reminder_id=? AND user_id=?",
        [target, now, id, reminderId, userId]);
    } else {
      m.add("UPDATE reminder_occurrences SET status=?, handled_at=?, updated_at=? WHERE id=? AND reminder_id=? AND user_id=?", [action, now, now, id, reminderId, userId]);
      await prepareAdvance(m, o);
      m.completeIfSettled();
    }
    if (await m.commit()) return getOccurrence(db, userId, reminderId, id);
  }
  throw new Error("Reminder mutation contention");
}
