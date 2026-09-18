---
task_contract: cdf-cdtask/v1
handoff_type: approved-tasking
status: tasking_ready
source: cdf
approval_state: approved
risk_level: Level M
workspace: /Volumes/Development/Workspace/Iris-assisant
source_branch: Unavailable
source_commit: Unavailable
source_worktree_state: Unavailable
source_worktree_changes: [Unavailable]
save_drift_preflight: matched
save_drift_notes: none
scope_lock_sha256: 7e76518b4e2445aa9aa88005c79d2f47c7a11b62d520efc37d2bc24777acbf15
approval_record_sha256: 42d6a1e29d3f2f292e6dcce16523015f6291a68bf1accc18235962762bb55e9f
created_at: 2026-09-19T03:03:41+08:00
---

# Iris Memory Repository Template

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
- Scope Lock SHA-256: 7e76518b4e2445aa9aa88005c79d2f47c7a11b62d520efc37d2bc24777acbf15
- Approval Record SHA-256: 42d6a1e29d3f2f292e6dcce16523015f6291a68bf1accc18235962762bb55e9f
- Execution Progress Path: /Volumes/Development/Workspace/Iris-assisant/_cdtask/2026-09-19-iris-memory-template.md.progress.yaml
- Execution Progress Created By Save: No

READY 只表示该任务定义已保存，可供以后通过 CDF 恢复；不表示模板已经创建、Git 已初始化、初始 commit 已完成或验收已经通过。

## Approval Summary

保存授权原文：

````text
/ cdf 读取提示词，生成task文件
````

需求来源：

- 附件：`/Users/walter/.codex/attachments/e6d6c0da-9c9d-4536-8bde-20e192601528/pasted-text.txt`
- 附件 SHA-256：`09c4d26551eb85a133791f62dc5b12c6c1dd7b7583ffce72dc2eccdbdf25fbea`
- 本任务完整吸收附件中的目录、Manifest、README、Agent policy、Git 安全、验证、输出和 Scope Lock 要求；保存动作不授权执行。

## Development Plan

### Requirement Understanding

在 `/Volumes/Development/Workspace/Iris-assisant/iris-memory-template` 从零创建 Iris Memory Repository 的标准模板。该仓库保存长期内容、知识、项目资料、Skills、Scripts、Prompts、References 和 Identity/Personality 等 durable artifacts；D1 继续独占 Project、Milestone、Task、Resource/Capability metadata、Reminder 和其他结构化运行状态。Memory Repo 不是 D1 的 Markdown 镜像，也不是 OPC_OS 的延续结构。

交付只包含最小稳定目录、`.iris/memory.yaml`、根 `README.md`、根 `AGENTS.md`、安全导向的 `.gitignore` 和各空目录的 `.gitkeep`。不创建示例 Skill、Script、Prompt、Personality 或 Project 内容，不实现任何 Iris API、Cloud Agent、GitHub 集成、Capability Runtime、Knowledge/RAG、迁移或自动化能力。

### Evidence Summary

- Fact — 保存时目标路径 `/Volumes/Development/Workspace/Iris-assisant/iris-memory-template` 不存在。
- Fact — 父工作区 `/Volumes/Development/Workspace/Iris-assisant` 当前不是 Git repository，因此 branch、commit 和 worktree state 均不可用。
- Fact — 父工作区是现有 Iris API 工程；本任务明确禁止修改其中已有 API、D1 schema、源码、测试和文档。
- Fact — 用户提供的完整需求附件 SHA-256 为 `09c4d26551eb85a133791f62dc5b12c6c1dd7b7583ffce72dc2eccdbdf25fbea`。
- Fact — 需求指定的模板根文件只有 `README.md`、`AGENTS.md`、`.gitignore`、`.iris/memory.yaml`，以及八个持久目录中的 `.gitkeep`。
- Fact — 当前父目录不是 Git repository，因此未来在新目标目录内执行 `git init` 不构成在现有 Git repository 中嵌套初始化；执行时仍须再次预检。
- Assumption — 执行时本机 Git 可用，并已配置可用于初始 commit 的身份；若没有身份或 commit 失败，保留已初始化仓库并如实报告，不虚构成功。
- Evidence Gap — 尚未运行 YAML parser、secret scan、目录树检查或 Git clean 检查，因为本轮仅生成 task 文件。
- Conflict — none。

### Risk Gate Result

- Final Level: Level M
- Rationale: 任务会在父工作区内新增一个独立目录，并可能在该目录初始化 Git 和创建初始 commit；影响范围明确、无远程 push、无生产状态或 D1 变更，且可通过删除新目录回滚。主要风险是越界修改 Iris System Repo、误存 secrets、误复制 D1 state 或 legacy OPC_OS hierarchy。
- Sensitive-data rule: `NEVER COMMIT SECRETS` 是强制约束；模板只允许 secret names、`.env.example` 和配置说明，不允许任何 secret value。

### Scope Lock

```yaml
Scope-Lock-Version: cdf-scope/v1
in_scope:
  - 在 /Volumes/Development/Workspace/Iris-assisant/iris-memory-template 创建一个从零设计的 Iris Memory Repository 标准模板。
  - 创建 README.md、AGENTS.md、.gitignore、.iris/memory.yaml，以及 identity、projects、knowledge、skills、scripts、prompts、references、archive 八个目录及其 .gitkeep。
  - 在 README 中定义 Iris System Repo、D1 与 Iris Memory Repo 的边界、目录用途、Resource/Capability metadata 关系、OPC_OS legacy 定位和 secrets 禁令。
  - 在 AGENTS.md 中建立简洁、可执行的长期记忆仓库 policy，覆盖内容保护、去重、目录放置、secrets、可执行 memory 和 Git history。
  - 创建稳定轻量的 memory manifest，并在环境允许时初始化目标 Git repository 和创建一次初始 commit。
  - 完成目录、YAML、边界、禁用结构、secrets、示例资产和 Git 状态验证。
out_of_scope:
  - 修改 Iris System Repo、Iris API、D1 schema 或任何现有源码、测试、migration 和产品文档。
  - 迁移 OPC_OS、复制其目录结构、添加 Obsidian 配置或创建 legacy compatibility hierarchy。
  - 创建真实 Iris Memory instance、真实项目内容、正式 Personality 内容、示例 Skill、示例 Script 或大量 placeholder Markdown。
  - 实现 GitHub API、Cloud Agent、Capability Runtime、Knowledge Base、RAG、vectors、embeddings、chunks、indexes、workflows、execution 或 containers。
  - 创建 database、state、tasks、milestones、reminders 等运行状态目录或在 Git 中复制 D1 operational state。
  - 远程 repository 创建、remote 配置、push、部署、自动 commit 工具或 secrets store。
non_goals:
  - 不定义固定的 Project 子目录模板或 knowledge taxonomy。
  - 不定义 Capability type=prompt，不执行 Skill 或 Script，不实现 Personality System。
  - 不建立 D1 archived state 与 Git archive/ 的自动同步。
assumptions:
  - 目标目录在执行开始时仍不存在；若已存在，先检查并保护其中用户内容，不覆盖。
  - 父工作区在执行时仍不是 Git repository；若此事实改变，必须重新判断是否允许 git init。
  - memory.yaml 只需要 version、type 和 instance.name 三项规定内容。
stop_conditions:
  - 目标目录已存在且含有不能安全合并的内容，或发现执行会覆盖用户文件。
  - 父目录已成为 Git repository，导致在目标目录 git init 会成为嵌套仓库；停止 Git 初始化并报告，除非获得新的明确决定。
  - 完成要求必须修改 Iris API、D1 schema、父工程文件、引入真实 secrets 或扩展到任何范围外系统。
  - 需求冲突导致无法同时满足 D1 单一事实来源、Memory Repo 长期内容边界或 secrets 禁令。
will_change:
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/README.md
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/AGENTS.md
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/.gitignore
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/.iris/memory.yaml
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/{identity,projects,knowledge,skills,scripts,prompts,references,archive}/.gitkeep
  - /Volumes/Development/Workspace/Iris-assisant/iris-memory-template/.git/** 仅在执行时预检确认可安全初始化 Git 后创建
will_not_change:
  - /Volumes/Development/Workspace/Iris-assisant 中 iris-memory-template 之外的任何文件或目录。
  - memory.yaml 不加入 user id、project id、current task/milestone、API endpoint、database id、GitHub token、secret、capability state 或 runtime state。
  - 不创建 .obsidian、OPC_OS legacy hierarchy、运行状态文件、Knowledge/RAG 结构、Capability runtime 结构或示例可执行资产。
acceptance_criteria:
  - 最终目录树精确包含规定的四个根文件、.iris/memory.yaml 和八个带 .gitkeep 的持久目录，不用额外 placeholder 内容填充模板。
  - .iris/memory.yaml 是合法 YAML，version 等于数字 1、type 精确等于 iris-memory、instance.name 等于 Iris，且不含任何禁止字段或 runtime state。
  - README.md 明确定义该仓库是 Iris instance 的 long-term memory and persistent workspace，并准确区分 Iris System Repo、D1 和 Iris Memory Repo。
  - README.md 明文包含 Do not duplicate D1 operational state into this repository.，并说明 OPC_OS 是 legacy migration source 而不是 Iris Memory schema。
  - README.md 解释 identity、projects、knowledge、skills、scripts、prompts、references、archive 的用途、Project 内容灵活性、Resource/Capability metadata 注册关系和 Cloud Agent 执行边界。
  - AGENTS.md 以 Iris Memory Agent Rules 为标题，包含附件规定的十六项可执行规则，保护用户内容、避免重复、禁止 secrets，并明确 Git history 是 memory 的一部分。
  - .gitignore 至少忽略 .env、.env.*（但允许 .env.example）、*.pem、*.key、node_modules/、.DS_Store、tmp/ 和 temp/，且保持适合 Memory Repo 的小型安全规则集。
  - 仓库不包含 secrets、.obsidian、OPC_OS legacy hierarchy、D1 operational state 副本、示例 Skill/Script、正式 Personality 内容或任何范围外结构。
  - 若执行时目标目录位于非 Git 父目录且 Git 环境允许，则在目标目录完成 git init 和 chore: initialize Iris memory template 初始 commit，最终 git status clean；否则准确说明未初始化或未 commit 的原因。
  - 完成报告只包含创建的文件和目录、README 核心规范、AGENTS.md 核心规则、memory.yaml 内容、Git 初始化/commit 状态、最终目录树和待人工决定事项，然后停止。
```

### Technical Approach

- 先重新检查目标路径和父目录 Git 状态，只在目标目录仍可安全新建时继续。
- 使用最小文件集合直接建立模板；空目录仅用 `.gitkeep` 持久化，不增加示例资产或推测性 taxonomy。
- `memory.yaml` 固定为：

  ```yaml
  version: 1
  type: iris-memory

  instance:
    name: Iris
  ```

- README 以 repository boundary 为主线，明确 `D1 stores state. Git stores durable memory, content, and executable assets.`；Project state 留在 D1，Project content 放在 `projects/<project-slug>/`。
- AGENTS 使用短规则列表呈现可执行 policy，不扩写成哲学文章；Skill 和 Script 被描述为 executable memory，但实际执行权属于未来 Cloud Agent。
- `.gitignore` 只覆盖 secrets、private keys、依赖、本机噪声和临时目录；不套用大型 Node framework 模板。
- 用可用的 YAML parser 验证 manifest，并用文件/内容扫描和 Git 命令验证目录树、禁止结构、可疑 secrets 和 clean status。

### Implementation Plan

1. 预检目标路径不存在或为空、父目录 Git 状态和写入边界；若目标已有内容，停止并保护用户数据。
2. 创建 `iris-memory-template`、`.iris/` 和八个规定目录，在空目录中加入 `.gitkeep`。
3. 创建精确且轻量的 `.iris/memory.yaml` 与安全导向 `.gitignore`。
4. 编写 README，覆盖三类存储边界、目录用途、D1/Resource metadata 关系、OPC_OS legacy 定位、Cloud Agent 执行边界和 secrets 规则。
5. 编写简洁的 AGENTS policy，逐项覆盖用户指定的十六条 agent rules。
6. 验证 YAML、目录树、规定文本、禁用字段/目录、无示例资产和无明显 secret value。
7. 若父目录仍非 Git repository 且本机 Git 可用，在目标目录运行 `git init`，创建 `chore: initialize Iris memory template` 初始 commit，并验证 clean status；不配置 remote、不 push。
8. 按用户指定的八项输出格式报告实际结果，然后停止。

### Risks

- 在已有 Iris API 工作区内新建目录，路径判断错误会污染或覆盖 System Repo。通过绝对目标路径、存在性检查和严格 write scope 控制。
- 文档可能无意把 D1 状态复制进 Memory Repo。README 与 AGENTS 必须显式保持 D1 为 operational state 的唯一事实来源。
- `.gitignore` 不能证明仓库绝无 secrets；除 ignore 规则外还需扫描已创建内容，且任何检测到的 credential-like value 都阻止 commit。
- Git 初始化和 commit 依赖执行时父仓库状态与本机 identity。条件不成立时不得绕过、嵌套初始化或虚构成功。

### Rollback Plan

由于目标路径在保存时不存在，且所有计划变更都限定于新目录，未 commit 时可移除完整新目录；已创建独立初始 commit 时可先保留 Git history 供检查，再在用户明确要求回滚时移除该独立目录。不得为回滚修改或删除父工作区其他内容。

### Acceptance Criteria

1. 最终目录树精确包含规定的四个根文件、`.iris/memory.yaml` 和八个带 `.gitkeep` 的持久目录，不用额外 placeholder 内容填充模板。
2. `.iris/memory.yaml` 是合法 YAML，`version` 等于数字 `1`、`type` 精确等于 `iris-memory`、`instance.name` 等于 `Iris`，且不含任何禁止字段或 runtime state。
3. `README.md` 明确定义该仓库是 Iris instance 的 long-term memory and persistent workspace，并准确区分 Iris System Repo、D1 和 Iris Memory Repo。
4. `README.md` 明文包含 `Do not duplicate D1 operational state into this repository.`，并说明 OPC_OS 是 legacy migration source 而不是 Iris Memory schema。
5. `README.md` 解释八个内容目录的用途、Project 内容灵活性、Resource/Capability metadata 注册关系和 Cloud Agent 执行边界。
6. `AGENTS.md` 以 `Iris Memory Agent Rules` 为标题，包含附件规定的十六项可执行规则，保护用户内容、避免重复、禁止 secrets，并明确 Git history 是 memory 的一部分。
7. `.gitignore` 至少忽略 `.env`、`.env.*`（但允许 `.env.example`）、`*.pem`、`*.key`、`node_modules/`、`.DS_Store`、`tmp/` 和 `temp/`，且保持适合 Memory Repo 的小型安全规则集。
8. 仓库不包含 secrets、`.obsidian`、OPC_OS legacy hierarchy、D1 operational state 副本、示例 Skill/Script、正式 Personality 内容或任何范围外结构。
9. 若执行时目标目录位于非 Git 父目录且 Git 环境允许，则在目标目录完成 `git init` 和 `chore: initialize Iris memory template` 初始 commit，最终 `git status` clean；否则准确说明未初始化或未 commit 的原因。
10. 完成报告只包含创建的文件和目录、README 核心规范、AGENTS.md 核心规则、`memory.yaml` 内容、Git 初始化/commit 状态、最终目录树和待人工决定事项，然后停止。

### Verification Strategy

- Filesystem: 使用 `find`/`tree` 核对允许的最终目录和文件，确认八个空目录均由 `.gitkeep` 保留。
- Manifest: 使用环境中现成的 YAML parser 解析 `.iris/memory.yaml`，断言值和类型；若没有 parser，使用可安全执行的现有运行时库，不为此向模板新增依赖。
- Policy: 精确搜索 README 必需句、OPC_OS 定位、三种边界、Cloud Agent/Worker 执行边界，以及 AGENTS 的十六项规则和 secrets 禁止项。
- Negative checks: 搜索 `.obsidian`、legacy 目录、`database/state/tasks/milestones/reminders/vectors/embeddings/chunks/rag/index/workflows/execution/containers` 等禁用结构；确认没有示例 Skill/Script/Personality 内容。
- Secret safety: 检查创建文件中是否出现 token、password、private key、credential 等疑似值；只允许规则名称和说明，不允许真实值。
- Git: 若初始化，验证根路径、单一初始 commit 的 message、tracked tree 和 `git status --porcelain` 为空；不添加 remote、不 push。

### Next Action

1. Execute Now
2. Save as Task — selected and approved

## Canonical Repository Requirements

### Required final tree

```text
iris-memory-template/
├── README.md
├── AGENTS.md
├── .gitignore
├── .iris/
│   └── memory.yaml
├── identity/
│   └── .gitkeep
├── projects/
│   └── .gitkeep
├── knowledge/
│   └── .gitkeep
├── skills/
│   └── .gitkeep
├── scripts/
│   └── .gitkeep
├── prompts/
│   └── .gitkeep
├── references/
│   └── .gitkeep
└── archive/
    └── .gitkeep
```

### Storage boundary

- Iris System Repo: Worker, Dashboard, Runtime, API, Integrations。
- D1: Project/Milestone/Task state、Resource/Capability metadata、Reminder 和其他 structured runtime state。
- Iris Memory Repo: durable documents、long-form content、knowledge、project materials、skills、scripts、prompts、references、identity/personality。
- D1 stores state. Git stores durable memory, content, and executable assets.
- Database owns Project state. Git owns Project content.
- Memory Repo 通过 D1 Resource metadata 的 `repository/path` 与运行状态关联，不复制 status、current task、next action、reminder execution state、capability enabled state 或 runtime state。

### Directory rules

- `identity/`: Iris instance 的长期 identity/personality 资料；本任务不创建正式内容。
- `projects/<project-slug>/`: 天然属于单个 Project 的长期内容；内部结构保持灵活，不预建复杂模板。
- `knowledge/`: 跨 Project 可复用知识；不预建 taxonomy。
- `skills/`: 全局 Skill packages；可在未来注册为 Resource kind=directory 和 Capability type=skill，由 Cloud Agent 执行。
- `scripts/`: 确定性工具；可在未来注册为 Resource kind=file 和 Capability type=script，由 Cloud Agent 执行。
- `prompts/`: 长期 Prompt assets；当前只是 Memory Resource，不定义 Capability(type=prompt)。
- `references/`: 全局参考资料；Project 专属 reference 优先放到对应 Project 目录。
- `archive/`: 仍需保留但不适合主要结构的长期内容；不与 D1 `Project.archived_at` 自动同步。

### Mandatory agent policy

1. This repository stores long-term memory and durable artifacts.
2. Do not treat this repository as the source of truth for runtime state.
3. Do not create Markdown copies of task status, project status, reminders, current focus, or capability enabled state.
4. Preserve existing user content.
5. Prefer editing existing resources rather than silently creating duplicates.
6. Never store secrets, including API keys, access tokens, passwords, credentials, and private keys.
7. Skills and Scripts are executable memory.
8. Project documents naturally belonging to one Project go under `projects/<project-slug>/`.
9. Cross-project reusable knowledge goes under `knowledge/`.
10. Global reusable Skills go under `skills/`.
11. Deterministic executable utilities go under `scripts/`.
12. Prompts go under `prompts/`.
13. Global references go under `references/`.
14. Identity and Personality go under `identity/`.
15. Archive does not mean deletion.
16. Git history is part of Iris memory; preserve useful history and make meaningful commits when mutation is requested.

### Prohibited additions

- No `.obsidian`, OPC_OS directories, legacy compatibility hierarchy or migrated content.
- No `database/`, `state/`, `tasks/`, `milestones/` or `reminders/`.
- No `vectors/`, `embeddings/`, `chunks/`, `rag/` or `index/`.
- No `workflows/`, `capability-runtime/`, `execution/` or `containers/`.
- No real secret values, API/Cloudflare/Meta/GitHub tokens, passwords, private keys, database credentials or Cloud Agent credentials.
- No example Skill, Script, Personality, taxonomy or bulk placeholder Markdown.

## Task Definition

### TASK-001 — Create and verify Iris Memory Repository template

#### Dependencies

- None.

#### Write Scope

- Only `/Volumes/Development/Workspace/Iris-assisant/iris-memory-template/**`.
- `_cdtask/2026-09-19-iris-memory-template.md.progress.yaml` may be created by a future authorized CDF execution to record progress; this definition file is immutable after save.

#### Implementation Notes

- Follow the Development Plan and canonical requirements above without adding convenience examples or speculative structure.
- Do not touch the parent Iris API project.
- Git init and the initial commit are conditional on the execution-time preflight; never configure a remote or push.

#### Acceptance Criteria

- AC-01 through AC-10 are the ten canonical entries in `Development Plan > Acceptance Criteria`, in order.

#### Planned Verification

- V01 tree allowlist and `.gitkeep` check → AC-01.
- V02 YAML parse and exact value/type assertions → AC-02.
- V03 README definition and three-boundary review → AC-03.
- V04 exact D1 duplication sentence and OPC_OS legacy statement check → AC-04.
- V05 directory, Resource/Capability and execution-boundary coverage check → AC-05.
- V06 AGENTS heading and sixteen-rule coverage check → AC-06.
- V07 `.gitignore` pattern assertions → AC-07.
- V08 forbidden path/content and secret scan → AC-08.
- V09 conditional Git root/commit/status verification → AC-09.
- V10 final response content allowlist review → AC-10.

### Definition Status

READY

## Scope Guard

- [x] The task maps only to the approved template scope.
- [x] The source prompt was read in full and its attachment digest is recorded.
- [x] D1 operational state and durable Git content have distinct sources of truth.
- [x] OPC_OS is only a future migration source and contributes no template hierarchy.
- [x] All required files, directories, manifest values, policy rules and validation checks are represented.
- [x] All explicit prohibitions are constraints, not positive implementation scope.
- [x] The task cannot modify Iris API or any parent-workspace implementation file.
- [x] Git initialization is conditional, local-only and does not authorize remote operations.
- [x] This save performed no implementation verification and created no execution progress sidecar.

## Future CDF Execution Constraints

- Resume only through CDF and require an explicit current execution request.
- Re-run target existence and parent Git checks before any mutation.
- Treat this Scope Lock, write scope and acceptance criteria as immutable limits.
- If the target contains user content, preserve it and stop instead of overwriting.
- If the parent becomes a Git repository, do not create a nested repository without a new explicit decision.
- Record future runtime progress only in the separate `cdf-execution-progress/v1` sidecar; do not mutate this saved definition.
- Claim only checks actually run. A parser fallback, secret scan limitation, Git identity problem or skipped commit must be reported accurately.
- After the eight requested completion-report items, stop and wait for the next instruction.

## Compilation Gate Result

- Compilation Status: READY
- Task Count: 1
- Scope Guard: passed
- Implementation Verification: not performed; this result validates the saved task definition only

## Save Verification

- [x] Required CDF frontmatter and no-execution contract are present.
- [x] Requirement source and SHA-256 are recorded.
- [x] Development Plan contains requirement, evidence, risk, scope, approach, implementation, rollback, acceptance and verification sections.
- [x] One task covers all ten acceptance criteria with V01–V10 planned checks.
- [x] Write scope excludes the existing Iris API project.
- [x] No implementation directory or progress sidecar was created by Save as Task.
- [x] Source Git metadata is accurately marked unavailable.
- [x] Save-drift preflight confirmed the target directory remained absent during compilation.
- Verified At: 2026-09-19T03:03:41+08:00
