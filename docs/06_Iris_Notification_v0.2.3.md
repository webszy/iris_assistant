# Iris v0.2 — Notification PRD

**Version:** v0.2 Phase 1
**Module:** Notification
**Status:** Contract frozen; Phase 1 domain implemented; Production channel adapter pending
**Contract update:** 2026-09-23；以下正文已合并确认后的状态、调度、来源上下文和渠道身份规则。
**Dependencies:** Reminder / ReminderOccurrence
**Purpose:** Reliable notification acceptance, channel selection, delivery retry and fallback

---

## 1. 产品定义

Notification 解决的问题是：

> **Iris 已经决定有一件事情需要告诉用户，如何可靠地把这条消息持久化，并通过可用渠道最终送出去。**

Notification 不负责决定：

* 为什么要提醒
* 什么时候提醒
* 用户是否完成了事情
* Reminder 是否应该继续
* 条件是否满足

这些属于上游业务域。

例如：

```text
Reminder
→ 决定什么时候提醒

ReminderOccurrence
→ 表示这一次提醒

Notification
→ 表示 Iris 已正式接受“需要告诉用户”这件事

NotificationDelivery
→ 负责实际通过某个渠道发送
```

整体：

```text
Business Event
     │
     ▼
Notification
     │
     ▼
NotificationDelivery
     │
     ▼
Channel Adapter
     │
     ▼
External Provider
```

---

# 2. 核心实体

Notification 从第一版拆成三个概念：

```text
Notification
= immutable durable message event

NotificationDelivery
= 某一渠道的一次投递生命周期

NotificationChannel
= 用户可使用的通知渠道及其优先级
```

职责严格分离。

---

# 3. Notification

Notification 表示：

> Iris 已经正式接受一条需要通知用户的消息。

Notification 一旦创建，即成为历史事实。

因此第一版：

```text
Notification is immutable
```

不支持：

```text
PATCH Notification
DELETE Notification
修改 title/body
修改 source
```

---

# 4. Notification 内容快照

Notification 创建时保存：

```text
title
body
```

这是创建时的内容快照。

例如：

```text
Reminder.title = "锻炼"
```

触发后生成：

```text
Notification.title = "锻炼"
```

随后用户把 Reminder 改成：

```text
"晚上跑步"
```

已经存在的 Notification：

```text
仍然 = "锻炼"
```

Delivery retry 也必须继续使用 Notification 已保存的内容。

禁止 retry 时重新读取上游业务对象的最新 title/body。

---

# 5. Notification 数据模型

建议：

```text
notifications

id
user_id

source_type
source_id
source_version

dedupe_key

title
body

created_at
```

第一版不需要：

```text
updated_at
status
sent_at
failed_at
read_at
dismissed_at
```

因为 Notification 本身创建后不再变化。

---

# 6. Notification Source

每一条 Notification 必须知道：

> 它由什么业务事件产生。

对于 Reminder：

```text
source_type = reminder_occurrence
source_id = occurrence_id
source_version = trigger_version
```

未来可以扩展：

```text
finance_rule
watch
system
agent
...
```

Notification 不需要理解这些业务域。

它只保存来源身份。

---

# 7. Reminder 来源的 Dedupe Key

ReminderOccurrence 当前已经有：

```text
occurrence_id
trigger_version
```

因此 Notification 的稳定去重身份为：

```text
reminder-occurrence:{occurrenceId}:trigger:{triggerVersion}
```

要求：

```text
UNIQUE(user_id, dedupe_key)
```

同一个：

```text
occurrence_id + trigger_version
```

最多只能接受一次 Notification。

---

# 8. DELAY 与 Notification

ReminderOccurrence DELAY：

```text
trigger_version += 1
```

因此：

```text
trigger_version = 1
→ Notification A

DELAY

trigger_version = 2
→ Notification B
```

这是合法的两次 Notification。

旧 Notification 不修改、不删除。

---

# 9. Notification 与用户业务操作解耦

Notification durable accepted 之后：

```text
DONE
SKIP
CANCEL
RESCHEDULE
DELAY
```

这些上游业务动作：

**不撤回已经接受的 Notification。**

例如：

```text
Notification 已创建
Delivery pending

用户：
“做完了”

ReminderOccurrence → done
```

Notification / Delivery：

```text
继续自己的生命周期
```

第一版不尝试撤回已经接受的消息。

---

# 10. NotificationDelivery

NotificationDelivery 表示：

> 一条 Notification 通过一个具体 Channel 的投递生命周期。

建议模型：

```text
notification_deliveries

id
user_id
notification_id

channel

status

attempt_count
next_attempt_at

last_attempt_at?
sent_at?

provider_message_id?

last_error_code?
last_error_message?

created_at
updated_at
```

---

# 11. Delivery Status

第一版只支持：

```text
pending
sent
failed
```

### pending

仍然需要发送或重试。

### sent

Provider 已明确确认发送成功。

### failed

该渠道的 retry 生命周期已经终结。

不要增加：

```text
queued
retrying
processing
accepted
partial
standby
```

这些不是第一版所需的业务状态。

---

# 12. Claim 不属于业务 Status

Dispatcher 内部如果需要：

```text
claimed_at
claim_token
claim_expires_at
```

可以作为 internal execution metadata。

但不要增加：

```text
status = processing
```

作为公开业务状态。

原则：

```text
execution lease != business state
```

---

# 13. Delivery 唯一性

第一版：

```text
UNIQUE(notification_id, channel)
```

同一 Notification：

同一种 Channel 最多只能产生一个 Delivery。

例如：

```text
Notification #100

Conduit → failed
Push    → sent
```

不能再次创建：

```text
另一个 Conduit Delivery
```

---

# 14. Notification 不保存整体 Status

Notification 本身没有：

```text
status
```

因为 Delivery 才是真正变化的实体。

例如：

```text
Conduit → failed
Push    → sent
```

如果 Notification 自己再保存：

```text
sent?
failed?
partial?
```

会产生重复 source of truth。

因此 Notification overall state 只做动态推导。

---

# 15. Derived Notification State

Notification table 不持久化 status。API 只根据已持久化的 Delivery 推导：

```text
存在任一 sent → delivered
否则存在 pending → delivering
否则 → failed
```

读取状态时绝不重新读取当前 Channel 配置、Provider health 或 runtime config 来判定 failed。
渠道配置只参与 acceptance 的 initial Delivery 选择，以及 terminal failure 当场的 fallback 选择。
历史失败通知不会因为后来新增/启用渠道而自动恢复；本期没有 manual retry API。
已接受的通知至少有一条 Delivery；空历史只作为防御性读取返回 failed。

---

# 16. Notification 多渠道策略

v0.2 支持多渠道。

但是：

> **默认不是 fan-out。**

不是：

```text
Notification
├── Conduit 同时发
├── Push 同时发
└── Email 同时发
```

而是：

```text
Primary
↓
失败后
Backup 1
↓
失败后
Backup 2
```

即：

> prioritized fallback chain

---

# 17. Channel Priority

每个用户可以配置多个 Channel：

```text
notification_channels

id
user_id

channel
enabled
priority

created_at
updated_at
```

例如：

```text
conduit  enabled  priority=10
push     enabled  priority=20
email    enabled  priority=30
```

规则：

```text
priority 越小
→ 优先级越高
```

不需要额外：

```text
primary
backup
```

priority 已经表达顺序。

---

# 18. Notification Settings

用户级 Notification 总开关建议独立：

```text
notification_settings

user_id
enabled

created_at
updated_at
```

如果：

```text
enabled = false
```

视为当前没有可用通知渠道。

---

# 19. Channel Credential

敏感信息不得放入普通 D1 Channel row。

例如：

```text
API token
provider secret
authentication key
```

必须使用：

```text
Worker Secret
secure runtime configuration
```

或以后独立安全配置系统。

禁止：

```text
明文 credential 存 NotificationChannel
```

---

# 20. Enabled ≠ Usable

Channel：

```text
enabled = true
```

不一定代表它此刻可以真正使用。

Usable 必须同时满足：

```text
channel enabled
+
adapter exists
+
required runtime configuration exists
```

例如：

```text
Push enabled
但是 Push adapter 尚未安装
```

则：

```text
not usable
```

---

# 21. Notification Acceptance 时的 Channel 选择

上游业务请求创建 Notification 时：

```text
读取 NotificationSettings
↓
读取 enabled channels
↓
按 priority ASC
↓
检查 usable
↓
选择第一个 usable channel
```

只创建：

```text
1 个初始 Delivery
```

例如：

```text
Conduit usable
Push usable

→ 初始选择 Conduit
```

---

# 22. 没有任何 Usable Channel

这是已经冻结的重要规则。

如果：

```text
usable channel count = 0
```

则：

```text
不创建 Notification
不创建 Delivery
不接受该 Notification
```

对于 Reminder：

```text
ReminderOccurrence 继续保持 pending
```

Scheduler 未来再次尝试。

绝对不能：

```text
Notification 创建成功
Occurrence → triggered
但实际上没有任何发送路径
```

---

# 23. Reminder → Notification 原子事务

Reminder 是第一批 Notification producer。

ReminderOccurrence 到期时，Notification acceptance 必须在**同一个 D1 原子事务**内完成。

事务中至少执行：

```text
1. validate ReminderOccurrence

2. validate:
   status == pending
   trigger_version == expected
   trigger_at == expected
   parent Reminder/current schedule still allows trigger

3. resolve first usable channel

4. INSERT Notification

5. INSERT initial NotificationDelivery

6. ReminderOccurrence:
   pending → triggered

7. trigger_count += 1

8. last_triggered_at = now
```

全部：

```text
COMMIT
```

或：

```text
ROLLBACK
```

不能只完成其中一半。

---

# 24. Notification Durable Acceptance

正式定义：

> Notification durable acceptance = Notification + 至少一个 initial Delivery 已经成功持久化。

对于 Reminder：

只有完成 durable acceptance 后：

```text
Occurrence
pending → triggered
```

---

# 25. External Network 不进入 Acceptance Transaction

严禁：

```text
BEGIN D1 transaction
↓
INSERT Notification
↓
HTTP Conduit / APNs / Email
↓
等待公网响应
↓
COMMIT
```

外部 Provider 调用不能进入 D1 transaction。

正确：

```text
D1 acceptance
↓
commit
↓
Delivery dispatcher
↓
external Provider
```

---

# 26. 提交顺序决定竞争结果

延续 Reminder 已冻结的 contract：

> **以持久化成功提交顺序决定，不以请求开始时间决定。**

如果：

```text
DONE / SKIP / CANCEL / RESCHEDULE / DELAY
```

先成功提交，并使原 trigger identity 失效：

旧 Notification acceptance transaction 必须失败。

如果：

```text
Notification durable acceptance
```

先提交：

Notification 和 Delivery 保留。

随后发生的 Reminder 动作不撤回它。

---

# 27. Notification 接收端校验 Trigger Identity

Reminder handoff 时必须校验：

```text
occurrence_id
trigger_version
trigger_at
status
schedule validity
```

不能只校验：

```text
occurrence_id
```

因为 DELAY 可能产生新的：

```text
trigger_version
```

---

# 28. NotificationDelivery Dispatcher

Delivery 由独立 deterministic dispatcher 处理。

流程：

```text
Scheduled handler
↓
find:
status = pending
AND next_attempt_at <= now
↓
claim Delivery
↓
load Notification
↓
resolve Channel Adapter
↓
send
↓
persist result
```

Notification dispatcher 与 Reminder scheduler 是两个逻辑 Service。

即使它们由同一个 Cloudflare Scheduled Handler 调度，也不能混成同一个业务模块。

---

# 29. Channel Adapter

定义薄边界，例如概念：

```text
interface NotificationChannelAdapter {
  send(...): Promise<DeliveryResult>
}
```

Adapter 负责：

```text
provider endpoint
authentication
payload format
provider response parsing
provider-specific idempotency support
```

Notification domain 不直接理解 Provider HTTP details。

---

# 30. 第一版 Adapter 范围

Domain 已支持多 channel、priority 和 sequential fallback。本期检查仓库后未发现明确的
production Provider contract/config，因此不猜 Conduit endpoint、credentials、payload 或 destination。

当前实现 `NotificationChannelAdapter` boundary、可注入的 registry 和仅在 tests 中的 Fake Adapter。
生产 registry 为空，明确报告：**Production channel adapter pending**。

生产环境 usable channel = 0：不创建 Notification/Delivery，ReminderOccurrence 保持 pending。
Channel CREATE 只接受已注册 identifier，所以当前生产环境不能创建示例 conduit/push/email 配置。
示例名称不是已上线功能。Fake Adapter 绝不注册到 production runtime。

未来接入一个真实 Adapter 时实现 runtime usability、认证、目标用户路由、格式化、响应分类和
稳定 provider idempotency；不得借本期硬编码未知 Provider 或扩成消息平台。

---

# 31. Provider Payload

Notification 保存：

```text
canonical title
canonical body
```

Adapter 可以按照 Provider 要求：

```text
format
escape
truncate
transform
```

但：

```text
不得修改 Notification 本身
```

---

# 32. Delivery 成功

Provider 明确返回成功：

```text
Delivery.status = sent
attempt_count = claim 时已预留的本次 attempt（结果写回不再次加一）
last_attempt_at = now
sent_at = now
provider_message_id = provider value if available
```

清理/保留错误字段按实现 convention，但不得影响历史可审计性。

---

# 33. Temporary Failure

例如：

```text
timeout
429
5xx
temporary network error
```

如果仍允许 retry：

```text
status = pending
attempt_count = claim 时已预留的本次 attempt（结果写回不再次加一）
last_attempt_at = now
next_attempt_at = calculated backoff
last_error_code/message = sanitized error
```

---

# 34. Permanent Failure

例如：

```text
invalid destination
unsupported destination
permanently invalid provider config
non-retryable provider response
```

或者：

```text
retry limit exhausted
```

则：

```text
status = failed
```

---

# 35. Retry Policy

有限尝试 + backoff，策略集中在 `DELIVERY_POLICY`，不增加数据库 retry 配置。

当前实现最多 5 次 attempt，第一次也计入；失败后等待 1、5、15、60 分钟。
网络 timeout 为 15 秒，execution lease 为 60 秒。claim 时原子预留 attempt 并记录 lastAttemptAt，
因此网络发送前后 worker crash 也消耗一次预算，避免崩溃导致无限重试。

租约过期可重新 claim；最后一次 attempt 崩溃后，恢复流程终结该 Delivery 并选择 fallback，
不会再发送第 6 次。旧 claim token 的迟到结果不能覆盖新结果或创建备用投递。
claim 不改变 pending 业务状态，internal claim fields 不通过 API 返回。

Timeout / 429 / 5xx / 暂时网络错误可重试；永久配置/认证/目标错误或预算耗尽进入 failed + fallback。
next_attempt_at 是最早重试时间，真正执行受约一分钟 cadence、任务积压及平台调度影响，非秒级承诺。
这些具体次数/分钟数是当前实现常量，不是未来不可修改的产品配置契约。

---

# 36. Exactly-once 边界

Iris 内部可以保证：

```text
一个 source trigger identity
→ 一个 Notification

一个 Notification + Channel
→ 一个 Delivery
```

但是：

```text
Iris → external Provider
```

不能对所有 Provider 承诺严格 exactly-once。

因此 Delivery contract 是：

> **at-least-once delivery with best-effort provider-side deduplication**

如果 Provider 支持 idempotency key：

必须使用稳定 Delivery identity。

如果 Provider 不支持：

极端 timeout + retry 情况允许出现重复送达。

不要用普通锁假装解决公网 exactly-once。

---

# 37. Provider Idempotency

每个 Delivery 应有稳定 identity：

```text
delivery_id
```

如果 Provider 支持：

```text
Idempotency-Key
```

所有 retry 必须使用同一个稳定 key。

不要每次 retry 产生新 key。

---

# 38. Delivery Failure → Backup Channel

当 Delivery terminal failed，在同一个 D1 atomic batch 中：

1. 按当前 claim token 条件更新 pending → failed。
2. 检查该 Notification 没有 sent 或另一个 pending。
3. 读取此批次看到的最新 settings/channel 配置，选 enabled、usable、尚未尝试的 channel。
4. 若存在则创建唯一的 pending backup；最后释放旧 claim token。

settings disabled 时不创建新的 backup，但已有 Delivery 继续其生命周期。
优先级按 priority ASC、created_at ASC、id ASC；已尝试过的 channel 永不创建第二条 Delivery。
任何语句失败都会回滚 failed transition 与 backup insertion；通过 lease recovery 重试。
成功提交后 token 已释放，旧处理流程重复执行不能让历史 failed 通知重新复活。

数据库同时约束 UNIQUE(notification_id, channel) 和每 Notification 最多一个 pending 的部分唯一索引。
一旦存在 sent，停止 fallback。不同 Notification 可并发，同一 Notification 的渠道链始终顺序执行。

---

# 39. Backup 不是预先创建

第一版禁止提前创建：

```text
Push standby
Email standby
```

只在：

```text
当前渠道 terminal failure
```

后才创建下一 Delivery。

因此状态仍然只有：

```text
pending
sent
failed
```

---

# 40. Backup 使用最新 Channel 配置

Notification 创建时：

```text
不 snapshot 整条 fallback chain
```

Failover 发生时：

```text
重新读取当前用户 Channel 配置
```

例如：

Notification 创建时：

```text
Conduit
Push
Email
```

之后用户关闭：

```text
Email
```

Conduit、Push 都失败后：

```text
不会再尝试 Email
```

---

# 41. 已经创建的 Delivery 不受设置变化影响

如果：

```text
Conduit Delivery 已存在
status = pending
```

之后用户：

```text
disable Conduit
```

该已存在 Delivery：

> 继续完成自己的 retry 生命周期。

Channel 设置变化只影响：

```text
未来新的 Delivery 选择
```

不撤回已接受 Delivery。

---

# 42. Source 状态变化不取消 Delivery

Notification durable accepted 后：

以下动作：

```text
Reminder DONE
Reminder SKIP
Reminder CANCEL
Reminder RESCHEDULE
Reminder DELAY
```

都：

```text
不取消现有 Delivery
```

也：

```text
不阻止该 Notification 后续 fallback
```

例如：

```text
Conduit pending
↓
用户 DONE
↓
Conduit 最终 failed
↓
仍然允许 Push backup
```

这属于已经冻结的 contract。

---

# 43. 为什么不撤回

原因：

外部 Provider 可能已经收到消息，只是 Iris 尚未确认。

例如：

```text
HTTP timeout
```

不能判断：

```text
Provider 没收到
```

还是：

```text
Provider 已收到但 response 丢失
```

因此 durable accepted Notification 不做撤回式语义。

---

# 44. Delivery 全部失败

terminal failure 当场没有 next eligible channel 时，不创建 backup。
所有已持久化 Deliveries 均 failed，因此 Notification derived state = failed。

之后修改 Channel/settings 不扫描历史通知、不重新计算 eligibility、不自动恢复发送。
无 sent、无 pending 即 failed，读取过程只依赖 Delivery history。

失败只记录 normalized error metadata，不创建“通知发送失败”的新 Notification，避免递归。

---

# 45. Notification API

第一版 Notification 是内部 producer 创建。

因此公开 API 建议只有读取：

```http
GET /api/v1/notifications

GET /api/v1/notifications/{notificationId}

GET /api/v1/notifications/{notificationId}/deliveries
```

不公开：

```text
POST Notification
PATCH Notification
DELETE Notification
```

Agent 第一版不能随意创建 arbitrary Notification。

---

# 46. Notification List

GET /api/v1/notifications 支持 source_type、from、to；当前 source_type 只支持 reminder_occurrence。
from/to 按 created_at 过滤，包含两端，要求 from ≤ to。默认 created_at DESC、id ASC。

沿用当前 repository convention：返回数组，不增加新的 pagination 或 state-filter API。
请求参数 snake_case，响应字段 camelCase，未知参数由 strict schema 拒绝。

---

# 47. Notification Response

```json
{
  "id": "notification-id",
  "sourceType": "reminder_occurrence",
  "sourceId": "occurrence-id",
  "sourceVersion": 3,
  "sourceContext": { "reminderId": "reminder-id" },
  "title": "该锻炼了",
  "body": "今天的力量训练",
  "deliveryState": "delivering",
  "createdAt": "2026-09-23T00:00:00.000Z"
}
```

body 在 Reminder.description=null 时为 null。deliveryState 仅由已持久化 Delivery 推导。
sourceContext 是 user-scoped relation 的解析结果，不新增持久化字段或业务 identity。
若关系不可解析，sourceContext=null，消费者不得猜测对象。默认不返回 dedupeKey。

---

# 48. Delivery READ

```http
GET /api/v1/notifications/{notificationId}/deliveries
```

Response 类似：

```json
{
  "id": "...",
  "notificationId": "...",

  "channel": "conduit",
  "status": "failed",

  "attemptCount": 5,
  "nextAttemptAt": null,

  "lastAttemptAt": "...",
  "sentAt": null,

  "providerMessageId": null,
  "lastErrorCode": "TIMEOUT",

  "createdAt": "...",
  "updatedAt": "..."
}
```

不要默认向 Agent 返回原始 provider error body。

---

# 49. NotificationSettings API

```http
GET /api/v1/notifications/settings
PUT /api/v1/notifications/settings
```

PUT strict request：`{"enabled":true}` 或 false；按 user_id upsert。
GET 缺失返回 422 NOTIFICATION_SETTINGS_NOT_FOUND，沿用 repository 显式 settings 模式。
不自动创建 enabled=true；没有 settings 视为不能选择新 Delivery。

enabled=false 阻止未来 acceptance/fallback selection，不撤回已有 Delivery。
响应为 enabled、createdAt、updatedAt。

---

# 50. NotificationChannel API

```http
GET /api/v1/notifications/channels
POST /api/v1/notifications/channels
PATCH /api/v1/notifications/channels/{channelId}
```

CREATE 必填 channel、enabled、priority。channel 去首尾空格并规范化小写，只允许已注册 Adapter identifier。
PATCH 仅接受 enabled、priority，至少一项；明确禁止修改 channel。
priority 为 0–2147483647 整数。响应包含 id、channel、enabled、priority、createdAt、updatedAt。

UNIQUE(user_id, channel)。重复 CREATE 返回 409 NOTIFICATION_CHANNEL_ALREADY_EXISTS。
本期不提供 DELETE；通过 enabled=false 停用，保留配置与投递历史。
不接收 secret/token、provider URL 或任意 destination。

---

# 51. Channel Priority

要求：

```text
priority integer
```

Channel selection：

```text
ORDER BY priority ASC
```

如果 priority 相同：

必须使用稳定 secondary ordering，例如：

```text
created_at
id
```

不要产生随机 Primary Channel。

---

# 52. Channel Name

第一版：

```text
channel
```

应为 Server 已注册 Adapter 的明确 identifier。

例如：

```text
conduit
push
email
telegram
```

不要允许任意字符串直接变成外部执行 Provider。

未知 channel：

```text
INVALID_NOTIFICATION_CHANNEL
```

---

# 53. Secrets

Notification API 永远不得返回：

```text
provider token
secret
Authorization
API key
private credential
```

Adapter 的 runtime secret 完全独立于 Agent-facing API。

---

# 54. Reminder 集成

Reminder Scheduler：

```text
due ReminderOccurrence
↓
NotificationAcceptanceService
↓
D1 atomic transaction
↓
Notification + initial Delivery + Occurrence triggered
```

不要：

```text
Reminder Scheduler
→ Conduit HTTP
```

---

# 55. Notification Source Context

canonical source identity 保持：

```text
source_type = reminder_occurrence
source_id = occurrenceId
source_version = triggerVersion
```

API 通过 user-scoped occurrence → reminder relation 补充 sourceContext.reminderId。
不修改 Notification 持久化模型，不把 sourceContext 当作新的业务 identity。
Adapter 内部 send input 同样允许携带这份解析结果。

用户回复“做完了 / 晚点 / 今天算了”时，Agent 使用 sourceContext.reminderId + sourceId，
读取当前 occurrence 后调用已有嵌套 Reminder API 的 DONE / DELAY / SKIP。
历史 Notification 可能来自旧 triggerVersion，不能据此假设当前状态未变。

不增加 global occurrence lookup，不增加 Notification action API，不根据 title/body 模糊猜测。
来源关系缺失或意图不明确时先澄清。Skill 主业务动作加载 reminder-api.md。

---

# 56. Notification 不承载业务动作

不要提供：

```text
POST /notifications/{id}/done
POST /notifications/{id}/delay
POST /notifications/{id}/skip
```

这些操作必须回到 source domain。

例如：

```text
ReminderOccurrence
```

才拥有：

```text
DONE
DELAY
SKIP
```

---

# 57. Scheduler 架构

仍为同一个 Worker scheduled entrypoint，严格按 event.cron 分发：

```text
* * * * *   → ReminderScheduler → NotificationDeliveryDispatcher
0 20 * * *  → Finance FX Sync
```

每天 UTC 20:00 / 北京时间次日 04:00 执行 FX；一分钟触发时不执行 Finance。
Reminder 扫描故障不会跳过已有 Delivery 恢复；异常通过 scheduled invocation failure 汇报。
Reminder 不理解 Provider HTTP，外部网络只出现在 Delivery 阶段。

trigger_at / next_attempt_at 是目标/最早时间，实际执行受约一分钟 cadence 影响，不承诺秒级。

Scheduler 使用 (trigger_at,id) keyset 分页，默认每页 100、每轮最多扫描 1000、接受 100。
blocked record 不停止同次 run 的后续页。分页前通过 SQL 过滤无 enabled settings/channel 或无 usable adapter
的用户，即使无渠道 backlog 超过 scan budget，也不能长期占据最前面的批次挡住可投递用户。
acceptance 的批次中仍重新校验选择条件，预过滤不是原子验证的替代。

Delivery 每轮最多选择 100 条，最多并发 5 条；每次 claim 用当时的时间计算租约。

---

# 58. Suggested Indexes

建议至少：

```text
notifications:
(user_id, created_at)

UNIQUE(user_id, dedupe_key)

notification_deliveries:
(notification_id, channel) UNIQUE

(status, next_attempt_at)

(user_id, notification_id)

notification_channels:
(user_id, enabled, priority)
```

具体按 D1 实际 query pattern 调整。

---

# 59. Security / User Isolation

Notification：

```text
strictly user scoped
```

Delivery：

```text
strictly user scoped
```

NotificationSettings：

```text
user scoped
```

NotificationChannel：

```text
user scoped
```

即使知道 UUID：

不能访问其他用户的数据。

---

# 60. Logging

允许 structured operational logs：

```text
notification id
delivery id
channel
attempt count
delivery result class
provider status code if safe
```

禁止记录：

```text
Authorization
API token
secret
完整 provider credential
```

对于 Notification body：

默认不要在 operational log 中全文 dump。

---

# 61. Error Categories

建议至少有：

```text
NOTIFICATION_NOT_FOUND

NOTIFICATION_DELIVERY_NOT_FOUND

NOTIFICATION_SETTINGS_NOT_FOUND

NOTIFICATION_DISABLED

NO_USABLE_NOTIFICATION_CHANNEL

INVALID_NOTIFICATION_CHANNEL

NOTIFICATION_CHANNEL_NOT_FOUND

NOTIFICATION_CHANNEL_ALREADY_EXISTS

```

内部 dispatcher/provider 错误不一定全部暴露给 Agent。

继续复用：

```text
BAD_REQUEST
UNAUTHORIZED
INTERNAL_ERROR
```

---

# 62. Notification Acceptance 无渠道时的错误语义

对于内部 Reminder Scheduler：

```text
NO_USABLE_NOTIFICATION_CHANNEL
```

属于：

```text
retryable operational condition
```

ReminderOccurrence 保持：

```text
pending
```

不应该：

```text
failed
cancelled
triggered
```

---

# 63. Delivery Retry 与 Channel Availability

一旦 Delivery 已创建：

它自己的 retry lifecycle 不再因为：

```text
channel.enabled=false
```

而中断。

但如果 Adapter/runtime configuration 本身已经不存在到无法执行：

可最终依据明确规则标记：

```text
failed
```

然后进入 backup selection。

不要永久卡死。

---

# 64. Immutable Notification 的意义

以下全部不能修改历史 Notification：

```text
Reminder title changed
Project name changed
User changed Notification channel
Source object deleted/archived
```

Notification 仍作为：

> 当时 Iris 实际接受的消息记录。

---

# 65. Phase 1 Acceptance Criteria

至少覆盖：

1. ReminderOccurrence 可以原子接受 Notification。
2. 同一 `occurrence_id + trigger_version` 不重复创建 Notification。
3. Acceptance 同时创建 initial Delivery。
4. 没有 usable channel 时不创建 Notification。
5. 没有 usable channel 时 ReminderOccurrence 保持 pending。
6. 多 channel 按 priority 选择第一个 usable。
7. 初始只创建一个 Delivery，不 fan-out。
8. Notification 创建后不可修改。
9. Notification 内容是快照。
10. Delivery 成功 → sent。
11. 临时失败 → pending + retry。
12. retry exhausted → failed。
13. Primary failed 后创建 Backup Delivery。
14. Backup 按当前最新 channel settings 选择。
15. 已尝试 channel 不再次创建 Delivery。
16. 某一 Delivery sent 后不再 failover。
17. 没有 sent/pending Delivery 时 derived state = failed，读取不依赖当前 Channel 配置。
18. Channel 后续 disable 不取消已有 pending Delivery。
19. Reminder DONE 不取消 Delivery。
20. Reminder SKIP 不取消 Delivery。
21. Reminder CANCEL 不取消 Delivery。
22. Reminder RESCHEDULE 不取消 Delivery。
23. Reminder DELAY 不取消旧 Notification。
24. DELAY 新 trigger_version 可以创建新的 Notification。
25. 同一 Notification + channel 唯一。
26. Provider retry 使用稳定 idempotency identity。
27. User isolation 正确。
28. Notification API 不能创建任意 Notification。
29. 历史 failed 不因新增/启用 Channel 自动复活。
30. Channel PATCH 不允许修改 channel，重复 CREATE 返回 409。
31. Source context 可解析现有 Reminder 嵌套动作接口。
32. 无渠道 pending backlog 不阻塞后面的可投递 occurrence。
33. Notification API 不暴露 secret。
30. Delivery dispatcher 与 Reminder scheduler 分离。

---

# 66. Non-Goals

v0.2 Notification Phase 1 不实现：

```text
simultaneous multi-channel fan-out

per-Reminder channel override

per-Notification arbitrary routing rules

quiet hours

priority-based notification importance

read / unread

dismiss

acknowledge

notification delete

notification edit

rich notification UI

attachments

action buttons

user-created arbitrary notification

provider delivery analytics

delivery receipts across every provider

notification aggregation / digest

Notification failure generating another Notification

complex per-channel retry configuration
```

---

# 67. 当前架构

最终链路：

```text
ReminderOccurrence
        │
        │ due
        ▼
┌─────────────────────────────┐
│ D1 Atomic Acceptance        │
│                             │
│ validate trigger identity   │
│ resolve primary channel     │
│ create Notification         │
│ create initial Delivery     │
│ Occurrence → triggered      │
└─────────────────────────────┘
              │
              ▼
       Notification
         immutable
              │
              ▼
       Primary Delivery
              │
        ┌─────┴─────┐
        │           │
      sent        failed
        │           │
       STOP         ▼
                Backup #1
                    │
              ┌─────┴─────┐
              │           │
            sent        failed
              │           │
             STOP         ▼
                      Backup #2
```

---

# 68. 核心架构原则

这一版 Notification 最终可以概括成五句话：

```text
1. Notification 是不可变的 durable event。

2. Delivery 才负责发送、重试和失败。

3. 多渠道默认是优先级 fallback，不是 fan-out。

4. Notification 一旦 durable accepted，后续业务动作不撤回。

5. Reminder → Notification 的接受必须与 Occurrence 状态变化在同一 D1 原子事务中完成。
```

# 69. Phase 1 实现与验收记录

实现包含四张 additive tables、Reminder 原子接入、Delivery dispatcher、8 个公开操作、
两份 API reference 和 Skill progressive loading。Reminder schedule/trigger model 直接复用，
没有修改 Reminder 表结构或将 occurrence progression 移出事务。

D1 实际采用条件 mutation + batch；不依赖传统 BEGIN/COMMIT API。
NotificationAcceptancePlan 校验 Notification 和初始 Delivery 都实际存在，失败整批回滚。

**Production channel adapter pending**。本期不部署、不 push、不执行生产 migration、
不发送真实通知、不读取真实 credentials。生产 registry 为空，Fake Adapter 仅在 tests。

详细文件归属、测试结果、限制与 migration/test/OpenAPI/local scheduler/后续部署命令：
[Notification Phase 1 implementation report](notification-phase1-implementation.md)。
