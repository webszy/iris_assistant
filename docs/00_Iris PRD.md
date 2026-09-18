# Iris PRD

**版本：** Frozen Baseline
**日期：** 2026-09-17
**状态：** 🔒 Frozen / Pre-Development
**项目：** Iris
**当前开发目标：** Iris v0.1
**路线：** v0.1 → v0.5 → v1.0

---

# 1. 产品定义

Iris 是一个长期运行的私人秘书系统。

它不是单纯的聊天机器人，也不是一个固定功能集合的 Agent。

Iris 的核心职责是持续维护和理解用户的工作与生活上下文，并通过 Tools、API、Scheduler 和外部数据源参与用户的真实日常。

Iris 首先需要能够：

* 记住用户正在做什么
* 记住用户做过什么决定
* 管理任务与提醒
* 记录收入、支出和资产
* 获取天气等现实世界 Context
* 根据用户规则提供具体生活建议
* 在正确的时间主动提醒用户
* 为不同 AI Client 提供统一、可信的数据与执行能力

长期再逐步扩展为：

* 个人知识库管家
* 可学习新的工作流程和 Skill
* 能够持续成长的私人助理

---

# 2. 版本路线

Iris 路线正式确定为：

```text
v0.1
Reliable Personal Secretary
可靠的私人秘书

        ↓

v0.5
Personal Knowledge Steward
个人知识库管家

        ↓

v1.0
Self-Evolving Personal Assistant
自进化私人助理
```

当前只开发：

> **Iris v0.1**

v0.5 与 v1.0 仅作为未来架构方向，不进入当前开发 Scope。

---

# 3. Iris 系统边界

Iris 不是某一个模型。

Iris 也不是 Grok Bot。

系统关系：

```text
                Client Layer

        Grok Bot
        iOS App
        ChatGPT
        CLI
        Future Clients
             │
             ▼
         Iris Skill
     意图理解 / 工作流
             │
             ▼
         Iris API
             │
   ┌─────────┼──────────┐
   │         │          │
 Data    Scheduler    Context
   │         │          │
   └─────────┼──────────┘
             ▼
          Storage
```

定义：

```text
Grok Bot
= 当前主要交互入口和 AI 推理层

Iris Skill
= 告诉 AI 如何成为 Iris、如何使用 Iris Tools

Iris API
= 数据与可信执行层

Storage / T800
= 长期数据与事实存储

Scheduler
= 时间触发与主动提醒

Context Providers
= Weather 等现实世界数据源
```

---

# 4. 核心原则

## 4.1 API First

所有核心功能必须通过 Iris API 完成。

任何 Client 都不能拥有唯一业务逻辑。

```text
Grok Bot ─┐
iOS ──────┤
ChatGPT ──┼── Iris API
CLI ──────┘
```

---

## 4.2 LLM 可替换

Iris 的长期数据不得只存在于某个模型的上下文中。

模型可以替换：

```text
Grok
GPT
Claude
Local Model
Future Model
```

但：

```text
Projects
Tasks
Decisions
Transactions
Rules
Reminders
Knowledge
Skills
```

属于 Iris。

---

## 4.3 Single-user First

v0.1 第一阶段只实际服务一个用户。

暂不建设完整 SaaS 系统。

---

## 4.4 Multi-tenant Ready

底层不得把“系统永远只有一个用户”写死。

所有用户数据必须拥有：

```text
user_id
```

---

## 4.5 Authenticated From Day One

Iris API 不允许裸奔。

所有私人业务 API 必须认证。

---

## 4.6 Core Stable, Capabilities Expand

Iris 的：

```text
身份
数据
API
权限
历史
```

应该保持稳定。

未来新增的：

```text
Knowledge
Skills
Workflows
Evolution
```

建立在核心之上。

---

# 5. Iris v0.1 产品目标

v0.1 的目标是：

> **做出一个稳定、可信、每天真正可以使用的项目秘书和生活秘书。**

它必须完成一个最基本闭环：

```text
用户说一句话
      ↓
Iris Skill 理解
      ↓
调用 Iris API
      ↓
事实被保存 / 操作被执行
      ↓
未来需要的时候重新出现
```

---

# 6. v0.1 Scope

Iris v0.1 包含：

```text
Projects
Tasks
Decisions
Project Notes

Reminders

Finance
Transactions
Assets

Weather

User Rules

Daily Context

Authentication
Authorization
Audit

Iris API
Iris Skill
Grok Bot Integration
```

---

# 7. Project Management

## 7.1 Projects

Iris 必须可以记录用户所有项目，而不仅是当前 Active 项目。

结构：

```text
projects

id
user_id

name
alias
description

status
priority
category

current_focus
next_action

repo_url
website_url

created_at
updated_at
archived_at
```

---

## 7.2 Project Status

固定状态：

```text
idea
researching
planned
active
paused
shipped
archived
```

项目被记录不代表进入执行队列。

---

## 7.3 Current Focus

用于回答：

> 这个项目现在最重要的事情是什么？

示例：

```text
TokenClash

current_focus:
稳定 AI Router 和故障切换机制
```

---

## 7.4 Next Action

用于保存项目下一步可执行动作。

例如：

```text
next_action:
完成供应商健康检查模块
```

---

# 8. Project Decisions

Iris 不仅要记结果，也要记：

> 为什么当时这样决定。

结构：

```text
project_decisions

id
user_id
project_id

content
reason

created_at
```

例如：

```text
Decision:
暂时不做完整多租户后台

Reason:
第一阶段只验证个人 Iris 使用场景
```

---

# 9. Project Notes

项目可以关联普通 Notes。

```text
project_notes

id
user_id
project_id

type
content

created_at
```

type：

```text
note
research
idea
competitor
technical
```

v0.1 的 Project Note 是轻量记录。

完整 Knowledge Base 推迟到 v0.5。

---

# 10. Tasks

Task 表示：

> 有一件事情需要完成。

结构：

```text
tasks

id
user_id
project_id nullable

title
description

status
priority

due_at
completed_at

created_at
updated_at
```

状态：

```text
todo
doing
done
cancelled
```

Task 可以：

* 属于项目
* 属于个人生活
* 没有 Project

---

# 11. Reminders

Reminder 和 Task 分离。

Task：

> 有事情需要完成。

Reminder：

> 在一个确定时间提醒我。

结构：

```text
reminders

id
user_id

title
content

remind_at
timezone

status

created_at
triggered_at
cancelled_at
```

状态：

```text
pending
triggered
cancelled
failed
```

v0.1：

> 只要求稳定支持单次 Reminder。

Recurring Reminder 进入后续 v0.x。

---

# 12. Finance

Iris 必须能够记录项目和个人生活中的资金流。

## 12.1 Transactions

```text
transactions

id
user_id

project_id nullable

type
scope
category

amount
currency

description

occurred_at
created_at
```

---

## 12.2 Type

```text
income
expense
```

---

## 12.3 Scope

```text
personal
project
business
```

---

## 12.4 Category

初始可包括：

```text
food
transport
shopping

software
subscription

domain
server
advertising
equipment

salary
sales

other
```

Category 不应过度设计。

---

# 13. Finance Examples

用户：

> TokenClash 今天服务器花了 100。

保存：

```text
type = expense
scope = project
project = TokenClash
category = server
amount = 100
currency = CNY
```

用户：

> CodeToken 今天收入 860。

保存为项目收入。

用户：

> 刚才吃饭花了 38。

保存为：

```text
scope = personal
category = food
```

---

# 14. Finance Queries

必须支持：

> 今天花了多少钱？

> 这个月收入多少？

> 这个月项目支出多少？

> CodeToken 这个月赚了多少钱？

> TokenClash 到目前投入多少？

对应：

```text
GET /finance/summary
GET /finance/projects/:projectId/summary
```

---

# 15. Assets

Transaction 表示钱发生了变化。

Asset 表示：

> 用户拥有一个东西。

例如：

> 买鼠标 ¥399

可能同时创建：

```text
Transaction
expense = 399

Asset
Mouse
purchase_price = 399
```

结构：

```text
assets

id
user_id

name
category

status

purchase_price
purchase_currency
purchased_at

sold_price
sold_currency
sold_at

note

created_at
updated_at
```

状态：

```text
owned
sold
discarded
lost
```

---

# 16. Weather

Weather 是 Iris Context Provider。

它不是单纯：

> 天气查询 API。

Iris 获取天气的目的，是辅助用户做现实决策。

例如：

> 今天骑车吗？

> 今天适合出去走路吗？

> 要不要带伞？

---

# 17. Weather Provider

允许配置多个天气数据源：

```text
Weather API A
Weather API B
Weather API C
```

统一标准化为：

```text
weather_snapshot

location
observed_at

temperature
feels_like

condition

precipitation_probability
precipitation_amount
precipitation_intensity

wind_speed
wind_gust

humidity
visibility
air_quality

hourly[]
sources[]
confidence
```

---

# 18. Weather Confidence

多个 Provider 一致：

```text
confidence = high
```

多个 Provider 差异明显：

```text
confidence = low
```

Iris 不应该把低置信度天气预测描述成确定事实。

---

# 19. User Rules

用户的个人规则不得直接写死进 Skill。

例如：

```text
下雨 → 不骑自行车

大雨 → 建议开车

空气质量差 → 减少户外运动
```

结构：

```text
user_rules

id
user_id

domain
name

condition
action

enabled

created_at
updated_at
```

domain：

```text
weather
commute
finance
work
life
```

v0.1 condition / action 可以先使用 JSON。

---

# 20. Daily Context

统一接口：

```text
GET /context/today
```

返回今天最重要的 Context：

```text
Weather
Tasks
Reminders
Events
Active Projects
Project Next Actions
Today Income
Today Expense
```

示例：

```json
{
  "date": "...",
  "weather": {},
  "tasks": [],
  "reminders": [],
  "events": [],
  "active_projects": [],
  "finance": {
    "income": 0,
    "expense": 0
  }
}
```

Iris Skill 再负责生成自然语言 Daily Brief。

---

# 21. Authentication

v0.1 使用：

```text
Bearer Token
```

请求：

```http
Authorization: Bearer iris_xxxxxxxxxxxxxxxxx
```

---

# 22. Users

```text
users

id
name

timezone
default_currency
locale

created_at
updated_at
```

时区属于核心属性。

例如：

```text
timezone = Asia/Shanghai
```

自然语言：

> 下午两点提醒我。

最终必须被转换成明确的绝对时间。

---

# 23. API Tokens

```text
api_tokens

id
user_id

name
token_hash

created_at
last_used_at
expires_at
revoked_at
```

每个 Client 独立 Token：

```text
Iris Grok Bot
Iris iPhone
Iris CLI
Iris ChatGPT
```

某一个 Token 泄露后可以单独 revoke。

---

# 24. Token Security

服务器不保存原始 Token。

建议：

```text
raw token
   ↓
SHA-256
   ↓
token_hash
```

数据库只保存 hash。

---

# 25. Tenant Isolation

客户端不能决定：

```text
user_id
```

禁止依赖：

```json
{
  "user_id": "xxx"
}
```

决定数据归属。

必须：

```text
Bearer Token
      ↓
Authentication
      ↓
authenticated_user
      ↓
user_id
```

所有私人数据查询必须满足：

```text
user_id = authenticated_user.id
```

---

# 26. Security Requirements

v0.1 必须具备：

### HTTPS

只允许 HTTPS。

### Authentication

除健康检查之外的私人接口全部认证。

### Authorization

所有操作限制在 authenticated user 范围。

### Input Validation

所有请求必须经过 Schema Validation。

### Rate Limit

针对 Token 提供基础 Rate Limit。

### Secret Management

以下不得进入代码仓库：

```text
API Token
Weather API Key
External Service Secret
```

使用 Cloudflare Secret 等安全配置。

### Sensitive Logging

日志不得记录：

```text
完整 Authorization
完整 Token
敏感私人内容
```

---

# 27. Audit Log

关键修改需要留下 Audit。

至少包括：

```text
project update

transaction create
transaction delete

rule change

reminder create
reminder cancel
```

结构：

```text
audit_logs

id
user_id

actor

action
entity_type
entity_id

created_at
```

目的是未来可以回答：

> Iris 为什么改了这个东西？

---

# 28. API Prefix

统一：

```text
/api/v1
```

---

# 29. System API

```text
GET /health
GET /me
```

---

# 30. Projects API

```text
GET    /projects
POST   /projects

GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id

GET    /projects/:id/decisions
POST   /projects/:id/decisions

GET    /projects/:id/notes
POST   /projects/:id/notes
```

DELETE 默认倾向：

> soft delete / archive

避免直接物理删除。

---

# 31. Tasks API

```text
GET   /tasks
POST  /tasks

GET   /tasks/:id
PATCH /tasks/:id

POST /tasks/:id/complete
POST /tasks/:id/cancel
```

---

# 32. Reminders API

```text
GET  /reminders
POST /reminders

GET  /reminders/:id

POST /reminders/:id/cancel
```

---

# 33. Transactions API

```text
GET  /transactions
POST /transactions

GET /finance/summary
GET /finance/projects/:projectId/summary
```

支持：

```text
from
to
type
scope
project_id
category
```

---

# 34. Assets API

```text
GET  /assets
POST /assets

GET   /assets/:id
PATCH /assets/:id

POST /assets/:id/sell
POST /assets/:id/discard
```

---

# 35. Weather API

```text
GET /weather/current
GET /weather/today
GET /weather/hourly
GET /weather/forecast
```

---

# 36. Rules API

```text
GET   /rules
POST  /rules

PATCH  /rules/:id
DELETE /rules/:id
```

---

# 37. Context API

```text
GET /context/today
```

未来再考虑：

```text
/context/morning
/context/evening
/context/week
```

不进入 v0.1 必做范围。

---

# 38. API Response

成功：

```json
{
  "success": true,
  "data": {}
}
```

列表：

```json
{
  "success": true,
  "data": [],
  "meta": {
    "cursor": null
  }
}
```

错误：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "..."
  }
}
```

---

# 39. HTTP Status

```text
200 OK

201 Created

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Unprocessable Entity

429 Too Many Requests

500 Internal Server Error
```

---

# 40. Iris Skill

Iris Skill 不负责长期保存事实。

它负责：

```text
Understand
↓
Select Tool
↓
Call Iris API
↓
Explain Result
```

例如：

> TokenClash 今天服务器花了 100。

Skill 推断：

```text
intent = record_transaction

scope = project
project = TokenClash

type = expense
category = server
amount = 100
```

然后调用 API。

---

# 41. Agent Tool Layer

LLM 不应该直接面对完整底层 REST API。

Iris 提供一层 Agent-friendly Tools：

```text
create_project

update_project

record_project_decision

create_task

create_reminder

record_transaction

get_finance_summary

get_weather

get_today_context

get_user_rules
```

关系：

```text
REST API
= Machine Interface

Iris Tools
= Agent Interface

Iris Skill
= Agent Behavior
```

---

# 42. Scheduler

Reminder 保存：

```text
remind_at
```

Scheduler 负责：

```text
pending
↓
trigger
↓
notification
↓
triggered
```

Reminder 与通知渠道解耦。

未来可能的通知渠道：

```text
Grok
iOS Push
Telegram
Email
WeChat
```

v0.1 只要求至少有一个可靠通知出口。

---

# 43. Observability

至少记录：

```text
request_id

authenticated_user_id
api_token_id

method
path

status_code
duration

created_at
```

不记录原始 Token。

---

# 44. v0.1 数据模型

第一阶段核心表：

```text
users

api_tokens

projects
project_decisions
project_notes

tasks

reminders

transactions

assets

user_rules

audit_logs
```

Weather：

```text
fetch
↓
normalize
↓
cache
```

不要求永久保存全部历史天气。

---

# 45. v0.1 必须支持的用户故事

## Project

> 记录一个新项目。

> 修改一个项目当前重点。

> 暂停一个项目。

> 查看所有项目。

---

## Decisions

> 记录一个项目决定。

> 查看这个项目最近的决定。

---

## Tasks

> 给 TokenClash 加一个任务。

> 查看今天有什么任务。

> 完成这个任务。

---

## Reminders

> 一小时后提醒我。

> 下午两点提醒我。

> 查看今天还有什么提醒。

> 取消这个提醒。

---

## Finance

> 今天吃饭花了 38。

> DeepUsername 花了 70。

> CodeToken 今天收入 860。

> 今天一共花了多少钱？

> 这个月项目收入多少？

> TokenClash 到目前亏赚多少？

---

## Assets

> 今天买了一个鼠标。

> 把旧鼠标卖了。

---

## Weather

> 今天什么天气？

> 下午会不会下雨？

> 今天适合骑车吗？

---

## Context

> 今天有什么事情？

> 今天有什么需要注意？

---

# 46. v0.1 Non-goals

v0.1 明确不做：

```text
Organization
Workspace
Team
Invite
复杂 RBAC

Subscription
Billing
Public Registration

Google Login
Apple Login

多人协作

复杂项目看板

完整财务会计系统
银行同步

完整 Calendar 产品

复杂 RAG

Vector Database

Knowledge Base

Skill Factory

Skill Registry

自主生成 Skill

自主安装 Skill

Evolution Engine

复杂 Workflow Builder
```

这些不得进入当前 v0.1 开发 Scope。

---

# 47. v0.1 验收标准

v0.1 完成时必须满足：

1. Grok Bot 可以通过 Iris Skill 安全访问 Iris API。
2. 未认证请求不能读取任何私人数据。
3. Token 能映射到唯一用户。
4. 所有私人数据存在 user_id。
5. 客户端不能通过伪造 user_id 越权。
6. Projects 可以完整 CRUD。
7. Decisions 可以关联 Project。
8. Tasks 可以创建、修改和完成。
9. Reminder 可以创建、取消和触发。
10. Transaction 可以记录收入与支出。
11. 可以查询日/月/项目财务汇总。
12. Assets 可以记录购买和出售。
13. Weather 至少接入一个真实 Provider。
14. User Rules 可以保存并读取。
15. `/context/today` 能返回主要 Daily Context。
16. 核心修改存在 Audit。
17. Secret 不进入代码仓库。
18. Iris 可以被真实日常使用。

---

# 48. v0.1 推荐开发顺序

## Phase 1 — Foundation

```text
Cloudflare Worker

Database

users
api_tokens

Authentication
Authorization

Validation
Audit
```

首先解决：

> 谁在访问 Iris？

---

## Phase 2 — Project Core

```text
projects
project_decisions
project_notes
tasks
```

解决：

> Iris 能否可靠管理我的工作？

---

## Phase 3 — Personal Operations

```text
reminders
scheduler

transactions
assets
```

解决：

> Iris 能否开始参与我的日常？

---

## Phase 4 — Context

```text
weather
user_rules
context/today
```

解决：

> Iris 能否理解现实上下文并辅助决策？

---

## Phase 5 — Iris Skill

完成：

```text
Natural Language
↓
Intent
↓
Tool
↓
Iris API
```

---

## Phase 6 — Grok Bot Integration

将 Iris Skill 与 Iris API 接入 Grok Bot。

此时：

> Iris v0.1 正式进入真实使用阶段。

---

# 49. Iris v0.5 — Personal Knowledge Steward

v0.5 的核心目标：

> **让 Iris 不只是管理用户的事情，也开始管理用户的知识。**

Iris 将成为：

> Personal Knowledge Steward

即：

> **个人知识库管家。**

---

# 50. Knowledge 的定位

Iris 中的数据可以进一步分为：

```text
Operational Data
项目 / 任务 / 提醒 / 财务

Personal Context
规则 / 日程 / 天气 / 偏好

Knowledge
文档 / 研究 / 网页 / 笔记 / 资料 / 结论
```

Knowledge 不等同于 Chat Memory。

它属于用户明确拥有和管理的长期知识资产。

---

# 51. Knowledge 与 Project

知识可以独立存在，也可以与项目关联。

例如：

```text
TokenClash
│
├── Decisions
├── Tasks
├── Finance
│
└── Knowledge
    ├── PRD
    ├── Competitor Research
    ├── Architecture
    ├── GitHub Projects
    ├── API Documentation
    └── Notes
```

---

# 52. v0.5 Knowledge Model

基础结构：

```text
knowledge_items

id
user_id

project_id nullable

title

type
source_type
source_url nullable

content
summary nullable

tags

created_at
updated_at
```

type 例如：

```text
note
document
research
competitor
technical
reference
article
decision_support
```

source_type：

```text
manual
conversation
url
document
github
other
```

---

# 53. v0.5 Knowledge API

计划：

```text
POST   /knowledge
GET    /knowledge

GET    /knowledge/:id
PATCH  /knowledge/:id
DELETE /knowledge/:id

GET /knowledge/search
```

---

# 54. v0.5 用户场景

用户：

> 把这篇 TokenClash 竞品分析收进去。

Iris：

```text
Project = TokenClash
Type = competitor
Source = URL
```

用户：

> 这个 Cloudflare Worker 的认证方案以后有用，收一下。

Iris 保存为 Technical Knowledge。

用户：

> 我以前研究过哪些 AI Router？

Iris 可以从 Knowledge Base 中检索。

---

# 55. v0.5 第一阶段原则

v0.5 优先实现：

```text
保存
分类
项目关联
Source
Summary
Tags
Search
```

先做到：

> **存得进去、找得出来、知道属于什么。**

---

# 56. v0.5 Non-goals

Knowledge Base 第一阶段不要求立即建设：

```text
复杂 Vector Database
复杂 Embedding Pipeline
自动知识图谱
自动知识推理
大型 RAG 平台
复杂文档解析平台
```

这些能力只有在真实数据规模证明有需要后再加入。

---

# 57. v0.5 后续可扩展方向

随着 Knowledge 增长，可以逐步加入：

```text
Full-text Search

Chunking

Embedding

Semantic Search

RAG

Document Ingestion

Automatic Tagging

Related Knowledge

Knowledge Graph
```

但不得提前成为 v0.5 的实现前置条件。

---

# 58. Iris v1.0 — Self-Evolving Personal Assistant

v1.0 的核心目标：

> **从一个会工作的私人秘书，升级为一个会成长的私人助理。**

现实中的优秀秘书会随着工作不断学习：

```text
用户习惯
新的工具
新的业务
新的 SOP
新的技能
```

Iris v1.0 需要具备相似能力。

---

# 59. 自主进化核心闭环

```text
用户提出新需求
       ↓
Iris 尝试执行
       ↓
发现能力不足
       ↓
Capability Gap
       ↓
寻找解决方案
       ↓
创建 / 获取 Skill
       ↓
测试
       ↓
注册
       ↓
未来直接使用
```

---

# 60. Capability Registry

未来 Iris 需要知道：

> 我现在会什么？

例如：

```text
weather.query

weather.forecast

finance.record

project.manage

cloudflare.analytics

facebook.ads

flight.search
```

Capability 与具体 Skill Implementation 分离。

---

# 61. Skill Registry

未来建立：

```text
skills

id
owner_id

name
description
version

source
status

capabilities

permissions
dependencies

created_at
updated_at
last_used_at
```

来源：

```text
builtin
user_taught
generated
imported
marketplace
```

状态：

```text
draft
testing
active
disabled
deprecated
failed
```

---

# 62. Skill Factory

自主进化不直接写死在 Iris API。

未来建立独立基础设施：

> **Skill Factory**

负责：

```text
Capability Gap Detection
        ↓
Skill Discovery
        ↓
Skill Design
        ↓
Skill Generation
        ↓
Validation
        ↓
Sandbox Test
        ↓
Evaluation
        ↓
Repair
        ↓
Publish
```

Skill Factory 属于通用 AI Infrastructure。

不仅 Iris 可以使用。

---

# 63. Skill Runtime

Skill Factory 与 Skill Runtime 分离：

```text
Skill Factory
= 制造技能

Skill Registry
= 保存技能

Skill Runtime
= 执行技能
```

因此：

> Factory 暂时不可用，不应导致现有 Iris Skills 停止工作。

---

# 64. Hermes 的长期角色

Hermes 是自主进化 / Skill 机制的重要参考实现。

未来路线不是：

> Iris 永久运行在 Hermes 上。

而是：

```text
研究 Hermes
↓
识别 Evolution / Skill 核心机制
↓
抽取 / 移植 / 重构
↓
建立独立 Skill Factory
```

Hermes 的角色：

```text
Reference Implementation

Technical Source

Prototype
```

不是：

```text
Permanent Runtime Dependency
```

---

# 65. Grok Bot 与 Skill Factory

Skill Factory 应尽可能：

> Model-Agnostic

它负责：

```text
状态
流程
工具
测试
验证
版本
```

模型负责：

```text
推理
研究
设计
生成
修正
```

因此未来可以让：

```text
Grok Bot
```

作为主要 Intelligence Provider。

这样 Iris 的：

```text
日常运行
+
Skill Learning
```

都可以尽可能利用 Grok Bot 自身模型额度。

从而减少对额外第三方 LLM API 的持续依赖。

---

# 66. 长期理想架构

```text
                    Iris
             Personal Assistant
                       │
          ┌────────────┴────────────┐
          │                         │
    Interaction Layer         Evolution Layer
          │                         │
       Grok Bot                Skill Factory
       iOS App                      │
       Others                       │
          │                         │
          └────────────┬────────────┘
                       │
                   Iris API
                       │
       ┌───────────────┼────────────────┐
       │               │                │
     T800         Knowledge Base    Skill Registry
       │               │                │
       └───────────────┼────────────────┘
                       │
                  Skill Runtime
```

---

# 67. v1.0 Evolution Levels

## Level 1 — Preference Learning

学习：

```text
用户习惯
用户规则
工作偏好
通知偏好
生活习惯
```

---

## Level 2 — Workflow Learning

识别重复工作并形成 SOP。

例如：

```text
weather
→ tasks
→ reminders
→ projects
→ summary
```

形成：

```text
morning-brief
```

---

## Level 3 — Skill Acquisition

学习以前完全不会的能力：

```text
Cloudflare Analytics
Facebook Ads
新的 API
新的平台
新的数据源
新的自动化方式
```

---

# 68. Evolution Loop

真正的进化不仅是生成 Skill。

还包括：

```text
Use
↓
Observe
↓
Failure / Feedback
↓
Evaluate
↓
Improve
↓
Test
↓
Publish New Version
↓
Use Again
```

因此：

```text
Day 1 Iris
≠
Day 180 Iris
```

---

# 69. Evolution Security

自主学习不等于无限权限。

未来 Skill 按风险分级。

## Low Risk

例如：

```text
天气查询
公开资料查询
信息整理
报告生成
```

可给予较高自动化程度。

## Medium Risk

例如：

```text
读取私人 Calendar
读取账户数据
访问个人项目
```

需要授权。

## High Risk

例如：

```text
删除数据
修改服务器
发送公开内容
发送邮件
执行支付
```

必须明确授权。

原则：

> **允许自主学习，但不允许无限权限。**

---

# 70. 产品路线最终定义

## Iris v0.1

**Reliable Personal Secretary**

解决：

> 我的事情能不能被稳定记住、执行、提醒和查询？

核心：

```text
Projects
Tasks
Decisions
Reminders
Finance
Assets
Weather
Rules
Context

Auth
Audit

Iris API
Iris Skill
Grok Bot
```

---

## Iris v0.5

**Personal Knowledge Steward**

解决：

> 我的长期资料、研究和知识能不能被 Iris 管理起来？

增加：

```text
Knowledge Items
Project Knowledge
Sources
Summary
Tags
Search
```

---

## Iris v1.0

**Self-Evolving Personal Assistant**

解决：

> Iris 能不能自己学习新的工作方式？

增加：

```text
Capability Registry

Skill Registry

Skill Runtime

Skill Factory

Preference Learning

Workflow Learning

Skill Acquisition

Evolution Loop
```

---

# 71. Frozen Scope

截至 2026-09-17，本 PRD 与路线图正式冻结。

当前默认规则：

> **不继续新增产品愿景。**

> **不继续扩大 v0.1 Scope。**

> **不提前开发 v0.5。**

> **不提前开发 v1.0。**

只有在用户明确提出：

> 修改 Iris PRD / 解锁路线图

时，才重新调整。

当前项目正式进入：

# Pre-Development

---

# 72. Pre-Development 下一步

接下来只处理 Iris v0.1 实现。

顺序：

```text
1. Database Schema

2. Authentication / Authorization

3. API Route Contract

4. Cloudflare Worker Architecture

5. Migration Strategy

6. Validation / Error Model

7. Projects / Decisions / Tasks

8. Reminder / Scheduler

9. Finance / Assets

10. Weather / Rules / Context

11. Iris Agent Tools

12. Iris Skill

13. Grok Bot Integration
```

后续所有技术讨论，应优先回答一个问题：

> **这是否属于 Iris v0.1 的实现？**

如果不是：

> 记录到 Roadmap，不进入当前开发。

---

# 73. 当前正式项目状态

```text
Iris PRD
LOCKED

v0.1 Scope
LOCKED

v0.5 Roadmap
LOCKED

v1.0 Roadmap
LOCKED

Current Stage
PRE-DEVELOPMENT

Current Focus
IRIS API IMPLEMENTATION
```

从此版本开始，Iris 项目结束愿景定义阶段，正式进入工程实现阶段。
