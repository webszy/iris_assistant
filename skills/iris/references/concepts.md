# Iris Concepts

This document defines the current Iris domain model and the semantic meaning of its core entities.

It reflects the current repository implementation. Modeling guidance explains intended use; it does not imply additional database validation or an implemented execution system. Field names below use database naming.

## 1. Core Principle

> Project-owned work and material live in a Project; personal Reminders need not.

> This does not mean everything becomes a Project.

Project is the long-lived context container for Milestones, Tasks, Resources, Capabilities
and Expenses. Reminder has an optional Project; Finance Settings and Notification
settings/channels belong to the user, and ExchangeRate is a shared current cache.

An ordinary action, temporary conversation, or external file does not automatically justify creating a new Project.

If material is registered as an Iris Resource, it must belong to an appropriate existing Project.
Use the entity that describes its purpose within the appropriate ongoing context.

## 2. Entity Relationship Overview

```text
Project
├── Milestones
├── Tasks
├── Resources
├── Capabilities
└── Expenses

Milestone
├── Tasks (a Task's Milestone relationship is optional)
└── Resources (optional Milestone scope)

Task
└── Resources (optional Task scope)

Capability
└── Resource (exactly one, required; may be shared by multiple Capabilities)
```

Project, Milestone, Task, Resource and Capability have a user owner. Their child entities require a Project. Optional child relationships stay within the same user and Project. A Resource has at most one direct Milestone or Task scope.

## 3. Project

**Project = long-lived context container.**

Use it for an ongoing product, operation, automation, personal goal/context, content project, or another long-running context. It holds stable identity and lifecycle state. Its `slug` is unique per user.

`kind`: `product`, `operation`, `automation`, `personal`, `content`, `other`.
`kind` is descriptive metadata; it does not select different business rules. The default is `other`.

Good Projects: Iris, DeepUsername, an ongoing marketing operation, a novel, an ongoing personal goal. “Fix button” and “Write Chapter 10” are normally Tasks inside those contexts.

`status`: `planned`, `active`, `paused`, `completed`; default: `planned`. Completing a Task or Milestone does not automatically complete its Project.

**Archive is separate from Project status.**
`archived_at = null` means unarchived; a non-null value means archived. Archiving preserves history and hides the Project from the default Project listing. It does not change status or delete children. Unarchiving clears `archived_at`. Current Project operations preserve records rather than providing hard deletion.

## 4. Milestone

**Milestone = meaningful stage or phase inside a Project.**

Milestones are optional: a Project can have none. Use one for a meaningful phase, not automatically for every group of Tasks. For example, Iris may have Milestones named `v0.1`, `v0.5`, and `v1.0`. These are example phase names, not claims that those versions are implemented.

`status`: `planned`, `active`, `completed`, `cancelled`; default: `planned`. Multiple Milestones in the same Project may be active simultaneously; the current services and schema impose no single-active-Milestone constraint. Task completion does not automatically change Milestone status.

`position` is explicit integer ordering within the Project, ascending. An omitted initial position starts at 100, then uses the current maximum + 100. Creation time is not planning order. Discarded phases use `cancelled`; current Milestone operations do not provide hard deletion.

## 5. Task

**Task = concrete executable work.**

A Task describes what needs doing and its current execution state. It requires a Project; `milestone_id` is nullable. A linked Milestone must belong to the same user and Project.

`status`: `todo`, `doing`, `completed`, `cancelled`; default: `todo`.
`position` is explicit integer execution ordering. Initial positions are allocated in increments of 100 within the Milestone, or among Project-level Tasks when no Milestone is assigned.

`completed_at` is the explicit completion time:

- Non-completed → completed: set the completion time.
- Completed → non-completed: clear the completion time.
- Completed → completed: preserve the existing completion time.
- Editing title or description without changing status preserves completion time.
- Creating an already completed Task sets its completion time immediately.

`updated_at` is not `completed_at`; do not use metadata update time to infer completion time. Use `cancelled` for abandoned work; current Task operations do not provide hard deletion.

A Task is not the durable content it produces. Keep `description` focused on execution context. “Write Chapter 10” is a Task; the chapter itself belongs in a Git file referenced by a Resource. This is a modeling boundary, not an enforced description-length limit.

## 6. Resource

**Resource = pointer to durable material used by Iris.**

It answers: **Where does the real material live?** It stores metadata and a location reference, not the large content itself. A Resource may describe a repository, directory, file, or external material. Creating metadata does not read or verify the referenced Git or URL contents. Deleting metadata does not delete the underlying material.

The Markdown Resource creation endpoint additionally creates a new Markdown file before
registering metadata. Content APIs expose full Markdown reads/replacements for the configured
logical repository under `projects/<project.id>/`; Project slug edits do not move that namespace.
Ordinary Resource POST still registers only a pointer. PATCH only rebinds metadata pointers,
not files; DELETE still removes metadata only. Multiple Resources may point at one file and
share its content revision. Content PUT does not change Resource `updated_at`.

`kind`: `repository`, `directory`, `file`, `url`.

| `role` | Semantic purpose |
| ------ | ---------------- |
| `context` | Background needed to understand the work. |
| `spec` | Specification or formal definition. |
| `artifact` | Output being created or maintained. |
| `reference` | Supporting reference material. |

Location requirements enforced by current validation:

| `kind` | Required non-null location fields |
| ------ | --------------------------------- |
| `repository` | `repository` |
| `directory` | `repository`, `path` |
| `file` | `repository`, `path` |
| `url` | `url` |

Non-null location values must be nonempty strings.
`repository` identifies the repository; `path` locates material within it; `url` identifies external material. Current validation does not enforce a repository identifier format, path format, or URL syntax. These are minimum location requirements: additional location fields are not forbidden.

## 7. Resource Scope

Every Resource requires `project_id` and exactly one most-specific scope:

| Scope | `project_id` | `milestone_id` | `task_id` |
| ----- | ------------ | -------------- | --------- |
| Project Resource | Required | null | null |
| Milestone Resource | Required | Required | null |
| Task Resource | Required | null | Required |

`milestone_id` and `task_id` must not both be non-null. A linked Milestone or Task must belong to the Resource's user and Project. A Task already knows its optional Milestone; its Resource must not repeat that relationship. Scope and location constraints also apply to the complete record after an update.

## 8. Resource Context Inheritance

When working on a Task, relevant durable context may be assembled from:

```text
Project Resources
+ Resources of the Task's Milestone (if assigned)
+ Task Resources
```

This is the existing design's context assembly semantics, not automatic inheritance stored in the database. The services do not implement an automatic context assembler. Choose the appropriate scope for each reference. Multiple Resources may intentionally reference the same file for different scopes or roles; that is shared content, not automatic inheritance. Locations have no database uniqueness constraint.

## 9. Capability

**Capability = reusable executable ability registered in Iris.**

It answers: **What can Iris do?**

```text
Resource   → where/what exists
Capability → the registered ability associated with that material
```

`type`: `script`, `skill`. A script file or Skill directory does not automatically become a Capability. A Capability has a name, optional description, required Project and Resource, and an `enabled` flag.
`enabled` defaults to true; false retains the registration while marking it disabled. The flag records availability, not proof that anything has been executed.

## 10. Capability → Resource

**Every Capability must reference a Resource.**
`resource_id` is required and NOT NULL, with a foreign key to Resource. Current validation enforces:

```text
script → file Resource
skill  → directory Resource
```

One Resource may support multiple Capabilities; `resource_id` is not unique. Capability stores the relationship, while Resource stores the location. The current Capability Registry represents registration metadata, not a runtime execution system. Registering or enabling a Capability does not execute its script or Skill.

## 11. Capability / Resource Integrity

- The referenced Resource must belong to the same user and Project as the Capability.
- A Resource cannot be deleted while any Capability references it, including a disabled Capability.
- The Resource foreign key restricts deletion; it does not cascade-delete Capabilities.
- A Resource kind change is rejected if it would break any referencing Capability's required kind.
- Changes to Capability type or Resource reference must preserve ownership and kind compatibility.
- Disabling retains the reference and its protection. Current Capability operations do not provide hard deletion.

## 12. Entity Selection Guide

| User intent | Iris entity |
| ----------- | ----------- |
| Long-running context | Project |
| Meaningful project phase | Milestone |
| Concrete executable work | Task |
| Durable file, directory, repository, or URL | Resource |
| Reusable executable ability | Capability, backed by a Resource |
| Already incurred Project cost | Expense |
| Time-based attention schedule | Reminder (Project optional) |
| One specific reminder execution | ReminderOccurrence |
| Durable message / delivery lifecycle / configured path | Notification / NotificationDelivery / NotificationChannel |

Examples:

- “Build Iris v0.1” → within the existing Iris Project, use or create a `v0.1` Milestone as appropriate; concrete implementation work becomes Tasks.
- “Deploy Iris API” → Task inside the Iris Project.
- “v0.1 PRD.md” → file Resource with role `spec`, scoped to the relevant Milestone.
- “Project Secretary Skill” → directory Resource + `skill` Capability in the same Project.
- “Write Chapter 10” → Task; its chapter file → Task-scoped file Resource with role `artifact`.

## 13. Common Modeling Mistakes

- Turning every action or temporary conversation into a Project.
- Creating a Milestone for every group of Tasks.
- Storing long-form output in Task descriptions instead of referenced durable material.
- Creating a Capability without a Resource, or treating the registry as the execution runtime.
- Duplicating one Resource at multiple scopes to represent context inheritance.
- Setting both Resource child-scope fields because its Task belongs to a Milestone.
- Treating `archived` as Project status or `updated_at` as Task completion time.
- Treating a Resource as file contents rather than a metadata/location record.

## 14. Finance

Expense is an incurred Project cost held in D1, not a Markdown memory entry. Finance Settings
holds the user's reporting currency; ExchangeRate is a shared current FX cache. Each Expense
retains the reporting currency and rate used for it; settings/cache updates do not rewrite
historical Expenses. Expense currency is immutable; correction requires delete and replacement.
There is no Account, Income, Balance, Budget or full accounting model in this phase.

## 15. Reminder and Notification

Reminder is a time-based attention schedule, distinct from executable Task state. Project
association is optional; there is no implicit Task/Milestone/Resource binding. An occurrence
is one logical execution of that Reminder. Completing/skipping an occurrence does not cancel
the whole schedule; delaying that execution does not permanently reschedule the definition.

```text
Reminder → ReminderOccurrence → Notification → NotificationDelivery
                                                   ↓
                                          NotificationChannel
```

Notification is an immutable durable message snapshot with a structured source identity;
NotificationDelivery records actual delivery, and NotificationChannel configures a delivery
path. Multiple channels form sequential priority fallback, not simultaneous fan-out.
For a Reminder event, sourceId identifies the occurrence, sourceVersion its trigger generation,
and sourceContext.reminderId resolves its parent when that relation is available.
User follow-ups act on the source occurrence, never on the immutable Notification.

An occurrence becoming triggered means durable Notification acceptance, not delivery, reading
or user completion. A sent Delivery means provider-confirmed success, not that the user read it.
Accepted events and existing delivery attempts are not withdrawn by source completion,
skipping, cancellation, rescheduling or delay. A delayed execution may produce a new event.

## 16. Current Scope

The model includes Project work/material, Finance expense tracking, time-based Reminder and
Notification delivery infrastructure. Production notification adapters are currently absent;
without a usable channel an occurrence remains pending. These domain semantics do not imply
live provider availability, Watch/Rule, condition/event monitoring, arbitrary Agent-created
Notifications, Reminder pause/resume, calendar sync or an autonomous Agent execution system.
