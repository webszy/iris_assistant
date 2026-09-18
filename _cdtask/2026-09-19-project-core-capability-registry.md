---
task_contract: cdf-cdtask/v1
handoff_type: approved-tasking
status: tasking_ready
source: cdf
approval_state: approved
risk_level: Level XL
workspace: /Volumes/Development/Workspace/Iris-assisant
source_branch: Unavailable
source_commit: Unavailable
source_worktree_state: Unavailable
source_worktree_changes: [Unavailable]
save_drift_preflight: matched
save_drift_notes: none
scope_lock_sha256: 0af14b82ecb57b5b433bfe0f68fad85d4c71f8071a8ff365b266229fb7965008
approval_record_sha256: 447da15fa4866375d92aaec68df5de3df72cc85eb802be6699e5fb3cb451eafe
created_at: 2026-09-18T18:20:48.519Z
---

# Iris v0.1 — Project Core + Capability Registry

## CDF Resume Contract
- Resume Path: CDF only
- Task Contract: cdf-cdtask/v1
- Canonical Scope Lock: cdf-scope/v1
- Saved Definition State: tasking_ready
- Execution Authorized by This Document: No
- Saved Approval Meaning: approved scope and Save as Task persistence authorization only
- Source Workspace: /Volumes/Development/Workspace/Iris-assisant
- Source Branch: Unavailable
- Source Commit: Unavailable
- Source Worktree State: Unavailable
- Source Worktree Changes: [Unavailable]
- Save Drift Preflight: matched
- Save Drift Notes: none
- Scope Lock SHA-256: 0af14b82ecb57b5b433bfe0f68fad85d4c71f8071a8ff365b266229fb7965008
- Approval Record SHA-256: 447da15fa4866375d92aaec68df5de3df72cc85eb802be6699e5fb3cb451eafe
- Execution Progress Path: /Volumes/Development/Workspace/Iris-assisant/_cdtask/2026-09-19-project-core-capability-registry.md.progress.yaml
- Execution Progress Created By Save: No

Git 不可用的原因和内容摘要基线详见 Evidence Summary。保存前 2026-09-18T18:20:48.519Z 已重新检查全部 32 个基线文件和目录集合，未发现内容漂移。READY 仅表示任务定义可供以后受控恢复，不表示功能已实现或测试已通过。

## Approval Summary

保存授权原文（先前用户消息）：

````text
那我们把这个拆分成4个task，Project、Milestone、Task、Resource各一个，然后批准并保存为task
````

以下为已展示的冲突评审原文。该历史评审没有批准提问，不虚构提问；其建议由后续用户最终答复取舍。最新答复明确改为五个任务并集中一次迁移，覆盖此前四任务拆分。保存动作沿用已给出的明确授权，本次不是执行授权。

````text
可以合并，整体模型兼容，但有几处冲突和缺口需要在保存任务前统一。最关键的是：新增 Capability 后，Resource 的删除和修改规则也必须补充。

| 问题 | 对照结果 | 建议合并规则 |
|---|---|---|
| `resource_id` 是否必填 | 新需求要求 `NOT NULL`；仓库[最新定义文档](/Volumes/Development/Workspace/Iris-assisant/docs/03_Iris_Project_Task_Resource_Capability_Definition_v0.1.md:1099)仍写 Optional | 按新增需求设为必填，并同步修正文档 |
| 删除被引用的 Resource | 原需求允许删除 metadata；现在 Capability 必须保留 Resource 引用，且自身不能删除 | 有任何 Capability 引用时拒绝删除，包括 disabled 的引用；建议返回 `409 RESOURCE_IN_USE`，外键禁止级联删除 |
| 修改被引用的 Resource.kind | 原需求允许修改 kind；可能把 script 引用的 file 改成 directory，破坏关联规则 | Resource PATCH 同样检查引用它的 Capability；不兼容的修改拒绝，不能只在 Capability 创建/更新时校验 |
| kind 不匹配的错误码 | 新需求前面写 `422 VALIDATION_ERROR`，后面写 `INVALID_CAPABILITY_RESOURCE_KIND` | 统一为 `422 INVALID_CAPABILITY_RESOURCE_KIND` |
| 跨 Project 引用错误 | 新需求同时出现专用 mismatch 错误码和“404 / validation failure” | 建议统一 `404 RESOURCE_NOT_FOUND`；跨用户也返回相同结果，避免额外泄露 |
| 校验状态码与仓库约定 | [现有校验入口](/Volumes/Development/Workspace/Iris-assisant/src/app.ts:12)统一返回 `400 BAD_REQUEST`，提示词要求部分错误返回 422 | 保留已有通用 400；Resource/Capability 明确规定的业务校验使用 422，并在 OpenAPI 和测试中明确区分 |
| Migration 生成方式 | [当前配置](/Volumes/Development/Workspace/Iris-assisant/drizzle.config.ts:3)注明缺少 Drizzle 历史 meta，直接 generate 可能重复生成基础表 | 先明确增量迁移生成方案；保留旧 SQL，不直接运行未经基线处理的 generate |
| 示例缺字段 | 新增的 `Check Provider Script` 是 file，但示例缺少 repository | 补上 `repository: OPC_OS` |

还有三处需要在合并文本中说清楚：

- 原来的“不要实现 Skill”应收窄为“不要实现 Skill Runtime、发现、安装和执行”。允许注册 `type=skill` 的 metadata，与本阶段范围一致。
- “One Git Repository”目前没有指定可校验的唯一仓库标识。建议本阶段只记录 `repository/path`，不自动访问 Git，也不擅自增加仓库白名单约束。
- 之前的“四个 task、每个实体一个”现在对应五个实体。建议增加第 5 个 **Capability Registry** task；它依赖 Project 和 Resource，并包含上述 Resource 引用保护及整条链路验收。

“一次新增五张表”与分任务实施也需要协调：若每个 task 要独立完成并验收，逐任务追加 migration 更自然；若坚持单个 migration，就需要集中处理五表 schema。这是交付组织选择，不是数据模型冲突。

目前没有保存新任务，也没有修改代码。以上是合并建议，尚未把新增的删除限制、错误码等建议当作已确定需求。
````

原始需求 R1（历史输入，按最新答复覆盖冲突；逐字保留）：

````text
我们继续实现 Iris API。

前一阶段已经完成/正在完成基础 Bootstrap：

Cloudflare Workers
+ Hono
+ TypeScript
+ D1
+ Drizzle ORM
+ Zod
+ OpenAPI
+ Bearer Token Auth

现在进入 Iris v0.1 的第二个开发阶段：

# Project Core

本阶段一次性实现：

- Project
- Milestone
- Task
- Resource

包括：

- Drizzle Schema
- D1 Migration
- Zod / OpenAPI Schema
- CRUD Routes
- Tenant Isolation
- Relationship Validation
- 基础测试

请严格控制 Scope。

不要实现：

- Decision
- Reminder
- Finance
- Asset
- Weather
- Rules
- Context
- Knowledge Base
- RAG
- GitHub 文件读写
- Skill
- Automation
- Workflow

Resource 当前只保存文件 / Git / URL 的 metadata。
不要在本阶段真正读取、修改或 commit Git 文件。

==================================================
一、实施前先检查仓库
==================================================

开始前先读取并理解现有仓库：

- package.json
- wrangler 配置
- drizzle.config
- src/db
- src/middleware/auth
- src/routes
- OpenAPI 配置
- 当前 response/error helper
- 当前测试方式
- 已有 users / api_tokens schema
- 当前 timestamp / UUID 约定

原则：

1. 优先遵循当前仓库已经建立的合理规范。
2. 不要重新搭一套平行架构。
3. 不要破坏已经工作的 Auth / Test Route。
4. 如果本 Prompt 与仓库中已经锁定的实现细节存在冲突，先以仓库现有基础约定为准，并在最终总结中说明差异。
5. 如果项目中已经存在 Iris Project / Resource 系统定义 Markdown，请先阅读；否则本 Prompt 即为当前实现 Source of Truth。

==================================================
二、Iris 核心原则
==================================================

Iris 的 Project System 遵循：

> Everything lives in a Project.

不是：

> Everything becomes a Project.

基础关系：

Project
  ↓
Milestone (optional)
  ↓
Task

同时：

Project / Milestone / Task
都可以关联 Resource。

完整关系：

Project
│
├── Resources
│
├── Milestone
│   ├── Resources
│   └── Task
│       └── Resources
│
└── Task
    └── Resources

概念定义：

Project
= 长期上下文

Milestone
= Project 中的阶段

Task
= 具体执行动作

Resource
= 与 Project / Milestone / Task 关联的真实资料或成果物引用

==================================================
三、非常重要：不要存重复状态
==================================================

Project 不保存：

- current_focus
- next_action
- progress
- current_milestone_id
- last_completed_task

这些全部从 Milestone / Task 派生。

例如：

Current Work
→ status = doing 的 Tasks

Next Action
→ position 最靠前的 todo Tasks

Recent Progress
→ completed_at 最近的 Tasks

Current Stage
→ status = active 的 Milestones

不要在数据库中建立重复字段。

==================================================
四、统一基础约定
==================================================

继续沿用项目已有约定。

如果当前仓库没有不同约定，则使用：

ID:
- UUID v4
- crypto.randomUUID()

Timestamp:
- D1 / SQLite INTEGER
- UTC Unix epoch milliseconds

API Response 中：
- 时间输出为 ISO 8601 UTC String

所有私人数据必须：

user_id = authenticated user

禁止客户端提交 user_id 来决定资源归属。

所有 Route 都从：

c.get("user")

获取当前用户。

所有查询都必须显式限制：

user_id = authenticatedUser.id

跨用户资源访问统一返回 404，
不要泄漏另一个用户的数据是否存在。

==================================================
五、Project 数据模型
==================================================

创建：

projects

字段：

id
user_id

name
slug
description

kind
status

created_at
updated_at
archived_at

--------------------------------
字段要求
--------------------------------

id:
UUID v4

user_id:
NOT NULL

name:
NOT NULL

slug:
NOT NULL

description:
nullable

kind:
NOT NULL

status:
NOT NULL

created_at:
NOT NULL

updated_at:
NOT NULL

archived_at:
nullable

--------------------------------
Project kind
--------------------------------

v0.1 固定为：

product
operation
automation
personal
content
other

kind 当前只是描述属性。

不要根据 kind 创建不同业务流程。

默认：

other

--------------------------------
Project status
--------------------------------

v0.1：

planned
active
paused
completed

默认：

planned

语义：

planned
= 已存在，但尚未开始

active
= 正在运行

paused
= 暂停，但仍属于当前体系

completed
= Project 本身已经真正结束

注意：

Iris v0.1 Milestone completed
不代表
Iris Project completed

--------------------------------
Slug
--------------------------------

约束：

UNIQUE(user_id, slug)

slug 使用：

lowercase
[a-z0-9-]

不要自动修改用户已经提交的合法 slug。

创建时 slug 必填。

--------------------------------
Archive
--------------------------------

Archive 与 status 分开。

archived_at = null
→ 正常显示

archived_at != null
→ 已归档

不要增加：

status = archived

v0.1 不提供 Project hard delete API。

==================================================
六、Milestone 数据模型
==================================================

创建：

milestones

字段：

id
user_id
project_id

name
description

status
position

created_at
updated_at

--------------------------------
字段要求
--------------------------------

id:
UUID v4

user_id:
NOT NULL

project_id:
NOT NULL

name:
NOT NULL

description:
nullable

status:
NOT NULL

position:
NOT NULL integer

created_at:
NOT NULL

updated_at:
NOT NULL

--------------------------------
Milestone status
--------------------------------

planned
active
completed
cancelled

默认：

planned

允许一个 Project 同时存在多个：

status = active

不要创建：

project.current_milestone_id

不要限制一个 Project 只能有一个 active Milestone。

--------------------------------
Position
--------------------------------

position 表示规划顺序。

推荐：

100
200
300

创建 Milestone 时：

如果客户端提供 position：
→ 使用并验证 integer

如果没有提供：
→ 自动取该 Project 当前最大 position + 100

第一条默认：

100

不要使用 created_at 推断 Milestone 顺序。

--------------------------------
Deadline
--------------------------------

不要创建：

deadline
due_at
target_at
completed_at

Milestone v0.1 不需要独立截止日期。

status 切换为 completed 时：

updated_at = now

即可作为第一版实用的完成时间。

--------------------------------
Delete
--------------------------------

不提供 Milestone hard delete Route。

废弃阶段使用：

status = cancelled

==================================================
七、Task 数据模型
==================================================

创建：

tasks

字段：

id
user_id
project_id
milestone_id nullable

title
description nullable

status
position

created_at
updated_at
completed_at nullable

--------------------------------
字段要求
--------------------------------

id:
UUID v4

user_id:
NOT NULL

project_id:
NOT NULL

milestone_id:
nullable

title:
NOT NULL

description:
nullable

status:
NOT NULL

position:
NOT NULL

created_at:
NOT NULL

updated_at:
NOT NULL

completed_at:
nullable

--------------------------------
Task status
--------------------------------

todo
doing
completed
cancelled

默认：

todo

v0.1 不加入：

blocked
waiting
review

--------------------------------
Project
--------------------------------

project_id 必须存在。

Task 不允许成为 orphan。

Everything lives in a Project。

--------------------------------
Milestone
--------------------------------

milestone_id 可空。

允许：

Project → Task

不强制所有 Task 都进入 Milestone。

如果 milestone_id != null：

必须验证：

- Milestone 属于 authenticated user
- Milestone.project_id == Task.project_id

--------------------------------
Position
--------------------------------

Task position 表示执行顺序。

创建 Task 时：

如果提供 position：
→ 使用

如果没有提供：

若 milestone_id != null：
→ 在该 Milestone 内取 max(position) + 100

若 milestone_id == null：
→ 在该 Project 的 project-level Tasks 中取 max(position) + 100

第一条默认：

100

--------------------------------
completed_at
--------------------------------

Task 必须保留独立 completed_at。

当：

status 从非 completed
→ completed

设置：

completed_at = now

当：

status 从 completed
→ todo / doing / cancelled

清空：

completed_at = null

修改已经 completed 的 Task title/description 时：

不要改变 completed_at。

--------------------------------
Delete
--------------------------------

不提供 Task hard delete Route。

不再执行的 Task：

status = cancelled

==================================================
八、Resource 数据模型
==================================================

创建：

resources

字段：

id
user_id

project_id
milestone_id nullable
task_id nullable

name
kind
role

repository nullable
path nullable
url nullable

created_at
updated_at

--------------------------------
概念
--------------------------------

Resource 不存 Markdown 正文。

Iris DB：

保存 Resource metadata。

Git：

保存 Markdown 正文。

当前 v0.1 不实现 Git API 文件操作。

--------------------------------
Resource kind
--------------------------------

repository
directory
file
url

--------------------------------
Resource role
--------------------------------

context
spec
artifact
reference

语义：

context
= 理解上下文所需资料
例如 AGENTS.md / PROJECT_CONTEXT.md

spec
= 规格与定义
例如 PRD / API Design

artifact
= Task / Project 实际产出的成果物
例如小说章节 / 技术文章

reference
= 外部参考资料
例如竞品 URL / API 文档

--------------------------------
Resource ownership
--------------------------------

每个 Resource 必须属于 Project。

project_id:
NOT NULL

Milestone / Task 是进一步缩小 Scope。

严格采用以下三种形式：

1. Project Resource

project_id = required
milestone_id = null
task_id = null

2. Milestone Resource

project_id = required
milestone_id = required
task_id = null

3. Task Resource

project_id = required
milestone_id = null
task_id = required

禁止：

milestone_id != null
AND
task_id != null

Task 已经知道自己的 Milestone，
Task Resource 不重复存 milestone_id。

--------------------------------
Relationship validation
--------------------------------

如果 milestone_id != null：

必须验证：

milestone.user_id == authenticated user
milestone.project_id == resource.project_id

如果 task_id != null：

必须验证：

task.user_id == authenticated user
task.project_id == resource.project_id

--------------------------------
kind 字段校验
--------------------------------

kind = repository

要求：

repository != null

path 可以为空
url 可以为空

---

kind = directory

要求：

repository != null
path != null

---

kind = file

要求：

repository != null
path != null

---

kind = url

要求：

url != null

repository / path 可以为空

不要在 v0.1 自动访问这些 Resource。

==================================================
九、数据库索引
==================================================

建立必要索引。

至少：

--------------------------------
projects
--------------------------------

UNIQUE:
(user_id, slug)

INDEX:
(user_id, status)

INDEX:
(user_id, archived_at)

--------------------------------
milestones
--------------------------------

INDEX:
(user_id, project_id)

INDEX:
(user_id, project_id, status)

INDEX:
(user_id, project_id, position)

--------------------------------
tasks
--------------------------------

INDEX:
(user_id, project_id)

INDEX:
(user_id, project_id, status)

INDEX:
(user_id, project_id, position)

INDEX:
(user_id, milestone_id, status)

INDEX:
(user_id, milestone_id, position)

INDEX:
(user_id, completed_at)

--------------------------------
resources
--------------------------------

INDEX:
(user_id, project_id)

INDEX:
(user_id, milestone_id)

INDEX:
(user_id, task_id)

不要为了猜测未来查询模式建立大量额外索引。

==================================================
十、数据库关系
==================================================

建立合理 Foreign Key。

users
→ projects

projects
→ milestones

projects
→ tasks

milestones
→ tasks

projects
→ resources

milestones
→ resources

tasks
→ resources

不要设计物理删除级联逻辑来承担业务生命周期。

Project / Milestone / Task 正常业务操作不会 hard delete。

Resource metadata 可以删除。

==================================================
十一、Project Routes
==================================================

统一：

/api/v1

所有以下 Route：

必须 Auth。

--------------------------------
GET /api/v1/projects
--------------------------------

返回当前用户 Projects。

默认：

不返回 archived 项目。

支持 query：

status
kind
include_archived

include_archived=true
→ 包含 archived

默认排序建议：

created_at DESC

不要做 Pagination，
当前阶段先保持简单。

--------------------------------
POST /api/v1/projects
--------------------------------

Body：

name
slug
description?
kind?
status?

禁止：

user_id
created_at
updated_at
archived_at

创建成功：

201

--------------------------------
GET /api/v1/projects/:projectId
--------------------------------

只允许访问自己的 Project。

不存在或不属于当前用户：

404

--------------------------------
PATCH /api/v1/projects/:projectId
--------------------------------

允许修改：

name
slug
description
kind
status

禁止直接修改：

id
user_id
created_at
updated_at
archived_at

更新：

updated_at = now

--------------------------------
POST /api/v1/projects/:projectId/archive
--------------------------------

设置：

archived_at = now

如果已经 archived：

保持 idempotent

--------------------------------
POST /api/v1/projects/:projectId/unarchive
--------------------------------

设置：

archived_at = null

保持 idempotent

不要实现：

DELETE /projects/:id

==================================================
十二、Milestone Routes
==================================================

--------------------------------
GET /api/v1/projects/:projectId/milestones
--------------------------------

返回该 Project 的 Milestones。

确认 Project 属于当前用户。

支持：

status

默认：

ORDER BY position ASC

--------------------------------
POST /api/v1/projects/:projectId/milestones
--------------------------------

Body：

name
description?
status?
position?

project_id 来自 URL，
禁止 body 提交 user_id / project_id。

创建成功：

201

--------------------------------
GET /api/v1/projects/:projectId/milestones/:milestoneId
--------------------------------

必须同时满足：

authenticated user
project
milestone belongs to project

否则：

404

--------------------------------
PATCH /api/v1/projects/:projectId/milestones/:milestoneId
--------------------------------

允许：

name
description
status
position

更新：

updated_at = now

不要 DELETE Milestone。

==================================================
十三、Task Routes
==================================================

--------------------------------
GET /api/v1/projects/:projectId/tasks
--------------------------------

返回 Project 所有 Tasks。

支持 query：

status
milestone_id

默认排序：

position ASC

如果 milestone_id 提供：

必须确保 milestone 属于该 Project + authenticated user。

--------------------------------
POST /api/v1/projects/:projectId/tasks
--------------------------------

Body：

milestone_id?
title
description?
status?
position?

project_id 来自 URL。

如果 milestone_id 存在：

验证属于当前 Project。

创建成功：

201

如果创建时：

status = completed

则：

completed_at = now

--------------------------------
GET /api/v1/projects/:projectId/tasks/:taskId
--------------------------------

必须确保：

task.user_id = current user
task.project_id = URL project

否则：

404

--------------------------------
PATCH /api/v1/projects/:projectId/tasks/:taskId
--------------------------------

允许：

milestone_id
title
description
status
position

如果修改 milestone_id：

必须重新验证 Milestone 属于同一 Project。

status transition：

非 completed → completed
→ completed_at = now

completed → 非 completed
→ completed_at = null

completed → completed
→ 保留原 completed_at

每次 mutation：

updated_at = now

不要 DELETE Task。

==================================================
十四、Resource Routes
==================================================

--------------------------------
GET /api/v1/projects/:projectId/resources
--------------------------------

返回该 Project 下所有 Resource metadata。

支持 query：

kind
role
milestone_id
task_id

如果 milestone_id / task_id 被提供：

必须验证属于该 Project。

--------------------------------
POST /api/v1/projects/:projectId/resources
--------------------------------

Body：

name
kind
role

milestone_id?
task_id?

repository?
path?
url?

禁止：

user_id
project_id

project_id 来自 URL。

必须验证 ownership rule：

milestone_id 和 task_id 不能同时存在。

然后根据 kind 校验：

repository
path
url

创建成功：

201

--------------------------------
GET /api/v1/projects/:projectId/resources/:resourceId
--------------------------------

只允许当前用户读取。

确认 Resource 属于 URL Project。

--------------------------------
PATCH /api/v1/projects/:projectId/resources/:resourceId
--------------------------------

允许修改：

name
kind
role
milestone_id
task_id
repository
path
url

任何修改后：

重新执行完整 relationship validation
+
kind validation

updated_at = now

--------------------------------
DELETE /api/v1/projects/:projectId/resources/:resourceId
--------------------------------

允许删除 Resource metadata。

重要：

这里只删除 Iris DB 中的 Resource 记录。

绝对不要：

- 删除 Git 文件
- 调 GitHub API
- 删除实际 URL 内容
- 删除 repository 内容

返回：

204
或遵循仓库当前统一 delete response。

==================================================
十五、OpenAPI / Zod
==================================================

全部 Route 必须：

- 使用 Zod 校验
- 注册 OpenAPI Schema
- 定义 request
- 定义 params
- 定义 query
- 定义 response

不要：

只写 runtime validation 但 OpenAPI 缺失。

建议建立：

src/schemas/project.ts
src/schemas/milestone.ts
src/schemas/task.ts
src/schemas/resource.ts

或者遵循当前仓库已有组织方式。

Enum 也使用 Zod 固定定义。

==================================================
十六、统一 API Response
==================================================

继续使用现有项目响应规范。

如果当前项目采用：

{
  "success": true,
  "data": {}
}

则保持。

错误：

{
  "success": false,
  "error": {
    "code": "...",
    "message": "..."
  }
}

不要自行建立另一套 response format。

==================================================
十七、Error Codes
==================================================

至少提供明确错误：

PROJECT_NOT_FOUND

MILESTONE_NOT_FOUND

TASK_NOT_FOUND

RESOURCE_NOT_FOUND

INVALID_PROJECT_KIND

INVALID_PROJECT_STATUS

INVALID_MILESTONE_STATUS

INVALID_TASK_STATUS

INVALID_RESOURCE_KIND

INVALID_RESOURCE_ROLE

INVALID_RESOURCE_SCOPE

INVALID_RESOURCE_LOCATION

SLUG_ALREADY_EXISTS

VALIDATION_ERROR

如果当前仓库已有统一错误机制，则融入现有机制。

==================================================
十八、Tenant Isolation
==================================================

这是本阶段强制验收项。

所有操作必须以：

authenticated user

为第一层过滤条件。

例如：

不要：

SELECT * FROM projects WHERE id = ?

而应该逻辑上：

SELECT *
FROM projects
WHERE id = ?
AND user_id = authenticatedUser.id

同理：

Milestone
Task
Resource

全部必须 user scoped。

跨用户访问：

404

不要返回：

403 + "belongs to another user"

避免泄漏资源存在。

==================================================
十九、Relationship Validation
==================================================

必须验证：

Milestone → Project

Task → Project

Task → Milestone → same Project

Resource → Project

Resource → Milestone → same Project

Resource → Task → same Project

不能只依靠客户端传来的 ID。

数据库外键和 Application Validation 都要合理配合。

==================================================
二十、测试
==================================================

使用仓库当前已经采用的测试方式。

至少覆盖：

==================================================
Project
==================================================

- 创建 Project
- slug unique per user
- 两个不同 user 可以使用同一个 slug
- list 默认不显示 archived
- archive
- unarchive
- patch
- cross-user GET 返回 404

==================================================
Milestone
==================================================

- 创建
- position 自动 +100
- list position 排序
- 多个 active Milestone 合法
- patch status
- cross-user / cross-project 返回 404

==================================================
Task
==================================================

- Project-level Task 创建
- Milestone Task 创建
- 非本 Project Milestone 被拒绝
- position 自动生成
- todo → completed 设置 completed_at
- completed → doing 清空 completed_at
- 修改已 completed Task title 不改变 completed_at
- cross-user 返回 404

==================================================
Resource
==================================================

- Project Resource
- Milestone Resource
- Task Resource

- milestone_id + task_id 同时存在 → 422

- file 没有 repository/path → 422
- directory 没有 repository/path → 422
- repository 没 repository → 422
- url 没 url → 422

- Milestone 不属于 Project → 404
- Task 不属于 Project → 404

- DELETE Resource 只删除 metadata

==================================================
Auth
==================================================

至少一个测试验证：

未认证请求无法访问 Project Core API。

==================================================
二十一、Migration
==================================================

生成新的 Drizzle migration。

不要修改已经部署过的旧 Migration 文件。

Migration 应新增：

projects
milestones
tasks
resources

以及相应 indexes / foreign keys。

确保：

本地 D1 migration 可以执行。

==================================================
二十二、代码组织
==================================================

不要突然引入：

Service Layer
Repository Layer
DI Container
Event Bus

除非仓库当前已经存在这种架构。

保持当前阶段简单。

建议：

src/routes/projects.ts
src/routes/milestones.ts
src/routes/tasks.ts
src/routes/resources.ts

src/schemas/...

src/db/schema.ts

如果单个文件过大，可以自然拆分，
但不要为了“架构漂亮”创建大量无用 abstraction。

==================================================
二十三、暂时不要实现 Git 文件操作
==================================================

Resource 当前只是 metadata。

不要实现：

GitHub Contents API
GitLab API
git commit
git push
Markdown read
Markdown write

这些属于 Resource Integration 的下一步。

本阶段只要能够正确保存：

repository
path
url

即可。

==================================================
二十四、本阶段最终验证
==================================================

完成后实际运行：

1. pnpm install（如需要）
2. migration generate
3. local D1 migration
4. typecheck
5. lint（如果项目已有）
6. test
7. wrangler dev / 项目现有 dev command
8. 实际调用至少一组 API

建议实际验证：

创建：

Project: Iris

然后：

Milestone:
v0.1

然后：

Task:
Implement Project Core

然后：

Resource:
Iris v0.1 PRD
kind = file
role = spec

确保整条关系真实工作。

==================================================
二十五、完成后输出
==================================================

完成后不要继续进入下一阶段。

只给我：

1. 实现了哪些功能
2. 新增了哪些表
3. Migration 文件
4. 新增 Route 清单
5. 测试结果
6. OpenAPI 是否正常
7. 本地 D1 是否正常
8. 是否存在仍需人工处理的问题
9. 如果有设计上和本 Prompt 不一致的地方，说明原因

然后停止。

==================================================
二十六、Scope Lock
==================================================

本阶段只实现：

Project
Milestone
Task
Resource

Database
+
Routes
+
Validation
+
OpenAPI
+
Tests

不要自行继续实现：

Decision
Reminder
Finance
Asset
Weather
Rules
Daily Context
Git integration
Knowledge Base
Skill
Evolution

Project Core 完成后停止，等待下一步指令。
````

新增需求 R2（用户请求“新增了一些需求，和之前的需求合并，你先看有没有冲突”；逐字保留）：

````text
1. 阶段名称改成
# Project Core + Capability Registry

本阶段一次实现：

Project
Milestone
Task
Resource
Capability
2. 在 Resource 后追加这一整节
==================================================
九、Capability 数据模型
==================================================

创建：

capabilities

字段：

id
user_id
project_id

name
description

type
resource_id

enabled

created_at
updated_at

--------------------------------
Capability 概念
--------------------------------

Capability 表示：

Iris 可以调用的一项可执行能力。

区别：

Resource
= 某个真实东西在哪里

Capability
= Iris 可以利用这个 Resource 做什么

例如：

Resource:
scripts/check-provider.ts

Capability:
Check Provider Health

或者：

Resource:
skills/project-secretary/

Capability:
Project Secretary

--------------------------------
Capability type
--------------------------------

v0.1 只允许：

script
skill

不要提前增加：

http
workflow
tool

--------------------------------
resource_id
--------------------------------

resource_id:

NOT NULL

因为 Iris 当前架构已经确定：

所有 Script / Skill 都必须存在 One Git Repository 中，
并首先注册为 Resource。

Capability 不能脱离 Resource 独立存在。

--------------------------------
type 与 Resource kind 的关系
--------------------------------

如果：

type = script

则：

resource.kind 必须为：

file

如果：

type = skill

则：

resource.kind 必须为：

directory

否则：

422 VALIDATION_ERROR

--------------------------------
Project 关系
--------------------------------

Capability 必须属于 Project。

project_id:

NOT NULL

Capability Resource 必须满足：

resource.user_id == authenticated user

resource.project_id == capability.project_id

禁止 Capability 引用其他 Project 的 Resource。

--------------------------------
enabled
--------------------------------

Boolean。

默认：

true

含义：

true
= Capability 可以被 Iris 调用

false
= Capability 已注册，但当前禁用

注意：

本阶段只是 Capability Registry。

不要真正执行 Capability。

--------------------------------
Capability 当前不包含
--------------------------------

不要加入：

runtime
entrypoint
input_schema
output_schema
timeout
permissions
container
environment
dependencies
execution_policy

这些属于以后 Capability Runtime / Cloud Agent 集成阶段。
3. 索引部分增加
--------------------------------
capabilities
--------------------------------

INDEX:
(user_id, project_id)

INDEX:
(user_id, project_id, enabled)

INDEX:
(user_id, type)

INDEX:
(user_id, resource_id)

我不会现在做：

UNIQUE(resource_id)

因为同一个 Resource 理论上可能暴露多个 Capability。

比如一个 Skill directory 以后完全可能提供：

Research
Summarize
Generate Report

所以不要把它锁成 1:1。

4. 数据库关系增加
projects
→ capabilities

resources
→ capabilities

逻辑关系：

Project 1:N Capability

Resource 1:N Capability

虽然第一阶段大多数情况可能是：

1 Resource
→ 1 Capability

但数据库不强制。

5. 增加 Capability Routes
==================================================
Capability Routes
==================================================

所有 Route：

/api/v1/projects/:projectId/capabilities

全部需要 Auth。

--------------------------------
GET /api/v1/projects/:projectId/capabilities
--------------------------------

返回当前 Project 的 Capabilities。

支持 query：

type
enabled

默认：

只按 created_at ASC 或当前项目统一排序规范返回。

确认 Project 属于 authenticated user。

--------------------------------
POST /api/v1/projects/:projectId/capabilities
--------------------------------

Body：

name
description?
type
resource_id
enabled?

禁止：

id
user_id
project_id
created_at
updated_at

project_id 来自 URL。

默认：

enabled = true

必须验证：

Resource 存在
Resource 属于 authenticated user
Resource.project_id == URL projectId

并验证：

type = script
→ resource.kind = file

type = skill
→ resource.kind = directory

创建成功：

201

--------------------------------
GET /api/v1/projects/:projectId/capabilities/:capabilityId
--------------------------------

必须确保：

capability.user_id = authenticated user

capability.project_id = URL projectId

否则：

404

--------------------------------
PATCH /api/v1/projects/:projectId/capabilities/:capabilityId
--------------------------------

允许修改：

name
description
type
resource_id
enabled

如果：

type
或者
resource_id

发生变化：

必须重新进行完整验证：

Resource ownership
Project relationship
type → resource.kind

更新：

updated_at = now

--------------------------------
POST /api/v1/projects/:projectId/capabilities/:capabilityId/enable
--------------------------------

设置：

enabled = true

保持 idempotent。

--------------------------------
POST /api/v1/projects/:projectId/capabilities/:capabilityId/disable
--------------------------------

设置：

enabled = false

保持 idempotent。

--------------------------------
DELETE
--------------------------------

v0.1 不提供：

DELETE /capabilities/:id

正常操作使用：

enabled = false

保留历史注册信息。
6. Zod / OpenAPI 增加
src/schemas/capability.ts

包括：

CapabilityType:

script
skill

以及：

CapabilityResponse
CreateCapabilityRequest
UpdateCapabilityRequest
CapabilityParams
CapabilityQuery

所有 Capability Routes 全部进入 OpenAPI。

7. Error Codes 增加
CAPABILITY_NOT_FOUND

INVALID_CAPABILITY_TYPE

CAPABILITY_RESOURCE_REQUIRED

CAPABILITY_RESOURCE_PROJECT_MISMATCH

INVALID_CAPABILITY_RESOURCE_KIND

其中：

script + directory

或者：

skill + file

应该返回：

INVALID_CAPABILITY_RESOURCE_KIND
8. Tenant Isolation 增加 Capability

把原来的：

Project
Milestone
Task
Resource

全部 user scoped，扩展为：

Project
Milestone
Task
Resource
Capability

例如逻辑查询必须是：

WHERE capability.id = ?
AND capability.user_id = authenticatedUser.id
AND capability.project_id = ?

跨用户仍然：

404
9. Relationship Validation 增加

最终这一轮必须验证：

Milestone → Project

Task → Project

Task → Milestone → same Project

Resource → Project

Resource → Milestone → same Project

Resource → Task → same Project

Capability → Project

Capability → Resource → same Project

Capability type=script
→ Resource kind=file

Capability type=skill
→ Resource kind=directory

这张关系实际上就是这轮最核心的验收标准。

10. 测试增加 Capability
==================================================
Capability
==================================================

- 创建 script Capability

- 创建 skill Capability

- script + file Resource 成功

- skill + directory Resource 成功

- script + directory Resource → 422

- skill + file Resource → 422

- Capability 引用其他 Project Resource → 404 / validation failure

- Capability 引用其他 User Resource → 404

- enabled 默认 true

- disable Capability

- enable Capability

- PATCH name/description

- PATCH resource_id 后重新验证关系

- PATCH type 后重新验证 Resource kind

- list by type

- list by enabled

- cross-user GET 返回 404
11. Migration 改成一次新增五张业务表

原来：

projects
milestones
tasks
resources

现在变成：

projects
milestones
tasks
resources
capabilities

如果这一轮 migration 还没生成/执行，直接一次生成最好。

如果 Codex 已经生成了前四张表的 migration，也不要为了追求“一张 migration”去修改已经执行过的 migration。

直接再新增：

capabilities migration

即可。

12. 最终实际验证场景也一起升级

原来：

Project:
Iris

Milestone:
v0.1

Task:
Implement Project Core

Resource:
Iris v0.1 PRD

现在再加：

Resource:
Project Secretary Skill

kind:
directory

role:
artifact

repository:
OPC_OS

path:
skills/project-secretary/

然后：

Capability:

name:
Project Secretary

type:
skill

resource_id:
<Project Secretary Skill Resource>

enabled:
true

再建立一个：

Resource:
Check Provider Script

kind:
file

path:
scripts/check-provider.ts

以及：

Capability:

name:
Check Provider Health

type:
script

这样整个链条都验证到了。

13. Scope Lock 最后改成
==================================================
Scope Lock
==================================================

本阶段只实现：

Project
Milestone
Task
Resource
Capability Registry

包括：

Database
Routes
Validation
OpenAPI
Tests

不要实现：

Capability Execution
Cloud Agent
Skill Runtime
Script Runtime
GitHub API
Git checkout
Git commit
Git push

Decision
Reminder
Finance
Asset
Weather
Rules
Daily Context

Knowledge Base
RAG
Embedding
Evolution

完成 Project Core + Capability Registry 后停止，
等待下一步指令。
````

最终答复 R3（用户当前请求“这是回答你的”；逐字保留，其十一条规则作为本次合并的明确指令）：

````text
这组对照我基本全部同意，而且里面有几项不是“优化”，而是**必须修正的数据完整性约束**。尤其是 `resource_id NOT NULL`、Resource 删除保护、`Resource.kind` 修改保护，这三条必须进入最终实现，否则 Capability Registry 会留下结构性漏洞。

我建议把最终合并规则正式定成下面这一版。

### 1. Capability → Resource 强制关联

既然我们已经确定：

```text
script / skill
必须存在 One Git Repository
```

那么：

```text
capabilities.resource_id
```

直接：

```text
NOT NULL
```

并同步修正文档里原先的 `Optional`。

关系固定为：

```text
Capability(type=script)
→ Resource(kind=file)

Capability(type=skill)
→ Resource(kind=directory)
```

Capability 只是注册能力，不直接保存 `path`、`repository`，这些全部从 Resource 获取。

---

### 2. Resource 一旦被 Capability 引用，就不能随便删除

这个判断是对的。

即使：

```text
Capability.enabled = false
```

它仍然是一条有效的历史注册关系。

所以：

```text
DELETE Resource
```

之前必须检查：

```sql
SELECT capability
WHERE resource_id = ?
```

只要存在任何引用：

```text
409 RESOURCE_IN_USE
```

数据库 FK 也应采用：

```text
ON DELETE RESTRICT
```

或者 SQLite/D1 对应的默认限制语义。

**绝对不要 CASCADE。**

否则删除一个 Resource 顺手把 Capability 删除，会破坏我们之前“Capability 默认不删除”的设计。

---

### 3. 修改 Resource.kind 也必须进行反向完整性检查

这点非常关键。

不能只在：

```text
POST/PATCH Capability
```

时验证：

```text
script → file
skill → directory
```

因为用户完全可能先创建：

```text
Resource kind=file
↓
Capability type=script
```

之后再：

```text
PATCH Resource
kind=directory
```

这会瞬间制造非法状态。

所以 Resource PATCH 如果修改 `kind`：

```text
查询所有引用该 Resource 的 Capability
```

然后验证：

```text
所有 script
要求新 kind = file

所有 skill
要求新 kind = directory
```

如果任何一个不兼容：

```text
422 INVALID_CAPABILITY_RESOURCE_KIND
```

拒绝 Resource 修改。

这意味着 **relationship invariant 必须双向维护**，而不是只在 Capability 一侧维护。

---

### 4. 错误码统一

同意统一成：

```text
422 INVALID_CAPABILITY_RESOURCE_KIND
```

不要同一个场景有时候：

```text
VALIDATION_ERROR
```

有时候：

```text
INVALID_CAPABILITY_RESOURCE_KIND
```

业务规则已经明确，就用具体错误码。

同理：

```text
Resource 正被 Capability 使用
→ 409 RESOURCE_IN_USE
```

---

### 5. 跨 Project / 跨 User 引用统一伪装成不存在

也同意。

比如你在 Project A 创建 Capability，然后提交：

```text
resource_id = Project B 的 Resource
```

不要暴露：

> Resource 存在，但是属于另一个 Project。

统一：

```text
404 RESOURCE_NOT_FOUND
```

跨用户更是一样：

```text
404 RESOURCE_NOT_FOUND
```

这里不需要：

```text
CAPABILITY_RESOURCE_PROJECT_MISMATCH
```

这个错误码可以从外部 API 里删除。

内部日志如果想区分原因可以区分，但 API 不泄漏。

---

### 6. 400 和 422 的边界这样定

这个需要保持和现有仓库兼容。

我会固定：

```text
400 BAD_REQUEST
```

用于**请求本身不合法**：

```text
JSON malformed
缺 required field
enum 不合法
string 类型错误
query/params schema 错误
```

也就是普通 Zod / OpenAPI schema validation。

而：

```text
422
```

用于：

> 请求格式完全合法，但违反 Iris 的业务不变量。

例如：

```text
milestone_id + task_id 同时存在
→ 422 INVALID_RESOURCE_SCOPE

file Resource 缺 repository/path
→ 422 INVALID_RESOURCE_LOCATION

script Capability 指向 directory
→ 422 INVALID_CAPABILITY_RESOURCE_KIND
```

这样比把所有 validation 都变成 422 更清晰，而且不会破坏当前 `/src/app.ts` 的统一 400 行为。

---

### 7. Migration 不要让 Codex 盲目 `drizzle-kit generate`

这个风险判断也是对的。

既然现在：

```text
已有数据库 / SQL
但 Drizzle historical meta 不完整
```

那就不能一句：

```bash
drizzle-kit generate
```

然后祈祷它不会重新生成 users/api_tokens。

我建议这轮直接确定：

> **Schema 一次完成五张表，Migration 在最后集中生成/编写一次。**

开发任务仍然可以拆成：

```text
Task 1 Project
Task 2 Milestone
Task 3 Task
Task 4 Resource
Task 5 Capability Registry
```

但是不要每完成一个 Task 就生成一次 migration。

最终：

```text
Drizzle schema
五个实体全部完成
        ↓
检查现有 migrations
        ↓
创建一个只包含新增五张业务表的增量 migration
        ↓
本地 D1 实际执行验证
```

如果 Drizzle Meta 无法可靠地产生正确 diff：

> **允许手工编写这次 incremental SQL migration。**

这比让生成器误判 baseline 安全得多。

并且明确：

```text
绝不修改已经存在/执行过的旧 SQL migration
```

等这轮结束后，再考虑把 Drizzle migration metadata baseline 修复好，让之后恢复正常 `generate` 工作流。

---

### 8. One Git Repository 暂时只是逻辑约定

也完全同意不要现在加数据库白名单。

Resource：

```text
repository
path
```

只是 metadata。

第一阶段：

```text
repository = OPC_OS
```

Iris 保存这个名字，但不会：

```text
检查 GitHub repo 是否真实存在
检查是不是唯一指定 Repo
自动 checkout
访问 GitHub
```

“One Repo”是当前部署架构约束，不需要在 Project Core 阶段设计成复杂数据库约束。

等 Git Integration 真开始时，再定义：

```text
repository alias
→ provider
→ owner/repo
→ credentials
```

现在不要提前做。

---

### 9. Skill 的 Scope Lock 文案确实要改

之前：

```text
不要实现 Skill
```

已经与 Capability 冲突。

应该改成：

```text
允许：
- 注册 type=skill 的 Capability metadata
- Resource 指向 Skill directory

禁止：
- Skill discovery
- Skill install
- Skill parsing/runtime
- Skill execution
- Skill update
- Skill generation
- Skill Factory
```

这样不会产生歧义。

---

### 10. Capability 作为第五个实现 Task

我也赞成。

依赖关系应该明确：

```text
Project
   ↓
Milestone
   ↓
Task
   ↓
Resource
   ↓
Capability
```

严格来说 Resource 不完全依赖 Task，但从实现顺序看这样最舒服。

Capability Task 必须包含两个额外验收：

```text
Resource deletion protection
Resource kind mutation protection
```

因为 Capability 加入以后，这已经不再只是 Capability 自己的代码。

---

### 11. 示例补全 repository

正确例子应该是：

```text
Resource:
name = Check Provider Script
kind = file
role = artifact
repository = OPC_OS
path = scripts/check-provider.ts
```

然后：

```text
Capability:
name = Check Provider Health
type = script
resource_id = <resource id>
enabled = true
```

Skill：

```text
Resource:
name = Project Secretary Skill
kind = directory
role = artifact
repository = OPC_OS
path = skills/project-secretary/
```

对应：

```text
Capability:
name = Project Secretary
type = skill
resource_id = <resource id>
enabled = true
```

---

我觉得这次 review 非常有价值，因为它实际上补上了一个我们之前遗漏的原则：

> **Capability 不仅要求自己创建时合法，还会反过来对它依赖的 Resource 施加完整性约束。**

所以最终关系不是简单的：

```text
Capability → Resource
```

而是：

```text
Capability
    ↓ references
Resource

Resource DELETE
    ↑ must respect Capability

Resource kind PATCH
    ↑ must respect Capability
```

数据库层负责 FK 基本完整性，Application 层负责 `skill/script ↔ directory/file` 这种语义完整性。

如果你现在让 Codex 合并，我会采用 **5 个实现 Task + 最后统一一个增量 Migration + 一次完整端到端验收**。这是目前最稳妥的交付方式。
````

## Development Plan

### Requirement Understanding

交付 Iris v0.1 Phase 2：Project Core + Capability Registry。将原 Project/Milestone/Task/Resource 提示词、Capability 增补和用户最终十一条答复合并，保存五个实现任务，不在本次保存过程中修改实现或运行迁移。

优先级：最终十一条答复 > Capability 增补 > 原始本阶段提示词；明确修订之外沿用现有合理基础约定。仓库 docs/01、docs/02 和 docs/03 提供领域定义；docs/03 的可空 resource_id 被用户显式修订为必填。docs/00 的远期路线不增加本轮范围。完整原文保留在 Approval Summary 内以供追溯，执行时按本节优先级解释，不得从历史原文重新引入已被覆盖要求。

五个任务按用户指定 Project → Milestone → Task → Resource → Capability 顺序。TASK-001 包含五表共享 Schema 基础，TASK-005 汇总 SQL migration、反向保护及所有数据库集成验收。前四个任务仅对其静态实现/测试定义检查建立证据；所有真实数据库/API 行为成功是 AC-07 至 AC-11 的最终交付门槛。不得把编写了测试当作通过了测试。

### Evidence Summary

- Workspace: /Volumes/Development/Workspace/Iris-assisant
- Source-Branch: Unavailable
- Source-Commit: Unavailable
- Source-Worktree-State: Unavailable
- Source-Worktree-Changes: [Unavailable]
- 原因：git status 报告当前目录及其父目录不是 Git 仓库。不能声称 clean；改用实际计算的逐文件 SHA-256 及目录路径清单作为内容基线。恢复时任何缺失基线或无法解释的变化均不能视为无漂移。
- Fact：项目已有 Workers + OpenAPIHono + Drizzle/D1，users/api_tokens，Bearer middleware，/health、/api/v1/test、/openapi.json；API 错误 helper 与通用 400 行为已存在。当前 Bearer scheme 大小写不敏感、Token 本体大小写敏感，401 有 WWW-Authenticate。
- Fact：src/db/schema.ts 尚无五张业务表；src/routes 只有 health.ts/test.ts；src/schemas 及五个业务路由文件尚未创建；drizzle 仅 0000_init.sql 和 0001_users_contract.sql，无 meta journal。新路径是批准新增，不是假定已有目标。
- Fact：drizzle.config.ts 明确不暴露 generate 命令以避免重复初始建表。允许手写一次增量 migration 的最新答复解决此冲突；无需修复历史 meta。
- Fact：tests/apply-migrations.ts 使用 applyD1Migrations，vitest.config.ts 读取 drizzle/*.sql。tests/schema.test.ts 当前断言仅有两张业务表；tests/routes.test.ts 断言固定四个错误码。新增业务表/错误码必须适配这些断言，但保留既有业务与安全回归。
- Fact：package.json 提供 dev、typecheck、test、db:migrate:local、auth:create-dev；没有 lint 脚本。pnpm/Workers 测试依赖已经存在。本次未运行测试，不声称 Bootstrap 当前测试全绿。
- Fact：docs/03 resource_id nullable/Optional/if present 与最新答复冲突，已由用户明确解决为必填；其 Cloud Agent 架构描述不授权本轮 Runtime。
- Inference：既有注册函数和 errorResponse 模式足以实现本轮，预计不需要新依赖或分层框架。若执行发现不成立须停止重新评估。
- Assumption：仅本地 D1 实测，不依赖真实远程 database_id 或 Git provider 凭据。源码内容与测试配置的基线在保存前再次比较。
- 本会话早先读取后，已有 Bootstrap auth/error 测试和 docs/03 出现外部更新；本计划依据下面最新内容重新读取建立，不引用早先快照作为当前代码事实，也不归因这些改动为本任务输出。

Evidence Baselines（SHA-256，实际哈希命令生成；路径相对 Workspace，含只读依赖和保护区；本表覆盖下列目录全部常规文件：src、tests、drizzle、docs、scripts，以及列出的根配置/lockfiles）：

| Path | SHA-256 |
|---|---|
| docs/00_Iris PRD.md | `9781f92e3e3737867ddb834c0b9bdfb67249b16b10c236c2ce8a1c96d9e00d45` |
| docs/01_Iris_Project_System_Definition_v0.1.md | `2637ca984994b340696e815eb2ec9424ef80e0f933c54dcc07c5176465a67a71` |
| docs/02_Iris_Resource_System_Definition_v0.1.md | `2002096eea1d34fac3c4ec35ec5a7c95bb5a1a7e404802bd88312e530f3b2d78` |
| docs/03_Iris_Project_Task_Resource_Capability_Definition_v0.1.md | `3bb43aab93f35c310111b8db61a804d62192da76f7340eb02343d64f22232363` |
| drizzle.config.ts | `1c4e5ddd60239dd453fa8332af02b02e504b92bfc8ac529170b9376cf99b4f63` |
| drizzle/0000_init.sql | `c777f2fa431f927a8bc6ad6ad974709d4872466248a79363928139556b936a21` |
| drizzle/0001_users_contract.sql | `74fa9b2225ec7d8686812e5aff2efcb0aaead1206543f024ace8fad14ef7619d` |
| package.json | `e814e9119150328765e4a332300116493e23396613cb1215601895ecdc39bef5` |
| pnpm-lock.yaml | `9e50d329e9d35b00554cff2f1c19adf3136d86a5ca53ac6041a1988eaf0131c6` |
| pnpm-workspace.yaml | `3a16576817d50593a4abe73ca1dfc2e6ef79d8a4843f98639f7fc97cfb5ed32a` |
| scripts/create-dev-auth.ts | `a25b65a3792e7513b2228feed6de999812d2fe3f436b1d89bf4ef9e2a4869a4d` |
| src/app.ts | `b9aaaf2842a9de40b8498bbffd5cd9e9327e63b8ecb8166d1251184e83620a6f` |
| src/db/index.ts | `1a56f968ba8fa79955074195c8b0496fe23b49199aff3a5d398bbd9b35ed6423` |
| src/db/schema.ts | `5950a4bf02595d7c64a96f8185fbf25362504615750a58b7c9678ad6fe981b3d` |
| src/index.ts | `055b4e7aa29b7aa901b0caa7e6fd1c31c40fda20c9f4e0e1ea4dcdbe9441deb4` |
| src/lib/response.ts | `434f945377cc3954d6cd4d9f984072c0ffdaf797f2e4a3c4e561af684810fd2b` |
| src/lib/time.ts | `5fe30b8f4c3c43384e431a2a2ea557fa79e3b7dc91f0c5ebe6677e5450b99ad3` |
| src/lib/token.ts | `d44adbe62dfabbca31473a5a3a83f28825c060d3bb1033e9cda1bb1672af053a` |
| src/middleware/auth.ts | `d127b4f0d1f667b1202adf921e28fbf1dd5463ecfca0a7c5e92c8384ba8331f8` |
| src/routes/health.ts | `5d4bfcf015a2c8c4fae463e2003a4775b1ad95b0076c273ccbb66bedbd02c8c5` |
| src/routes/test.ts | `b57d55fae56e852d78ff6d4b7f2b2306eed920970fc75dd37683dbf4c1041bff` |
| src/types/env.ts | `1bde582834ae7d4bedbc65a1598953b7208c1e48221ae48cc05147f28f67ef80` |
| tests/apply-migrations.ts | `2d684b4b07cf9a77ea0ff3fc30b829320d8c2bc07709c89e3f1cd6aa6a8a65f5` |
| tests/auth.test.ts | `e482f3f617b53ab2f68ed069d1fe45bd90b226cacbb38bdbb0f7662ada90211d` |
| tests/env.d.ts | `621065a695a31123bd0c5c9b1d7294973388fb0b5680afcfde11a26acd994326` |
| tests/helpers.ts | `82302802e0768964f22be49be95620f1d5e1ebd2877907310431a373499cdb64` |
| tests/routes.test.ts | `f0579510be40e59f1fea38fcbc88164d21d5378afbbdaf4dd2a66573e5d0ee72` |
| tests/schema.test.ts | `de6628c5f25fdff3d9c52d03496882ac1c35afac413259d0f82d2a3409c0cb03` |
| tsconfig.json | `74bf13e9ca86dfb3974074201336feb943941ec4901618156cce62e3e6785b03` |
| tsconfig.scripts.json | `709bddc1a94d00f921629fbe7e48c39583a4515d0240183891bc5a19fd205ebb` |
| vitest.config.ts | `e33c6070bd4fbc6ccac97a1a8ac8e6130323cc5e99b3e96db96ca719278ccd42` |
| wrangler.jsonc | `44f77d89313f967251d2342c1a4bb8f36ea77e546177e586343bff6639a4feb6` |

Requirements Sources（完整文本也嵌入 Approval Summary，外部附件失效时可回溯）：

| ID | Source | SHA-256 |
|---|---|---|
| R1 | /Users/walter/.codex/attachments/d302befb-409a-4be2-8eeb-70e590e2aafc/pasted-text.txt | `d3100fb8912d598e826ded428f10f75f474fc42a61ade425ac5047b336ff1420` |
| R2 | /Users/walter/.codex/attachments/f687a732-8dd1-44e4-ab6c-844ac8a1fba9/pasted-text.txt | `bbb635a3ddaded16392a00c14e5dbfc352490ea47b2fc1eff4961128a1d0ed9d` |
| R3 | /Users/walter/.codex/attachments/4a5c2cbf-f440-4db0-93c5-b1f6484c0551/pasted-text.txt | `ef3f34bc2335898cfdcb513209735d597659816bc6b206dacbee580ea89f876c` |

有关新增/删除的漂移检查：恢复时重新枚举上述目录，对照表中路径集合和内容摘要，同时检查五个计划新增路由/Schema/测试及 drizzle 新 SQL 是否已存在。保存的文档及合法 progress sidecar 本身不是实现漂移。部分参考文档仅相关章节用于决策（docs/00）；哈希整个文件不意味着执行其全部内容。

### Risk Gate Result

- Final Level: XL
- Dimensions: impact 为新增持久化业务与 API 合约；blast radius 涉及五表、共享路由注册、错误 schema 和测试；reversibility 为代码可撤销但 migration 后新增数据不能随意删除；uncertainty 为无 Git 元数据但有已计算内容基线，历史 meta 缺失以手写增量方案解决；sensitivity 为私人数据、跨租户访问及引用完整性；coordination 为一次集中五表迁移和最终本地联合验收。
- S Reverse Check: S-01 FAIL（多个实体和共享入口）；S-02 FAIL（行为与持久化）；S-03 FAIL（API/schema/migration）；S-04 FAIL（跨模块验收）；S-05 FAIL（迁移非简单静态回退）；S-06 FAIL（安全、关系和契约）。
- Mandatory Signals: ESC-01 HIT（app/error/schema 共享）；ESC-02 HIT（用户隔离）；ESC-03 HIT（五表与迁移）；ESC-04 HIT（复用认证进行授权）；ESC-05 CLEAR（无指标）；ESC-06 HIT（archive/enable 幂等，无后台工作）；ESC-07 HIT（隐私与存在性泄露）；ESC-08 CLEAR（无需生产或环境配置变更）；ESC-09 HIT（API/OpenAPI 对外合约，无新增第三方调用）；ESC-10 HIT（新 Registry 模块及五表迁移）；ESC-11 HIT（Git traceability 不可用，已以完整内容摘要限制漂移风险）；ESC-12 CLEAR（已识别冲突由用户最终答复解决）。
- Reverse Check: Not Applicable（XL；不尝试降级到 M）。
- Rationale: 持久化 migration 与 Capability 新模块构成 XL。本阶段是一轮受控交付，五个 Task 是阶段内部实施拆分，不授权后续 Runtime/Git 阶段。

### Scope Lock

```yaml
Scope-Lock-Version: cdf-scope/v1
in_scope:
  - "实现 Project 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。"
  - "实现 Milestone 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。"
  - "实现 Task 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。"
  - "实现 Resource metadata 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。"
  - "实现 Capability Registry、Resource 双向引用保护、定义文档修正，并集中完成五表增量迁移和完整本地端到端验收。"
out_of_scope:
  - "不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。"
  - "不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。"
  - "不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。"
  - "不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。"
non_goals:
  - "不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。"
  - "不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。"
assumptions:
  - "本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。"
  - "One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。"
  - "五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。"
stop_conditions:
  - "恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。"
  - "如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。"
  - "若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。"
  - "本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。"
will_change:
  - "src/db/schema.ts 中新增五张业务表、对应类型、索引和外键；不改变 users/api_tokens 契约。"
  - "src/routes/projects.ts、src/schemas/project.ts 及对应 Project 测试。"
  - "src/routes/milestones.ts、src/schemas/milestone.ts 及对应 Milestone 测试。"
  - "src/routes/tasks.ts、src/schemas/task.ts 及对应 Task 测试。"
  - "src/routes/resources.ts、src/schemas/resource.ts 及对应 Resource 测试。"
  - "src/routes/capabilities.ts、src/schemas/capability.ts、Resource 引用保护及对应 Capability/集成测试。"
  - "src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。"
  - "drizzle/ 下一个仅新增五张业务表及其索引/外键的 SQL migration；docs/03_Iris_Project_Task_Resource_Capability_Definition_v0.1.md 中 resource_id 必填及相关一致性文案。"
will_not_change:
  - "保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。"
  - "不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。"
  - "保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。"
  - "不创建执行进度 sidecar、不运行实现、不创建后台任务或调度；此次授权仅保存任务定义。"
acceptance_criteria:
  - "AC-01：五张业务表的 Drizzle Schema、固定枚举、空值/默认值、必要索引和外键与合并规格一致，ID 使用 UUID v4，时间落库为 UTC epoch milliseconds，Capability.resource_id 必填且不唯一，引用 Resource 的外键禁止 CASCADE。"
  - "AC-02：Project 的六个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖同用户 slug 唯一、跨用户同 slug、状态与 kind、列表过滤、归档/取消归档幂等及租户隔离；不增加重复状态或 hard delete。"
  - "AC-03：Milestone 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project 归属、position 默认从 100 按项目递增 100、position 排序、多 active 合法及跨用户/跨项目 404。"
  - "AC-04：Task 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project-level/Milestone Task、同项目关系、分组 position、completed_at 创建与状态转换规则及跨用户/跨项目隔离。"
  - "AC-05：Resource 的五个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖三种互斥归属、kind/location、过滤及 PATCH 合并后完整验证；删除仅影响 DB metadata。"
  - "AC-06：Capability 的六个规定路由及完整 Zod/OpenAPI 和测试用例齐备，resource_id 必填、同用户同 Project、script 对应 file、skill 对应 directory、enabled 默认 true、enable/disable 幂等，允许多个 Capability 引用同一 Resource。"
  - "AC-07：真实 D1 测试证明所有 Capability 引用（含 disabled）均阻止 Resource 删除并返回 409 RESOURCE_IN_USE，Resource.kind 不兼容修改返回 422 INVALID_CAPABILITY_RESOURCE_KIND 且记录不变，数据库 FK 同时禁止删除被引用 Resource。"
  - "AC-08：全部业务 API 使用认证用户隔离并校验 URL Project 归属；格式/类型/required/enum/query/params 错误返回 400 BAD_REQUEST，业务不变量使用规定 422，跨 Project/User Resource 引用统一 404 RESOURCE_NOT_FOUND，外部 API 不暴露 CAPABILITY_RESOURCE_PROJECT_MISMATCH。"
  - "AC-09：最后集中新增一个只创建五张业务表及必要索引/外键的增量 SQL migration，本地 D1 实际执行成功且 Drizzle Schema 与 SQL 一致，原有两份 migration 及 users/api_tokens 契约和数据保持不变。"
  - "AC-10：pnpm typecheck、现有 Workers/D1 测试及新增五模块的全部规定测试通过，已有 Auth/Test Route/health/错误处理回归通过，新增路由在 /openapi.json 中具有 request/params/query/response 和 bearerAuth 声明；若已有 lint 则运行，没有则明确不适用。"
  - "AC-11：通过本地 dev server 实际创建 Iris Project、v0.1 Milestone、Implement Project Core Task、PRD file Resource、OPC_OS 下的 Skill directory 和 Script file Resources 及对应两种 Capability，读取/过滤/启停与引用保护响应符合规格；不访问或修改真实 Git 内容。"
  - "AC-12：定义文档所有 Capability.resource_id 可选表述同步为必填并表达对应完整性约束，最终报告功能、表、migration、路由、实际测试/OpenAPI/本地 D1 结果、未验证或人工事项及与旧提示词的差异，然后停止。"
```

### Technical Approach

沿用 createApp/register…Route、OpenAPIHono、createDb、c.get("user")、errorResponse、nowEpochMs/toIso8601Utc。新增 src/schemas 下各实体 schema 和现有 src/routes 下注册函数，不增加服务层。DB 列名沿用 snake_case、Drizzle TS 属性沿用 camelCase；新请求字段按提示词 snake_case，现有 Auth/Test 响应不改；业务时间输出 ISO 8601 UTC，nullable 时间保留 null。成功响应沿用 {success:true,data:...}，错误沿用 {success:false,error:{code,message}}。Resource 成功删除返回 204。

共用规则：UUID v4 crypto.randomUUID；所有 id/user_id/required 父键、name 或 title、枚举、created_at/updated_at 非空；description 可空。身份由服务端赋值；拒绝客户端以 body 写 id/user_id/project_id/created_at/updated_at 等只读字段，Project slug 创建必填。不在普通 Zod 中把 business refinements 混成默认 400；先完成结构校验，再执行 422 业务检查。PATCH 合并现有记录与允许字段后验证，不能只验证稀疏 body。

数据模型（除明确 nullable 外按原提示词必填）：

| Table | Columns / defaults / rules |
|---|---|
| projects | id,user_id,name,slug,description nullable,kind default other,status default planned,created_at,updated_at,archived_at nullable；kind=product/operation/automation/personal/content/other；status=planned/active/paused/completed；slug 为 lowercase [a-z0-9-]，合法提交不自动改写；UNIQUE(user_id,slug) |
| milestones | id,user_id,project_id,name,description nullable,status default planned,position integer,created_at,updated_at；status=planned/active/completed/cancelled；多个 active 合法；无 deadline/due_at/target_at/completed_at |
| tasks | id,user_id,project_id,milestone_id nullable,title,description nullable,status default todo,position integer,created_at,updated_at,completed_at nullable；status=todo/doing/completed/cancelled |
| resources | id,user_id,project_id,milestone_id nullable,task_id nullable,name,kind,role,repository nullable,path nullable,url nullable,created_at,updated_at；kind=repository/directory/file/url；role=context/spec/artifact/reference |
| capabilities | id,user_id,project_id,name,description nullable,type,resource_id NOT NULL,enabled default true,created_at,updated_at；type=script/skill；enabled 使用 SQLite INTEGER boolean 映射，API boolean；不复制 repository/path，不设 UNIQUE(resource_id) |

Project 不存 current_focus/next_action/progress/current_milestone_id/last_completed_task，也不新增派生查询 API。Milestone completed 不自动完成 Project，Task completed 不自动完成 Milestone。位置客户端提供则验证 integer 并使用；缺省 Milestone 按 user+Project 求 max+100，Task 按 user+Project+Milestone 或 user+Project 且 milestone_id IS NULL 分组求 max+100，首项 100。position 非唯一，不扩展重排系统。Task 创建为 completed 时赋 completed_at；非 completed→completed 赋 now；completed→非 completed 清 null；保持 completed 时原值不变。正常更新写 updated_at；archive/unarchive、enable/disable 保持幂等。

Resource Scope 恰为 Project（两个子键 null）、Milestone（仅 milestone_id）、Task（仅 task_id），禁止两个子键同时非空。repository kind 必须 repository；directory/file 必须 repository+path；url 必须 url。引用的 Project/Milestone/Task 必须属于同一用户及 URL Project，不自动访问 location。

Capability 必须引用同用户同 Project 的 Resource，script→file、skill→directory；type/resource_id 改动按合并后的组合重新验证。任意 Capability（包括 disabled）引用存在即禁止 Resource DELETE；使用受用户/项目限制的引用查询及 FK RESTRICT/default restrictive semantics，不 CASCADE。Resource PATCH kind 必须对全部引用检查，任何不兼容即整次拒绝，不能留下部分写入。普通 Resource 名称、描述位置等更新仍按原 Resource 规则验证，不扩展执行政策。

索引严格覆盖批准清单：

| Table | Index columns |
|---|---|
| projects | UNIQUE(user_id,slug)；(user_id,status)；(user_id,archived_at) |
| milestones | (user_id,project_id)；(user_id,project_id,status)；(user_id,project_id,position) |
| tasks | (user_id,project_id)；(user_id,project_id,status)；(user_id,project_id,position)；(user_id,milestone_id,status)；(user_id,milestone_id,position)；(user_id,completed_at) |
| resources | (user_id,project_id)；(user_id,milestone_id)；(user_id,task_id) |
| capabilities | (user_id,project_id)；(user_id,project_id,enabled)；(user_id,type)；(user_id,resource_id) |

FK：各 user_id→users；milestones/tasks/resources/capabilities 的 project_id→projects；tasks.milestone_id→milestones；resources.milestone_id→milestones、task_id→tasks；capabilities.resource_id→resources。新业务生命周期不依赖物理级联；保留旧 api_tokens→users 已有 FK 行为。

所有下列路径以 /api/v1 开头，均先认证，所有业务查询（含 max/引用检查）明确 user-scoped，嵌套路由明确 project-scoped。不属于当前用户/URL Project 与不存在采用同样 404。

| Entity | Routes | Inputs / filters / ordering |
|---|---|---|
| Project | GET/POST /projects；GET/PATCH /projects/:projectId；POST /projects/:projectId/archive；POST /projects/:projectId/unarchive | create/patch: name,slug,description,kind,status；list: status,kind,include_archived；缺省排除 archived，include_archived=true 包含全部；created_at DESC；无 pagination |
| Milestone | GET/POST /projects/:projectId/milestones；GET/PATCH /projects/:projectId/milestones/:milestoneId | name,description,status,position；list status，position ASC |
| Task | GET/POST /projects/:projectId/tasks；GET/PATCH /projects/:projectId/tasks/:taskId | milestone_id,title,description,status,position；list status,milestone_id，过滤时验证 Milestone 归属，position ASC |
| Resource | GET/POST /projects/:projectId/resources；GET/PATCH/DELETE /projects/:projectId/resources/:resourceId | name,kind,role,milestone_id,task_id,repository,path,url；list kind,role,milestone_id,task_id，过滤关联须验证归属 |
| Capability | GET/POST /projects/:projectId/capabilities；GET/PATCH /projects/:projectId/capabilities/:capabilityId；POST /projects/:projectId/capabilities/:capabilityId/enable；POST /projects/:projectId/capabilities/:capabilityId/disable | name,description,type,resource_id,enabled；list type,enabled，created_at ASC |

所有创建成功 201；成功读取/修改按既有 JSON envelope；无 Project/Milestone/Task/Capability DELETE。查询 boolean 不能将字符串 "false" 按 JS truthy 解析成 true。完整登记 enums、request/body、params、query、response、安全声明和对应错误响应。

错误优先规则由用户最终答复确定：

| Situation | Response |
|---|---|
| JSON malformed，缺必填字段（含 resource_id），enum/type/query/params schema 非法 | 400 BAD_REQUEST；不再以旧提示词 INVALID_* enum 或 CAPABILITY_RESOURCE_REQUIRED 替代通用结构校验码 |
| 未认证 | 401 UNAUTHORIZED，保持既有 challenge |
| Project/Milestone/Task/Resource/Capability 不存在或在当前作用域不可访问 | 404 对应 *_NOT_FOUND；Capability 引用的 Resource 跨 Project/User 统一 RESOURCE_NOT_FOUND |
| milestone_id+task_id 同时非空 | 422 INVALID_RESOURCE_SCOPE |
| Resource 对应 kind 所需 repository/path/url 缺失 | 422 INVALID_RESOURCE_LOCATION（location 字段结构可选，业务条件单独校验） |
| Capability type 与 Resource.kind 不匹配，或 Resource.kind 反向修改破坏关系 | 422 INVALID_CAPABILITY_RESOURCE_KIND |
| Resource 被任一 Capability 引用 | 409 RESOURCE_IN_USE |
| 同用户 slug 冲突 | SLUG_ALREADY_EXISTS（按冲突响应处理，不泄露 SQL） |

通用 VALIDATION_ERROR 不覆盖上述具体业务码；外部不暴露 CAPABILITY_RESOURCE_PROJECT_MISMATCH。保持异常日志/响应不含 Token、SQL 或秘密。新增错误 enum 后只扩展对应测试预期，不删原断言覆盖。

Migration 在第五个任务集中创建 drizzle 下一个未占用顺序号 SQL，当前候选 0002_project_core_capability_registry.sql；五表 CREATE、所有规定索引和 FK，绝不包含重建 users/api_tokens 或重复初始表。当前无可靠 meta，优先允许的手工增量 SQL；不盲跑 drizzle-kit generate，不修复历史 metadata。文档修正范围仅 docs/03 中 Capability.resource_id 必填及其对应关系/删除语义，不重写远期架构。

### Implementation Plan

1. TASK-001 Project：一次补齐五实体共享 Drizzle Schema；实现 Project schema/routes、认证挂载和必要错误 schema、Project 测试定义。执行 typecheck、Schema/路由/OpenAPI 静态或不依赖新表的检查。此时不生成或应用业务 SQL migration。
2. TASK-002 Milestone：实现 Milestone schema/routes/测试定义，核对 user+Project 作用域、排序、位置、多 active；运行局部可执行检查。
3. TASK-003 Task：实现 Task schema/routes/测试定义，核对 milestone 归属、position 分组和 completed_at 状态转换；运行局部可执行检查。
4. TASK-004 Resource：实现 Resource schema/routes/测试定义，核对互斥 scope、location、PATCH 完整验证和 metadata-only delete；运行局部可执行检查。此时引用保护将在下一个任务接入，整个阶段尚未可交付。
5. TASK-005 Capability Registry：实现 schema/routes/测试；补齐 Resource 反向检查和文档修正；最后集中写入一个五表增量 migration，适配现有仅两表/四错误码断言；应用本地 D1 migration，运行全部测试/typecheck/OpenAPI 和 dev server API 全链路；完成所有 canonical criteria 后报告并停止。

这五项属于用户批准的一个 Phase。前四项“可继续下一任务”的证据是 AC-01 至 AC-05 的代码/定义及局部检查；真实 D1 行为与全部测试通过在 TASK-005 的 AC-07 至 AC-11 中集中验收。因此不会要求前四项先跑成功依赖尚未创建 migration 的集成测试，也不能把局部检查说成完整功能验收。

### Risks

- 多租户访问与双向引用检查遗漏可泄露或破坏数据；所有查询显式作用域，真实 D1 测试覆盖跨用户/跨 Project，错误不泄露存在性。
- Resource kind 修改和 Capability 引用写入共享业务不变量，执行时应检查校验与写入边界，不能接受部分写入；数据库 FK 只保证基本引用，不替代类型语义。
- 当前无 Drizzle 历史 meta，盲目 generate 会重复初始建表；本轮只允许经检查的增量 SQL。首次应用后不能通过编辑旧 SQL“修复”历史。
- 无 Git 元数据，不能依靠 branch/commit 恢复或 git revert 回滚；需核对 SHA-256 内容基线并保留实施前文件副本/可追溯 diff。记录摘要不是自动恢复原文的备份。
- final migration 延后意味着中间步骤不具有完整 D1 验收结果；不得将整个阶段提前宣称完成。
- 已有 Bootstrap 若出现真实失败，先判断与批准变更是否相关；范围外修复另行报告。

### Rollback Plan

保存阶段只创建新任务文件，无实现回滚动作。未来执行开始前保留受影响文件的可恢复副本或确认已建立可用版本管理，不初始化/修改 Git 作为隐藏任务。
迁移应用前：仅撤销本任务新增路由、schema、错误补充、测试与 docs/03 修订，保留用户并行改动；恢复 src/app.ts 新业务挂载，维持 Auth/Test/health。
迁移应用后：先停止新业务路由写入；保留新业务表与数据、原 migration 历史，回退应用层变更不自动 DROP 表、不删除本地 DB。不在本任务内执行破坏性数据库降级；如必须删除数据或修复已应用 SQL，需新的明确方案。回归 Auth/Test、health、现有 users/api_tokens 数据。
风险集中在共享 app/error/schema 和新关系；不能将恢复旧整文件覆盖用户后续改动。

### Acceptance Criteria

- AC-01：五张业务表的 Drizzle Schema、固定枚举、空值/默认值、必要索引和外键与合并规格一致，ID 使用 UUID v4，时间落库为 UTC epoch milliseconds，Capability.resource_id 必填且不唯一，引用 Resource 的外键禁止 CASCADE。
- AC-02：Project 的六个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖同用户 slug 唯一、跨用户同 slug、状态与 kind、列表过滤、归档/取消归档幂等及租户隔离；不增加重复状态或 hard delete。
- AC-03：Milestone 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project 归属、position 默认从 100 按项目递增 100、position 排序、多 active 合法及跨用户/跨项目 404。
- AC-04：Task 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project-level/Milestone Task、同项目关系、分组 position、completed_at 创建与状态转换规则及跨用户/跨项目隔离。
- AC-05：Resource 的五个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖三种互斥归属、kind/location、过滤及 PATCH 合并后完整验证；删除仅影响 DB metadata。
- AC-06：Capability 的六个规定路由及完整 Zod/OpenAPI 和测试用例齐备，resource_id 必填、同用户同 Project、script 对应 file、skill 对应 directory、enabled 默认 true、enable/disable 幂等，允许多个 Capability 引用同一 Resource。
- AC-07：真实 D1 测试证明所有 Capability 引用（含 disabled）均阻止 Resource 删除并返回 409 RESOURCE_IN_USE，Resource.kind 不兼容修改返回 422 INVALID_CAPABILITY_RESOURCE_KIND 且记录不变，数据库 FK 同时禁止删除被引用 Resource。
- AC-08：全部业务 API 使用认证用户隔离并校验 URL Project 归属；格式/类型/required/enum/query/params 错误返回 400 BAD_REQUEST，业务不变量使用规定 422，跨 Project/User Resource 引用统一 404 RESOURCE_NOT_FOUND，外部 API 不暴露 CAPABILITY_RESOURCE_PROJECT_MISMATCH。
- AC-09：最后集中新增一个只创建五张业务表及必要索引/外键的增量 SQL migration，本地 D1 实际执行成功且 Drizzle Schema 与 SQL 一致，原有两份 migration 及 users/api_tokens 契约和数据保持不变。
- AC-10：pnpm typecheck、现有 Workers/D1 测试及新增五模块的全部规定测试通过，已有 Auth/Test Route/health/错误处理回归通过，新增路由在 /openapi.json 中具有 request/params/query/response 和 bearerAuth 声明；若已有 lint 则运行，没有则明确不适用。
- AC-11：通过本地 dev server 实际创建 Iris Project、v0.1 Milestone、Implement Project Core Task、PRD file Resource、OPC_OS 下的 Skill directory 和 Script file Resources 及对应两种 Capability，读取/过滤/启停与引用保护响应符合规格；不访问或修改真实 Git 内容。
- AC-12：定义文档所有 Capability.resource_id 可选表述同步为必填并表达对应完整性约束，最终报告功能、表、migration、路由、实际测试/OpenAPI/本地 D1 结果、未验证或人工事项及与旧提示词的差异，然后停止。

### Verification Strategy

以下均为未来授权执行后的计划，本次仅验证任务文档，不运行这些实现检查。

| Check | Canonical mapping | Planned evidence |
|---|---|---|
| V01 | AC-01 | 检查五表 Drizzle 字段/enum/null/default/index/FK 与合并表格，运行 typecheck；最终迁移后对 D1 PRAGMA table_info/index_list/foreign_key_list 检查 SQL 一致性 |
| V02 | AC-02 | 局部核对六路由/schema/测试代码；最终真实 D1 覆盖 create、slug 同用户冲突/不同用户复用、list status/kind/archive 默认及 include_archived、archive/unarchive 幂等、patch、跨用户 404 |
| V03 | AC-03 | 局部 typecheck/OpenAPI/测试定义；最终创建、显式/自动 position +100、position 排序、多个 active、patch status、跨用户/跨项目 404 |
| V04 | AC-04 | 局部 typecheck/OpenAPI/测试定义；最终 Project-level/Milestone create、错误 Milestone、两类 position 分组、初始 completed、todo→completed、completed→doing/cancelled/todo、重复 completed 和修改 title 保留完成时间、跨用户 404 |
| V05 | AC-05 | 局部 typecheck/OpenAPI/测试定义；最终三类 Resource、双子键 422、四类 location 缺失 422、关联过滤验证、跨项目/user、PATCH 合并完整验证、未引用删除 204 且无外部操作 |
| V06 | AC-06 | script/file 与 skill/directory 创建、错误配对 422、同 Resource 多 Capability、enabled default/true/false filters、enable/disable 幂等、name/description PATCH、type/resource_id 更新重验证、list type、跨用户 GET 和引用 404 |
| V07 | AC-07 | enabled 和 disabled 引用均禁止 DELETE；直接 FK 删除受阻；多引用逐项检查 kind PATCH，拒绝后 Resource/Capability 未改变；兼容更新成功 |
| V08 | AC-08 | 各路由家族无认证失败；两用户/两 Project 测试矩阵；非法 JSON/required/enum/type/query/params 为 400；合法结构但 scope/location/kind 业务错误为 422；引用不可见统一 404；409 resource-in-use；请求无法指定归属 |
| V09 | AC-09 | 比对旧 SQL 摘要；检查单个增量无重复基础表/破坏性 DDL；pnpm db:migrate:local 实际应用；测试使用 readD1Migrations/applyD1Migrations；验证已有 users/api_tokens 契约和数据保留 |
| V10 | AC-10 | pnpm typecheck、pnpm test；已有 lint 才运行；/openapi.json 覆盖全部 25 个业务操作及 required/ref/enum/errors/bearerAuth；保留 Auth/Test/health/400/401/404/500 既有回归 |
| V11 | AC-11 | pnpm dev 启动本地 Worker；现有 auth:create-dev 或测试身份仅本地；真实 HTTP 创建 Iris→v0.1→Implement Project Core→PRD file（repository OPC_OS）→Project Secretary Skill directory（skills/project-secretary/）→Check Provider Script file（scripts/check-provider.ts）→两种 Capability；读取、过滤、enable/disable、409 delete、422 kind 修改；不调用 Git 或实际执行资产 |
| V12 | AC-12 | docs/03 检索 nullable/Optional/if present 的 Capability 引用表述已一致；汇总功能、五表、迁移路径、25 routes、实际命令结果/OpenAPI/D1/人工事项/差异，停止在本阶段 |

如依赖已安装则不无故 pnpm install；如确需安装沿用 lockfile，不新增依赖。没有 lint 时记录 N/A，不自建 lint 系统。每项失败区分批准范围内缺陷与外部阻塞，未验证项不算通过。

### Next Action

1. Execute Now — 本次未选择。
2. Save as Task — 已选择；保存包含五个任务的此文档后停止。未来执行须显式继续并通过 CDF 恢复校验。

## Approved Phase Boundary
- Phase: Iris v0.1 Phase 2 — Project Core + Capability Registry
- Phase Scope: 实现 Project 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。；实现 Milestone 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。；实现 Task 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。；实现 Resource metadata 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。；实现 Capability Registry、Resource 双向引用保护、定义文档修正，并集中完成五表增量迁移和完整本地端到端验收。
- Ends At: 五个实现任务及所有 canonical acceptance criteria 获得实际成功证据，并报告结果后停止；本次仅保存此阶段定义。
- Explicitly Deferred: Capability/Script/Skill Runtime、Cloud Agent、Git integration、其他业务模块、Drizzle 历史 metadata baseline 修复、远程迁移和生产部署。

## Approval Record
- User Approval: 那我们把这个拆分成4个task，Project、Milestone、Task、Resource各一个，然后批准并保存为task
- Approval Context: 当前会话中首次明确保存授权；用户随后以“这是回答你的”提交最终十一条答复，本记录整理于 2026-09-18T18:14:07.088Z
- User Choice: Save as Task
- Approval Type: full
- Approved Items: ["实现 Project 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。","实现 Milestone 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。","实现 Task 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。","实现 Resource metadata 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。","实现 Capability Registry、Resource 双向引用保护、定义文档修正，并集中完成五表增量迁移和完整本地端到端验收。"]
- Conditions Added To Scope Lock: 用户最终答复明确采用五个 Task、resource_id NOT NULL、双向完整性保护、400/422/404/409 边界、五表集中一次增量迁移、One Repo 仅逻辑约定和 Skill metadata 范围；原文保存在 Approval Summary。
- Unapproved Items: none
- Scope Approved: Yes
- Code Changes Authorized In This Turn: No
- Approval Binding: 首次显式 Save as Task 授权持续有效；最新用户答复替换四任务拆分为五任务并确定修订规则。没有把原四任务授权单独当作 Capability 授权，也没有虚构新的逐字批准语句。

## Dependency Graph
- TASK-001 -> TASK-002
- TASK-002 -> TASK-003
- TASK-003 -> TASK-004
- TASK-004 -> TASK-005

## Dependency Data

| Task ID | Depends On | Approved reason |
|---|---|---|
| TASK-001 | none | 用户确定的第一步 Project，兼含一次五表共享 Schema 基础 |
| TASK-002 | TASK-001 | Milestone 依赖 Project 归属及共享 Schema |
| TASK-003 | TASK-002 | Task 的可选 Milestone 归属校验 |
| TASK-004 | TASK-003 | Resource 的 Task/Milestone/Project 归属及用户指定实现顺序 |
| TASK-005 | TASK-004 | Capability 引用 Resource、反向保护；五模块完成后统一迁移及端到端验收 |

此顺序不表示 Resource 业务上必须属于 Task；Project Resource 和 Milestone Resource 仍然合法。未创建调度器、worker assignment 或自动执行机制。

## Task Definitions

## TASK-001: Project

### Goal
实现 Project 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。

### Dependencies
- none

### Approved Scope Mapping
- `in_scope`: 实现 Project 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。
- `will_change`: src/db/schema.ts 中新增五张业务表、对应类型、索引和外键；不改变 users/api_tokens 契约。
- `will_change`: src/routes/projects.ts、src/schemas/project.ts 及对应 Project 测试。
- `will_change`: src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。

### Write Scope
- src/db/schema.ts（一次建立五表共享基础，保留 users/api_tokens）
- src/routes/projects.ts（新增）
- src/schemas/project.ts（新增）
- src/app.ts（新增认证挂载及 Project 注册）
- src/lib/response.ts（必要的共享错误 schema 增补）
- tests/ 下 Project 测试与必要的测试辅助

### Shared Contracts
- Technical Approach 的实体字段、HTTP/Zod/OpenAPI、认证身份、user/Project 隔离、时间和 error envelope 契约。
- 一次统一五表 Schema；第五任务集中单个 migration 与全部 D1/API 联合验收。

### Implementation Notes
- 按 Technical Approach 一次建立五表 Drizzle 声明；实现六个 Project 操作、slug 唯一、归档和枚举/响应 schema。编写 Project 测试。此任务不生成 migration；全量数据库行为由第五任务集中验证。
- 不改变 Technical Approach 已锁定行为；依赖顺序采用用户明确选择的实现顺序。

### Acceptance Criteria
- AC-01：五张业务表的 Drizzle Schema、固定枚举、空值/默认值、必要索引和外键与合并规格一致，ID 使用 UUID v4，时间落库为 UTC epoch milliseconds，Capability.resource_id 必填且不唯一，引用 Resource 的外键禁止 CASCADE。
- AC-02：Project 的六个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖同用户 slug 唯一、跨用户同 slug、状态与 kind、列表过滤、归档/取消归档幂等及租户隔离；不增加重复状态或 hard delete。

### Must Not Change
- 不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。
- 不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。
- 不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。
- 不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。
- 不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。
- 不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。
- 保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。
- 不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。
- 保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。

### Planned Verification
- V01/V02：运行 typecheck、检查五表定义/索引/FK 和 Project 路由/Zod/OpenAPI/测试代码。新表尚未迁移时只报告局部检查；V02 的真实 D1 行为成功留给 TASK-005 的最终集成门槛。
- 本文档内未执行上述实现检查；Definition Status 不是运行进度。

### Assumptions and Stop Conditions
- 本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。
- One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。
- 五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。
- 恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。
- 如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。
- 若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。
- 本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。

### Definition Status
READY

## TASK-002: Milestone

### Goal
实现 Milestone 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。

### Dependencies
- TASK-001

### Approved Scope Mapping
- `in_scope`: 实现 Milestone 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。
- `will_change`: src/routes/milestones.ts、src/schemas/milestone.ts 及对应 Milestone 测试。
- `will_change`: src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。

### Write Scope
- src/routes/milestones.ts（新增）
- src/schemas/milestone.ts（新增）
- src/app.ts（Milestone 注册）
- src/lib/response.ts（Milestone 错误 schema 增补）
- tests/ 下 Milestone 测试与必要的辅助

### Shared Contracts
- Technical Approach 的实体字段、HTTP/Zod/OpenAPI、认证身份、user/Project 隔离、时间和 error envelope 契约。
- 一次统一五表 Schema；第五任务集中单个 migration 与全部 D1/API 联合验收。

### Implementation Notes
- 复用五表基础和 Project 用户作用域；实现四个 Milestone 操作、max(position)+100、多个 active、排序和 404 关系验证；编写相应测试。
- 不改变 Technical Approach 已锁定行为；依赖顺序采用用户明确选择的实现顺序。

### Acceptance Criteria
- AC-03：Milestone 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project 归属、position 默认从 100 按项目递增 100、position 排序、多 active 合法及跨用户/跨项目 404。

### Must Not Change
- 不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。
- 不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。
- 不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。
- 不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。
- 不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。
- 不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。
- 保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。
- 不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。
- 保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。

### Planned Verification
- V03：typecheck、路由/OpenAPI 和测试定义检查；真实 D1 创建/位置/多 active/404 用例集中在 TASK-005 执行，不提前宣称通过。
- 本文档内未执行上述实现检查；Definition Status 不是运行进度。

### Assumptions and Stop Conditions
- 本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。
- One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。
- 五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。
- 恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。
- 如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。
- 若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。
- 本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。

### Definition Status
READY

## TASK-003: Task

### Goal
实现 Task 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。

### Dependencies
- TASK-002

### Approved Scope Mapping
- `in_scope`: 实现 Task 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。
- `will_change`: src/routes/tasks.ts、src/schemas/task.ts 及对应 Task 测试。
- `will_change`: src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。

### Write Scope
- src/routes/tasks.ts（新增）
- src/schemas/task.ts（新增）
- src/app.ts（Task 注册）
- src/lib/response.ts（Task 错误 schema 增补）
- tests/ 下 Task 测试与必要的辅助

### Shared Contracts
- Technical Approach 的实体字段、HTTP/Zod/OpenAPI、认证身份、user/Project 隔离、时间和 error envelope 契约。
- 一次统一五表 Schema；第五任务集中单个 migration 与全部 D1/API 联合验收。

### Implementation Notes
- 实现四个 Task 操作；按 Project-level 或 Milestone 范围求 position；所有引用保持 same-user/same-project；实现创建 completed 与 completed_at 状态转换，保持标题修改不改变完成时间。
- 不改变 Technical Approach 已锁定行为；依赖顺序采用用户明确选择的实现顺序。

### Acceptance Criteria
- AC-04：Task 的四个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖 Project-level/Milestone Task、同项目关系、分组 position、completed_at 创建与状态转换规则及跨用户/跨项目隔离。

### Must Not Change
- 不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。
- 不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。
- 不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。
- 不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。
- 不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。
- 不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。
- 保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。
- 不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。
- 保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。

### Planned Verification
- V04：typecheck、schema/OpenAPI、状态转换和测试用例代码检查；真实 D1 用例统一在 TASK-005 验证。
- 本文档内未执行上述实现检查；Definition Status 不是运行进度。

### Assumptions and Stop Conditions
- 本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。
- One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。
- 五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。
- 恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。
- 如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。
- 若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。
- 本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。

### Definition Status
READY

## TASK-004: Resource

### Goal
实现 Resource metadata 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。

### Dependencies
- TASK-003

### Approved Scope Mapping
- `in_scope`: 实现 Resource metadata 的数据模型、认证 API、Zod/OpenAPI 和测试，遵循原始 Project Core 需求及已确认修订。
- `will_change`: src/routes/resources.ts、src/schemas/resource.ts 及对应 Resource 测试。
- `will_change`: src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。

### Write Scope
- src/routes/resources.ts（新增）
- src/schemas/resource.ts（新增）
- src/app.ts（Resource 注册）
- src/lib/response.ts（Resource 错误 schema 增补）
- tests/ 下 Resource 测试与必要的辅助

### Shared Contracts
- Technical Approach 的实体字段、HTTP/Zod/OpenAPI、认证身份、user/Project 隔离、时间和 error envelope 契约。
- 一次统一五表 Schema；第五任务集中单个 migration 与全部 D1/API 联合验收。

### Implementation Notes
- 实现五个 metadata 操作、三种互斥 scope、四类 location、query 引用验证及 PATCH 合并后的完整验证。新业务只返回 metadata，不访问 location。Capability 加入后的删除和 kind 反向保护归 TASK-005，阶段在此尚不交付。
- 不改变 Technical Approach 已锁定行为；依赖顺序采用用户明确选择的实现顺序。

### Acceptance Criteria
- AC-05：Resource 的五个规定路由、Zod/OpenAPI 定义及测试用例代码齐备，覆盖三种互斥归属、kind/location、过滤及 PATCH 合并后完整验证；删除仅影响 DB metadata。

### Must Not Change
- 不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。
- 不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。
- 不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。
- 不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。
- 不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。
- 不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。
- 保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。
- 不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。
- 保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。

### Planned Verification
- V05：typecheck、schema/OpenAPI 与测试用例代码检查；D1 操作及 metadata-only delete 证明在 TASK-005，不能标为已经全功能验证。
- 本文档内未执行上述实现检查；Definition Status 不是运行进度。

### Assumptions and Stop Conditions
- 本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。
- One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。
- 五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。
- 恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。
- 如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。
- 若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。
- 本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。

### Definition Status
READY

## TASK-005: Capability Registry 与最终联合验收

### Goal
实现 Capability Registry、Resource 双向引用保护、定义文档修正，并集中完成五表增量迁移和完整本地端到端验收。

### Dependencies
- TASK-004

### Approved Scope Mapping
- `in_scope`: 实现 Capability Registry、Resource 双向引用保护、定义文档修正，并集中完成五表增量迁移和完整本地端到端验收。
- `will_change`: src/db/schema.ts 中新增五张业务表、对应类型、索引和外键；不改变 users/api_tokens 契约。
- `will_change`: src/routes/resources.ts、src/schemas/resource.ts 及对应 Resource 测试。
- `will_change`: src/routes/capabilities.ts、src/schemas/capability.ts、Resource 引用保护及对应 Capability/集成测试。
- `will_change`: src/app.ts 的新增路由和认证挂载、src/lib/response.ts 的错误码/OpenAPI schema 增补、tests/ 中必要的测试辅助和既有断言适配。
- `will_change`: drizzle/ 下一个仅新增五张业务表及其索引/外键的 SQL migration；docs/03_Iris_Project_Task_Resource_Capability_Definition_v0.1.md 中 resource_id 必填及相关一致性文案。

### Write Scope
- src/routes/capabilities.ts（新增）
- src/schemas/capability.ts（新增）
- src/routes/resources.ts（双向引用保护）
- src/db/schema.ts（批准的五表一致性修正，如必要）
- src/app.ts（Capability 注册）
- src/lib/response.ts（Capability/Resource 业务错误 schema）
- src/routes/projects.ts、src/routes/milestones.ts、src/routes/tasks.ts、src/schemas/project.ts、src/schemas/milestone.ts、src/schemas/task.ts、src/schemas/resource.ts（仅批准范围内最终验收失败修正）
- tests/（Capability、引用保护、全链路、五模块测试；tests/schema.test.ts 与 tests/routes.test.ts 扩展断言）
- drizzle/ 下一个新增五表的 SQL migration（当前候选 0002_project_core_capability_registry.sql，执行前核对是否占用）
- docs/03_Iris_Project_Task_Resource_Capability_Definition_v0.1.md（仅必填引用及关系保护文案）

### Shared Contracts
- Technical Approach 的实体字段、HTTP/Zod/OpenAPI、认证身份、user/Project 隔离、时间和 error envelope 契约。
- 一次统一五表 Schema；第五任务集中单个 migration 与全部 D1/API 联合验收。
- Capability 与 Resource 的必填/同域/类型不变量必须双向维护；disabled 引用仍受保护。

### Implementation Notes
- 实现 Capability 六路由、required Resource 引用、script/file 与 skill/directory、enabled 和过滤、1:N 引用。补齐 Resource DELETE 409 与 kind PATCH 422 双向维护（包含 disabled 引用），FK 禁止 CASCADE。修正文档，最后集中写一个增量 migration 并验证既有数据保留。执行所有 V01–V12；修复只能在批准范围内。
- 不改变 Technical Approach 已锁定行为；依赖顺序采用用户明确选择的实现顺序。

### Acceptance Criteria
- AC-06：Capability 的六个规定路由及完整 Zod/OpenAPI 和测试用例齐备，resource_id 必填、同用户同 Project、script 对应 file、skill 对应 directory、enabled 默认 true、enable/disable 幂等，允许多个 Capability 引用同一 Resource。
- AC-07：真实 D1 测试证明所有 Capability 引用（含 disabled）均阻止 Resource 删除并返回 409 RESOURCE_IN_USE，Resource.kind 不兼容修改返回 422 INVALID_CAPABILITY_RESOURCE_KIND 且记录不变，数据库 FK 同时禁止删除被引用 Resource。
- AC-08：全部业务 API 使用认证用户隔离并校验 URL Project 归属；格式/类型/required/enum/query/params 错误返回 400 BAD_REQUEST，业务不变量使用规定 422，跨 Project/User Resource 引用统一 404 RESOURCE_NOT_FOUND，外部 API 不暴露 CAPABILITY_RESOURCE_PROJECT_MISMATCH。
- AC-09：最后集中新增一个只创建五张业务表及必要索引/外键的增量 SQL migration，本地 D1 实际执行成功且 Drizzle Schema 与 SQL 一致，原有两份 migration 及 users/api_tokens 契约和数据保持不变。
- AC-10：pnpm typecheck、现有 Workers/D1 测试及新增五模块的全部规定测试通过，已有 Auth/Test Route/health/错误处理回归通过，新增路由在 /openapi.json 中具有 request/params/query/response 和 bearerAuth 声明；若已有 lint 则运行，没有则明确不适用。
- AC-11：通过本地 dev server 实际创建 Iris Project、v0.1 Milestone、Implement Project Core Task、PRD file Resource、OPC_OS 下的 Skill directory 和 Script file Resources 及对应两种 Capability，读取/过滤/启停与引用保护响应符合规格；不访问或修改真实 Git 内容。
- AC-12：定义文档所有 Capability.resource_id 可选表述同步为必填并表达对应完整性约束，最终报告功能、表、migration、路由、实际测试/OpenAPI/本地 D1 结果、未验证或人工事项及与旧提示词的差异，然后停止。

### Must Not Change
- 不实现 Capability Execution、Cloud Agent、Script Runtime、Skill discovery/install/parsing/runtime/execution/update/generation 或 Skill Factory。
- 不实现 GitHub/GitLab API、Git checkout/commit/push、文件或 Markdown 正文读写、仓库白名单、repository alias/provider/credentials 映射。
- 不实现 Decision、Reminder、Finance、Asset、Weather、Rules、Context/Daily Context、Knowledge Base、RAG、Embedding、Evolution、Automation 或 Workflow。
- 不实施远程 D1 migration、生产部署、旧 migration 改写或 Drizzle 历史 metadata baseline 修复。
- 不新增 Service Layer、Repository Layer、DI Container、Event Bus、分页或推测性的业务抽象和依赖。
- 不新增 Project 派生状态字段、Milestone 截止日期或 completed_at、Task 新状态或 Capability runtime 配置字段。
- 保留 Auth/Test Route、health、Token 哈希/认证/401 challenge 契约、现有响应 envelope、通用 400 BAD_REQUEST 行为及敏感信息不泄露规则。
- 不提供 Project、Milestone、Task、Capability 的 hard delete API；Resource 删除仅作用于未被引用的 DB metadata。
- 保留 drizzle/0000_init.sql 与 drizzle/0001_users_contract.sql 原文、users/api_tokens 已有字段和数据，以及用户的其他文件与改动。

### Planned Verification
- V06–V12 是本任务验收；同时运行 V01–V05 的最终 D1 阶段，覆盖全部五模块。执行 pnpm db:migrate:local、pnpm typecheck、pnpm test、已有 lint（没有则 N/A）、本地 pnpm dev 与真实 HTTP 示例；核对 OpenAPI 25 个业务操作及旧 SQL 摘要。保存实际证据，任何失败/未验证项阻止阶段完成。
- 本文档内未执行上述实现检查；Definition Status 不是运行进度。

### Assumptions and Stop Conditions
- 本轮以两份开发提示词及用户最终十一条答复合并为准；最新答复覆盖旧需求冲突处，其余沿用仓库已锁定合理约定。
- One Git Repository 仅为逻辑部署约定，repository/path 本轮只保存 metadata。
- 五个实体 Schema 在第一个实现任务统一建立，增量 SQL migration 只在第五个任务集中生成或手工编写一次；前四个任务的局部检查不代表数据库行为已经验收。
- 恢复时若证据内容变化影响接口、范围、风险、验收或回滚，停止并重新规划；Git 不可用时必须核对文件摘要及新增或缺失文件。
- 如果发现需要修改旧 migration、认证契约、users/api_tokens 字段、生产配置或增加范围外模块才能完成，停止并报告。
- 若集中迁移前已有他人新增或应用业务 migration，先核实实际历史并重新评估，不覆盖或重写已执行 SQL。
- 本地 D1、测试或 API 实测无法完成时如实保留未验证项，不宣称本阶段完成。

### Definition Status
READY

## Scope Guard
- [x] Every task maps to approved in_scope or will_change content.
- [x] Exclusions, non-goals and protected areas appear only as constraints, never positive scope.
- [x] The canonical Scope Lock is byte-for-byte unchanged from the frozen CDF planning payload.
- [x] The Development Plan is carried verbatim with the required eleven headings and sole Scope Lock.
- [x] Exact displayed review summary and original user requirements/clarifications are preserved; the continuing Save as Task instruction and explicit user revision, not invented approval, authorize this definition.
- [x] The Acceptance Criteria projection exactly matches every canonical criterion in order.
- [x] in_scope and acceptance_criteria are non-empty.
- [x] Every task criterion is a verbatim canonical entry in canonical order.
- [x] Every canonical criterion has task coverage and a corresponding V01–V12 planned check.
- [x] Approval Record and approved phase boundary are preserved; no partial approval applies.
- [x] Dependency chain is the implementation sequence explicitly requested by the user.
- [x] Planned implementation verification is not reported as performed.
- [x] Assumptions, stop conditions and protected areas are visible for resume.
- [x] Unavailable Git metadata and actual content baselines are preserved; save drift preflight is recorded.
- [x] The compiler did not implement, schedule, assign, or review implementation and did not change CDF planning/approval/risk decisions.

## Future CDF Execution Constraints
- Resume only through CDF.
- Follow CDF Integrity Verification, Resume a Saved Task, and Repository Drift rules.
- Treat Scope Lock, Approval Record, phase boundary, task Write Scope and dependencies as immutable limits.
- Stop and return to planning if evidence requires new scope, technical decisions or acceptance criteria.
- Saved approval permits persistence only; implementation requires an explicit current continue request and successful validation.
- After execution authorization, record runtime state only in the separate cdf-execution-progress/v1 sidecar; never alter this definition.
- Skip only verified task evidence that still applies; inspect interrupted or blocked work and reconcile actual attribution.
- Only claim checks actually run; inspecting/reviewing this definition does not authorize code or progress mutation.
- Before completion, verify every canonical acceptance entry with current evidence, including the final integrated D1/API requirements, regardless of individual task states.
- If a task is continued alone before TASK-005, report its limited static/definition checks and outstanding integrated checks explicitly. Do not call the whole phase complete.

## Compilation Gate Result
- Compilation Status: READY
- Task Count: 5
- Scope Guard: passed
- Canonical Scope Lock Before Save: matched approved handoff
- Implementation Verification: not performed; this result validates task definitions only

## Save Verification
- [x] Frontmatter and traceability match the approved handoff.
- [x] Required sections are present.
- [x] The displayed review summary and explicit user clarification are preserved and match the merged plan and scope.
- [x] Verbatim Development Plan headings, sole canonical Scope Lock, and acceptance projection match.
- [x] Immutable Approval Record and approved phase boundary are preserved; no partial approval applies.
- [x] Required Scope Lock and Approval Record digests recompute and match.
- [x] Source worktree changes and save-drift preflight metadata match; unavailable Git metadata is disclosed.
- [x] Five task IDs and dependency data are internally consistent and acyclic.
- [x] All twelve canonical acceptance entries have task coverage and corresponding V01–V12 planned checks.
- [x] Scope Guard and CDF-only resume constraints are present.
- [x] The document grants no execution authority and no progress sidecar was created.
- [x] All 32 implementation/evidence baseline files remain unchanged; no implementation file was added.
- Verified At: 2026-09-18T18:23:40.091Z
