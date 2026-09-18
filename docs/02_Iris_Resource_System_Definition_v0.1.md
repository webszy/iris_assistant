# Iris System Definition — Resource

**Version:** v0.1  
**Status:** Frozen for implementation  
**Scope:** Resource model and Git-backed content integration  
**Principle:** Structured state lives in Iris DB; long-form content stays in external resources.

---

# 1. Definition

A **Resource** is a reference to a real file, directory, repository, or URL associated with an Iris Project, Milestone, or Task.

Resource does not store the actual Markdown body in Iris v0.1.

It answers:

> Where is the real content or supporting material for this Project, Milestone, or Task?

Examples:

```text
Iris Project
→ iris-api Git repository

Iris v0.1 Milestone
→ Iris-v0.1-PRD.md

Task: Implement Bearer Auth
→ auth-design.md

Novel Task: Complete Chapter 10
→ Chapter-10.md

Competitor research
→ external URL
```

---

# 2. Core Storage Boundary

Iris v0.1 separates structured operational state from content.

```text
Iris DB / D1
→ Project
→ Milestone
→ Task
→ Resource metadata

Git
→ Markdown
→ PRD
→ technical articles
→ novels
→ chapters
→ notes
→ long-form documents

R2
→ not used as the primary Markdown store in v0.1
```

The core rule is:

> **Iris manages state. Git-backed files manage content.**

---

# 3. Git-backed Markdown

Markdown files remain in a Git repository.

Obsidian is not part of the Iris architecture.

Obsidian may still be used as an editor, but Iris does not depend on it.

The architecture is:

```text
Obsidian / VS Code / GitHub Web / Iris
              ↓
          Git Repository
              ↓
           Markdown
```

The Git repository is the Source of Truth for Markdown content.

---

# 4. Why Git Is the v0.1 Markdown Store

Git already provides:

```text
version history
diff
rollback
commit history
human-readable files
portable repositories
```

Iris should not reimplement these capabilities in D1 or R2 during v0.1.

If Iris modifies a Markdown file, the change should be committed to Git.

---

# 5. Cloudflare Worker and Git

Cloudflare Worker does not need a persistent local Git working tree.

It can manage Git repositories through provider HTTP APIs.

Initial target:

```text
Cloudflare Worker
        ↓
GitHub API / GitLab API
        ↓
Git Repository
```

For GitHub, v0.1 may use:

```text
GitHub Contents API
```

to:

- read files,
- create files,
- modify files,
- delete files,
- create commits.

More complex multi-file atomic commits can be considered later through lower-level Git APIs.

This is not required for the initial Resource data model itself.

---

# 6. Resource Scope

A Resource can belong to:

```text
Project
Milestone
Task
```

The relationship is:

```text
Project
│
├── Resources
│
├── Milestone
│   ├── Resources
│   │
│   └── Task
│       └── Resources
│
└── Task
    └── Resources
```

Resource should be attached to the most specific meaningful level.

---

# 7. Project Resource

A Project Resource represents material that applies broadly to the whole Project.

Example:

```text
Project:
Iris

Resources:
- iris-api Git repository
- Iris project root directory
- AGENTS.md
```

Another example:

```text
Project:
Novel A

Resource:
09_小说创作/Novel-A/
```

---

# 8. Milestone Resource

A Milestone Resource represents material specific to one phase or version.

Example:

```text
Project:
Iris

Milestone:
v0.1

Resource:
Iris-v0.1-PRD.md
```

Then:

```text
Milestone:
v0.5

Resource:
Iris-v0.5-PRD.md
```

This avoids forcing a Project to have only one PRD.

Each Milestone can own the specification relevant to that phase.

---

# 9. Task Resource

A Task Resource represents material directly used or produced by a Task.

Example:

```text
Project:
Iris

Milestone:
v0.1

Task:
Implement Bearer Auth

Resource:
auth-design.md
```

Another example:

```text
Project:
Novel A

Milestone:
Volume 1

Task:
Complete Chapter 10

Resource:
Chapter-10.md
```

In this model:

```text
Task.status = doing
```

means the work is in progress.

The chapter body itself remains in:

```text
Chapter-10.md
```

When the chapter is complete:

```text
Task.status = completed
```

The Markdown file does not need to move or be duplicated.

---

# 10. Resource Role

Resource should include a lightweight `role` field.

v0.1 values:

```text
context
spec
artifact
reference
```

## `context`

Background material needed to understand the surrounding work.

Example:

```text
AGENTS.md
PROJECT_CONTEXT.md
```

## `spec`

A specification or definition document.

Example:

```text
Iris-v0.1-PRD.md
API-design.md
```

## `artifact`

The output being produced or maintained.

Example:

```text
Chapter-10.md
technical-article.md
release-notes.md
```

## `reference`

Supporting material used as external reference.

Example:

```text
competitor URL
API documentation URL
GitHub repository
```

---

# 11. Resource Kind

Resource should also contain a lightweight `kind`.

v0.1 values:

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
= directory inside a repository or mounted file system

file
= a specific file

url
= external web resource
```

---

# 12. Resource Model

Recommended v0.1 model:

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

---

# 13. Field Definitions

## `id`

Stable unique identifier.

Recommended:

```text
UUID v4
```

## `user_id`

Owner of the Resource.

Required for tenant isolation.

## `project_id`

Required.

Every Resource must belong to a Project.

This follows the global Iris rule:

> **Everything lives in a Project.**

## `milestone_id`

Optional.

Used when the Resource belongs specifically to a Milestone.

## `task_id`

Optional.

Used when the Resource belongs specifically to a Task.

## `name`

Human-readable name.

Examples:

```text
Iris v0.1 PRD
Iris API Repository
Chapter 10
Meta Ads Reference
```

## `kind`

One of:

```text
repository
directory
file
url
```

## `role`

One of:

```text
context
spec
artifact
reference
```

## `repository`

Optional repository identifier.

Examples:

```text
OPC_OS
iris-api
owner/repo
```

The exact repository representation can be finalized with the Git provider integration.

## `path`

Optional path inside the repository.

Examples:

```text
01_想法/24-tech-Iris/PRD/Iris-v0.1.md
09_小说创作/Novel-A/正文/Chapter-10.md
docs/auth-design.md
```

## `url`

Optional external URL.

Used primarily for `kind = url`.

## `created_at`

Resource record creation time.

## `updated_at`

Resource metadata update time.

It does not represent the Git file modification time.

---

# 14. Ownership Rule

A Resource should have one clear most-specific owner level.

Recommended v0.1 rule:

## Project Resource

```text
project_id = required
milestone_id = null
task_id = null
```

## Milestone Resource

```text
project_id = required
milestone_id = required
task_id = null
```

## Task Resource

```text
project_id = required
task_id = required
milestone_id = null
```

Task already knows its Milestone.

Therefore Task Resource does not need to repeat `milestone_id`.

This avoids duplicate relationship state.

---

# 15. No Many-to-Many Resource Graph in v0.1

v0.1 does not support a Resource directly belonging to multiple Projects, Milestones, or Tasks through a generic many-to-many graph.

If a Resource is broadly relevant:

> attach it to the Project.

If it belongs to a phase:

> attach it to the Milestone.

If it belongs to a concrete action:

> attach it to the Task.

This keeps the model understandable and deterministic.

---

# 16. Context Inheritance

When Iris works on a Task, relevant context can be assembled from higher levels.

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
Resource:
- project root
- AGENTS.md

Milestone: v0.1
Resource:
- Iris-v0.1-PRD.md

Task: Implement Bearer Auth
Resource:
- auth-design.md
```

Iris can use all three layers when operating on the Task.

Context inheritance is a retrieval rule.

It does not require copying Resource records between levels.

---

# 17. PRD Example

```text
Project:
Iris

Milestone:
v0.1

Resource:
name = Iris v0.1 PRD
kind = file
role = spec
repository = OPC_OS
path = .../Iris-v0.1-PRD.md
```

Later:

```text
Milestone:
v0.5

Resource:
name = Iris v0.5 PRD
kind = file
role = spec
repository = OPC_OS
path = .../Iris-v0.5-PRD.md
```

This allows each phase to have its own PRD without creating ambiguity about the Project-level PRD.

---

# 18. Novel Example

```text
Project:
Novel A

Milestone:
Volume 1

Task:
Complete Chapter 10

Resource:
name = Chapter 10
kind = file
role = artifact
repository = OPC_OS
path = 09_小说创作/Novel-A/正文/Chapter-10.md
```

The Task tracks execution state.

The Markdown file stores the actual chapter.

---

# 19. Technical Article Example

```text
Project:
Technical Writing

Task:
Write Hono + Cloudflare Worker article

Resource:
name = Hono Worker Article
kind = file
role = artifact
repository = OPC_OS
path = 08_个人创作/技术文章/hono-worker.md
```

Again:

```text
Iris DB
→ tracks the work

Git
→ stores the content
```

---

# 20. Source of Truth Rules

v0.1 must avoid duplicated truth.

| Data | Source of Truth |
|---|---|
| Project identity/status | Iris DB |
| Milestone identity/status | Iris DB |
| Task identity/status | Iris DB |
| Resource metadata | Iris DB |
| PRD body | Git / Markdown |
| Novel body | Git / Markdown |
| Technical article body | Git / Markdown |
| Long-form notes | Git / Markdown |
| File version history | Git |
| File diff / rollback | Git |

Iris must not store full Markdown bodies in D1 during v0.1.

---

# 21. File Changes

When Iris later gains file mutation capability:

```text
Iris
↓
Resource
↓
repository + path
↓
Git provider API
↓
read / modify / create / delete
↓
commit
```

The Resource record points to the file.

The Git commit history records the actual content changes.

---

# 22. R2 Boundary

R2 is not the primary store for Markdown in v0.1.

Potential future R2 use cases include:

```text
images
PDFs
audio
video
large attachments
generated binary files
```

But this is outside the current Resource implementation scope.

---

# 23. v0.1 Explicit Non-Goals

Resource v0.1 does not include:

```text
Embedding
Vector Database
RAG
Chunking
Full-text knowledge ingestion
Automatic tagging
Knowledge Graph
Automatic Markdown synchronization into D1
Document version tables
Generic many-to-many resource graph
Complex file permission system
R2 Markdown migration
```

These belong to future Knowledge Base work if real usage requires them.

---

# 24. Core System Relationship

The resulting Iris project system is:

```text
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
```

Definitions:

```text
Project
= long-term context

Milestone
= stage

Task
= executable action

Resource
= real material associated with the context, stage, or action
```

---

# 25. Final Principle

The v0.1 Resource model follows two core rules:

> **Everything lives in a Project.**

and

> **Iris stores operational state; Git stores long-form content.**

This allows Iris to manage PRDs, technical articles, novels, chapters, project context, and other Markdown assets without duplicating their content into the database or depending on Obsidian.
