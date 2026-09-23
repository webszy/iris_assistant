# Iris
> **状态：暂停开发，观望中**  
> **原因：发现即将发布OpenAI Bot可能已经覆盖iris绝大多数功能**

**一个强状态、长期运行、以 Life OS 为目标的私人 Agent。**

Iris 不只是聊天机器人，也不只是 Todo List 或项目管理工具。

它希望成为一个持续存在的个人操作系统：知道你正在做什么，记得你过去做过什么，知道下一步应该处理什么，能够复用已经积累的能力，并逐渐减少重复推理。

> **把人生、工作、知识、记忆、规则和执行，组织成一个统一的个人系统。**

---

# 为什么做 Iris

大多数 AI 助手是“会话优先”的：

```text
你提问
→ 模型回答
→ 对话结束
```

Iris 希望成为“状态优先”的系统：

```text
生活持续发生
→ Iris 持续维护状态
→ Memory 持续积累
→ Context 持续变化
→ Rules / Capabilities 持续工作
→ 只有真正需要时才调用 LLM 推理
```

大模型只是 Iris 的一个组成部分，而不是 Iris 本身。

Iris 的核心是：

- 持久状态
- 长期记忆
- 确定性规则
- 可复用 Skill
- 可执行 Script
- Agent Runtime

---

# 核心思想

```text
Runtime
= Iris 怎么运行

Working State
= Iris 现在在做什么

Memory
= Iris 经历过什么、知道什么

Capability
= Iris 会做什么

Personality
= Iris 倾向于怎么行动
```

Iris 从设计上就尽量减少不必要的大模型调用。

```text
重复推理
→ Rule

重复流程
→ Skill

稳定执行
→ Script / API
```

LLM 主要处理：

- 模糊问题
- 新情况
- 信息冲突
- 自然语言理解
- 开放式推理
- 需要综合上下文的决策

而已经可以稳定确定的行为，应逐渐从 LLM 推理中沉淀出来。

---

# 系统架构

```text
                        用户 / Any Agent
                               │
                               ▼
                         Iris Skill
                               │
                               ▼
                      Cloudflare Worker
                         控制平面 / API
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
             D1                         Iris Memory Repo
         Working State                    Durable Memory
              │                                 │
              │                                 ▼
              │                           Git Provider
              │                                 │
              │                                 ▼
              │                              GitHub
              │
              └────────────────┬────────────────┘
                               │
                               ▼
                          Cloud Agent
                            执行层
                           （未来）
```

Iris 当前已经形成两个明确的数据平面：

```text
D1
→ Working State

Git
→ Durable Memory
```

Worker 负责：

- API
- 权限
- 状态
- 数据验证
- 调度
- 确定性业务逻辑
- Memory 路由

未来 Cloud Agent 负责 Worker 不适合直接承担的复杂执行任务。

---

# Iris System Repo

Iris System Repo 保存 Iris 本身的程序代码。

主要包括：

- Cloudflare Worker API
- Auth
- D1 Schema / Migration
- Hono Routes
- Services
- OpenAPI
- Git Integration
- Scheduler
- Agent Adapter
- Iris Skill
- Future Dashboard
- Runtime

Iris System Repo 回答：

> **Iris 怎么运行？**

---

# Iris Memory Repo

Iris 支持独立的 Git-backed Memory Repo。

Memory Repo 保存一个 Iris Instance 的长期沉淀，例如：

- Project 文档
- PRD
- Notes
- 技术文章
- 小说
- Knowledge
- References
- Prompts
- Skills
- Scripts
- Identity
- Personality

Iris Worker 通过 Git Provider 访问 Memory Repo。

当前主要使用：

```text
GitHub Contents API
```

Agent 不需要、也不应该直接持有 GitHub Token。

调用链：

```text
Agent
↓
Iris API
↓
Cloudflare Worker
↓
GitHub API
↓
Iris Memory Repo
```

---

# D1

D1 保存结构化运行状态。

例如：

- Project
- Milestone
- Task
- Resource
- Capability
- Finance
- Reminder
- ReminderOccurrence
- Notification
- NotificationDelivery
- NotificationChannel
- 未来的 Rule / Watch
- 其他运行状态

D1 回答：

> **现在发生了什么？**

---

# Git-backed Memory

Memory Repo 回答：

> **什么内容值得长期保留下来？**

标准 Iris Memory Repo 可以组织为：

```text
iris-memory/
├── .iris/
│   ├── memory.yaml
│   └── MEMORY_RULES.md
├── identity/
├── projects/
├── knowledge/
├── skills/
├── scripts/
├── prompts/
├── references/
└── archive/
```

Project 内容使用稳定的 Project ID 作为物理目录身份：

```text
projects/<project-id>/
```

例如：

```text
projects/018f.../
├── specs/
│   └── v0.1-prd.md
├── notes/
├── references/
└── ...
```

Project 的：

```text
name
slug
```

可以修改。

但底层 Memory 路径不会因为名称变化而漂移。

---

# State 与 Memory 的边界

Iris 明确区分：

```text
D1
→ 状态

Git
→ 长期记忆、内容、Skill、Script

Cloud Agent
→ 执行
```

例如：

```text
D1:

Task = "完成小说第 10 章"
status = doing
```

真正的正文则保存在：

```text
Git:

projects/<project-id>/chapters/chapter-10.md
```

数据库负责记录：

> 这件事现在做到哪里。

Git 负责保存：

> 真正需要长期存在的内容。

这样避免 D1 与 Git 保存两份相同的真相。

---

# 核心模型

Iris 有一个重要原则：

> **Everything can live in a Project.**

但这并不意味着：

> Everything becomes a Project.

Project 是长期上下文和组织边界。

并不是所有实体都必须强制依附 Project。

例如：

```text
Reminder
```

可以独立存在，也可以选择关联某个 Project。

---

# Project

Project 表示一个长期上下文。

例如：

```text
Iris
DeepUsername
Meta Ads
Daily Weather
减脂
某部小说
```

Project 可以代表：

- 产品
- 长期工作
- 运营
- 自动化
- 个人目标
- 内容项目
- 其他长期上下文

---

# Milestone

Milestone 表示 Project 中的阶段目标。

例如：

```text
Iris
├── v0.1
├── v0.2
├── v0.5
└── v1.0
```

Milestone 回答：

> **这个 Project 当前处在哪个阶段？**

Milestone 是可选的。

---

# Task

Task 表示具体的可执行动作。

例如：

```text
实现 Bearer Auth
完成小说第 10 章
部署 Iris API
更新 DeepUsername Pricing
```

Task 必须属于 Project。

Milestone 可以为空。

---

# Resource

Resource 是对真实资料的结构化引用。

例如：

```text
PRD.md
Chapter-10.md
scripts/check-provider.ts
skills/project-secretary/
外部文档 URL
Git Repository
Directory
```

Resource 不负责保存真实内容本身。

它回答：

> **真实东西在哪里？**

---

# Capability

Capability 表示 Iris 已经注册的一项可复用能力。

例如：

```text
Project Secretary
Check Provider Health
Novel Consistency Checker
Fetch Weather
```

当前主要支持：

```text
Skill
Script
```

例如：

```text
Resource:
scripts/check-provider.ts

Capability:
Check Provider Health
type = script
```

或者：

```text
Resource:
skills/project-secretary/

Capability:
Project Secretary
type = skill
```

Resource 回答：

> 东西在哪里？

Capability 回答：

> Iris 可以用它做什么？

---

# Markdown Memory

Iris 已支持通过 API 直接操作 Memory Repo 中的 Markdown 内容。

当前支持：

```text
CREATE Markdown
READ Markdown
UPDATE Markdown
```

例如：

```text
用户：
“把这个 PRD 保存到 Iris 项目里。”

Agent
↓
Iris Skill
↓
Iris API
↓
Resource / Markdown Service
↓
Iris Memory Repo
```

Markdown 内容使用 Git Revision 进行 optimistic concurrency control。

典型流程：

```text
GET content
↓
revision = A
↓
修改内容
↓
PUT expected_revision = A
```

如果在此期间远端内容已经变化：

```text
CONTENT_CONFLICT
```

Agent 不允许静默覆盖新的内容。

这使 Git-backed Memory 可以在多人、多个 Agent 或多个 Runtime 并发访问时保持基本的数据安全。

---

# Finance

Iris v0.2 增加了 Project Expense Tracking。

Finance 当前目标不是做完整会计系统，而是解决一个更直接的问题：

> **一个 Project 到底花了多少钱？**

核心结构：

```text
User
├── FinanceSettings
│   └── Reporting Currency
│
├── ExchangeRate
│
└── Project
    └── Expense
```

Expense 支持：

- Project Scope
- 多币种
- Reporting Currency
- 创建时保存采用的汇率
- Expense Summary
- 历史金额稳定

例如：

```text
DeepUsername

Meta Ads
$120

Domain
¥300

API
€20
```

Iris 可以统一汇总成用户设置的 Reporting Currency。

历史 Expense 不会因为未来汇率变化而重新计算。

---

# Reminder

Reminder 是 Iris 从“被动记录”走向“主动秘书”的关键能力。

Reminder 表示：

> **什么事情，需要在什么时间重新进入用户的注意力。**

核心结构：

```text
Reminder
= 调度定义

ReminderOccurrence
= 某一次具体提醒执行
```

例如：

```text
Reminder:
每天晚上 8 点锻炼

Occurrence:
2026-09-23 20:00
2026-09-24 20:00
2026-09-25 20:00
```

Reminder 支持：

```text
CREATE
DONE
DELAY
SKIP
CANCEL
RESCHEDULE
```

例如：

```text
“明天下午三点提醒我交资料”
→ CREATE

“做完了”
→ DONE

“明天再提醒我”
→ DELAY

“今天算了”
→ SKIP

“以后别提醒了”
→ CANCEL

“以后都改成晚上九点”
→ RESCHEDULE
```

Reminder 与 Task 不同。

```text
Task
→ 要做什么

Reminder
→ 什么时候重新提醒
```

Reminder 只负责时间型调度。

例如：

```text
“明天下午三点提醒我”
```

属于 Reminder。

而：

```text
“美元跌到 7 以下提醒我”
```

属于未来的：

```text
Watch / Rule / Trigger
```

而不是 Reminder。

---

# Notification

Notification 负责：

> **把 Iris 已经决定需要告诉用户的事情可靠地送出去。**

Reminder 与 Notification 是不同的领域。

```text
Reminder
→ 决定什么时候说

Notification
→ 记录要说什么

NotificationDelivery
→ 决定通过哪个渠道送出去
```

结构：

```text
ReminderOccurrence
        │
        ▼
   Notification
        │
        ▼
NotificationDelivery
        │
        ▼
 Channel Adapter
```

Notification 本身是：

```text
Immutable Durable Event
```

一旦正式接受，就不再修改历史内容。

Delivery 负责：

- 发送
- Retry
- Failure
- Channel Fallback

---

## 多渠道

Notification 支持多个渠道。

但默认不是：

```text
Push
+
Email
+
Conduit
```

同时轰炸用户。

而是：

```text
Primary
↓ failure
Backup #1
↓ failure
Backup #2
```

即：

> **优先级 + 后备渠道。**

例如：

```text
Conduit
↓
Push
↓
Email
```

正常情况下只需要一个渠道成功。

---

# Iris Skill

Iris 提供一个专门的 Agent Skill。

Skill 不保存业务状态。

它负责教 Agent：

- 如何理解 Iris 数据模型
- 什么情况下读取哪些 API 文档
- 如何 Resolve Project / Task / Reminder
- 如何安全修改状态
- 如何处理 Finance
- 如何创建 Reminder
- 如何处理 Notification 后的用户回复
- 如何读写 Git-backed Markdown Memory

核心控制流程：

```text
PREPARE
→ READ
→ RESOLVE
→ DECIDE
→ WRITE
→ VERIFY
→ RESPOND
```

---

## Progressive Loading

Skill 使用 Progressive Loading。

不同任务只加载需要的参考文档。

例如：

```text
Project
→ project-api.md

Task
→ task-api.md

Finance
→ finance-api.md

Reminder
→ reminder-api.md

Notification
→ notification-api.md

Markdown Memory
→ content-api.md
```

只有需要精确 Schema、调试或发现文档漂移时，才读取：

```text
openapi.json
```

不会因为一个简单操作就加载全部 API 文档。

---

# 主动闭环

v0.2 开始以后，Iris 不再只有：

```text
User
→ Iris
→ State
```

而开始拥有真正的异步闭环：

```text
User
↓
创建 Reminder
↓
时间流逝
↓
ReminderOccurrence
↓
Notification
↓
Delivery
↓
Iris 主动联系用户
↓
用户回复
↓
DONE / DELAY / SKIP
↓
状态继续演进
```

例如：

```text
Iris：
该锻炼了。

用户：
今天太累了，明天吧。

Iris：
→ 找到 Notification 对应的 ReminderOccurrence
→ DELAY
→ 明天重新进入调度
```

这意味着 Iris 开始从：

> **会记录的系统**

逐渐变成：

> **会持续跟踪并主动重新进入用户注意力的秘书。**

---

# Cloud Agent

Cloud Agent 是未来的执行层。

Worker 更适合承担：

- API
- Auth
- State
- Validation
- Scheduler
- Deterministic Logic

Cloud Agent 更适合承担：

- 读取 / 修改复杂仓库内容
- 执行 Skill
- 运行 Script
- 生成 Artifact
- 调用 Coding Agent
- commit / push
- 长时间任务
- 多步骤执行

长期结构：

```text
Worker
= Control Plane

D1
= Working State

Git
= Durable Memory

Cloud Agent
= Execution Plane
```

---

# Life OS

Iris 的长期方向是成为一个个人 Life OS。

它最终应该能够帮助回答：

```text
我现在在做什么？

下一步最重要的是什么？

我以前为什么做过这个决定？

我是不是忘了什么？

这个 Project 已经积累了什么？

我已经会哪些能力？

最近花了多少钱？

有哪些事情快到时间了？

哪些提醒还没有处理？

哪些事情已经提醒过但还没有完成？

根据当前环境，我现在应该怎么做？

我的生活最近发生了什么变化？
```

未来 Dashboard 会成为这一系统的可视化层：

> **一个属于个人的 Life Cockpit。**

---

# 从设计上减少 LLM 调用

Iris 不希望所有事情都永远依赖 LLM 推理。

执行优先级：

```text
确定性 Rule 能处理？
→ 用 Rule

已有 Script 能处理？
→ 跑 Script

已有 Skill 能处理？
→ 用 Skill

已有 API 能确定执行？
→ 调 API

只有确实需要模糊推理？
→ 调用 LLM
```

长期演化：

```text
Experience
→ Pattern
→ Rule
→ Skill
→ Script / API
```

随着时间：

```text
LLM 重复推理 ↓
确定性执行 ↑
个性化 ↑
可靠性 ↑
```

Iris 的目标不是让 Agent 永远做越来越多推理。

相反：

> **把已经证明稳定的行为逐渐从推理沉淀成确定性能力。**

---

# 版本路线

## v0.1 — Reliable Personal Secretary

v0.1 已完成核心地基，并已经可以部署运行。

主要能力：

- Bearer Token Auth
- Project
- Milestone
- Task
- Resource
- Capability Registry
- Git-backed Memory
- Markdown CREATE / READ / UPDATE
- Optimistic Concurrency
- OpenAPI
- Iris Skill
- Cloudflare Worker
- Cloudflare D1

目标：

> **让 Iris 成为一个可靠、有状态、有长期记忆的私人秘书基础系统。**

---

## v0.2 — Proactive Personal Secretary

v0.2 开始让 Iris 具备主动秘书能力。

主要模块：

### Finance

```text
Project Expense Tracking
Multi-currency
Exchange Rate
Reporting Currency
Expense Summary
```

### Reminder

```text
One-time Reminder
Recurring Reminder
ReminderOccurrence
DONE
DELAY
SKIP
CANCEL
RESCHEDULE
```

### Notification

```text
Durable Notification
NotificationDelivery
Retry
Channel Priority
Fallback
```

目标：

> **让 Iris 从“会记录”升级成“会持续跟踪并主动联系用户”。**

---

## v0.5 — Personal Knowledge Steward

重点：

- 长期 Knowledge
- Knowledge Item
- Search
- Project Link
- Source
- Summary
- Tags
- Knowledge Maintenance

目标：

> **让 Iris 开始真正管理、整理和检索长期知识。**

---

## v1.0 — Self-Evolving Personal Assistant

重点：

- Capability Registry
- Skill Registry
- Skill Runtime
- Skill Factory
- Workflow Learning
- Preference Learning
- Capability Evolution
- Controlled Self-Extension

目标：

> **把重复成功的推理与工作流沉淀成可复用、可执行的能力。**

Iris 的自我进化不是无约束地修改自己。

而是：

```text
观察重复行为
↓
发现可以固化的模式
↓
创建改进任务
↓
用户批准
↓
调用开发 Agent
↓
实现
↓
测试
↓
注册新 Capability
```

即：

> **Controlled Self-Evolution**

---

## v1.1 — Personality System

重点：

- Persistent Identity
- Behavioral Traits
- Communication Style
- Decision Style
- Initiative
- Principles
- Personality Versioning
- Controlled Personality Evolution

目标：

> **让每一个 Iris Instance 都拥有稳定、可理解、可版本化、可演化的行为身份。**

---

# 多 Iris Instance

长期来看：

```text
Iris System
    │
    ├── Iris #1 → State #1 + Memory #1
    ├── Iris #2 → State #2 + Memory #2
    └── Iris #100 → State #100 + Memory #100
```

系统代码可以完全相同。

每个 Iris 会因为这些东西不同而成为不同个体：

- Working State
- Memory
- Capability
- Personality
- Experience

因此 Iris 最终不仅是某一个私人助手。

它希望成为：

> **一套可实例化、可长期运行、能够持续成长的个人 Agent System。**

---

# 技术栈

当前主要技术栈：

- Cloudflare Workers
- Hono
- TypeScript
- Cloudflare D1
- Drizzle ORM
- Zod
- OpenAPI
- GitHub Contents API
- Git-backed Memory
- Iris Skill
- Cloudflare Scheduled Triggers
- Future Cloud Agent Execution

---

# 部署

Iris 当前已经可以部署到 Cloudflare Workers + D1，并连接独立的 Iris Memory Git Repository。

完整部署流程：

```text
配置 wrangler.jsonc
↓
运行memory:init生成git仓库模版并push
↓
配置 GitHub Token Secret
↓
执行远程数据库 Migration
↓
部署 Worker
↓
创建远程 Iris API Token
↓
配置本地 Iris Skill
↓
执行 API 连通测试
↓
执行 Memory 连通测试
```
---

## 1. 准备 Cloudflare 和 GitHub

部署前至少需要：

- Cloudflare Account
- Cloudflare Workers
- Cloudflare D1 Database
- GitHub Account
- 一个 Iris Memory Repository
- GitHub fine-grained token

建议 Iris Memory Repo 使用：

```text
Private Repository
```

并让 GitHub Token 只拥有 Iris 实际需要的 Repository 权限。

---

## 2. 配置 `wrangler.jsonc`

首先配置：

```text
wrangler.jsonc
```

至少确认：

- Worker Name
- D1 Binding
- D1 Database Name
- D1 Database ID
- Scheduled Triggers
- Runtime Vars

例如：

```jsonc
{
  "name": "iris",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "iris",
      "database_id": "<YOUR_D1_DATABASE_ID>"
    }
  ],

  "vars": {
    "GITHUB_OWNER": "<YOUR_GITHUB_OWNER>",
    "GITHUB_REPO": "<YOUR_IRIS_MEMORY_REPO>"
  }
}
```

实际变量名请以当前代码中的 runtime configuration 为准。

---

## 3. 配置普通 Runtime Vars

非敏感配置可以放在：

```text
wrangler.jsonc
```

的：

```text
vars
```

中。

例如：

```text
GitHub Owner
Memory Repository
Runtime Mode
其他非敏感配置
```

不要把：

```text
GitHub Token
Iris API Token
Provider Token
其他 Secret
```

直接写进 `vars`。

---

## 4. 配置 GitHub Token

GitHub Token 属于 Secret。

不要写入：

```text
wrangler.jsonc
Git Repository
Iris Memory Repo
README
```

使用 Cloudflare Worker Secret：

```bash
pnpm wrangler secret put GITHUB_TOKEN
```

然后根据命令提示输入 GitHub fine-grained token。

推荐：

```text
Token
↓
只授权 Iris Memory Repo
↓
只开放 Iris 实际需要的 Repository Contents 权限
```

Agent 不应该直接获取这个 Token。

正确结构：

```text
Agent
↓
Iris API
↓
Worker
↓
GitHub API
```

---

## 5. 执行远程数据库 Migration

配置完成后执行：

```bash
pnpm run db:migrate:remote
```

该命令会将项目中的数据库 Migration 应用到远程 Cloudflare D1。

首次部署必须执行。

以后如果新增：

```text
Table
Column
Index
Migration
```

也需要在部署对应代码时执行。

建议顺序保持：

```text
Migration
↓
Deploy
```

避免新代码依赖尚未存在的数据库结构。

---

## 6. 部署 Iris Worker

执行：

```bash
pnpm run deploy
```

部署完成后会得到线上 Worker 地址，例如：

```text
https://iris.<your-subdomain>.workers.dev
```

如果配置了自定义域名，则使用实际 Iris API 地址。

此时：

```text
Worker
+
D1
+
Memory Integration
```

已经运行。

但 Agent 还没有访问 Iris API 的身份凭据。

---

## 7. 创建远程 Iris API Token

执行：

```bash
pnpm run auth:create-remote
```

该命令会在远程 Iris D1 中创建 API Token。

生成后的 Token 类似：

```text
iris_xxxxxxxxx
```

客户端请求使用：

```http
Authorization: Bearer iris_xxx
```

原始 Token 只应在创建时暴露。

Server 只保存：

```text
SHA-256 Token Hash
```

不要保存明文 Token。

创建后请立即妥善保存。

不要：

- commit 到 Git
- 写入 Memory Repo
- 写进 README
- 放进公开配置

---

# 配置本地 Iris Skill

远程 API 部署完成以后，需要让本地 Agent / Runtime 能够调用 Iris。

至少需要：

```text
IRIS_API_BASE_URL
IRIS_API_TOKEN
```

例如：

```text
IRIS_API_BASE_URL=https://iris.example.com
IRIS_API_TOKEN=iris_xxx
```

具体配置方式取决于运行 Iris Skill 的 Agent Runtime。

Skill 本身不应该硬编码：

- Iris API URL
- Iris API Token
- GitHub Token
- Provider Secret

---

# 本地 Skill 连通测试

部署以后不要立刻写入大量真实数据。

建议先完成最小连通性测试。

测试顺序：

```text
Auth
↓
READ
↓
CREATE
↓
VERIFY
↓
Memory READ
↓
Memory WRITE
```

---

## 1. 测试 Auth + API

让本地 Agent 执行：

```text
列出我的 Iris Projects。
```

验证：

```text
Local Agent
↓
Iris Skill
↓
Remote Iris API
↓
Bearer Auth
↓
D1
```

可以正常连通。

---

## 2. 创建测试 Project

例如：

```text
创建一个名为 Iris Deployment Test 的测试 Project。
```

确认：

- CREATE 成功
- 返回 Project ID
- GET 可以再次读取
- User Scope 正确

---

## 3. 测试 Git-backed Memory

让 Agent 执行：

```text
在 Iris Deployment Test 项目中创建一个 test.md。

内容：

# Iris Memory Test

Memory connection works.
```

完整调用链：

```text
Local Agent
↓
Iris Skill
↓
Iris API
↓
Markdown Service
↓
Git Provider
↓
GitHub
↓
Iris Memory Repo
```

随后再次读取该文件。

确认：

- Resource 已创建
- Git 文件存在
- Markdown 内容正确
- Revision 正常返回

---

## 4. 测试 Memory Update

读取：

```text
revision = A
```

然后更新：

```text
test.md
```

提交：

```text
expected_revision = A
```

确认：

- 内容更新成功
- Revision 发生变化
- Git 提交正常

这样可以确认 optimistic concurrency 工作正常。

---

# 部署完成检查

最小检查：

```text
[ ] Worker 可以正常访问

[ ] D1 Migration 已完成

[ ] Iris API Token 可以认证

[ ] Project API 可以读写

[ ] Milestone API 可以读写

[ ] Task API 可以读写

[ ] Resource API 可以工作

[ ] Capability API 可以工作

[ ] Iris Memory Repo 可以创建 Markdown

[ ] Markdown 可以读取

[ ] Markdown 可以更新

[ ] Git Revision 正常

[ ] Content Conflict Protection 正常

[ ] Iris Skill 可以连接远程 Iris API
```

v0.2 还可以继续检查：

```text
[ ] Finance API

[ ] Reminder API

[ ] Reminder Scheduled Trigger

[ ] Notification API

[ ] Notification Settings

[ ] Notification Channel
```

如果尚未配置真实 Notification Provider：

Notification 的生产 Delivery Channel 可以暂时不可用。

此时 ReminderOccurrence 应保持：

```text
pending
```

而不是伪造通知发送成功。

---

# 日常更新部署

首次部署完成后，日常代码更新通常只需要：

```bash
pnpm run db:migrate:remote
pnpm run deploy
```

如果本次没有新的 Migration，可以根据项目实际情况省略数据库 Migration。

---

# 首次部署快速流程

```text
1. 创建 Cloudflare D1

2. 创建 Iris Memory Repo

3. 创建 GitHub fine-grained Token

4. 配置 wrangler.jsonc

5. 配置 vars

6. 配置 GITHUB_TOKEN Secret

7. pnpm run db:migrate:remote

8. pnpm run deploy

9. pnpm run auth:create-remote

10. 配置本地 Iris Skill

11. 测试 Project API

12. 测试 Git-backed Memory
```

完成后，一个最小可运行 Iris Instance 已经建立：

```text
Local Agent
     │
     ▼
 Iris Skill
     │
     ▼
Cloudflare Worker
     │
 ┌───┴────────┐
 ▼            ▼
D1          GitHub
State       Memory
```

---

# 设计原则

Iris 当前遵循以下原则：

- 不保存两份相同的真相。
- 优先保留历史，而不是破坏性删除。
- 能确定性执行，就不要重复调用 LLM。
- 结构化运行状态放 D1。
- 长期内容和可执行记忆放 Git。
- Secrets 不进入 Memory Repo。
- Agent 不直接持有底层 Provider Secret。
- Agent 不直接持有 GitHub Token。
- 优先复用已有 Capability，而不是每次重新发明流程。
- 把重复成功的推理逐渐沉淀成 Rule / Skill / Script / API。
- 历史事实不应该因为当前配置变化而被重新解释。
- Agent 负责理解模糊意图。
- Server 负责确定性执行。
- 没有真实使用证明之前，不提前把核心模型复杂化。
- 自我进化必须受控。
- 修改已有数据前，应先 Resolve 正确的实体。
- 并发修改长期内容时，不允许静默覆盖。

---

# 当前状态

Iris 已经从概念设计阶段进入：

> **可部署、可真实使用、持续迭代的个人 Agent Runtime。**

v0.1 已经完成：

```text
Structured State
+
Git-backed Memory
+
Iris API
+
Iris Skill
+
Cloudflare Deployment
```

v0.2 开始增加：

```text
Finance
+
Reminder
+
Notification
```

Iris 已经具备从：

```text
记录
```

走向：

```text
持续跟踪
+
主动提醒
+
长期记忆
```

的基础结构。

接下来的重点不是无限扩充模型。

而是：

```text
部署真实 Iris
↓
持续 Dogfooding
↓
让 Iris 管理真实工作与生活
↓
观察实际行为
↓
发现摩擦
↓
修正模型和 Skill
↓
发现重复模式
↓
沉淀 Rule / Skill / Script / API
```

真正的目标始终不是：

> 做一个看起来很聪明的 Demo。

而是：

> **让 Iris 可靠地持续存在，真正进入日常生活，并随着长期使用越来越懂你、越来越会做事。**