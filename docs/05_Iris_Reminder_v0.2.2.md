

# Iris v0.2 — Reminder PRD

**Version:** v0.2 Phase 1
**Module:** Reminder
**Status:** Contract frozen; Reminder and Notification durable integration implemented; production channel adapter pending
**Dependency:** Iris v0.1 Core
**Delivery dependency:** Notification（参见 06_Iris_Notification_v0.2.3.md）
**Contract update:** 2026-09-23；以下规则合并两轮确认，覆盖早期草案。

---

# 1. 产品定义

Reminder 解决的问题是：

> **什么事情，需要在什么时间重新进入用户的注意力。**

Reminder 是一个 **time-based attention scheduler**。

它不负责：

* 消息通过什么渠道发送
* 邮件 / Push / Conduit
* 条件监控
* Task 执行
* LLM 自动决策

核心结构：

```text
Reminder
= 提醒规则 / 调度定义

ReminderOccurrence
= 某一次具体提醒
```

例如：

```text
Reminder
每天 20:00 锻炼

Occurrence A
2026-09-23 20:00

Occurrence B
2026-09-24 20:00
```

这两个概念必须从第一版分离。

---

# 2. 核心用户行为

Reminder 必须支持以下语义：

```text
CREATE
= 创建提醒

DONE
= 这一次已经处理完了

DELAY
= 这一次晚点再提醒

SKIP
= 这一次不处理，下次正常继续

CANCEL
= 整个提醒以后都不要了

PATCH / RESCHEDULE
= 永久修改提醒规则
```

核心区别：

```text
DONE / DELAY / SKIP
→ Occurrence-level action

CANCEL / RESCHEDULE
→ Reminder-level action
```

---

# 3. 典型自然语言

### Create

> 明天下午 3 点提醒我提交资料。

### Done

> 已经交了。

### Delay

> 今天累了，明天再提醒我锻炼。

### Skip

> 今天不练了，明天正常提醒。

### Cancel

> 以后别提醒我这个了。

### Reschedule

> 以后都改成晚上九点提醒。

这些必须映射成不同的业务操作。

---

# 4. Reminder ≠ Task

语义严格区分：

```text
Task
= 我要完成什么

Reminder
= 什么时候重新让我注意某件事
```

例如：

```text
Task:
Renew Hermes VPS

Reminder:
10 月 1 日提醒我检查 VPS 是否续费
```

Reminder 第一版不要求绑定 Task。

---

# 5. Project 关系

Reminder：

```text
project_id OPTIONAL
```

例如：

```text
检查 DeepUsername 广告
→ DeepUsername Project
```

但：

```text
明天提醒我给孩子买文具
```

不应该为了创建 Reminder 强制创建 Project。

所以 Reminder 是允许脱离 Project 存在的少数实体之一。

第一版不支持：

```text
task_id
milestone_id
resource_id
```

---

# 6. Reminder 类型

支持：

```text
one-time
recurring
```

不单独存 `type` 字段也可以。

判断：

```text
rrule == null
→ one-time

rrule != null
→ recurring
```

---

# 7. Reminder 数据模型

```text
reminders
id / user_id
project_id nullable
title / description nullable
status: active | completed | cancelled
starts_at / timezone / rrule nullable
schedule_version INTEGER NOT NULL DEFAULT 1
mutation_token (internal CAS fence; not exposed)
created_at / updated_at
completed_at nullable / cancelled_at nullable
```

UUID v4；数据库时间统一 UTC epoch milliseconds，API 输出 UTC ISO datetime。
只有 starts_at/timezone/rrule 的实质修改增加 schedule_version；metadata 不增加。
mutation_token 只协调同一 D1 批次的条件写入，不是公开状态或可过期的处理租约。

---

# 8. Reminder Status

```text
active
completed
cancelled
```

active：规则仍有后续周期，或任意版本还有 pending/triggered 可操作 occurrence。

completed 必须同时满足：

```text
没有未来规则 occurrence
AND
所有版本均没有 pending / triggered occurrence
```

triggered 不是终态。一次性或最后一次循环 trigger 后仍 active，等待 DONE/SKIP；也可以 DELAY。
`active + nextTriggerAt = null` 完全合法，例如只剩 triggered 等待用户回应。
旧版本未处理的 triggered 同样阻止自动 completed。

cancelled：用户明确永久停止，优先于自动 completed；历史操作不得改变 cancelled。
不支持 paused/expired/archived，也不再存在 completed → active 的 DELAY 特例。

---

# 9. starts_at

starts_at 是 schedule 的 DTSTART / recurrence anchor，输入为带 Z 或 offset 的明确 absolute ISO datetime。

one-time：唯一正常 scheduled_for = starts_at。
recurring：Server 转换到 IANA timezone 后，anchor 必须满足显式 RRULE 约束。
例如周四 anchor 配 `FREQ=WEEKLY;BYDAY=MO` 返回 INVALID_RRULE。
输入 offset 不必与 timezone 的写法一致；Z 可以表示同一绝对时刻。
recurring anchor 如果落在秋季重复时间的第二个实例，直接拒绝，不静默更改。

---

# 10. Timezone 与 DST

每条 Reminder 保存有效 IANA timezone，例如 Asia/Shanghai、America/New_York；不接受 UTC+8/GMT-5。
循环语义是当地钟表时间，而不是固定 UTC 间隔。

- 春季跳时导致当地时间不存在：不生成、不平移、不消耗 COUNT。
- 秋季回拨导致时间重复：仅认第一次对应的 absolute instant，生成一次。
- 每月 31 日遇到不存在的日期、闰日遇到非闰年：跳过，不消耗 COUNT。
- 停机错过的有效 logical occurrence 确实存在，因此消耗 COUNT，但不逐条补生成。
- one-time 和 DELAY 只使用 absolute instant，不参与 wall-clock recurrence 校验。

非法时区返回 INVALID_TIMEZONE。

---

# 11. RRULE

Recurring Reminder 使用 iCalendar-style RRULE。

例如：

```text
每天：
FREQ=DAILY

每周一：
FREQ=WEEKLY;BYDAY=MO

每月 1 日：
FREQ=MONTHLY;BYMONTHDAY=1

每年：
FREQ=YEARLY
```

`starts_at` 单独保存。

因此 `rrule` 内不要再包含：

```text
DTSTART
TZID
```

---

# 12. v0.2 RRULE 范围

支持 DAILY / WEEKLY / MONTHLY / YEARLY，以及 INTERVAL、BYDAY、BYMONTHDAY、BYMONTH、COUNT、UNTIL。
BYDAY 支持 monthly/yearly ordinal，例如 -1MO；BYMONTHDAY 支持负数，例如 -1 表示月底。
COUNT 与 UNTIL 互斥。UNTIL 使用 UTC compact datetime `YYYYMMDDTHHmmssZ`，包含边界。
不接受 DTSTART/TZID、多条规则、未知键或非本期 FREQ；不实现完整 RFC 的罕见组合。

COUNT = 有效 logical recurrence 总数，包括 anchor 和停机期间错过的有效周期。
DELAY 不创造 logical occurrence，不额外消耗 COUNT。UNTIL 限制 scheduled_for，不限制 trigger_at。

实现采用 rrule 2.8.1 生成浮动当地日历序列，@js-temporal/polyfill 0.5.1 转换时区并应用 DST 规则。
COUNT/UNTIL 在有效 absolute logical sequence 上处理，避免库的默认时区行为改变 contract。
不实现自然语言日期解析；日期逻辑集中在 RecurrenceService。

---

# 13. Natural Language 边界

Worker 不负责理解：

```text
“明天下午”
“下周一”
“每月底”
“过两个小时”
```

由 Agent 转换为：

```text
starts_at
timezone
rrule
```

例如：

> 每月 1 号上午 10 点提醒我交房租。

Agent：

```text
starts_at =
2026-10-01T10:00:00+08:00

timezone =
Asia/Shanghai

rrule =
FREQ=MONTHLY;BYMONTHDAY=1
```

Server：

> 验证并确定性调度。

---

# 14. ReminderOccurrence

```text
reminder_occurrences
id / user_id / reminder_id
schedule_version
scheduled_for (immutable)
trigger_at
trigger_version INTEGER NOT NULL DEFAULT 1
status: pending | triggered | done | skipped | cancelled
trigger_count INTEGER NOT NULL DEFAULT 0
last_triggered_at nullable / handled_at nullable
created_at / updated_at
```

schedule_version 标识生成这次 occurrence 的调度定义；trigger_version 标识这次 occurrence 的执行代次。
二者职责独立；不新增 delayed 状态，也不引入复杂 trigger history table。

---

# 15. scheduled_for vs trigger_at

这是 Reminder 系统的重要区别。

### scheduled_for

表示：

> 根据 Reminder 原始 schedule，这一次本来应该什么时候发生。

创建后不可修改。

### trigger_at

表示：

> 当前这一次实际上应该什么时候触发。

正常：

```text
scheduled_for = 20:00
trigger_at     = 20:00
```

Delay 后：

```text
scheduled_for = 20:00
trigger_at     = 明天 10:00
```

因此：

```text
scheduled_for
= logical occurrence identity

trigger_at
= execution time
```

---

# 16. Occurrence Status

- pending：当前 trigger_version 尚未 durable accepted。此前版本可能已触发过，trigger_count 不清零。
- triggered：当前 trigger_version 的 Notification event 已 durable accepted；不代表送达、看到或完成。
- done：用户明确本次已完成。
- skipped：用户明确本次跳过。
- cancelled：CANCEL 或 RESCHEDULE 终止的 pending 执行。

DONE/SKIP 可终结 pending/triggered；triggered 仍可在有效当前版本下 DELAY。
终态 done/skipped/cancelled 不允许 DELAY 或改成另一个终态。
重复 DONE、重复 SKIP 使用幂等成功，保留 handled_at。

---

# 17. Occurrence 唯一性

```text
UNIQUE(reminder_id, schedule_version, scheduled_for)
```

同一版本、同一逻辑时间只存在一个 occurrence，防止 Cron/Worker retry 和并发重复生成。
不同 schedule_version 可拥有相同 scheduled_for，因此 A → B → A 重排不会被旧历史阻止。
历史 identity 不改写；不再使用 `(reminder_id, scheduled_for)` 永久唯一的旧约束。

---

# 18. 创建 Reminder

API：

```http
POST /api/v1/reminders
```

一次性：

```json
{
  "title": "提交资料",
  "description": "给学校提交报名材料",
  "starts_at": "2026-09-24T15:00:00+08:00",
  "timezone": "Asia/Shanghai"
}
```

Recurring：

```json
{
  "title": "锻炼",
  "starts_at": "2026-09-24T20:00:00+08:00",
  "timezone": "Asia/Shanghai",
  "rrule": "FREQ=DAILY"
}
```

可选：

```json
{
  "project_id": "..."
}
```

---

# 19. CREATE 行为

创建 Reminder 后：

```text
Reminder INSERT
↓
创建第一个 ReminderOccurrence
```

第一次：

```text
scheduled_for = starts_at
trigger_at     = starts_at
status         = pending
schedule_version = 1
trigger_version  = 1
trigger_count    = 0
```

必须保证：

> Reminder 创建成功后一定有明确的第一次 Occurrence。

---

# 20. Past Due Reminder

允许：

```text
starts_at <= now
```

不要因为 Agent / network 延迟几秒钟就拒绝。

例如：

```text
“现在提醒我”
```

创建后：

```text
Occurrence.trigger_at <= now
```

Scheduler 下一轮立即处理。

---

# 21. Scheduler

Scheduler 查询 pending 且 trigger_at <= now 的 occurrence，按 trigger_at/id 排序，单轮默认最多 100 条。
不在每次 Cron 全量重新计算 Reminder schedule。

```text
select due occurrence
→ prepare guarded same-D1 transaction
→ durable Notification event + triggered/count update + necessary next occurrence
→ atomic commit / rollback
```

Notification Phase 1 已实现同库 durable acceptor；当前 production adapter registry 为空。
没有 usable channel 时不写 Notification/Delivery、不标 triggered、不增加 trigger_count，保持 pending。
现有 daily scheduled 入口保留 Finance 同步行为，只记录 Reminder integration pending。
同一 Worker 按 cron 分发：每分钟执行 Reminder/Delivery；原 UTC 20:00 cron 仅执行 Finance。
trigger_at 是目标时间，执行受约一分钟 cadence 影响，不承诺秒级。
trigger_at 是目标时间，实际处理取决于 cadence，不承诺亚分钟精度。

---

# 22. Notification 边界

Reminder 不负责：

```text
Conduit
Push
Email
Telegram
Webhook
```

它只负责产生：

> “现在需要通知用户”的事件。

结构：

```text
Reminder
↓
Occurrence
↓
Notification
↓
Delivery Channel
```

---

# 23. Trigger 成功的定义

只有 Notification、initial Delivery 与 occurrence 状态/计数/必要下一周期在同一个 D1 原子批次中成功提交，才算 durable acceptance。

```text
Notification event persisted
+
Occurrence pending → triggered
trigger_count += 1
last_triggered_at = now
```

要么全部提交，要么全部回滚；不能把开始处理、远程调用已发出或 Push 成功当成此定义。
同一 trigger_version 重试不重复接受、不重复计数。

---

# 24. Notification 创建失败

事件插入、occurrence 更新或下一周期创建的任一步失败，都回滚整个批次。
Occurrence 保持 pending，可用相同 occurrence_id + trigger_version retry。
接收语句未插入事件不能伪装成功；本期测试覆盖无写入 acceptor 和后续语句失败。
不允许先提交 triggered，再尝试创建事件。

---

# 25. Trigger Idempotency

正式 execution identity：

```text
occurrence_id + trigger_version
```

trigger_version 初始为 1，每次真正改变 trigger_at 的 DELAY 加 1。
相同仍在未来的目标时间重试是 no-op，不增加 trigger_version。
A → B → A 有不同代次；trigger_at 仍是原子接受的 expected 校验字段，但不是唯一接受身份。
Notification 使用 `reminder-occurrence:{occurrenceId}:trigger:{triggerVersion}`，
以 UNIQUE(user_id,dedupe_key) 保证同一执行代次唯一接受，不使用 trigger_at 或 schedule_version 作为 dedupe identity。
trigger_count 仅在某一代次第一次成功接受时增加。

---

# 26. Trigger / DONE / SKIP 后推进

当前版本 occurrence trigger 成功，或在 trigger 前被 DONE/SKIP 时：

1. 检查同一 schedule_version 是否已经存在 scheduled_for 更晚的 occurrence。
2. 若存在则保持，不再次推进，包括对历史 triggered 的迟到 DONE/SKIP。
3. 否则，以 `max(now, current.scheduled_for)` 为 anchor，寻找严格晚于它的下一有效 logical occurrence。
4. 有下一次则创建 pending，scheduled_for = trigger_at，trigger_version = 1。
5. 没有下一次时，只有全部版本均无 actionable occurrence 才 completed。

旧 schedule version 的历史 DONE/SKIP 永不推进任何版本。
DELAY 本身不推进，不修改、取消或合并其他 occurrence。

---

# 27. Missed Recurrence / Downtime

不 replay backlog 只针对停机期间尚未生成的规则周期。

例如每天 20:00，已有 09/20 overdue occurrence，09/23 10:00 恢复：处理已有 occurrence 后，
直接生成 09/23 20:00，不补生成 09/21 和 09/22。

已实际生成的 pending（包括用户明确 DELAY 的多次 occurrence）全部保留，各自可接受一次；
不能为了“每个 Reminder 最多一条”而丢弃用户明确安排的执行。
停机期间错过的 valid logical cycles 消耗 COUNT，DST/不存在日期则不同，不消耗。

---

# 28. One-time overdue

一次性 Reminder 不同。

即使：

```text
已经晚了两小时
```

仍然：

```text
trigger once
```

因为：

> 晚提醒通常仍比永远不提醒更合理。

---

# 29. DONE

API：

```http
POST /api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/done
```

语义：

> 当前这一次已经处理完成。

允许：

```text
pending → done
triggered → done
```

如果 pending 时 DONE：

```text
不会再发送本次 Notification
```

---

# 30. DONE 对 one-time

DONE 终结目标 occurrence，handled_at = now。
没有其他版本 pending/triggered，也没有后续规则时间时，parent completed。
若旧版本仍有 triggered 等待收尾，parent 继续 active；cancelled parent 始终 cancelled。

---

# 31. DONE 对 recurring

当前版本 pending/triggered → done，按第 26 节确保后续周期，不重复推进。
规则尚有下一次，或任意版本还有 pending/triggered 时，parent active；全部结束才 completed。
旧版本 triggered 的 DONE 仅收尾该记录并重新判断完成条件，不推进规则。

---

# 32. DELAY

API：

```http
POST /api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/delay
```

Request：

```json
{
  "until": "2026-09-24T10:00:00+08:00"
}
```

Agent 负责把：

```text
“明天”
“两个小时后”
“下午再叫我”
```

解析成具体 absolute datetime。

Worker 不解析自然语言。

---

# 33. DELAY 语义

只修改目标 occurrence：

```text
trigger_at = until
trigger_version += 1  // 仅当目标时间实质变化
status = pending
```

scheduled_for、schedule_version、Reminder.starts_at/timezone/rrule 永远不因 DELAY 改变。
trigger_count、last_triggered_at 保留；其他 occurrence 完全不受影响。
相同仍在未来的 until 是 no-op；不存在独立 delayed 状态或 snooze endpoint。

---

# 34. DELAY 允许状态

仅 active parent、当前 schedule_version 的 pending/triggered occurrence 允许 DELAY。
旧版本、cancelled parent、done/skipped/cancelled occurrence 返回 INVALID_OCCURRENCE_STATE。
最后一次 recurring triggered 也允许 DELAY，因为 parent 尚未 completed，且不新增逻辑周期。

---

# 35. DELAY 时间

until 必须是带 Z/offset 的有效 absolute ISO datetime，并严格满足 until > server now。
until <= now 返回 INVALID_DELAY_TIME；格式不合法返回 BAD_REQUEST。
一次请求使用确定的服务端时间判断，不引入复杂 tolerance。
DELAY 使用 absolute instant，允许秋季重复当地时间中的任一明确 instant。

---

# 36. DELAY 与 recurring

允许 delayed occurrence 与 normal recurrence 并存，不自动合并。
例如今天 20:00 已 trigger，明天 20:00 已生成；今天这次 DELAY 到明天 10:00，则明天有两次。
若用户说“今天不做，明天正常”，应 SKIP，不能用 DELAY 代替。
nextTriggerAt 取所有 pending 的最小 trigger_at，不限定一个 pending。

---

# 37. One-time 与最后一次 recurring 的 DELAY

一次性或最后一次 recurring 的 occurrence trigger 后，parent 仍 active。
随后 DELAY：triggered → pending，改变 trigger_at 与 trigger_version。
再次 trigger 后仍等待 DONE/SKIP；仅当不存在任何 pending/triggered 与未来规则时间时 completed。
删除旧规则“one-time completed 可通过 DELAY 特殊复活”；现在不需要任何 completed → active 路径。

---

# 38. SKIP

API：

```http
POST /api/v1/reminders/{reminderId}/occurrences/{occurrenceId}/skip
```

语义：

> 这一轮不处理，但整个 Reminder 保持原计划。

允许：

```text
pending → skipped
triggered → skipped
```

---

# 39. SKIP 对 recurring

本次 pending/triggered → skipped，handled_at = now；重复 SKIP 幂等。
当前版本按第 26 节保持后续规则；旧版本仅收尾，不推进。
后续规则或任何版本 actionable occurrence 存在时 active，否则 completed；cancelled 不变。

---

# 40. SKIP 对 one-time

终结本次 occurrence；所有版本无 actionable 且没有未来规则 occurrence 时，parent completed。
存在旧 triggered 则继续 active，等待用户收尾；cancelled parent 始终 cancelled。

---

# 41. CANCEL

`POST /api/v1/reminders/{reminderId}/cancel`

原子设置 parent cancelled/cancelled_at，取消所有版本的全部 pending，包括 overdue 和 delayed。
历史 triggered 保留；以后可以 DONE/SKIP，但不能 DELAY，也不能改变 parent 的 cancelled 状态。
重复 CANCEL 幂等，不重写 cancelled_at；不再产生新 occurrence。

---

# 42. Cancelled Reminder

第一版不支持：

```text
reactivate
resume
uncancel
```

如果以后又需要类似提醒：

创建新的 Reminder。

---

# 43. PATCH / Reschedule

API：

```http
PATCH /api/v1/reminders/{reminderId}
```

允许修改：

```text
title
description
project_id
starts_at
timezone
rrule
```

不允许直接 PATCH：

```text
status
completed_at
cancelled_at
user_id
id
```

业务动作必须走明确 endpoint。

---

# 44. Metadata PATCH

如果只修改：

```text
title
description
project_id
```

不要改变未来 schedule。

---

# 45. Schedule PATCH / RESCHEDULE

只有 starts_at/timezone/rrule 实质变化才是重排；相同或标准化后相同 schedule 的 PATCH 是 no-op。
重排只允许当前 active parent，并且是单个原子业务操作：

1. 合并并验证新 definition，anchor 必须匹配规则。
2. schedule_version + 1。
3. 旧版本所有 pending → cancelled，不区分 future、overdue、delayed。
4. triggered/done/skipped/cancelled 历史不因重排改写。
5. 按新 version 创建必要的首次 pending。
6. 统一重算 parent 状态，不强制保持 active。

新首次规则：

| 新 schedule | 首次 occurrence |
| --- | --- |
| starts_at > now | starts_at |
| one-time，starts_at <= now | 一个 overdue pending |
| recurring，starts_at <= now | 第一个严格晚于 now 的有效 logical occurrence |
| 新 COUNT/UNTIL 已耗尽 | 接受修改，不创建 occurrence |

COUNT 从新 starts_at 的完整有效逻辑序列计算，过去周期照样消耗。
如果没有新的 occurrence，但历史 triggered 仍可操作，parent active；否则 completed。
旧版本 triggered 可 DONE/SKIP，不能 DELAY，且不能推进任何 version。

---

# 46. Completed / Cancelled Reminder Reschedule

completed/cancelled parent 禁止实质 schedule PATCH，返回 INVALID_REMINDER_STATE。
metadata PATCH 不复活；相同 schedule 的重复提交不创建新版本或 occurrence。
不再存在 one-time DELAY 复活例外。需要全新安排时 CREATE 新 Reminder。
“耗尽的新规则仍接受重排”只适用于重排前 parent 为 active 的情况。

---

# 47. Reminder READ API

```http
GET /api/v1/reminders
GET /api/v1/reminders/{reminderId}
```

List 支持 status / project_id；project_id 必须属于当前用户。
遵循现有列表习惯：createdAt 降序、id 升序；不新增分页契约。
nextTriggerAt 动态查询所有 pending 的最小 trigger_at，不在 Reminder 表重复保存。

---

# 48. Reminder Response

建议：

```json
{
  "id": "...",
  "projectId": "...",

  "title": "锻炼",
  "description": null,

  "status": "active",

  "startsAt": "...",
  "timezone": "Asia/Shanghai",
  "rrule": "FREQ=DAILY",
  "scheduleVersion": 1,

  "nextTriggerAt": "...",

  "createdAt": "...",
  "updatedAt": "...",
  "completedAt": null,
  "cancelledAt": null
}
```

其中：

```text
nextTriggerAt
```

可以从当前最早：

```text
pending occurrence.trigger_at
```

动态得到。

不要求在 Reminder 表中重复存一份。

---

# 49. Occurrence READ API

```http
GET /api/v1/reminders/{reminderId}/occurrences
GET /api/v1/reminders/{reminderId}/occurrences/{occurrenceId}
```

支持 status / from / to；from/to 使用绝对 ISO datetime，基于 scheduled_for，包含两端，from <= to。
列表按 scheduled_for、schedule_version 升序。不使用 trigger_at 替代 logical time 过滤。
Reminder、Occurrence、URL 父子关系均须属于当前用户。

---

# 50. Occurrence Response

```json
{
  "id": "...",
  "reminderId": "...",
  "scheduleVersion": 1,
  "triggerVersion": 1,

  "scheduledFor": "...",
  "triggerAt": "...",

  "status": "triggered",

  "triggerCount": 1,
  "lastTriggeredAt": "...",
  "handledAt": null,

  "createdAt": "...",
  "updatedAt": "..."
}
```

---

# 51. trigger_count

每个 trigger_version 的 Notification durable acceptance 首次成功才 trigger_count += 1。
相同代次重试不重复计数；DELAY 不清零；失败或接收端没有持久化写入时不增加。
该计数是 operational/debug 字段；不实现复杂历史表。

---

# 52. handled_at

仅用户 DONE / SKIP 时记录 handled_at，重复相同动作保留原时间。
CANCEL / RESCHEDULE 取消 pending 时不设置 handled_at，以区分用户处理与调度取消。

---

# 53. No hard delete

第一版 Reminder / Occurrence 都不提供正常 DELETE。

原因：

它们属于调度和执行历史。

用户说：

> 不要再提醒

应该：

```text
CANCEL
```

而不是删除。

---

# 54. Scheduler 并发与 Claim

同库原子提交顺序决定结果，不使用普通锁竞争返回 BUSY。

所有 Reminder domain writer 使用 parent mutation_token 作条件更新 fence。
它与业务语句在同一 D1 batch 中完成，不存在单独提交的 processing 状态或租约。
读到旧快照的 writer 整批跳过后重新读取并重试；不覆盖其他已提交动作。

Scheduler 同时校验 pending、expected trigger_version、expected trigger_at、due 时间、parent active、当前 schedule_version。
Notification、initial Delivery 与 occurrence 状态/计数/下一周期共用事务；任一步失败整体回滚。
不靠 lease 到期判断旧 handoff 失败。
REMINDER_BUSY 只为未来无法判定的外部 ownership 保留，本期不注册或返回该错误。

---

# 55. Reminder 和 Notification 的事务边界

正式 architecture contract：同一个 D1 原子事务。

```text
validate expected pending / trigger_version / trigger_at / current schedule
↓ same transaction
persist Notification + initial Delivery
+ pending → triggered
+ trigger_count += 1
+ last_triggered_at = now
+ necessary next occurrence
↓
commit all / rollback all
```

Action 先提交：DONE/SKIP 改状态，CANCEL/RESCHEDULE 取消旧执行，DELAY 增代次；旧 acceptance 必须失败。
Acceptance 先提交：事件已经 durable，后续 DONE/SKIP 正常收尾；DELAY 新增执行代次，旧事件不承诺撤回。

Notification 扩展 `ReminderNotificationAcceptance.prepare` 为带 guard 的 acceptance plan，禁止外部 I/O。
同一批次必须持久化 Notification 和 initial Delivery，再转换 occurrence 并推进下一周期；空写入或局部失败整体回滚。
真实 Provider 尚未接入，Fake Adapter 仅用于测试，不注册进 production runtime。
未来换成独立系统必须重新确认等价原子验收协议，不能替换成普通异步 enqueue 即认为兼容。

---

# 56. Notification Delivery Failure

以后即使：

```text
Notification created
↓
Push delivery failed
```

ReminderOccurrence 仍然可以保持：

```text
triggered
```

因为：

> Reminder 的责任已经完成。

Delivery retry 属于 Notification subsystem。

---

# 57. Condition-based Reminder 明确不属于本模块

例如：

> 美元跌到 7 以下提醒我。

> CodeToken 余额低于 $100 提醒我。

> 有新邮件时提醒我。

这些不是 Reminder。

它们未来属于：

```text
Watch / Rule / Trigger
↓
Notification
```

Reminder 只负责：

> **time-based scheduling**

这条边界必须锁住。

---

# 58. Phase 1 不做 Pause / Resume

类似：

> 这周先别提醒我，下周恢复。

属于：

```text
pause / resume
```

确实有价值，但第一版暂不实现。

未来可增加：

```text
paused
pause_until
resume
```

本期不做。

---

# 59. Delay ≠ Pause

```text
Delay
= 某一次 occurrence 晚点执行

Pause
= 整个 recurring schedule 暂停
```

不要混淆。

---

# 60. Delay ≠ Reschedule

```text
“今天晚点叫我”
→ DELAY

“以后都改成晚上 9 点”
→ PATCH schedule
```

---

# 61. Skip ≠ Cancel

```text
“今天算了”
→ SKIP

“以后都算了”
→ CANCEL
```

这是 Skill 必须理解的重要区别。

---

# 62. Done ≠ Cancel

```text
“今天练完了”
→ DONE current occurrence

“以后不用提醒我锻炼”
→ CANCEL reminder
```

---

# 63. Agent Context

当 Notification 触发后，未来通知本身必须携带足够的内部 context：

```text
reminder_id
occurrence_id
```

因此用户回复：

> 晚点。

Agent 能知道：

> 对哪一个 Occurrence 执行 Delay。

不要要求 LLM 根据标题模糊猜测。

---

# 64. Ambiguous Follow-up

如果上下文不能可靠确定 Occurrence：

例如用户直接说：

> 明天再提醒。

但当前有多个正在等待处理的 Reminder。

Agent 必须先询问：

> 哪一件？

不得猜。

---

# 65. User isolation

Reminder：

```text
user scoped
```

Occurrence：

```text
user scoped
```

任何：

```text
reminderId
occurrenceId
```

都不能跨 user 访问。

如果 Reminder 有 project_id：

必须确认该 Project 属于同一 authenticated user。

---

# 66. Indexes

```text
reminders: (user_id, status)
reminder_occurrences:
  UNIQUE(reminder_id, schedule_version, scheduled_for)
  (user_id, status, trigger_at)
  (reminder_id, status)
  (trigger_at) WHERE status = 'pending'
```

最后一个 partial index 支持跨用户 due scan；user-leading 索引不能有效覆盖该查询。
保留 user/parent FK；Service 层严格验证 ownership。

---

# 67. Error Codes

| HTTP | Code |
| --- | --- |
| 400 | BAD_REQUEST |
| 401 | UNAUTHORIZED |
| 404 | REMINDER_NOT_FOUND / REMINDER_OCCURRENCE_NOT_FOUND / PROJECT_NOT_FOUND |
| 409 | INVALID_REMINDER_STATE / INVALID_OCCURRENCE_STATE |
| 422 | INVALID_TIMEZONE / INVALID_RRULE / INVALID_DELAY_TIME |
| 500 | INTERNAL_ERROR |

跨用户/错误父子关系表现为 not found；不泄露其他用户资源。
REMINDER_BUSY 仅为未来不确定外部 ownership 保留，本期不实现普通锁 BUSY。

---

# 68. Skill Integration

新增：

```text
skills/iris/references/reminder-api.md
```

包含：

* Reminder create/read/update
* one-time vs recurring
* RRULE
* timezone
* Occurrence
* Done
* Delay
* Skip
* Cancel
* relevant errors
* Agent intent mapping

不要复制完整 OpenAPI。

---

# 69. Progressive Loading

SKILL.md：

```text
Reminder operation
→ reminder-api.md
```

如果需要 resolve Project：

```text
+ project-api.md
```

不应该因为 Reminder 自动加载：

```text
finance-api.md
content-api.md
resource-api.md
capability-api.md
openapi.json
```

---

# 70. Agent Behavior Table

| 用户表达        | 行为                 |
| ----------- | ------------------ |
| “明天提醒我”     | CREATE             |
| “每天晚上八点提醒我” | CREATE recurring   |
| “做完了”       | DONE               |
| “晚两个小时”     | DELAY              |
| “明天再叫我”     | DELAY              |
| “今天算了”      | SKIP               |
| “以后别提醒”     | CANCEL             |
| “以后都改成九点”   | PATCH / RESCHEDULE |

这个映射是 Reminder Skill 的核心。

---

# 71. Acceptance Criteria

1. 原子创建 Reminder 与首次 occurrence，one-time/recurring、可选 Project、过去 CREATE 均成立。
2. IANA/ISO/RRULE 验证；anchor 必须匹配，DST gap/overlap、月末、闰日、COUNT/UNTIL 符合本文件。
3. schedule_version 管定义演化；trigger_version 管执行代次；版本化逻辑唯一性与历史身份不可变。
4. DONE/SKIP 幂等；提前处理从 max(now, scheduled_for) 严格推进；存在更晚 occurrence 不二次推进。
5. trigger 后仍 active；无未来规则且全部版本无 actionable 才 completed；无复活特例。
6. DELAY 可与正常 recurrence 并存；A→B→A 不复用 execution identity；不消耗额外 COUNT。
7. CANCEL 终止全部 pending，历史可 DONE/SKIP；parent 永久 cancelled。
8. RESCHEDULE 原子取消全部旧 pending、增版本、保留历史；A→B→A 合法，metadata/no-op 不重排。
9. 过去 recurring 重排不补 backlog；active parent 可接受耗尽的新规则；旧 triggered 阻止自动 completed。
10. 旧 version 禁止 DELAY，旧 DONE/SKIP 不推进任何版本。
11. 同 D1 durable event 与状态/计数/下一周期共提交或回滚；空 acceptor 写入不得假成功。
12. action-first 阻止 stale acceptance；acceptance-first 保留事件；重复 scheduler 不重复接受。
13. 既有 overdue/delayed occurrence 保留；未生成的 missed periods 不 replay，但有效周期消耗 COUNT。
14. 无生产 acceptor 时 pending 不变、不假触发；Finance 现有每日同步语义保留。
15. Bearer/user/nested ownership、strict request、camelCase response、明确 errors 与 OpenAPI 一致。
16. nextTriggerAt 是所有 pending 的最小 trigger_at；active + null 合法。
17. 增量 migration 不破坏 Core/Finance；API/OpenAPI/Skill/本 PRD 一致。

实际验证结果与命令见 `docs/reminder-phase1-implementation.md`，不得把测试已编写等同于已通过。

---

# 72. 明确 Non-Goals

v0.2 Reminder Phase 1 不实现：

```text
Pause / Resume

Task binding
Milestone binding
Resource binding

Snooze 独立概念
（Delay 已覆盖）

Condition-based reminder

Watch / Rule engine

Email
Push
Conduit implementation

Notification delivery retry

Reminder history UI

Calendar sync

Google Calendar

Location-based reminder

Priority

Tags

AI autonomous reminder generation

Complex occurrence analytics
```

---

# 73. 最终架构

```text
                    Reminder
              schedule definition
                     │
                     │ creates
                     ▼
             ReminderOccurrence
              concrete execution
                     │
          ┌──────────┼──────────┐
          │          │          │
         DONE       DELAY      SKIP
          │          │          │
          │          │          │
          └──────────┴──────────┘

                     │ due
                     ▼
                  Scheduler
                     │
                     ▼
              Notification Event
                     │
                     ▼
             Notification Module
                  (next phase)
```