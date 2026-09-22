import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { notificationFixture, resetNotifications, FakeNotificationAdapter } from "./notification-fixture";
import { NOW } from "./reminder-fixture";
import { seedIdentity } from "./helpers";
import { productionNotificationAdapters } from "../src/providers/notification-channel";

beforeEach(async () => { await resetNotifications(); vi.spyOn(Date,"now").mockReturnValue(NOW); vi.spyOn(console,"info").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
async function request(app: ReturnType<typeof createApp>, token: string | undefined, path: string, method="GET", body?: unknown) {
  return app.request(`/api/v1/notifications${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body) }, env);
}
async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ success: false, error: { code } });
}
describe("Notification HTTP and schema contract", () => {
  it("requires auth on every root/static/nested endpoint", async () => {
    const app = createApp();
    for (const [path,method] of [["","GET"],["/x","GET"],["/x/deliveries","GET"],["/settings","GET"],["/settings","PUT"],["/channels","GET"],["/channels","POST"],["/channels/x","PATCH"]]) {
      await expectError(await request(app,undefined,path!,method),401,"UNAUTHORIZED");
    }
  });
  it("settings GET is explicit, PUT upserts and never creates channels", async () => {
    const app = createApp(); const u = await seedIdentity();
    await expectError(await request(app,u.rawToken,"/settings"),422,"NOTIFICATION_SETTINGS_NOT_FOUND");
    for (const enabled of [false,true,false]) {
      const res = await request(app,u.rawToken,"/settings","PUT",{enabled});
      expect(res.status).toBe(200); expect(await res.json()).toMatchObject({data:{enabled,createdAt:expect.any(String),updatedAt:expect.any(String)}});
    }
    expect(await (await request(app,u.rawToken,"/channels")).json()).toMatchObject({data:[]});
    await expectError(await request(app,u.rawToken,"/settings","PUT",{enabled:true,user_id:"other"}),400,"BAD_REQUEST");
  });
  it("channels normalize identifiers, reject unknown names and duplicate creation, update priority/enabled only", async () => {
    const adapters = new Map([["primary",new FakeNotificationAdapter("primary")]]);
    const app = createApp({notificationAdapters:adapters}); const u=await seedIdentity();
    const response = await request(app,u.rawToken,"/channels","POST",{channel:"PRIMARY",enabled:true,priority:10});
    expect(response.status).toBe(201);
    const body = await response.json() as {data:{id:string;channel:string}};
    expect(body.data.channel).toBe("primary");
    await expectError(await request(app,u.rawToken,"/channels","POST",{channel:"primary",enabled:false,priority:1}),409,"NOTIFICATION_CHANNEL_ALREADY_EXISTS");
    await expectError(await request(app,u.rawToken,"/channels","POST",{channel:"unknown",enabled:true,priority:1}),422,"INVALID_NOTIFICATION_CHANNEL");
    const patched=await request(app,u.rawToken,`/channels/${body.data.id}`,"PATCH",{enabled:false,priority:2});
    expect(patched.status).toBe(200); expect(await patched.json()).toMatchObject({data:{channel:"primary",enabled:false,priority:2}});
    for (const bad of [{channel:"backup"},{token:"secret"},{priority:-1},{priority:1.5},{priority:2147483648},{}]) {
      await expectError(await request(app,u.rawToken,`/channels/${body.data.id}`,"PATCH",bad),400,"BAD_REQUEST");
    }
    await expectError(await request(app,u.rawToken,`/channels/${body.data.id}`,"DELETE"),404,"NOT_FOUND");
  });
  it("production runtime has no fake or placeholder adapters", async () => {
    expect(productionNotificationAdapters().size).toBe(0);
    const u=await seedIdentity();
    await expectError(await request(createApp(),u.rawToken,"/channels","POST",{channel:"conduit",enabled:true,priority:1}),422,"INVALID_NOTIFICATION_CHANNEL");
  });
  it("returns camelCase snapshots, sourceContext and safe delivery metadata; filters createdAt", async () => {
    const f=await notificationFixture(); await f.accept(); const n=(await f.notifications())[0]!;
    const app=createApp({notificationAdapters:f.adapters}); const token=f.identity.rawToken;
    const response=await request(app,token,`/${n.id}`); expect(response.status).toBe(200);
    const value=await response.json(); expect(value).toMatchObject({data:{id:n.id,sourceType:"reminder_occurrence",sourceId:f.occurrence.id,sourceVersion:1,sourceContext:{reminderId:f.reminder.id},deliveryState:"delivering"}});
    expect(JSON.stringify(value)).not.toMatch(/dedupeKey|userId|source_type/);
    const deliveries=await (await request(app,token,`/${n.id}/deliveries`)).json();
    expect(deliveries).toMatchObject({data:[{channel:"primary",attemptCount:0,status:"pending",lastErrorCode:null}]});
    expect(JSON.stringify(deliveries)).not.toMatch(/claimToken|claimExpiresAt|lastErrorMessage|userId|Authorization/);
    const time=encodeURIComponent(new Date(NOW).toISOString());
    expect(await (await request(app,token,`?source_type=reminder_occurrence&from=${time}&to=${time}`)).json()).toMatchObject({data:[{id:n.id}]});
    expect(await (await request(app,token,`?from=${encodeURIComponent(new Date(NOW+1).toISOString())}`)).json()).toMatchObject({data:[]});
    for (const query of ["?sourceType=reminder_occurrence","?source_type=watch","?from=bad","?from=2026-09-24T00:00:00Z&to=2026-09-23T00:00:00Z"]) {
      await expectError(await request(app,token,query),400,"BAD_REQUEST");
    }
  });
  it("all resource lookups and static settings/channels are user scoped", async () => {
    const f=await notificationFixture(); await f.accept(); const other=await seedIdentity(); const app=createApp({notificationAdapters:f.adapters});
    const n=(await f.notifications())[0]!;
    await expectError(await request(app,other.rawToken,`/${n.id}`),404,"NOTIFICATION_NOT_FOUND");
    await expectError(await request(app,other.rawToken,`/${n.id}/deliveries`),404,"NOTIFICATION_NOT_FOUND");
    await expectError(await request(app,other.rawToken,`/channels/${f.config[0]!.id}`,"PATCH",{enabled:false}),404,"NOTIFICATION_CHANNEL_NOT_FOUND");
    await expectError(await request(app,other.rawToken,"/settings"),422,"NOTIFICATION_SETTINGS_NOT_FOUND");
    expect(await (await request(app,other.rawToken,"")).json()).toMatchObject({data:[]});
    expect(await (await request(app,other.rawToken,"/channels")).json()).toMatchObject({data:[]});
    await expect(env.DB.prepare(`INSERT INTO notification_deliveries(id,user_id,notification_id,channel,next_attempt_at,created_at,updated_at)
      VALUES(?,?,?,'foreign',?,?,?)`).bind(crypto.randomUUID(),other.userId,n.id,NOW,NOW,NOW).run()).rejects.toThrow();
  });
  it("Notification exposes no create/edit/delete/retry/business-action routes", async () => {
    const f=await notificationFixture(); await f.accept(); const app=createApp(); const n=(await f.notifications())[0]!;
    for (const [path,method] of [["","POST"],[`/${n.id}`,"PATCH"],[`/${n.id}`,"DELETE"],[`/${n.id}/retry`,"POST"],[`/${n.id}/done`,"POST"],[`/${n.id}/delay`,"POST"],[`/${n.id}/skip`,"POST"]]) {
      await expectError(await request(app,f.identity.rawToken,path!,method,{}),404,"NOT_FOUND");
    }
    const doc=await (await app.request("/openapi.json")).json() as {paths:Record<string,Record<string,unknown>>};
    expect(Object.keys(doc.paths["/api/v1/notifications"]!)).toEqual(["get"]);
    expect(Object.keys(doc.paths["/api/v1/notifications/{notificationId}"]!)).toEqual(["get"]);
    expect(doc.paths["/api/v1/notifications/settings"]).toHaveProperty("put");
  });
});
