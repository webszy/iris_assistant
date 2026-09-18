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
scope_lock_sha256: c66debdc6b01af9380a0bdb8746340df8fc2a8a39d9988d63319b3786076d6bc
approval_record_sha256: 43dd3fd593702e5c863c8c7016707dfd519eb31dbf9a2d34f98ab82d75b3d072
created_at: 2026-09-18T23:34:42+08:00
---

# Iris API Phase 1 — Bootstrap, Auth, and Test Route

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
- Scope Lock SHA-256: c66debdc6b01af9380a0bdb8746340df8fc2a8a39d9988d63319b3786076d6bc
- Approval Record SHA-256: 43dd3fd593702e5c863c8c7016707dfd519eb31dbf9a2d34f98ab82d75b3d072
- Execution Progress Path: /Volumes/Development/Workspace/Iris-assisant/_cdtask/2026-09-18-iris-api-phase-1-bootstrap-auth.md.progress.yaml
- Execution Progress Created By Save: No

## Approval Summary

````text
仓库证据已确认：目标根目录完全为空，且当前不是 Git 仓库；不存在 `package.json`、Wrangler、`tsconfig`、已有代码或数据库约定。因此将采用你指定的绿地默认方案。当前没有修改任何文件。

### 需求理解

- 在 `/Volumes/Development/Workspace/Iris-assisant` 根目录完成 Phase 1：Cloudflare Workers + Hono + TypeScript + D1 + Drizzle + Zod/OpenAPI + Bearer Auth。
- 仅创建 `users`、`api_tokens`、公开 `/health`、受保护 `/api/v1/test`、`/openapi.json`、统一错误响应及开发身份脚本。
- 明确排除所有 Iris 业务模块、管理 API、JWT/OAuth、复杂分层，以及 Git 仓库初始化。Phase 1 到上述链路验证完成即停止。

### 技术方案

- 采用 `crypto.randomUUID()`；时间以 UTC Unix epoch milliseconds 存入 D1，API 输出 ISO 8601；Token 使用安全随机数生成 `iris_<random>`，仅保存 SHA-256。
- 提供 `scripts/create-dev-auth.ts` 与 `pnpm auth:create-dev`，通过本地 D1 创建测试用户和 Token；原始 Token 仅输出一次，不写入 migration。
- 使用 Hono Context 传递认证用户与 `apiTokenId`；使用 Drizzle migration、Zod OpenAPI 响应定义和 Cloudflare Workers 环境下的自动化认证测试。

### 实施与验收

1. 在根目录建立最小项目、依赖与配置，生成两个表的 migration，并实现开发身份脚本。
2. 实现认证中间件、路由、OpenAPI、统一 400/401/404/500 错误处理，确保日志和响应不泄露 Token、Header、Secret 或 SQL 细节。
3. 逐项验证：安装、typecheck、migration、本地启动、测试用户和 Token 创建、数据库仅存 hash、公开健康检查、缺失/格式错误/无效/revoke/过期 Token 均返回 401、有效 Token 返回用户并更新 `last_used_at`、OpenAPI 可访问。
4. 运行 Wrangler dry-run/bundle validation；若没有真实 D1 ID 或 Cloudflare 凭据，远程建库和生产部署明确记为待办，不虚构成功。

### 风险

风险等级为 **XL**：这是一个全新的 API 服务，同时涉及持久化 schema、认证安全和 Cloudflare 部署配置。当前目录为空使回滚相对直接，但没有 Git 历史可恢复；若执行期间发现非空文件、需要超出当前范围的架构，或本地验证必须依赖虚构生产配置，将立即停止并重新确认。

请明确回复：**批准上述 Phase 1 计划并立即执行**，或**批准上述 Phase 1 计划并保存为任务**。
````

## Development Plan

### Requirement Understanding

在仓库根目录建立 Iris API v0.1 的 Phase 1 绿地项目，只验证 Cloudflare Workers、Hono、TypeScript、D1、Drizzle ORM、Zod/OpenAPI 和 Bearer Token Auth 的最小完整链路。身份只能来自 Bearer Token；数据库只保存 Token SHA-256；测试身份通过本地开发脚本创建。公开接口仅为 `GET /health`，受保护接口仅为 `GET /api/v1/test`，OpenAPI JSON 位于 `/openapi.json`。

所有 Iris 业务模块、业务表、管理 API、JWT/OAuth、复杂架构和未经批准的基础设施均排除。真实远程 D1 创建与生产部署仅在用户提供 Cloudflare 凭据和真实 D1 Database ID 后执行；否则 Phase 1 以本地验证和 Wrangler dry-run/bundle 验证结束。

### Evidence Summary

- Fact — Workspace `/Volumes/Development/Workspace/Iris-assisant` 在规划及保存预检时均为空；排除 `_cdtask` 的根目录清单 SHA-256 为 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。
- Fact — 目标目录不是 Git 仓库，因此 Source Branch、Source Commit、Source Worktree State 和 Source Worktree Changes 均为 `Unavailable`；没有 Git 历史可用于回滚或漂移比对。
- Fact — 不存在 `package.json`、pnpm lockfile、Wrangler 配置、TypeScript 配置、源代码、migration、schema、脚本或数据库约定。
- Fact — 本机检测到 Node.js `v24.19.0`、pnpm `11.24.0`、Wrangler `4.125.0` 和 Git `2.55.0`；这里只证明命令存在，不证明待安装依赖兼容或运行验证已经完成。
- Fact — 用户提供的原始需求附件为 `/Users/walter/.codex/attachments/07f2d685-b0fa-41bc-ad81-161eea9ebd0a/pasted-text.txt`，SHA-256 为 `d5b8615d7a2bedb44930e8a2b1ac248cd6dacd209f68fa799d6cdc6ef48a9664`。
- Fact — 用户明确指定根目录实施，并在无既有约定时采用 UUID v4、UTC epoch milliseconds、`iris_<random>` + SHA-256、`scripts/create-dev-auth.ts`/`pnpm auth:create-dev` 以及无凭据时本地验证优先的默认方案。
- Inference — 这是绿地项目，没有可复用约定；批准的默认方案是唯一已确认的实现基线。
- Assumption — 执行时当前稳定的 Hono、Drizzle、Zod OpenAPI 与 Cloudflare 工具版本可形成兼容依赖集；若不成立，不允许以扩大架构或降低安全要求解决。
- Evidence Gap — 没有 Cloudflare 登录状态、Account ID 或真实 D1 Database ID 的证据。该缺口不阻塞本地实现，但阻塞真实远程建库和生产部署。
- Conflict — none。

### Risk Gate Result

- Final Level: Level XL
- Dimensions: Impact — 新 API 服务、认证和持久化数据；Blast radius — 限定于新建的 Phase 1 服务，但覆盖其完整入口、数据和部署配置；Reversibility — 预生产且目录原为空，文件级回滚简单，但无 Git 历史且 schema/认证需一致回退；Uncertainty — 本地范围已明确，依赖兼容性和远程凭据仍需执行时验证；Sensitivity — 身份认证、Token 和用户数据；Coordination — 本地单项目，远程部署需 Cloudflare 凭据与真实 D1 资源。
- Mandatory Signals: ESC-01 CLEAR（无现有共享组件）；ESC-02 HIT（用户身份与受保护路由）；ESC-03 HIT（D1 schema、migration 和持久化写入）；ESC-04 HIT（认证与访问控制）；ESC-05 CLEAR（无分析或业务指标）；ESC-06 CLEAR（无队列、事件或后台任务）；ESC-07 HIT（Token 安全与敏感信息防泄露）；ESC-08 HIT（Workers、Wrangler 和 D1 配置）；ESC-09 HIT（OpenAPI 与部署产物）；ESC-10 HIT（绿地新 API 服务）；ESC-11 CLEAR（远程凭据缺口已限定为待办，不影响本地安全边界）；ESC-12 CLEAR（需求与证据无冲突）。
- Reverse Check: Not Applicable；M-03、M-06 不成立，持久化认证与新服务架构存在更高风险下限。
- Rationale: 绿地新服务同时引入认证、持久化 schema 和部署配置，符合 Level XL；当前批准仅覆盖 Phase 1，后续业务阶段不获授权。

### Scope Lock

```yaml
Scope-Lock-Version: cdf-scope/v1
in_scope:
  - 在仓库根目录建立可本地运行且可部署到 Cloudflare Workers 的 Iris API Phase 1 基础项目，采用 Hono、TypeScript、D1、Drizzle ORM、Zod 和 OpenAPI。
  - 仅建立 users 与 api_tokens 数据模型、migration，以及 pnpm auth:create-dev 开发身份脚本；ID、Token 与时间遵循已批准的绿地默认方案。
  - 实现公开 GET /health、受 Bearer Token 保护的 GET /api/v1/test、认证中间件、统一响应和基础错误处理，并生成可访问的 /openapi.json。
  - 完成本地安装、类型检查、D1 migration、开发身份、认证场景、OpenAPI 与 Wrangler dry-run/bundle 验证；真实远程 D1 创建和生产部署在缺少 Cloudflare 凭据时保持待办。
out_of_scope:
  - Projects、Tasks、Decisions、Reminders、Transactions、Assets、Weather、Rules、Context、Knowledge Base、Skill Factory 及任何其他 Iris 业务模块。
  - OAuth、JWT、Refresh Token、权限系统、临时管理 API、正式 migration 中的测试用户，以及复杂 Service/Repository/DI 分层。
  - PostgreSQL、Redis、Durable Objects、Queues、Vector DB、GraphQL、tRPC，以及未获批准的基础设施或架构扩展。
  - 初始化 Git 仓库、虚构 Cloudflare Account ID 或 D1 Database ID、在无凭据时声称完成远程部署。
non_goals:
  - 不提前为后续业务建立空目录、通用框架或扩展点。
  - 不在 Phase 1 之外继续开发。
assumptions:
  - 目标根目录在执行开始时除已保存的 _cdtask 任务资料外仍无项目文件，且不存在需要保留的既有工程约定。
  - Node.js、pnpm 和 Wrangler 的本机版本可用于安装和本地验证；依赖版本以执行时相互兼容的当前稳定版本为准。
  - 若没有 Cloudflare 登录凭据或真实 D1 Database ID，本地验证与 dry-run 完成即可，远程操作保持等待用户输入。
stop_conditions:
  - 若执行前发现除 _cdtask 外的新项目文件或既有约定，停止并返回 CDF 重新检查和规划。
  - 若安全完成需要超出批准范围的新业务模块、管理 API、认证机制、数据表、基础设施或架构决策，停止并重新审批。
  - 若本地 D1、测试或 bundle 验证必须依赖虚构的生产标识或未提供的敏感凭据，停止相关步骤并将其报告为未验证。
will_change:
  - 根目录的 package.json、pnpm-lock.yaml、tsconfig.json、wrangler.jsonc、drizzle.config.ts 及完成 Phase 1 所必需的最小工具配置。
  - src/** 中的 Worker 入口、Hono 应用、环境类型、D1/Drizzle schema、认证中间件、health/test 路由和统一错误处理。
  - drizzle/** 中的 users 与 api_tokens migration。
  - scripts/create-dev-auth.ts、自动化认证测试及其必要的 package scripts 和测试配置。
will_not_change:
  - 不创建任何 Iris 业务模块、业务表、业务路由或提前设计的业务抽象。
  - 不持久化、记录或在响应中返回原始 Bearer Token、Authorization Header、Secret 或 SQL 内部细节。
  - 不硬编码或虚构 Cloudflare Account ID、D1 Database ID 或其他生产凭据。
  - 不初始化 Git 仓库，不修改目标根目录之外的项目内容。
acceptance_criteria:
  - pnpm install 可以成功完成并生成可复现的锁文件。
  - TypeScript typecheck 通过且项目代码不使用未经说明的 any。
  - 本地 D1 migration 可以成功执行，并且仅创建 users、api_tokens 及批准的外键和必要索引。
  - users.id 与 api_tokens.id 使用 crypto.randomUUID() 生成的 UUID v4；D1 时间字段保存 UTC Unix epoch milliseconds，API 时间输出为 ISO 8601 UTC 字符串。
  - pnpm auth:create-dev 可以在本地 D1 创建测试用户并生成 iris_<random> 格式的安全 Token，且原始 Token 只打印一次。
  - 数据库仅保存 Bearer Token 的 SHA-256 hash，不保存原始 Token。
  - GET /health 无需认证并返回 200 及统一成功响应。
  - GET /api/v1/test 缺少 Authorization Header 时返回统一格式的 401。
  - GET /api/v1/test 的 Bearer 格式错误时返回统一格式的 401。
  - GET /api/v1/test 使用不存在的 Token 时返回统一格式的 401。
  - GET /api/v1/test 使用已 revoke 的 Token 时返回统一格式的 401。
  - GET /api/v1/test 使用已过期的 Token 时返回统一格式的 401。
  - GET /api/v1/test 使用有效 Token 时返回 200、统一成功响应及由 Token 识别的当前用户，且不读取客户端 user_id。
  - 有效 Token 请求完成后会更新对应 api_tokens.last_used_at。
  - /openapi.json 可以访问，并包含 /health、/api/v1/test 及明确的认证错误 response schema。
  - 基础统一错误处理覆盖 400、401、404、500，且响应和日志不泄露原始 Token、Authorization Header、Secret 或 SQL 内部细节。
  - pnpm dev 或等价的 wrangler dev 本地命令可以启动，Client → Worker → Hono → Auth → D1 → Drizzle → User → Protected Route → JSON Response 链路可验证。
  - Wrangler dry-run/bundle validation 通过；若缺少 Cloudflare 凭据或真实 D1 Database ID，远程建库和生产部署被明确报告为等待用户输入而非声称完成。
```

### Technical Approach

- 在根目录创建最小 pnpm TypeScript Worker 项目，采用 Hono 与 `@hono/zod-openapi` 定义应用和契约，使用 Wrangler 管理本地 Workers/D1 环境；只安装实现与验证批准范围所必需的依赖。
- 使用 Drizzle SQLite/D1 schema 与 migration 管理 `users`、`api_tokens`。ID 由 `crypto.randomUUID()` 生成；所有时间列为 UTC epoch milliseconds `INTEGER`，输出时转换为 ISO 8601 UTC。
- Token 通过 Web Crypto 安全随机数生成 `iris_<random>`，SHA-256 后查询 `api_tokens`。认证中间件验证格式、存在性、撤销和过期状态，查询用户、更新 `last_used_at`，再将 `user` 与 `apiTokenId` 写入 Hono Context。
- `scripts/create-dev-auth.ts` 通过本地 Wrangler/D1 工具链执行最小参数化或安全转义的插入流程，提供 `pnpm auth:create-dev`；不创建管理路由，不把测试身份写入正式 migration。
- 采用与安装版本兼容的 Cloudflare Workers 测试方式验证真实 D1 binding 和认证场景。Wrangler 配置只保留清晰的远程 D1 placeholder 或官方允许的未配置状态，不编造资源 ID。

### Implementation Plan

1. 创建最小 package、TypeScript、Wrangler、Drizzle 和测试配置，建立 Worker/Hono 入口及环境类型；planned check：安装依赖、typecheck、Wrangler 配置解析和本地启动。
2. 定义 `users`、`api_tokens` schema、外键和 `token_hash` 必要索引并生成 migration；planned check：在本地 D1 执行 migration 并检查表结构。
3. 实现 Token 随机生成、SHA-256、UUID/时间工具及 `scripts/create-dev-auth.ts`；planned check：创建测试用户和 Token，并查询本地 D1 确认只有 hash。
4. 实现 Bearer Auth middleware、用户查询、撤销/过期检查、`last_used_at` 更新和类型化 Hono Context；planned check：自动测试缺失、格式错误、未知、撤销、过期和有效 Token。
5. 实现 `/health`、`/api/v1/test`、`/openapi.json`、统一响应及 400/401/404/500 错误处理；planned check：验证状态码、响应 schema、当前用户来源和敏感信息不泄露。
6. 运行完整本地验证与 Wrangler dry-run/bundle；planned check：逐项核对全部 canonical acceptance criteria，并把真实远程建库/部署标记为完成或因缺少凭据等待用户输入。

### Risks

- 新服务涉及认证与持久化；错误的 Token 处理、时间比较或 Context 身份来源可能造成越权。通过集中 middleware、原始 Token 不落库、拒绝客户端 `user_id` 和完整负面场景测试降低风险。
- Wrangler、D1、Drizzle 与测试工具的当前版本可能存在配置兼容差异。只能在批准的最小架构内按实际版本调整；若需新基础设施、不同认证机制或新的数据模型，停止并重新规划。
- 无 Git 历史使误改恢复能力较弱。执行必须保持根目录外不变，并只创建批准的 Phase 1 文件。
- Cloudflare 凭据和真实 D1 ID 未确认；这不会阻塞本地结果，但远程建库和生产部署不得被标记为已完成。

### Rollback Plan

在确认没有执行前新增的用户文件后，仅移除本次 Phase 1 创建的根配置、`src/**`、`drizzle/**`、`scripts/create-dev-auth.ts`、测试文件和安装产物；保留 `_cdtask` 任务文档及任何执行进度 sidecar。远程 D1 或部署如后来获得单独授权，则使用 Cloudflare 提供的对应回滚流程，不能由本任务预先假定。

### Acceptance Criteria

- pnpm install 可以成功完成并生成可复现的锁文件。
- TypeScript typecheck 通过且项目代码不使用未经说明的 any。
- 本地 D1 migration 可以成功执行，并且仅创建 users、api_tokens 及批准的外键和必要索引。
- users.id 与 api_tokens.id 使用 crypto.randomUUID() 生成的 UUID v4；D1 时间字段保存 UTC Unix epoch milliseconds，API 时间输出为 ISO 8601 UTC 字符串。
- pnpm auth:create-dev 可以在本地 D1 创建测试用户并生成 iris_<random> 格式的安全 Token，且原始 Token 只打印一次。
- 数据库仅保存 Bearer Token 的 SHA-256 hash，不保存原始 Token。
- GET /health 无需认证并返回 200 及统一成功响应。
- GET /api/v1/test 缺少 Authorization Header 时返回统一格式的 401。
- GET /api/v1/test 的 Bearer 格式错误时返回统一格式的 401。
- GET /api/v1/test 使用不存在的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已 revoke 的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已过期的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用有效 Token 时返回 200、统一成功响应及由 Token 识别的当前用户，且不读取客户端 user_id。
- 有效 Token 请求完成后会更新对应 api_tokens.last_used_at。
- /openapi.json 可以访问，并包含 /health、/api/v1/test 及明确的认证错误 response schema。
- 基础统一错误处理覆盖 400、401、404、500，且响应和日志不泄露原始 Token、Authorization Header、Secret 或 SQL 内部细节。
- pnpm dev 或等价的 wrangler dev 本地命令可以启动，Client → Worker → Hono → Auth → D1 → Drizzle → User → Protected Route → JSON Response 链路可验证。
- Wrangler dry-run/bundle validation 通过；若缺少 Cloudflare 凭据或真实 D1 Database ID，远程建库和生产部署被明确报告为等待用户输入而非声称完成。

### Verification Strategy

- 安装与静态检查：运行 `pnpm install`、项目定义的 typecheck 和测试命令，检查 lockfile、TypeScript 错误及未说明的 `any`。
- 数据验证：对本地 D1 执行 migration，检查只存在批准的两张业务相关表、外键和索引；运行 `pnpm auth:create-dev`，核对 UUID、epoch milliseconds、Token 格式、一次性输出及数据库仅存 hash。
- 路由与认证验证：在 Cloudflare Workers 本地环境运行自动化测试或等价的真实 binding 集成检查，覆盖 `/health`、缺失/格式错误/未知/revoke/过期/有效 Token、当前用户身份及 `last_used_at` 更新。
- 契约与安全验证：请求 `/openapi.json` 并核对三类 response schema；检查统一响应与 400/401/404/500，确认响应和可观察日志不包含禁止的敏感值。
- Worker 验证：启动 `pnpm dev` 或等价 Wrangler 本地命令，执行完整链路冒烟测试，再运行 Wrangler dry-run/bundle validation。远程步骤只有在真实凭据可用时才执行，否则明确记录为未验证且等待用户。

### Next Action

1. Execute Now
2. Save as Task — selected and approved

## Approved Phase Boundary
- Phase: Phase 1 — Bootstrap, Auth, and Test Route
- Phase Scope: 在仓库根目录建立可本地运行且可部署到 Cloudflare Workers 的 Iris API Phase 1 基础项目，采用 Hono、TypeScript、D1、Drizzle ORM、Zod 和 OpenAPI。；仅建立 users 与 api_tokens 数据模型、migration，以及 pnpm auth:create-dev 开发身份脚本；ID、Token 与时间遵循已批准的绿地默认方案。；实现公开 GET /health、受 Bearer Token 保护的 GET /api/v1/test、认证中间件、统一响应和基础错误处理，并生成可访问的 /openapi.json。；完成本地安装、类型检查、D1 migration、开发身份、认证场景、OpenAPI 与 Wrangler dry-run/bundle 验证；真实远程 D1 创建和生产部署在缺少 Cloudflare 凭据时保持待办。
- Ends At: 全部本地 acceptance criteria 与 Wrangler dry-run/bundle validation 已核验，远程建库和部署已完成或明确记录为等待真实 Cloudflare 凭据。
- Explicitly Deferred: Projects、Tasks、Decisions、Reminders、Transactions、Assets、Weather、Rules、Context、Knowledge Base、Skill Factory 及任何其他 Iris 业务模块，以及所有未批准的后续阶段。

## Approval Record
- User Approval: 批准上述 Phase 1 计划并保存为任务
- Approval Context: 2026-09-18T23:34:42+08:00
- User Choice: Save as Task
- Approval Type: full
- Approved Items: 在仓库根目录建立可本地运行且可部署到 Cloudflare Workers 的 Iris API Phase 1 基础项目，采用 Hono、TypeScript、D1、Drizzle ORM、Zod 和 OpenAPI。；仅建立 users 与 api_tokens 数据模型、migration，以及 pnpm auth:create-dev 开发身份脚本；ID、Token 与时间遵循已批准的绿地默认方案。；实现公开 GET /health、受 Bearer Token 保护的 GET /api/v1/test、认证中间件、统一响应和基础错误处理，并生成可访问的 /openapi.json。；完成本地安装、类型检查、D1 migration、开发身份、认证场景、OpenAPI 与 Wrangler dry-run/bundle 验证；真实远程 D1 创建和生产部署在缺少 Cloudflare 凭据时保持待办。
- Conditions Added To Scope Lock: none
- Unapproved Items: none
- Scope Approved: Yes
- Code Changes Authorized In This Turn: No

## Dependency Graph
- TASK-001 -> TASK-002
- TASK-001 -> TASK-003
- TASK-001 -> TASK-004
- TASK-001 -> TASK-005
- TASK-002 -> TASK-003
- TASK-002 -> TASK-004
- TASK-004 -> TASK-005
- TASK-003 -> TASK-006
- TASK-005 -> TASK-006

## Dependency Data
| Task ID | Depends On | Approved reason |
|---|---|---|
| TASK-001 | none | 基础 package、Worker、TypeScript、Wrangler 与环境类型是数据、认证、路由和验证工作的前提。 |
| TASK-002 | TASK-001 | Drizzle/D1 schema 与 migration 依赖基础依赖和绑定配置。 |
| TASK-003 | TASK-001, TASK-002 | 开发身份脚本依赖工具链与已建立的 users/api_tokens schema。 |
| TASK-004 | TASK-001, TASK-002 | 认证 middleware 依赖 Hono 环境类型、D1 binding 和 Drizzle schema。 |
| TASK-005 | TASK-001, TASK-004 | 受保护路由与 OpenAPI 应用组合依赖基础应用和认证 Context 契约。 |
| TASK-006 | TASK-003, TASK-005 | 完整验证依赖开发 Token 创建、认证、路由、契约和错误处理均已定义。 |

## TASK-001: Bootstrap Worker Project and Tooling

### Goal
在仓库根目录建立批准的最小 pnpm、TypeScript、Cloudflare Workers、Hono、Wrangler、Drizzle 与测试工具链。

### Dependencies
- none

### Approved Scope Mapping
- `in_scope`: 在仓库根目录建立可本地运行且可部署到 Cloudflare Workers 的 Iris API Phase 1 基础项目，采用 Hono、TypeScript、D1、Drizzle ORM、Zod 和 OpenAPI。
- `will_change`: 根目录的 package.json、pnpm-lock.yaml、tsconfig.json、wrangler.jsonc、drizzle.config.ts 及完成 Phase 1 所必需的最小工具配置。
- `will_change`: src/** 中的 Worker 入口、Hono 应用、环境类型、D1/Drizzle schema、认证中间件、health/test 路由和统一错误处理。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/package.json`
- `/Volumes/Development/Workspace/Iris-assisant/pnpm-lock.yaml`
- `/Volumes/Development/Workspace/Iris-assisant/tsconfig.json`
- `/Volumes/Development/Workspace/Iris-assisant/wrangler.jsonc`
- `/Volumes/Development/Workspace/Iris-assisant/drizzle.config.ts`
- Phase 1 所需的最小测试配置文件
- `/Volumes/Development/Workspace/Iris-assisant/src/index.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/app.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/types/env.ts`

### Shared Contracts
- Cloudflare D1 binding 与类型化 Hono Context 是后续任务共用的运行时契约。

### Implementation Notes
- 只安装 Hono、Drizzle、Zod/OpenAPI、Wrangler、TypeScript、D1 migration、开发脚本和批准测试所需依赖；保持项目结构最小。
- 远程 D1 ID 使用清晰 placeholder 或 Wrangler 官方允许的未配置状态；不得编造可部署资源。

### Acceptance Criteria
- pnpm install 可以成功完成并生成可复现的锁文件。
- TypeScript typecheck 通过且项目代码不使用未经说明的 any。

### Must Not Change
- 不提前为后续业务建立空目录、通用框架或扩展点。
- 不初始化 Git 仓库，不修改目标根目录之外的项目内容。

### Planned Verification
- 运行安装与 typecheck，核对 lockfile；解析 Wrangler/Drizzle 配置并检查最小入口能够由工具链加载。

### Assumptions and Stop Conditions
- Node.js、pnpm 和 Wrangler 的本机版本可用于安装和本地验证；依赖版本以执行时相互兼容的当前稳定版本为准。
- 若执行前发现除 _cdtask 外的新项目文件或既有约定，停止并返回 CDF 重新检查和规划。

### Definition Status
READY

## TASK-002: Define D1 Schema and Migration

### Goal
建立且仅建立 `users`、`api_tokens` 的 Drizzle schema、约束、索引和正式 migration。

### Dependencies
- TASK-001

### Approved Scope Mapping
- `in_scope`: 仅建立 users 与 api_tokens 数据模型、migration，以及 pnpm auth:create-dev 开发身份脚本；ID、Token 与时间遵循已批准的绿地默认方案。
- `will_change`: src/** 中的 Worker 入口、Hono 应用、环境类型、D1/Drizzle schema、认证中间件、health/test 路由和统一错误处理。
- `will_change`: drizzle/** 中的 users 与 api_tokens migration。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/src/db/index.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/db/schema.ts`
- `/Volumes/Development/Workspace/Iris-assisant/drizzle/**`
- 已批准根配置中与 D1 migration/binding 直接相关的字段

### Shared Contracts
- `users` 与 `api_tokens` 字段、外键、`token_hash` 索引、UUID 与 epoch-millisecond 时间表示供认证和开发脚本共用。

### Implementation Notes
- 不在正式 migration 中插入测试用户或 Token；不创建其他业务表。

### Acceptance Criteria
- 本地 D1 migration 可以成功执行，并且仅创建 users、api_tokens 及批准的外键和必要索引。
- users.id 与 api_tokens.id 使用 crypto.randomUUID() 生成的 UUID v4；D1 时间字段保存 UTC Unix epoch milliseconds，API 时间输出为 ISO 8601 UTC 字符串。

### Must Not Change
- 不创建任何 Iris 业务模块、业务表、业务路由或提前设计的业务抽象。
- OAuth、JWT、Refresh Token、权限系统、临时管理 API、正式 migration 中的测试用户，以及复杂 Service/Repository/DI 分层。

### Planned Verification
- 在本地 D1 应用 migration，检查表、字段、外键和索引；核对 schema 类型与批准的 ID/时间约定。

### Assumptions and Stop Conditions
- 若本地 D1、测试或 bundle 验证必须依赖虚构的生产标识或未提供的敏感凭据，停止相关步骤并将其报告为未验证。

### Definition Status
READY

## TASK-003: Create Local Development Identity Script

### Goal
提供 `scripts/create-dev-auth.ts` 和 `pnpm auth:create-dev`，安全创建本地测试用户与一次性显示的原始 Token。

### Dependencies
- TASK-001
- TASK-002

### Approved Scope Mapping
- `in_scope`: 仅建立 users 与 api_tokens 数据模型、migration，以及 pnpm auth:create-dev 开发身份脚本；ID、Token 与时间遵循已批准的绿地默认方案。
- `will_change`: scripts/create-dev-auth.ts、自动化认证测试及其必要的 package scripts 和测试配置。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/scripts/create-dev-auth.ts`
- `/Volumes/Development/Workspace/Iris-assisant/package.json` 中的 `auth:create-dev` 及其必要脚本配置
- 与批准的 Token/UUID/时间实现直接相关的最小 `src/**` helper

### Shared Contracts
- Token 格式为 `iris_<random>`；数据库字段只接收 SHA-256；ID 与时间沿用 schema 契约。

### Implementation Notes
- 使用安全随机数与 Web Crypto；原始 Token 仅在成功写入本地 D1 后打印一次，不创建管理 API。

### Acceptance Criteria
- pnpm auth:create-dev 可以在本地 D1 创建测试用户并生成 iris_<random> 格式的安全 Token，且原始 Token 只打印一次。
- 数据库仅保存 Bearer Token 的 SHA-256 hash，不保存原始 Token。

### Must Not Change
- 不持久化、记录或在响应中返回原始 Bearer Token、Authorization Header、Secret 或 SQL 内部细节。
- 不硬编码或虚构 Cloudflare Account ID、D1 Database ID 或其他生产凭据。

### Planned Verification
- 对已迁移的本地 D1 运行脚本，捕获一次性 Token 输出，再查询数据库验证用户、Token hash、UUID 和时间值，确认不存在原始 Token。

### Assumptions and Stop Conditions
- 若没有 Cloudflare 登录凭据或真实 D1 Database ID，本地验证与 dry-run 完成即可，远程操作保持等待用户输入。

### Definition Status
READY

## TASK-004: Implement Bearer Authentication Middleware

### Goal
实现类型化 Bearer Token 认证、用户解析、撤销/过期校验、`last_used_at` 更新和 Hono Context 身份注入。

### Dependencies
- TASK-001
- TASK-002

### Approved Scope Mapping
- `in_scope`: 实现公开 GET /health、受 Bearer Token 保护的 GET /api/v1/test、认证中间件、统一响应和基础错误处理，并生成可访问的 /openapi.json。
- `will_change`: src/** 中的 Worker 入口、Hono 应用、环境类型、D1/Drizzle schema、认证中间件、health/test 路由和统一错误处理。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/src/middleware/auth.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/types/env.ts`
- 与认证查询和 hash 直接相关的最小 `src/db/**` 或 `src/**` helper

### Shared Contracts
- 成功认证后 Hono Context 至少包含 `user` 与 `apiTokenId`；受保护代码不得从客户端输入读取 `user_id`。
- 认证错误使用批准的统一错误响应。

### Implementation Notes
- 严格解析 `Authorization: Bearer <token>`，hash 后查询 Token，检查 `revoked_at` 与 `expires_at`，查询用户，更新 `last_used_at` 后写入 Context。

### Acceptance Criteria
- GET /api/v1/test 缺少 Authorization Header 时返回统一格式的 401。
- GET /api/v1/test 的 Bearer 格式错误时返回统一格式的 401。
- GET /api/v1/test 使用不存在的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已 revoke 的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已过期的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用有效 Token 时返回 200、统一成功响应及由 Token 识别的当前用户，且不读取客户端 user_id。
- 有效 Token 请求完成后会更新对应 api_tokens.last_used_at。

### Must Not Change
- 不持久化、记录或在响应中返回原始 Bearer Token、Authorization Header、Secret 或 SQL 内部细节。
- OAuth、JWT、Refresh Token、权限系统、临时管理 API、正式 migration 中的测试用户，以及复杂 Service/Repository/DI 分层。

### Planned Verification
- 使用本地 D1 fixtures 或已批准的测试身份运行全部认证正负场景，并在有效请求前后读取 `last_used_at`；检查 Context 用户来自 Token 关联。

### Assumptions and Stop Conditions
- 若安全完成需要超出批准范围的新业务模块、管理 API、认证机制、数据表、基础设施或架构决策，停止并重新审批。

### Definition Status
READY

## TASK-005: Implement Routes, OpenAPI, and Error Handling

### Goal
提供公开健康路由、受保护测试路由、OpenAPI JSON、统一响应和基础统一错误处理。

### Dependencies
- TASK-001
- TASK-004

### Approved Scope Mapping
- `in_scope`: 实现公开 GET /health、受 Bearer Token 保护的 GET /api/v1/test、认证中间件、统一响应和基础错误处理，并生成可访问的 /openapi.json。
- `will_change`: src/** 中的 Worker 入口、Hono 应用、环境类型、D1/Drizzle schema、认证中间件、health/test 路由和统一错误处理。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/src/app.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/routes/health.ts`
- `/Volumes/Development/Workspace/Iris-assisant/src/routes/test.ts`
- 与批准的响应 schema 和错误处理直接相关的最小 `src/**` 文件

### Shared Contracts
- 成功响应为 `{ success: true, data: ... }`；错误响应为 `{ success: false, error: { code, message } }`。
- `/health` 公开；`/api/v1/test` 必须通过认证 middleware；`/openapi.json` 公开生成契约。

### Implementation Notes
- 使用 Zod 与 `@hono/zod-openapi` 实际定义路由响应和认证错误 schema，不添加 Swagger/Scalar 等非必要 UI。

### Acceptance Criteria
- GET /health 无需认证并返回 200 及统一成功响应。
- GET /api/v1/test 使用有效 Token 时返回 200、统一成功响应及由 Token 识别的当前用户，且不读取客户端 user_id。
- /openapi.json 可以访问，并包含 /health、/api/v1/test 及明确的认证错误 response schema。
- 基础统一错误处理覆盖 400、401、404、500，且响应和日志不泄露原始 Token、Authorization Header、Secret 或 SQL 内部细节。

### Must Not Change
- 不创建任何 Iris 业务模块、业务表、业务路由或提前设计的业务抽象。
- 不提前为后续业务建立空目录、通用框架或扩展点。

### Planned Verification
- 请求三个公开/受保护端点并核对状态、统一响应和 OpenAPI schema；触发已批准的错误类别并检查敏感信息未出现。

### Assumptions and Stop Conditions
- 若安全完成需要超出批准范围的新业务模块、管理 API、认证机制、数据表、基础设施或架构决策，停止并重新审批。

### Definition Status
READY

## TASK-006: Complete Local Integration and Bundle Verification

### Goal
建立并执行覆盖全部 canonical acceptance criteria 的自动化与本地端到端验证，并明确远程部署状态。

### Dependencies
- TASK-003
- TASK-005

### Approved Scope Mapping
- `in_scope`: 完成本地安装、类型检查、D1 migration、开发身份、认证场景、OpenAPI 与 Wrangler dry-run/bundle 验证；真实远程 D1 创建和生产部署在缺少 Cloudflare 凭据时保持待办。
- `will_change`: scripts/create-dev-auth.ts、自动化认证测试及其必要的 package scripts 和测试配置。

### Write Scope
- `/Volumes/Development/Workspace/Iris-assisant/tests/**`
- `/Volumes/Development/Workspace/Iris-assisant/package.json` 中批准的测试、typecheck、migration、dev 与 bundle scripts
- 已批准的最小测试配置文件
- 仅限修复验证发现且位于其他任务批准 Write Scope 内的问题

### Shared Contracts
- 所有验证以 canonical acceptance criteria 为唯一验收来源；远程缺凭据属于明确未验证状态，不得伪造成功。

### Implementation Notes
- 使用与已安装 Cloudflare Workers 工具链兼容的最小测试方式覆盖真实 D1 binding、认证状态和路由契约；只修复批准范围内的失败。

### Acceptance Criteria
- pnpm install 可以成功完成并生成可复现的锁文件。
- TypeScript typecheck 通过且项目代码不使用未经说明的 any。
- 本地 D1 migration 可以成功执行，并且仅创建 users、api_tokens 及批准的外键和必要索引。
- users.id 与 api_tokens.id 使用 crypto.randomUUID() 生成的 UUID v4；D1 时间字段保存 UTC Unix epoch milliseconds，API 时间输出为 ISO 8601 UTC 字符串。
- pnpm auth:create-dev 可以在本地 D1 创建测试用户并生成 iris_<random> 格式的安全 Token，且原始 Token 只打印一次。
- 数据库仅保存 Bearer Token 的 SHA-256 hash，不保存原始 Token。
- GET /health 无需认证并返回 200 及统一成功响应。
- GET /api/v1/test 缺少 Authorization Header 时返回统一格式的 401。
- GET /api/v1/test 的 Bearer 格式错误时返回统一格式的 401。
- GET /api/v1/test 使用不存在的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已 revoke 的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用已过期的 Token 时返回统一格式的 401。
- GET /api/v1/test 使用有效 Token 时返回 200、统一成功响应及由 Token 识别的当前用户，且不读取客户端 user_id。
- 有效 Token 请求完成后会更新对应 api_tokens.last_used_at。
- /openapi.json 可以访问，并包含 /health、/api/v1/test 及明确的认证错误 response schema。
- 基础统一错误处理覆盖 400、401、404、500，且响应和日志不泄露原始 Token、Authorization Header、Secret 或 SQL 内部细节。
- pnpm dev 或等价的 wrangler dev 本地命令可以启动，Client → Worker → Hono → Auth → D1 → Drizzle → User → Protected Route → JSON Response 链路可验证。
- Wrangler dry-run/bundle validation 通过；若缺少 Cloudflare 凭据或真实 D1 Database ID，远程建库和生产部署被明确报告为等待用户输入而非声称完成。

### Must Not Change
- 不在 Phase 1 之外继续开发。
- 不硬编码或虚构 Cloudflare Account ID、D1 Database ID 或其他生产凭据。
- Projects、Tasks、Decisions、Reminders、Transactions、Assets、Weather、Rules、Context、Knowledge Base、Skill Factory 及任何其他 Iris 业务模块。

### Planned Verification
- 运行安装、typecheck、migration、开发身份脚本、自动化测试、本地 Worker 冒烟检查和 Wrangler dry-run/bundle；逐项记录每个 canonical criterion 的实际结果与证据。

### Assumptions and Stop Conditions
- 若没有 Cloudflare 登录凭据或真实 D1 Database ID，本地验证与 dry-run 完成即可，远程操作保持等待用户输入。
- 若本地 D1、测试或 bundle 验证必须依赖虚构的生产标识或未提供的敏感凭据，停止相关步骤并将其报告为未验证。

### Definition Status
READY

## Scope Guard
- [x] Every task maps to approved `in_scope` or `will_change` content.
- [x] No task treats `out_of_scope`, `non_goals`, `will_not_change`, or an unapproved remainder as positive scope or work; those entries appear only as protective constraints.
- [x] The canonical Scope Lock is byte-for-byte unchanged.
- [x] The Development Plan is carried verbatim with its canonical headings and sole Scope Lock block.
- [x] The exact displayed approval basis (summary or explicitly approved full plan) is preserved, and the full plan and Scope Lock introduce no undisclosed scope, decisions, acceptance requirements, or verification obligations.
- [x] The Development Plan Acceptance Criteria is an item-for-item, same-order, verbatim projection of canonical `cdf-scope/v1.acceptance_criteria`.
- [x] Canonical `in_scope` and `acceptance_criteria` are both non-empty.
- [x] Every task-level criterion is an applicable canonical entry quoted verbatim and in canonical order; no task requires a new criterion.
- [x] Every canonical acceptance entry is covered by at least one task and a corresponding planned check; no entry is omitted.
- [x] The immutable Approval Record, stable Partial Approval Result when applicable, and approved phase boundary are preserved without creating a second scope authority.
- [x] Dependencies and tasks introduce no product, technical, or architecture decision.
- [x] Planned verification maps to the approved Verification Strategy and is not reported as performed.
- [x] Assumptions, stop conditions, and protected areas are visible to a future CDF resume.
- [x] Source worktree state, the path-scoped stable changes array, and CDF's save-drift preflight result and notes are preserved; dirty state was not treated as automatically material.
- [x] No implementation, execution, scheduling, approval, risk classification, or implementation review occurred.

## Future CDF Execution Constraints
- Resume only through CDF.
- Follow CDF's authoritative Integrity Verification, Resume a Saved Task, and Repository Drift rules.
- Treat the canonical Scope Lock, Approval Record, approved phase boundary, partial-approval exclusions, task Write Scope, and dependencies as immutable limits.
- Stop and return to CDF planning if current evidence requires new scope, a changed technical decision, changed acceptance criteria, or work from an unapproved remainder.
- After explicit current authorization, record runtime state only in the separate `cdf-execution-progress/v1` sidecar; never write it into this task.
- Skip only sidecar tasks whose `verified` evidence remains applicable. Inspect `in_progress` or `blocked` work before continuing it.
- Report only checks actually performed. An inspect, review, summarize, or validate request authorizes no code change or progress mutation.
- Before recording completion, verify every canonical acceptance entry against current successful evidence, including entries beyond any single task's mappings; all tasks being verified is not sufficient by itself.

## Compilation Gate Result
- Compilation Status: READY
- Task Count: 6
- Scope Guard: passed
- Canonical Scope Lock Before Save: matched approved handoff

## Save Verification
- [x] Frontmatter and traceability match the approved handoff.
- [x] Required sections are present.
- [x] The displayed approval basis (summary or explicitly approved full plan) is preserved and its approved meaning matches the full plan and Scope Lock.
- [x] Verbatim Development Plan headings, sole canonical Scope Lock, and acceptance projection match.
- [x] Immutable Approval Record and stable partial-approval projection are preserved.
- [x] Required Scope Lock and Approval Record digests recompute and match.
- [x] Source worktree changes and save-drift preflight metadata match.
- [x] Task IDs and dependency data are internally consistent.
- [x] Every canonical acceptance entry has task coverage and a corresponding planned check.
- [x] Scope Guard and CDF-only resume constraints are present.
- [x] The document grants no execution authority.
- Verified At: 2026-09-18T23:41:37+08:00
