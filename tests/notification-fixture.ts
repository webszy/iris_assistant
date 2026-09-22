import { env } from "cloudflare:test";
import { createDb } from "../src/db";
import { notificationDeliveries, notifications } from "../src/db/schema";
import { eq } from "drizzle-orm";
import type { DeliveryResult, NotificationChannelAdapter, NotificationSendInput } from "../src/providers/notification-channel";
import { reminderNotificationAcceptance } from "../src/services/notification-acceptance";
import { acceptReminderOccurrence } from "../src/services/reminder-scheduler";
import { createNotificationChannel, putNotificationSettings } from "../src/services/notifications";
import { reminderFixture, resetReminders, NOW } from "./reminder-fixture";

export class FakeNotificationAdapter implements NotificationChannelAdapter {
  usable = true;
  calls: NotificationSendInput[] = [];
  results: DeliveryResult[] = [];
  handler?: (input: NotificationSendInput) => Promise<DeliveryResult>;
  constructor(readonly channel: string) {}
  isUsable() { return this.usable; }
  async send(input: NotificationSendInput): Promise<DeliveryResult> {
    this.calls.push(input);
    return this.handler ? this.handler(input) : this.results.shift() ?? { outcome: "sent", providerMessageId: "test-message" };
  }
}
export async function resetNotifications() {
  await env.DB.exec("DELETE FROM notification_deliveries; DELETE FROM notifications; DELETE FROM notification_channels; DELETE FROM notification_settings;");
  await resetReminders();
}
export async function notificationFixture(channels = ["primary", "backup", "last"]) {
  const f = await reminderFixture({ description: "Original message", rrule: "FREQ=DAILY" });
  const adapters = new Map(channels.map(c => [c, new FakeNotificationAdapter(c)]));
  await putNotificationSettings(f.db, f.userId, { enabled: true });
  const config = [];
  for (const [i, name] of channels.entries()) config.push(await createNotificationChannel(f.db, f.userId, { channel: name, enabled: true, priority: i * 10 }, adapters));
  const sink = reminderNotificationAcceptance(f.db, env, adapters);
  return { ...f, adapters, config, sink,
    accept: async (now = NOW) => acceptReminderOccurrence(f.db, await f.raw(), reminderNotificationAcceptance(f.db, env, adapters), now),
    notifications: () => f.db.select().from(notifications).where(eq(notifications.userId, f.userId)),
    deliveries: () => f.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, f.userId)),
  };
}
/** Pause before the atomic boundary; no impossible mid-batch interleaving. */
export function pauseNotificationBatch() {
  let release!: () => void;
  let reached!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  let paused = false;
  const binding = new Proxy(env.DB, { get(target, property) {
    if (property === "batch") return async (statements: D1PreparedStatement[]) => {
      if (!paused) { paused = true; reached(); await resume; }
      return target.batch(statements);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db: createDb(binding), ready, release };
}
