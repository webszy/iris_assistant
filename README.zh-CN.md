# Iris

**一个强状态、长期运行、以 Life OS 为目标的私人 Agent。**

Iris 不只是聊天机器人，也不只是 Todo List 或项目管理工具。

它希望成为一个持续存在的个人操作系统：知道你正在做什么，记得你过去做过什么，知道下一步应该处理什么，能够复用已经积累的能力，并逐渐减少重复推理。

> **把人生、工作、知识、记忆、规则和执行，组织成一个统一的个人系统。**

---

## 为什么做 Iris

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

## 核心思想

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
→ Script
```

LLM 主要处理模糊问题、新情况、信息冲突和开放式推理。

---

## 系统架构

```text
                    用户 / Any Agent
                           │
                           ▼
                  Cloudflare Worker
                      控制平面
                           │
                           ▼
                          D1
                      当前状态
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        Iris System Repo          Iris Memory Repo
        系统代码 / API / UI       长期记忆
              │                         │
              └────────────┬────────────┘
                           ▼
                      Cloud Agent
                        执行层
```

### Iris System Repo

保存 Iris 本身的程序代码：

- Cloudflare Worker API
- Dashboard
- Auth
- D1 Schema / Migration
- Git Integration
- Agent Adapter
- Scheduler
- Runtime

### Iris Memory Repo

保存一个 Iris Instance 的长期沉淀：

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

### D1

保存结构化运行状态：

- Project
- Milestone
- Task
- Resource
- Capability
- Reminder
- Rule
- 其他运行状态

### Cloud Agent

负责 Worker 不应该直接承担的执行工作：

- 读取 / 修改仓库文件
- 执行 Skill
- 运行 Script
- 生成 Artifact
- commit / push

---

## 核心模型

Iris 有一个最核心的原则：

> **Everything lives in a Project.**

但这并不意味着：

> Everything becomes a Project.

### Project

长期上下文。

例如：

```text
Iris
DeepUsername
Meta Ads
Daily Weather
减脂
某部小说
```

### Milestone

Project 中可选的阶段。

```text
Iris
├── v0.1
├── v0.5
└── v1.0
```

### Task

具体执行动作。

```text
实现 Bearer Auth
完成小说第 10 章
部署 Iris API
```

### Resource

真实资料、文件、目录、仓库或 URL 的引用。

```text
PRD.md
Chapter-10.md
scripts/check-provider.ts
skills/project-secretary/
外部文档 URL
```

### Capability

Iris 已注册、可以调用的一项能力。

```text
Project Secretary
Check Provider Health
Novel Consistency Checker
Fetch Weather
```

关系：

```text
Project
│
├── Milestone
│   └── Task
│
├── Task
├── Resource
└── Capability
```

---

## State 与 Memory 的边界

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

而：

```text
Git:
projects/novel-a/chapters/chapter-10.md
```

数据库负责记录这件事做到哪里。

Git 负责保存真正的内容。

这样不会产生双重 Source of Truth。

---

## Resource 与 Capability

Resource 回答：

> 真实东西在哪里？

Capability 回答：

> Iris 可以用它做什么？

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

Script 和 Skill 都存放在 Iris Memory Repo。

Worker 负责注册、查找和路由 Capability。

Cloud Agent 负责真正执行。

---

## Memory

标准 Iris Memory Repo 大致如下：

```text
iris-memory/
├── .iris/
│   └── memory.yaml
├── identity/
├── projects/
├── knowledge/
├── skills/
├── scripts/
├── prompts/
├── references/
└── archive/
```

Memory Repo 不是 D1 的文件版备份。

它保存长期内容，而不是实时运行状态。

---

## Life OS

Iris 的长期方向是成为一个个人 Life OS。

它最终应该能够帮助回答：

```text
我现在在做什么？
下一步最重要的是什么？
我以前为什么做过这个决定？
我是不是忘了什么？
这个 Project 已经积累了什么？
我已经会哪些能力？
根据当前环境，我现在应该怎么做？
我的生活最近发生了什么变化？
```

未来 Dashboard 会成为这一系统的可视化层：

> 一个属于个人的 Life Cockpit。

---

## 从设计上减少 LLM 调用

```text
确定性 Rule 能处理？
→ 用 Rule

已有 Script 能处理？
→ 跑 Script

已有 Skill 能处理？
→ 用 Skill

只有确实需要模糊推理？
→ 调用 LLM
```

长期学习过程：

```text
Experience
→ Pattern
→ Rule
→ Skill
→ Script
```

随着时间：

```text
LLM 依赖 ↓
确定性执行 ↑
个性化 ↑
可靠性 ↑
```

---

## 路线图

### v0.1 — Reliable Personal Secretary

重点：

- Auth
- Project
- Milestone
- Task
- Resource
- Capability
- Reminder
- Finance
- Weather
- Rules
- Daily Context
- Iris API
- Iris Skill
- Grok Bot Integration

目标：

> 先让 Iris 成为一个真实可靠、能管理日常工作与生活的私人秘书。

### v0.5 — Personal Knowledge Steward

重点：

- 长期 Knowledge
- Knowledge Item
- Search
- Project Link
- Source
- Summary
- Tags

目标：

> 让 Iris 开始真正管理、整理和检索长期知识。

### v1.0 — Self-Evolving Personal Assistant

重点：

- Capability Registry
- Skill Registry
- Skill Runtime
- Skill Factory
- Workflow Learning
- Preference Learning
- Capability Evolution

目标：

> 把重复成功的推理与工作流沉淀成可复用能力。

### v1.1 — Personality System

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

> 让每一个 Iris Instance 都拥有稳定、可理解、可版本化、可演化的行为身份。

---

## 多 Iris Instance

```text
Iris System
    │
    ├── Iris #1 → Memory #1
    ├── Iris #2 → Memory #2
    └── Iris #100 → Memory #100
```

代码可以完全一样。

每个 Iris 可以因为这些东西不同而成为不同个体：

- Working State
- Memory
- Capability
- Personality
- Experience

所以 Iris 不只是“一个私人助手”。

它最终可以成为：

> **一套可实例化的长期个人 Agent 系统。**

---

## 当前开发重点

目前正在完成 v0.1 最底层的地基：

```text
Auth
+
Project
+
Milestone
+
Task
+
Resource
+
Capability
```

紧接着的主线是：

```text
Deploy API
→ 使用真实 Iris 数据 Dogfooding
→ 接入 Iris Memory Repo
→ Git Integration
→ Cloud Agent
```

---

## 技术栈

当前技术栈：

- Cloudflare Workers
- Hono
- TypeScript
- Cloudflare D1
- Drizzle ORM
- Zod
- OpenAPI
- Git-backed Memory
- Cloud Agent Execution

---

## 设计原则

- 不保存两份相同真相。
- 优先保留历史，而不是破坏性删除。
- 能确定性执行，就不要重复调用 LLM。
- 结构化状态放 D1。
- 长期内容和可执行记忆放 Git。
- Secrets 不进入 Memory Repo。
- 优先复用已有 Capability，而不是每次重新发明流程。
- 把重复成功的推理逐渐沉淀成 Rule / Skill / Script。
- 没有真实使用证明之前，不提前把核心模型复杂化。

---

## 当前状态

Iris 正在持续开发中。

项目仍然处于早期阶段，但设计目标不是先做一个看起来聪明的 Demo。

真正的目标是：

> **让 Iris 变得可靠、持续存在、真正有用，并且随着长期使用越来越懂你、越来越会做事。**
