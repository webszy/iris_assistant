# Iris System Definition — Project / Milestone / Task

**Version:** v0.1  
**Status:** Frozen for implementation  
**Scope:** Iris core project execution model  
**Principle:** Everything lives in a Project.

---

## 1. Core Concept

Iris uses a three-level execution model:

```text
Project
  ↓
Milestone (optional)
  ↓
Task
```

The three concepts have clearly separated responsibilities:

```text
Project
= What is this long-term context?

Milestone
= What stage or phase is this Project currently moving through?

Task
= What concrete action needs to be executed?
```

The model is intentionally minimal.

Iris should derive current progress from Milestones and Tasks instead of duplicating transient state such as `current_focus`, `next_action`, or `progress` on the Project itself.

---

# 2. Project

## 2.1 Definition

A **Project** is a persistent context container inside Iris.

Project does not mean only a software project or product-development project.

Examples:

```text
DeepUsername → Project
Meta Ads → Project
Daily Weather → Project
Iris → Project
Weight Loss → Project
Family Trip → Project
```

A Project should exist when something has:

- a persistent context,
- an ongoing lifecycle,
- future Tasks or Decisions,
- enough continuity that Iris should recognize it independently.

A single action does not automatically become a Project.

```text
Buy milk → Task / Reminder
Daily Weather → Project
```

Therefore the internal principle is:

> **Everything lives in a Project.**

Not:

> Everything becomes a Project.

## 2.2 Project Responsibility

Project stores stable identity and lifecycle information.

It answers:

> What is this thing?

It should not directly store:

- current focus,
- next action,
- progress percentage,
- current task,
- last completed task.

Those values should be derived from Task and Milestone data.

## 2.3 Project Model

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

### `id`

Stable unique identifier.

Recommended v0.1 implementation:

```text
UUID v4
```

### `user_id`

Owner of the Project.

All Project queries must respect authenticated user isolation.

### `name`

Human-readable Project name.

Examples:

```text
Iris
DeepUsername
Meta Ads
Daily Weather
```

### `slug`

Stable machine-friendly identifier.

Examples:

```text
iris
deepusername
meta-ads
daily-weather
```

Recommended constraint:

```text
UNIQUE(user_id, slug)
```

### `description`

Short explanation of what the Project is.

It is not a PRD or long-form document.

### `kind`

Describes the nature of the Project.

Initial v0.1 values:

```text
product
operation
automation
personal
content
other
```

`kind` is descriptive and must not create different business rules for different Project types in v0.1.

### `status`

General Project lifecycle state.

v0.1 values:

```text
planned
active
paused
completed
```

Meaning:

```text
planned
= Project exists but active work has not started.

active
= Project is currently active.

paused
= Project still exists but work is intentionally suspended.

completed
= The Project itself has reached its final objective.
```

Long-running Projects may remain `active` for years.

Example:

```text
Iris v0.1 completed
≠
Iris Project completed
```

### `archived_at`

Archiving is separate from Project status.

```text
archived_at = null
→ Project appears in normal Project views.

archived_at != null
→ Project is hidden from normal working views unless explicitly requested.
```

Archive means:

> Keep the history, but remove it from normal working context.

It does not mean completed.

## 2.4 Project Delete Semantics

Normal Iris operations should prefer:

```text
pause
complete
archive
```

instead of hard deletion.

Hard delete is destructive and should not be a normal Agent operation in v0.1.

---

# 3. Milestone

## 3.1 Definition

A **Milestone** is a meaningful stage or phase inside a Project.

It exists to organize Tasks around a concrete phase goal.

Examples:

```text
Iris
├── v0.1
├── v0.5
└── v1.0
```

```text
Meta Ads
├── September Creative Test
├── National Day Campaign
└── US Market Expansion
```

```text
Weight Loss
├── 130kg → 120kg
├── 120kg → 110kg
└── Maintenance
```

Milestones are optional.

A simple Project may have no Milestones.

## 3.2 Milestone Responsibility

Milestone answers:

> Which stage of this Project are we working through?

It is not a Project and not a Task.

## 3.3 Milestone Model

```text
milestones

id
user_id
project_id

name
description

status
position

created_at
updated_at
```

### `id`

Stable unique identifier.

Recommended:

```text
UUID v4
```

### `user_id`

Owner of the Milestone.

Stored explicitly for clear tenant isolation.

### `project_id`

Required.

A Milestone cannot exist outside a Project.

### `name`

Stage name.

Examples:

```text
v0.1
v0.5
v1.0
September Creative Test
130kg → 120kg
```

### `description`

Short statement of the phase objective.

It is not a replacement for a PRD.

### `status`

v0.1 values:

```text
planned
active
completed
cancelled
```

Meaning:

```text
planned
= Defined but not started.

active
= Currently being worked on.

completed
= Milestone objective has been achieved.

cancelled
= Previously planned but intentionally abandoned.
```

Multiple Milestones inside the same Project may be `active` simultaneously.

Iris must not enforce a single-current-Milestone rule.

### `position`

Defines planned Milestone ordering.

Recommended convention:

```text
100
200
300
```

This allows future insertion:

```text
100
150
200
```

Do not infer Milestone order from `created_at`.

## 3.4 No Deadline in v0.1

Milestone does not include:

```text
deadline
due_at
target_at
```

in v0.1.

A Milestone represents a stage, not necessarily a date-bound commitment.

## 3.5 Completion Time

v0.1 does not require a separate `completed_at` field for Milestone.

When Milestone state changes to `completed`, `updated_at` may be used as the practical completion timestamp in the initial implementation.

## 3.6 Milestone Completion Rule

Milestone completion must not be automatically inferred from Task completion.

Even if all current Tasks are completed, Iris may suggest that the Milestone looks ready to complete, but should not automatically change the Milestone status.

Milestone completion is a higher-level business decision.

---

# 4. Task

## 4.1 Definition

A **Task** is a concrete executable action inside a Project.

Examples:

```text
Create Hono project
Configure Drizzle + D1
Implement Bearer Auth
Deploy Worker
Prepare Meta Ads creative
Buy milk
```

Task answers:

> What specifically needs to be done?

## 4.2 Task Responsibility

Task is the execution layer of Iris.

```text
Project
= stable context

Milestone
= stage

Task
= execution
```

## 4.3 Task Model

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

### `id`

Stable unique identifier.

Recommended:

```text
UUID v4
```

### `user_id`

Task owner.

Required.

### `project_id`

Required.

A Task must belong to a Project.

This directly implements:

> Everything lives in a Project.

### `milestone_id`

Optional.

A Task may belong directly to a Project without belonging to a Milestone.

Example:

```text
Project: Iris
Task: Replace Iris icon
milestone_id = null
```

### `title`

Short executable action.

Good:

```text
Implement Bearer Auth middleware
```

Avoid vague titles:

```text
Auth stuff
```

### `description`

Optional detailed context.

Use only when the title is not sufficient.

### `status`

v0.1 values:

```text
todo
doing
completed
cancelled
```

Meaning:

```text
todo
= Planned but not started.

doing
= Currently being worked on.

completed
= Successfully finished.

cancelled
= Previously planned but intentionally no longer needed.
```

v0.1 intentionally does not include:

```text
blocked
waiting
review
```

### `position`

Defines execution order within the relevant Project/Milestone context.

Recommended convention:

```text
100
200
300
```

### `completed_at`

Task should store an explicit completion time.

Reason:

Task history will naturally support queries such as:

```text
What did I finish today?
What did I complete yesterday?
What tasks were completed this month?
```

`updated_at` cannot safely answer these questions because completed Tasks may later be edited.

When Task becomes:

```text
status = completed
```

set:

```text
completed_at = now
```

If a completed Task is reopened, `completed_at` should be cleared.

---

# 5. Derived Project State

Iris should avoid storing duplicate transient state.

## 5.1 Current Work

Derived from:

```text
Task status = doing
```

There may be multiple `doing` Tasks.

## 5.2 Next Action

Derived from:

```text
status = todo
ORDER BY position
```

No separate `projects.next_action` field is needed.

## 5.3 Recent Progress

Derived from:

```text
status = completed
ORDER BY completed_at DESC
```

## 5.4 Current Milestone

Do not store:

```text
project.current_milestone_id
```

in v0.1.

Instead query:

```text
milestone.status = active
```

Multiple active Milestones are allowed.

---

# 6. Example — Iris

```text
Project
Iris
status = active

├── Milestone: v0.1
│   status = active
│
│   ├── [completed] Create Hono project
│   ├── [completed] Configure Drizzle + D1
│   ├── [doing] Implement Bearer Auth
│   ├── [todo] Create Protected Test Route
│   ├── [todo] Generate OpenAPI
│   └── [todo] Deploy Worker
│
├── Milestone: v0.5
│   status = planned
│
└── Milestone: v1.0
    status = planned
```

Iris can derive:

```text
Project:
Iris

Current Milestone:
v0.1

Recent Completed:
Configure Drizzle + D1

Currently Doing:
Implement Bearer Auth

Next:
Create Protected Test Route
```

No duplicated `current_focus` or `next_action` field is required.

---

# 7. Example — Meta Ads

```text
Project
Meta Ads
kind = operation
status = active

├── Milestone: September Creative Test
│   status = active
│
│   ├── [completed] Review current ad set
│   ├── [doing] Prepare localized creative
│   └── [todo] Add creative to existing ad set
│
└── Milestone: National Day Campaign
    status = planned
```

---

# 8. Example — Daily Weather

A Project does not require Milestones.

```text
Project
Daily Weather
kind = automation
status = active

├── [completed] Select first Weather API
├── [doing] Implement Weather Adapter
├── [todo] Add rain commute rule
└── [todo] Connect reminder delivery
```

This is valid.

Milestones should only be introduced when they add useful structure.

---

# 9. Example — Simple Personal Task

```text
Project
Personal

└── Task
    Buy milk
```

The Task does not become a new Project.

This preserves the rule:

> Everything lives in a Project.

without turning every action into a Project.

---

# 10. Relationship Rules

## Project → Milestone

```text
1 : N
```

A Project may contain zero or many Milestones.

## Project → Task

```text
1 : N
```

Every Task belongs to exactly one Project.

## Milestone → Task

```text
1 : N
```

A Milestone may contain zero or many Tasks.

Task `milestone_id` is optional.

---

# 11. Core Constraints

Recommended constraints:

```text
projects.user_id NOT NULL

milestones.user_id NOT NULL
milestones.project_id NOT NULL

tasks.user_id NOT NULL
tasks.project_id NOT NULL
tasks.milestone_id NULLABLE
```

Recommended Project slug constraint:

```text
UNIQUE(user_id, slug)
```

Application/API layer must verify:

```text
milestone.user_id == project.user_id

task.user_id == project.user_id

if task.milestone_id != null:
    milestone.project_id == task.project_id
    milestone.user_id == task.user_id
```

This prevents cross-project and cross-user references.

---

# 12. v0.1 Explicit Non-Goals

This model intentionally does not include:

```text
Priority
Deadline
Assignee
Tags
Labels
Subtasks
Task Dependencies
Progress Percentage
Kanban Columns
Recurring Tasks
Blocked State
Review State
Sprint
Story Points
Time Estimates
Task Comments
Project current_focus
Project next_action
Project current_milestone_id
```

These features should only be added after real Iris usage demonstrates a need.

---

# 13. Design Principle Summary

The Iris execution model is deliberately small:

```text
Project
= long-term context

Milestone
= stage

Task
= action
```

Dynamic state should be derived whenever possible:

```text
Current Work
→ doing Tasks

Next Action
→ ordered todo Tasks

Recent Progress
→ recently completed Tasks

Current Stage
→ active Milestones
```

The system should avoid storing the same truth twice.

The central v0.1 principle is:

> **Everything lives in a Project.**
