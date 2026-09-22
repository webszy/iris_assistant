/** SQL stays inside acceptance/fallback batches so committed settings determine selection. */
export function channelSelection(userId: string, usable: readonly string[], notificationId?: string) {
  const names = usable.length ? usable.map(() => "?").join(",") : "NULL";
  return {
    sql: `SELECT c.channel FROM notification_channels c JOIN notification_settings s ON s.user_id=c.user_id
      WHERE c.user_id=? AND c.enabled=1 AND s.enabled=1 AND c.channel IN (${names})
      ${notificationId === undefined ? "" : `AND NOT EXISTS (SELECT 1 FROM notification_deliveries d
        WHERE d.notification_id=? AND d.channel=c.channel)`}
      ORDER BY c.priority ASC,c.created_at ASC,c.id ASC LIMIT 1`,
    bindings: [userId, ...usable, ...(notificationId === undefined ? [] : [notificationId])],
  };
}
export function notificationLog(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.info(JSON.stringify({ domain: "notification", event, ...fields }));
}
