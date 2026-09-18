# Iris System Definition — Project / Task / Resource / Capability

**Version:** v0.1  
**Status:** Frozen baseline for implementation  
**Scope:** Iris core project/context model and executable capability model

---

# 1. System Principle

Iris follows one central rule:

> **Everything lives in a Project.**

This does **not** mean every action becomes a Project.

It means all durable operational state, content references, and executable capabilities must belong to a Project context.

The core concepts are:

```text
Project
= long-lived context

Task
= concrete executable work

Resource
= real material, file, repository, directory, or URL

Capability
= an executable ability Iris can invoke
```

Milestone remains an optional intermediate planning layer between Project and Task. Its definition is unchanged and is not redefined in this document.

Conceptually:

```text
Project
│
├── Task
├── Resource
├── Capability
└── Milestone (optional)
     └── Task
```

---

# 2. Physical Architecture

The current Iris architecture is:

```text
Iris
=
Cloudflare Worker
+
D1
+
One Git Repository
+
Cloud Agent
```

Expanded:

```text
Interface
Grok Bot / Other UI
        ↓
Cloudflare Worker
Control Plane
        ↓
D1
Structured State

One Git Repository
Persistent Workspace
        ↓
Cloud Agent
Execution Plane
```

Responsibilities:

```text
Worker + D1
= authentication, state, routing, scheduling, orchestration

Git Repository
= Markdown, PRDs, novels, articles, scripts, skills, prompts, references

Cloud Agent
= read, write, execute, modify, commit, push
```

The Worker must not become a general-purpose arbitrary code runtime.

---

# 3. Source of Truth Boundary

Iris separates structured operational state from real content.

## D1 is the Source of Truth for:

```text
Project
Task
Resource metadata
Capability metadata
Milestone state
Reminder state
Rule state
other structured operational state
```

## Git is the Source of Truth for:

```text
PRD bodies
Markdown notes
novels
chapters
technical articles
scripts
skills
prompts
references
project context files
other long-form text/code assets
```

Core rule:

> **Iris DB stores state; Git stores working content and executable assets.**

Iris v0.1 does not copy full Markdown bodies into D1.

---

# 4. Project

## 4.1 Definition

A **Project** is a long-lived context container with a stable identity and lifecycle.

A Project represents something Iris should recognize as an independent ongoing context.

Examples:

```text
Iris
DeepUsername
Meta Ads
Daily Weather
Weight Loss
Novel A
Technical Writing
CodeToken Operations
```

A single temporary action should normally be a Task inside an existing Project.

Example:

```text
Buy milk
→ Task inside Personal Project
```

not:

```text
Buy Milk Project
```

## 4.2 Project Responsibility

Project answers:

> What long-running thing does this work belong to?

Project stores stable identity and lifecycle.

Project does not directly store transient execution state such as:

```text
current_focus
next_action
progress
current_task
last_completed_task
```

These values should be derived from Task and Milestone state.

## 4.3 Project Model

```text
projects

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
```

## 4.4 Field Definitions

### `id`

Stable unique identifier.

Recommended:

```text
UUID v4
```

### `user_id`

Owner of the Project.

Required.

The authenticated user determines ownership.

Clients must never choose another `user_id`.

### `name`

Human-readable name.

Examples:

```text
Iris
DeepUsername
Meta Ads
Novel A
```

### `slug`

Stable machine-friendly identifier.

Examples:

```text
iris
deepusername
meta-ads
novel-a
```

Recommended constraint:

```text
UNIQUE(user_id, slug)
```

### `description`

Short explanation of the Project.

It is not a PRD and not a long-form content field.

### `kind`

Descriptive Project category.

v0.1 values:

```text
product
operation
automation
personal
content
other
```

Examples:

```text
DeepUsername → product
Meta Ads → operation
Daily Weather → automation
Weight Loss → personal
Novel A → content
```

`kind` must not introduce different business logic in v0.1.

### `status`

Project lifecycle.

v0.1:

```text
planned
active
paused
completed
```

Meaning:

```text
planned
= Project exists but work has not meaningfully started

active
= Project is currently active

paused
= Project remains valid but work is intentionally suspended

completed
= The Project itself has reached its final objective
```

A Project may remain active for years.

Completing a version or Milestone does not automatically complete the Project.

### `archived_at`

Archive is separate from lifecycle status.

```text
archived_at = null
→ visible in normal working context

archived_at != null
→ hidden from normal working context
```

Archive means:

> Keep the history, remove it from normal active views.

Do not create:

```text
status = archived
```

---

# 5. Task

## 5.1 Definition

A **Task** is a concrete unit of executable work inside a Project.

Examples:

```text
Implement Bearer Auth
Write Chapter 10
Prepare Meta Ads creative
Deploy Worker
Buy milk
```

Task answers:

> What specific thing needs to be done?

## 5.2 Task Responsibility

Task is the execution state of Iris.

```text
Project
= context

Task
= action
```

Task should not store long-form output itself.

If a Task creates or modifies a real file, that file is represented through Resource.

## 5.3 Task Model

```text
tasks

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
```

## 5.4 Field Definitions

### `id`

Recommended:

```text
UUID v4
```

### `user_id`

Required.

Owner of the Task.

### `project_id`

Required.

Every Task must belong to a Project.

This enforces:

> **Everything lives in a Project.**

### `milestone_id`

Optional.

A Task may belong to a Milestone, but it is not required.

This allows:

```text
Project → Task
```

and:

```text
Project → Milestone → Task
```

If `milestone_id` is present:

```text
milestone.user_id == task.user_id
milestone.project_id == task.project_id
```

must be validated.

### `title`

Short executable action.

Good:

```text
Implement Bearer Auth middleware
Write Chapter 10
```

Avoid vague titles such as:

```text
Do auth stuff
Handle novel
```

### `description`

Optional execution context.

Use only when the title is insufficient.

### `status`

v0.1:

```text
todo
doing
completed
cancelled
```

Meaning:

```text
todo
= planned but not started

doing
= currently being worked on

completed
= finished successfully

cancelled
= intentionally abandoned
```

v0.1 intentionally excludes:

```text
blocked
waiting
review
```

### `position`

Explicit execution ordering.

Recommended:

```text
100
200
300
```

This allows insertion without renumbering all Tasks.

For a Milestone Task, position is scoped within the Milestone.

For a Project-level Task, position is scoped among Project-level Tasks.

### `completed_at`

Explicit Task completion time.

When:

```text
non-completed → completed
```

set:

```text
completed_at = now
```

When:

```text
completed → todo / doing / cancelled
```

set:

```text
completed_at = null
```

Editing title or description of an already completed Task must not change `completed_at`.

---

# 6. Derived Task State

Iris should derive transient Project state from Tasks.

## Current Work

```text
Task.status = doing
```

Multiple `doing` Tasks are allowed.

## Next Action

Conceptually:

```text
Task.status = todo
ORDER BY position
```

Do not store:

```text
project.next_action
```

## Recent Progress

```text
Task.status = completed
ORDER BY completed_at DESC
```

Do not store duplicate summary fields if the same truth can be derived.

---

# 7. Resource

## 7.1 Definition

A **Resource** is a reference to real material associated with a Project, Milestone, or Task.

Resource answers:

> Where is the actual file, directory, repository, or external material?

Examples:

```text
Iris PRD
Novel Chapter 10
technical article
Git repository
project directory
external API documentation URL
script file
Skill directory
```

Resource stores metadata only.

The actual content remains outside D1.

## 7.2 Resource Responsibility

Resource does not mean only reference material.

It may represent:

```text
context
specification
artifact
reference
executable file
Skill package
repository
directory
```

Resource tells Iris:

> What exists, and where is it?

It does not by itself mean:

> Iris is allowed or able to execute it.

Execution is represented by Capability.

## 7.3 Resource Model

```text
resources

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
```

## 7.4 Resource Scope

A Resource belongs to one clear most-specific scope.

### Project Resource

```text
project_id = required
milestone_id = null
task_id = null
```

### Milestone Resource

```text
project_id = required
milestone_id = required
task_id = null
```

### Task Resource

```text
project_id = required
milestone_id = null
task_id = required
```

Task already knows its Milestone.

Therefore Task Resource does not repeat `milestone_id`.

Forbidden:

```text
milestone_id != null
AND
task_id != null
```

## 7.5 Resource `kind`

v0.1:

```text
repository
directory
file
url
```

Meaning:

```text
repository
= Git repository

directory
= directory inside the repository/workspace

file
= specific file

url
= external web resource
```

## 7.6 Resource `role`

v0.1:

```text
context
spec
artifact
reference
```

### `context`

Background material required to understand the work.

Examples:

```text
AGENTS.md
PROJECT_CONTEXT.md
DEV_CONTEXT.md
```

### `spec`

Specification or formal definition.

Examples:

```text
PRD
architecture document
API design
```

### `artifact`

Output being created or maintained.

Examples:

```text
Novel Chapter 10
technical article
release notes
generated report
script implementation
Skill package
```

### `reference`

Supporting external material.

Examples:

```text
competitor website
API documentation
reference repository
research URL
```

## 7.7 Resource Location Rules

### `kind = repository`

Requires:

```text
repository != null
```

### `kind = directory`

Requires:

```text
repository != null
path != null
```

### `kind = file`

Requires:

```text
repository != null
path != null
```

### `kind = url`

Requires:

```text
url != null
```

The exact repository identifier format can be finalized with Git provider integration.

Examples:

```text
repository = OPC_OS

path = projects/iris/PRD/Iris-v0.1.md
```

or:

```text
repository = owner/repo
```

---

# 8. Resource Context Inheritance

When Iris works on a Task, relevant Resource context may be assembled from higher levels.

Conceptually:

```text
Project Resources
        +
Milestone Resources
        +
Task Resources
```

Example:

```text
Project: Iris
Resources:
- AGENTS.md
- iris-api repository

Milestone: v0.1
Resources:
- Iris-v0.1-PRD.md

Task: Implement Bearer Auth
Resources:
- auth-design.md
```

Iris can use all relevant layers when performing the Task.

This is retrieval behavior.

It does not duplicate Resource records.

---

# 9. Git-backed Resources

Markdown, scripts, and Skills live in the Git repository.

Obsidian is not part of the Iris architecture.

Obsidian may still be used as an editor, but Iris only cares about:

```text
repository
path
file
directory
```

The repository is the persistent workspace.

Example:

```text
repo/
├── projects/
├── docs/
├── novels/
├── articles/
├── skills/
├── scripts/
├── prompts/
├── references/
└── context/
```

The exact folder layout is not part of the database schema.

---

# 10. Capability

## 10.1 Definition

A **Capability** is an executable ability that Iris can invoke.

Capability answers:

> What can Iris actually do?

Examples:

```text
Fetch Weather
Check Provider Health
Generate Daily Report
Project Secretary Skill
Novel Consistency Checker
```

A Capability may point to a Resource stored in the Git repository.

## 10.2 Resource vs Capability

These concepts must remain separate.

```text
Resource
= the thing exists somewhere

Capability
= Iris can execute an ability using that thing
```

Example:

```text
Resource:
scripts/check-provider.ts
```

does not automatically mean:

```text
Capability:
Check Provider Health
```

The executable relationship must be explicit.

This prevents every script-like file from automatically becoming executable by Iris.

---

# 11. Capability Model

Recommended v0.1 model:

```text
capabilities

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
```

## 11.1 Field Definitions

### `id`

Recommended:

```text
UUID v4
```

### `user_id`

Required.

Owner of the Capability.

### `project_id`

Required.

Every Capability belongs to a Project.

This follows:

> **Everything lives in a Project.**

### `name`

Human-readable capability name.

Examples:

```text
Check Provider Health
Project Secretary
Novel Consistency Checker
Fetch Weather
```

### `description`

Short explanation of what the Capability does.

### `type`

Initial v0.1 values:

```text
script
skill
```

Keep this intentionally narrow.

Future types may include:

```text
http
workflow
tool
```

but should not be added until required.

### `resource_id`

Required.

A Capability cannot exist without a Resource.

Reason:

```text
script / skill
must live in One Git Repository
and must be registered as a Resource first
```

Therefore:

```text
capabilities.resource_id
= NOT NULL
```

Typical usage:

```text
script
→ file Resource

skill
→ directory Resource
```

Examples:

```text
Capability:
Check Provider Health

type:
script

resource:
scripts/check-provider.ts
```

or:

```text
Capability:
Project Secretary

type:
skill

resource:
skills/project-secretary/
```

Because `resource_id` is required, the following must always be validated:

```text
resource.user_id == capability.user_id
resource.project_id == capability.project_id
```

A Capability must never reference a Resource from another Project or another user.

The relationship is 1:N in the database:

```text
Project 1:N Capability
Resource 1:N Capability
```

`resource_id` is intentionally **not** unique: one Skill directory may later expose
several Capabilities such as Research, Summarize and Generate Report.

### Capability / Resource integrity protection

Because the reference is required, both directions must be protected:

```text
Resource delete
-> rejected while any Capability references it
   (including disabled Capabilities)
-> 409 RESOURCE_IN_USE
-> foreign key must not CASCADE

Resource.kind change
-> rejected when it would break a referencing Capability
   (script needs file, skill needs directory)
-> 422 INVALID_CAPABILITY_RESOURCE_KIND
-> record must stay unchanged
```

### `enabled`

Boolean.

Meaning:

```text
true
= Iris may use this Capability

false
= Capability remains registered but must not be invoked
```

Default:

```text
true
```

### `created_at`

Creation time.

### `updated_at`

Metadata update time.

---

# 12. Capability Type Semantics

## `script`

Points to an executable script or program inside the Git workspace.

Example:

```text
Resource:
kind = file
path = scripts/check-provider.ts

Capability:
type = script
```

The Worker does not execute the script directly.

The Cloud Agent does.

## `skill`

Points to a Skill package in the Git workspace.

Example:

```text
skills/project-secretary/
├── SKILL.md
├── references/
└── scripts/
```

Resource:

```text
kind = directory
path = skills/project-secretary/
```

Capability:

```text
type = skill
```

The Cloud Agent reads the Skill definition and follows it.

The Worker only orchestrates invocation.

---

# 13. Capability Execution Boundary

The Worker is the control plane.

The Cloud Agent is the execution plane.

Execution flow:

```text
User / Grok Bot
        ↓
Worker
        ↓
Identify Project
        ↓
Identify Capability
        ↓
Resolve Resource
        ↓
Invoke Cloud Agent
        ↓
Agent syncs / checks out repo
        ↓
Agent reads Skill or Script
        ↓
Agent executes
        ↓
Agent returns result
        ↓
Worker updates structured state if needed
```

If execution changes repository content:

```text
Cloud Agent
↓
modify file
↓
git diff
↓
commit
↓
push
```

The Worker must not become an arbitrary shell runtime.

---

# 14. Capability Does Not Store Runtime Complexity Yet

v0.1 should not immediately add:

```text
runtime
entrypoint
input_schema
output_schema
permissions
timeout
memory_limit
container_image
dependency graph
execution policy
```

These belong to the future Capability Runtime design.

In v0.1:

```text
Capability
→ tells Iris that the ability exists

Resource
→ tells Iris where its implementation lives

Cloud Agent
→ determines how to execute it
```

This keeps the model minimal.

---

# 15. Example — Iris Project

```text
Project:
Iris
status = active
kind = product
```

Project Resources:

```text
- Iris project directory
- AGENTS.md
- iris-api repository
```

Tasks:

```text
- Implement Project Core
- Implement Capability Registry
- Implement Reminder
```

Capability:

```text
name = Project Secretary
type = skill
resource = skills/project-secretary/
enabled = true
```

---

# 16. Example — Novel

```text
Project:
Novel A
kind = content
```

Task:

```text
Write Chapter 10
status = doing
```

Task Resource:

```text
name = Chapter 10
kind = file
role = artifact
path = novels/novel-a/chapter-10.md
```

Project Resource:

```text
Character Bible
role = context
```

Capability:

```text
name = Check Character Consistency
type = script
resource = scripts/check-character-consistency.py
```

Execution:

```text
Task Resource
Chapter 10
+
Project Capability
Character Consistency Checker
↓
Cloud Agent
↓
result
```

---

# 17. Example — Daily Weather

```text
Project:
Daily Weather
kind = automation
```

Resource:

```text
skills/weather-assistant/
```

Capability:

```text
name = Weather Assistant
type = skill
resource = skills/weather-assistant/
```

Another Resource:

```text
scripts/fetch-weather.ts
```

Another Capability:

```text
name = Fetch Weather
type = script
resource = scripts/fetch-weather.ts
```

Rules and Weather Context can later be attached to the same Project without changing Project / Resource / Capability semantics.

---

# 18. Example — CodeToken Operations

```text
Project:
CodeToken Operations
kind = operation
```

Task:

```text
Check upstream provider stability
```

Resource:

```text
scripts/check-provider.ts
```

Capability:

```text
name = Check Provider Health
type = script
resource = scripts/check-provider.ts
```

Iris flow:

```text
Task
↓
Capability
↓
Resource
↓
Cloud Agent
↓
execution result
```

---

# 19. Relationship Rules

## Project → Task

```text
1 : N
```

Every Task belongs to exactly one Project.

## Project → Resource

```text
1 : N
```

Every Resource belongs to exactly one Project.

## Project → Capability

```text
1 : N
```

Every Capability belongs to exactly one Project.

## Task → Resource

A Task may have zero or many Resources.

## Capability → Resource

A Capability may reference one Resource in v0.1.

This is sufficient for:

```text
script → file
skill → directory
```

If future usage proves that one Capability needs several implementation Resources, the model can be expanded later.

---

# 20. Tenant Isolation

All entities must be user-scoped.

Required:

```text
projects.user_id
tasks.user_id
resources.user_id
capabilities.user_id
```

All API queries must include authenticated user isolation.

Conceptually:

```text
WHERE id = ?
AND user_id = authenticatedUser.id
```

Cross-user access must return:

```text
404
```

not:

```text
403
```

to avoid leaking resource existence.

Relationship validation must ensure:

```text
task.project_id belongs to same user

resource.project_id belongs to same user

capability.project_id belongs to same user

capability.resource_id:
    resource.project_id == capability.project_id
    resource.user_id == capability.user_id
```

---

# 21. Secrets Boundary

Secrets must never be stored in the Git repository.

Examples:

```text
GitHub Token
Weather API Key
Meta Token
Database credentials
Cloud Agent credentials
```

Secrets belong in:

```text
Cloudflare Worker Secrets
Cloud Agent Secret Store
```

The repository may contain:

```text
.env.example
configuration schema
secret names
documentation
```

but never real secret values.

---

# 22. Delete Semantics

## Project

Normal operations should prefer:

```text
pause
complete
archive
```

No routine hard delete in v0.1.

## Task

Use:

```text
cancelled
```

instead of hard delete for normal history preservation.

## Resource

Resource metadata may be deleted **only while no Capability references it**.

Any reference blocks deletion, including a disabled Capability:

```text
409 RESOURCE_IN_USE
```

The foreign key from `capabilities.resource_id` must not CASCADE.

Deleting a Resource record must **not** automatically delete the actual Git file in v0.1.

## Capability

A Capability should normally be disabled first:

```text
enabled = false
```

Hard deletion may be allowed later, but the safer default is to preserve historical capability metadata.

---

# 23. Explicit Non-Goals for v0.1

Do not add the following into this core model yet:

```text
RAG
Embedding
Vector Database
Knowledge Graph
Full Markdown ingestion into D1
Generic many-to-many Resource graph
Automatic script discovery
Automatic Skill discovery
Arbitrary Worker-side code execution
Capability runtime policy engine
Container orchestration
Dependency management
Permission graph
Workflow engine
Subtasks
Task dependencies
Task priority
Task deadline
Kanban model
```

These may be added only after real Iris usage demonstrates a need.

---

# 24. Core Design Summary

The current Iris core model is:

```text
Project
= where the long-running context lives

Task
= what needs to be done

Resource
= where the real material lives

Capability
= what Iris can execute
```

Physical architecture:

```text
Worker + D1
= Control Plane

One Git Repo
= Persistent Workspace

Cloud Agent
= Execution Plane
```

The central separation is:

```text
State
→ D1

Content / Code / Skills
→ Git

Execution
→ Cloud Agent
```

This gives Iris a stable foundation without coupling content storage, execution runtime, and structured project state into one system.
