# Iris v0.2 — Finance PRD

**Version:** v0.2 Phase 1
**Module:** Finance / Project Expense Tracking
**Status:** Draft → Ready for implementation
**Dependency:** Iris v0.1 Project Core
**External FX Provider:** Frankfurter v2

---

## 1. 产品定义

Iris Finance v0.2 的第一阶段只解决一个核心问题：

> **记录每个 Project 花了多少钱，并在多币种环境下保留这笔支出发生时所采用的汇率。**

Finance 是现有 Project 模型的补充，而不是独立的完整财务系统。

核心关系：

```text
User
├── FinanceSettings
│   └── reporting_currency
│
├── Project
│   └── Expense
│
└── Exchange Rates
    └── current FX cache
```

其中：

```text
Project
= 工作 / 生活 / 产品等现有管理单位

Expense
= Project 已经发生的一笔支出

ExchangeRate
= 当前可用于新 Expense 的汇率

FinanceSettings
= 用户希望使用什么币种统一观察成本
```

---

# 2. Goals

v0.2 Finance 必须能够支持：

1. 为 Project 记录 Expense。
2. 支持不同 Expense 使用不同币种。
3. 用户设置自己的 reporting currency。
4. 系统每天自动获取最新汇率。
5. ExchangeRate 只保存当前汇率，不保存历史。
6. 创建 Expense 时，将实际采用的汇率数字保存到 Expense。
7. ExchangeRate 后续变化不能改变历史 Expense。
8. 用户可以显式指定某笔 Expense 的实际汇率。
9. 可以查看 Project 的 Expense。
10. 可以按时间、币种、分类过滤 Expense。
11. 可以计算 Project 在 reporting currency 下的历史总成本。
12. Iris Agent 可以通过 Skill 记录、读取、修改和删除 Expense。

---

# 3. Non-Goals

v0.2 Finance **不做完整财务系统**。

明确不实现：

```text
Income
Account
Bank Account
Balance
Transfer
Double-entry bookkeeping
Invoice
Receivable
Payable
Budget
Tax
Asset / Liability
Bank synchronization
Credit card synchronization
Accounting reports
Profit & Loss
Balance Sheet
Cash Flow Statement
Historical FX database
Historical FX lookup
FX snapshot entity/table
Notification
Reminder
Finance rules
AI anomaly detection
```

Finance v0.2 Phase 1 只有：

> **Project Expense Tracking**

---

# 4. 核心概念

## 4.1 Reporting Currency

每个用户配置一个：

```text
reporting_currency
```

例如：

```text
CNY
```

这意味着用户希望 Iris 将不同币种的 Project Expense 换算为人民币进行统一观察。

例如：

```text
Expense A
$100

Expense B
€50

Expense C
¥200
```

可以统一计算 Project 的 reporting cost。

Reporting currency 是：

> 用户层级设置。

不是 Project 设置。

---

# 5. FinanceSettings

每个 User 最多一条 FinanceSettings。

建议数据模型：

```text
finance_settings

user_id
reporting_currency

created_at
updated_at
```

约束：

```text
PRIMARY KEY(user_id)
```

`reporting_currency`：

```text
3-letter currency code
uppercase
```

例如：

```text
CNY
USD
EUR
JPY
SGD
```

---

## 5.1 FinanceSettings API

### GET

```http
GET /api/v1/finance/settings
```

成功：

```json
{
  "success": true,
  "data": {
    "reportingCurrency": "CNY",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### PUT

```http
PUT /api/v1/finance/settings
```

Request：

```json
{
  "reporting_currency": "CNY"
}
```

PUT 采用 create-or-replace/update 语义。

---

## 5.2 Reporting Currency 修改规则

修改：

```text
CNY → USD
```

只影响：

> **未来新创建的 Expense。**

历史 Expense 已保存：

```text
reporting_currency
exchange_rate
```

不得重新计算。

例如：

```text
September Expense
currency = USD
reporting_currency = CNY
exchange_rate = 7.12
```

即使用户后来设置：

```text
reporting_currency = USD
```

历史记录仍然：

```text
USD → CNY
7.12
```

---

# 6. ExchangeRate

ExchangeRate 不是财务历史记录。

它只是：

> **Current FX Rate Cache**

用途只有一个：

> 创建新的 Expense 时提供当前汇率。

---

# 7. ExchangeRate 数据模型

建议：

```text
exchange_rates

base_currency
quote_currency

rate_scaled

source
rate_date
fetched_at
updated_at
```

唯一约束：

```text
PRIMARY KEY(base_currency, quote_currency)
```

不需要：

```text
id
user_id
history
created_at
```

---

## 7.1 汇率方向

统一定义：

```text
1 base_currency
=
rate
quote_currency
```

例如：

```text
base_currency  = USD
quote_currency = CNY

rate = 7.12000000
```

表示：

```text
1 USD = 7.12 CNY
```

这个语义不得改变。

---

# 8. 汇率存储精度

数据库不要使用 floating point 保存汇率。

建议：

```text
FX_RATE_SCALE = 100_000_000
```

即 8 位小数。

例如：

```text
7.12345678
```

数据库：

```text
rate_scaled = 712345678
```

API 对外：

```json
{
  "rate": "7.12345678"
}
```

Agent 不需要接触 `rate_scaled`。

---

# 9. Frankfurter Provider

v0.2 使用：

```text
Frankfurter v2
```

Frankfurter 当前公共 API：

```text
https://api.frankfurter.dev/v2
```

不要求 API Key；`/v2/rates` 支持 `base`、`quotes` 等参数，返回 daily exchange-rate data。([Frankfurter][1])

Iris 不依赖 Frankfurter SDK。

直接使用 HTTPS。

---

# 10. Exchange Rate Sync

使用 Cloudflare Scheduled Trigger / Cron：

```text
Daily Cron
↓
Frankfurter
↓
Normalize rates
↓
UPSERT exchange_rates
```

频率：

```text
once per day
```

具体 UTC 时间属于部署配置，不属于 Finance domain contract。

---

# 11. Exchange Rate 获取策略

对于每个当前存在的：

```text
FinanceSettings.reporting_currency
```

读取 distinct currency。

例如：

```text
CNY
USD
```

分别同步。

假设 reporting currency：

```text
CNY
```

调用：

```http
GET https://api.frankfurter.dev/v2/rates?base=CNY
```

Frankfurter 返回：

```text
CNY → USD
CNY → EUR
CNY → JPY
...
```

Iris 将其标准化为 Expense 所需要的方向：

```text
USD → CNY
EUR → CNY
JPY → CNY
...
```

计算：

```text
X → CNY
=
1 / (CNY → X)
```

然后存入：

```text
exchange_rates
```

---

# 12. FX Provider 信息

保存：

```text
source = frankfurter
```

如果 Provider response 包含 rate date：

```text
rate_date
```

记录 provider rate 对应日期。

同时：

```text
fetched_at
```

记录 Iris 实际拉取时间。

例如：

```text
rate_date  = 2026-09-21
fetched_at = 2026-09-22T02:00:00Z
```

两者语义不同，不要混合。

---

# 13. ExchangeRate 更新规则

采用：

```text
UPSERT
```

同一：

```text
base_currency + quote_currency
```

每天覆盖旧：

```text
rate_scaled
rate_date
source
fetched_at
updated_at
```

ExchangeRate 表：

**不保存历史。**

例如：

```text
09/22
USD → CNY = 7.12

09/23
USD → CNY = 7.15
```

最终表中只有：

```text
USD → CNY = 7.15
```

---

# 14. Sync Failure

绝对禁止：

```text
DELETE old rates
→ fetch
→ fetch fails
→ rates empty
```

正确流程：

```text
Fetch Provider
↓
HTTP success?
↓
Parse?
↓
Validate?
↓
Normalize?
↓
only then UPSERT
```

任何步骤失败：

```text
keep previous exchange_rates
```

同时记录 structured error log。

Provider 故障不得破坏旧汇率缓存。

---

# 15. Expense

Expense 表示：

> Project 已经发生的一笔成本。

每个 Expense 必须属于：

```text
User
+
Project
```

Project 是 required。

---

# 16. Expense 数据模型

```text
expenses

id
user_id
project_id

amount_minor
currency

reporting_currency
exchange_rate_scaled

category
description

occurred_at

created_at
updated_at
```

不包含：

```text
exchange_rate_id
reporting_amount
account_id
task_id
milestone_id
```

---

# 17. Expense 与 ExchangeRate 的关系

它们之间**没有数据库 FK**。

创建 Expense 时：

```text
exchange_rates
↓
读取当前 rate
↓
将具体 rate number 写入 Expense
```

例如：

```text
current USD/CNY
=
7.12
```

Expense：

```text
amount = 100 USD
reporting_currency = CNY
exchange_rate = 7.12
```

第二天：

```text
exchange_rates
USD/CNY = 7.18
```

旧 Expense：

```text
exchange_rate
仍然 = 7.12
```

历史 Expense 永远不会因为当前 FX Cache 更新而改变。

第一版不设计独立 Snapshot entity/table。

---

# 18. Expense Amount

API 不要求 Agent 操作数据库整数。

Request 使用 decimal string：

```json
{
  "amount": "120.50"
}
```

不要要求 Agent：

```text
12050
```

数据库内部使用 integer/fixed-point representation。

禁止直接用 JavaScript floating point 作为账务持久化依据。

具体 money integer implementation 应与支持的 currency precision 保持一致。

---

# 19. Expense CREATE API

```http
POST /api/v1/projects/{projectId}/expenses
```

Request：

```json
{
  "amount": "120.50",
  "currency": "USD",
  "category": "ads",
  "description": "Meta Ads",
  "occurred_at": "2026-09-22T10:30:00+08:00"
}
```

可选手动指定：

```json
{
  "amount": "100.00",
  "currency": "USD",
  "exchange_rate": "7.18430000",
  "description": "AWS"
}
```

---

# 20. Expense CREATE 汇率解析

流程必须完全 deterministic。

```text
Resolve Project
↓
Verify user owns Project
↓
Load FinanceSettings
↓
Resolve reporting_currency
↓
Resolve rate
↓
Create Expense
```

汇率优先级：

### Case 1 — 用户明确提供

```text
exchange_rate supplied
```

使用用户提供值。

---

### Case 2 — 相同币种

```text
currency == reporting_currency
```

使用：

```text
exchange_rate = 1
```

不查询 ExchangeRate。

---

### Case 3 — 不同币种

查询：

```text
exchange_rates

base_currency  = expense.currency
quote_currency = reporting_currency
```

使用当前 rate。

---

# 21. Missing ExchangeRate

如果：

```text
currency != reporting_currency
```

并且：

```text
没有 manual exchange_rate
```

并且数据库：

```text
没有对应 ExchangeRate
```

CREATE 失败。

错误：

```text
EXCHANGE_RATE_NOT_FOUND
```

不要：

* 猜汇率
* 使用 1
* 自动使用其他 pair
* 让 LLM 推理汇率

用户仍然可以显式提供 exchange rate。

---

# 22. Historical Expense Input

第一版不做 Historical FX。

例如今天用户说：

> 8 月 10 日 AWS 花了 $100。

如果没有显式汇率：

```text
使用当前 exchange_rates
```

而不是自动查询 8 月 10 日。

如果用户知道实际账单汇率：

```text
exchange_rate = user provided
```

使用它。

`occurred_at` 不决定 FX lookup date。

这是 v0.2 明确接受的限制。

---

# 23. Expense Response

Response 使用 Agent-friendly decimal string。

例如：

```json
{
  "success": true,
  "data": {
    "id": "...",
    "projectId": "...",

    "amount": "120.50",
    "currency": "USD",

    "reportingCurrency": "CNY",
    "exchangeRate": "7.12000000",
    "reportingAmount": "857.96",

    "category": "ads",
    "description": "Meta Ads",

    "occurredAt": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

`reportingAmount`：

可以 API 动态计算。

**数据库不存。**

---

# 24. Expense CRUD API

```http
GET
/api/v1/projects/{projectId}/expenses

POST
/api/v1/projects/{projectId}/expenses

GET
/api/v1/projects/{projectId}/expenses/{expenseId}

PATCH
/api/v1/projects/{projectId}/expenses/{expenseId}

DELETE
/api/v1/projects/{projectId}/expenses/{expenseId}
```

所有请求：

```text
Bearer Iris API Token
```

并严格：

```text
user_id scoped
```

---

# 25. Expense List

支持基础过滤：

```text
from?
to?
currency?
category?
```

时间过滤基于：

```text
occurred_at
```

默认排序：

```text
occurred_at DESC
```

如果现有项目已经有统一 pagination convention：

沿用现有 convention。

不要为 Finance 单独发明新的分页协议。

---

# 26. Expense PATCH

允许修改：

```text
amount
currency
exchange_rate
category
description
occurred_at
```

不允许客户端修改：

```text
user_id
project_id
reporting_currency
created_at
```

---

# 27. PATCH 汇率语义

### 修改 amount

例如：

```text
100 USD → 120 USD
```

保留：

```text
currency
reporting_currency
exchange_rate
```

---

### 修改 description/category

不改变 FX。

---

### 修改 occurred_at

不改变 FX。

因为 v0.2：

```text
occurred_at != historical FX lookup
```

---

### 修改 currency

旧 rate 失效。

按照以下规则重新 resolve：

```text
explicit exchange_rate?
→ use it

else new currency == stored reporting_currency?
→ rate = 1

else
→ current ExchangeRate lookup
```

注意：

使用 Expense 自己已经保存的：

```text
reporting_currency
```

而不是当前 FinanceSettings。

---

### 修改 exchange_rate

直接使用提供的新汇率。

---

# 28. Expense DELETE

v0.2 允许：

```http
DELETE Expense
```

DELETE：

```text
只删除 Expense record
```

不影响：

```text
Project
FinanceSettings
ExchangeRate
```

第一版不实现：

```text
archive
soft delete
audit ledger
```

---

# 29. Expense Category

第一版：

```text
category = optional string
```

不要 enum。

允许：

```text
ads
hosting
domain
api
subscription
office
supplier
travel
software
...
```

Server：

```text
trim
reject empty-after-trim
reasonable max length
```

不要在 v0.2 建立复杂 taxonomy。

---

# 30. Project Expense Summary

Project Expense Tracking 如果只能存、不能快速统计，价值不足。

因此提供：

```http
GET /api/v1/projects/{projectId}/expenses/summary
```

支持：

```text
from?
to?
category?
```

---

# 31. Summary Calculation

每条 Expense 使用自己保存的：

```text
amount
exchange_rate
reporting_currency
```

进行换算。

绝对不能：

```text
重新读取 current exchange_rates
```

计算历史成本。

---

# 32. Summary Response

例如：

```json
{
  "success": true,
  "data": {
    "count": 18,

    "originalTotals": [
      {
        "currency": "USD",
        "amount": "1260.50"
      },
      {
        "currency": "CNY",
        "amount": "3200.00"
      }
    ],

    "reportingTotals": [
      {
        "currency": "CNY",
        "amount": "12176.43"
      }
    ]
  }
}
```

为什么 `reportingTotals` 是数组：

因为用户可能：

```text
过去 reporting_currency = CNY
后来 reporting_currency = USD
```

历史 Expense 不重算。

所以一个 Project 历史上可能同时存在：

```text
CNY reporting expenses
USD reporting expenses
```

禁止：

```text
CNY + USD
```

直接相加。

必须按：

```text
reporting_currency
```

分组。

---

# 33. ExchangeRate Read API

提供只读 API：

```http
GET /api/v1/finance/exchange-rates
```

支持：

```text
base_currency?
quote_currency?
```

例如：

```http
GET /api/v1/finance/exchange-rates?base_currency=USD&quote_currency=CNY
```

Response：

```json
{
  "success": true,
  "data": {
    "baseCurrency": "USD",
    "quoteCurrency": "CNY",
    "rate": "7.12000000",
    "source": "frankfurter",
    "rateDate": "...",
    "fetchedAt": "..."
  }
}
```

Agent 不允许：

```text
POST ExchangeRate
PATCH ExchangeRate
DELETE ExchangeRate
```

汇率更新属于 Server internal infrastructure。

---

# 34. Error Codes

新增至少：

```text
FINANCE_SETTINGS_REQUIRED

EXPENSE_NOT_FOUND

INVALID_MONEY_AMOUNT

INVALID_CURRENCY

INVALID_EXCHANGE_RATE

EXCHANGE_RATE_NOT_FOUND
```

继续复用：

```text
BAD_REQUEST
UNAUTHORIZED
PROJECT_NOT_FOUND
INTERNAL_ERROR
```

Provider/Cron 错误主要进入 structured logs。

不要把 Frankfurter 的原始 response/error 直接暴露给 Agent。

---

# 35. Currency Input Rules

Currency：

```text
string
3 ASCII letters
normalize uppercase
```

例如：

```text
usd
→ USD
```

非法格式：

```text
INVALID_CURRENCY
```

不要允许：

```text
$
人民币
US Dollar
```

API contract 使用 ISO-style currency code。

---

# 36. Agent Behavior

用户：

> DeepUsername 今天 Facebook 花了 120 美元。

Iris：

```text
resolve DeepUsername Project
↓
POST Expense
amount = 120
currency = USD
category = ads
description = Facebook/Meta Ads
↓
verify
```

不要要求用户自己查询汇率。

---

用户：

> 今天 AWS 扣了 100 美元，信用卡实际按 7.1843 算的。

Iris：

```text
POST Expense
amount = 100
currency = USD
exchange_rate = 7.1843
description = AWS
```

显式汇率优先。

---

用户：

> DeepUsername 这个月花了多少钱？

Iris：

```text
resolve Project
↓
GET Expense Summary
from = start of month
to = end/current time
↓
answer
```

不要把所有 Expense 拉给 LLM 再自己做金额加法。

---

# 37. Agent 不应该推断财务事实

如果缺少：

```text
amount
currency
Project
```

且不能可靠 resolve：

必须询问。

例如：

> “昨天广告花了 300。”

如果无法知道：

```text
USD?
CNY?
```

不得猜测。

---

# 38. Skill Integration

Finance 实现后新增：

```text
skills/iris/references/finance-api.md
```

或当前模块化 reference 命名规范下对应文件。

SKILL.md Progressive Loading：

```text
Finance / Expense operation
→ load finance-api.md
```

不要因为 Finance 操作加载：

```text
content-api.md
capability-api.md
openapi.json
```

除非确实需要。

---

# 39. Finance 与 Memory 的边界

Expense：

```text
D1 structured state
```

不是 Markdown Memory。

不要把 Expense 自动写进：

```text
iris-memory Git repository
```

不要创建：

```text
Resource
Markdown file
```

来代表每笔 Expense。

---

# 40. Finance 与 Project 的关系

v0.2 Finance 不建立新的组织体系。

继续遵循：

> Everything is Project.

Expense 必须属于 Project。

因此：

```text
广告
→ Product Project

服务器
→ Product / Infrastructure Project

公司房租
→ Company Operations Project

个人软件订阅
→ Personal / Subscriptions Project
```

Iris Agent 应优先 resolve 已有 Project。

不要为了每笔 Expense 创建新 Project。

---

# 41. Security

所有 Expense / FinanceSettings：

```text
user scoped
```

不得跨 user 读取。

ExchangeRate：

```text
global shared current FX data
```

不包含用户隐私。

Frankfurter：

```text
Server → Frankfurter
```

Agent 不直接调用外部 FX Provider。

---

# 42. Observability

FX sync 至少记录：

```text
provider
reporting currency
fetch started
fetch succeeded / failed
rate count
provider rate date
fetched_at
```

禁止记录：

```text
Iris API token
Authorization
unrelated user data
```

---

# 43. Migration

新增：

```text
finance_settings
exchange_rates
expenses
```

Migration 必须：

```text
non-destructive
```

不得修改 v0.1：

```text
projects
milestones
tasks
resources
capabilities
api_tokens
```

已有 API 行为不得改变。

---

# 44. v0.2 Finance Acceptance Criteria

Finance Phase 1 完成需要通过以下真实场景：

1. 用户设置 `reporting_currency=CNY`。
2. Daily FX sync 成功写入 USD→CNY 等 current rate。
3. 创建 CNY Expense，rate 自动为 1。
4. 创建 USD Expense，自动使用 current USD→CNY rate。
5. Expense 保存后 ExchangeRate 更新，旧 Expense 的 rate 不改变。
6. 新 Expense 使用更新后的新 rate。
7. 创建 Expense 时可显式指定 rate。
8. 显式 rate 优先于 ExchangeRate table。
9. 修改 Expense amount 不改变 rate。
10. 修改 occurred_at 不改变 rate。
11. 修改 currency 后重新 resolve rate。
12. FinanceSettings reporting currency 修改不改变历史 Expense。
13. Project Expense list 正确过滤。
14. Project summary 使用每条 Expense 自己保存的 rate。
15. 不同 reporting currencies 不直接求和。
16. FX Provider 拉取失败时旧 ExchangeRate 保留。
17. 缺失 FX rate 时返回 `EXCHANGE_RATE_NOT_FOUND`。
18. Project/user isolation 正确。
19. Expense CRUD 全部进入 OpenAPI。
20. `finance-api.md` 与真实 API 一致。
21. Iris Skill 可以正确记录和查询 Project Expense。

---

# 45. v0.2 Finance Final Scope

最终边界：

```text
Iris v0.2 Finance Phase 1

FinanceSettings
└── reporting currency

ExchangeRate
├── Frankfurter v2
├── daily sync
├── current only
└── overwrite / upsert

Expense
├── Project scoped
├── amount
├── currency
├── reporting currency
├── concrete exchange rate
├── category
├── description
└── occurred_at

Query
├── Expense list
└── Project expense summary
```

明确没有：

```text
Accounts
Income
Transfer
Budget
Historical FX
Snapshot entity
Bank sync
Accounting system
Notification
Reminder
```

---

## 46. 架构结果

完成后 Finance 的位置应该非常清楚：

```text
                    ┌──────── Project
                    │            │
User ─ FinanceSettings           │
         │                        │
         │ reporting currency     │
         │                        ▼
         │                     Expense
         │                     ├ amount
         │                     ├ currency
         │                     ├ reporting currency
         │                     └ concrete FX rate
         │
         ▼
ExchangeRate Cache
         ↑
   Daily Cron
         ↑
Frankfurter v2
```
[1]: https://frankfurter.dev/?utm_source=chatgpt.com "Frankfurter | Free exchange rates API"
