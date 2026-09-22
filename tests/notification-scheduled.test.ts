import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import * as reminders from "../src/services/reminder-scheduler";
import * as deliveries from "../src/services/notification-dispatcher";
import * as finance from "../src/services/exchange-rates";
import { notificationFixture, resetNotifications } from "./notification-fixture";
import { NOW } from "./reminder-fixture";
beforeEach(async () => { await resetNotifications(); vi.spyOn(Date,"now").mockReturnValue(NOW); vi.spyOn(console,"info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
describe("single Worker cron routing", () => {
  it("minute cron runs Reminder then Delivery, never Finance or external fetch", async () => {
    const f=await notificationFixture();
    const reminder=vi.spyOn(reminders,"runReminderScheduler");
    const delivery=vi.spyOn(deliveries,"runNotificationDispatcher");
    const fx=vi.spyOn(finance,"syncExchangeRates");
    const fetch=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("No network permitted"));
    await worker.scheduled({cron:"* * * * *"} as ScheduledController,env);
    expect(reminder).toHaveBeenCalledOnce(); expect(delivery).toHaveBeenCalledOnce();
    expect(reminder.mock.invocationCallOrder[0]!).toBeLessThan(delivery.mock.invocationCallOrder[0]!);
    expect(fx).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(await f.raw()).toMatchObject({status:"pending"});
  });
  it("daily cron runs only Finance", async () => {
    const reminder=vi.spyOn(reminders,"runReminderScheduler"); const delivery=vi.spyOn(deliveries,"runNotificationDispatcher");
    const fx=vi.spyOn(finance,"syncExchangeRates").mockResolvedValue({succeeded:0,failed:0,rateCount:0});
    await worker.scheduled({cron:"0 20 * * *"} as ScheduledController,env);
    expect(fx).toHaveBeenCalledOnce(); expect(reminder).not.toHaveBeenCalled(); expect(delivery).not.toHaveBeenCalled();
  });
  it("Reminder scan failure does not prevent delivery recovery", async () => {
    vi.spyOn(reminders,"runReminderScheduler").mockRejectedValue(new Error("test"));
    const delivery=vi.spyOn(deliveries,"runNotificationDispatcher");
    await expect(worker.scheduled({cron:"* * * * *"} as ScheduledController,env)).rejects.toThrow("Notification scheduled processing failed");
    expect(delivery).toHaveBeenCalledOnce();
  });
});
