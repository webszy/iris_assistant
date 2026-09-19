# Iris

**A stateful, long-running personal agent designed as a Life OS.**

Iris is not just a chatbot, a todo list, or a project manager.

It is an attempt to build a persistent personal operating system that can understand what you are working on, remember what you have learned, track what needs to happen next, reuse capabilities you have already built, and gradually reduce repeated reasoning.

> **Turn life, work, knowledge, memory, rules, and execution into one coherent personal system.**

---

## Why Iris

Most AI assistants are session-first:

```text
You ask
→ the model answers
→ the conversation ends
```

Iris is designed to be state-first:

```text
Life keeps happening
→ Iris keeps state
→ memory keeps accumulating
→ context keeps changing
→ rules and capabilities keep working
→ LLM reasoning is used only when needed
```

The model is only one part of Iris.

Iris is designed around persistent state, long-term memory, deterministic rules, reusable skills, executable scripts, and an agent runtime.

---

## Core Idea

```text
Runtime
= how Iris runs

Working State
= what Iris is doing now

Memory
= what Iris knows and has experienced

Capability
= what Iris knows how to do

Personality
= how Iris tends to behave
```

Iris is intentionally designed to reduce unnecessary LLM usage.

Whenever possible:

```text
Repeated reasoning
→ Rule

Repeated workflow
→ Skill

Stable execution
→ Script
```

The LLM is reserved for ambiguity, new situations, conflicts, and open-ended reasoning.

---

## Architecture

```text
                    User / Grok Bot
                           │
                           ▼
                  Cloudflare Worker
                    Control Plane
                           │
                           ▼
                          D1
                    Working State
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
        Iris System Repo          Iris Memory Repo
        Runtime / API / UI        Long-term Memory
              │                         │
              └────────────┬────────────┘
                           ▼
                      Cloud Agent
                     Execution Plane
```

### Iris System Repo

Contains the software that makes Iris run:

- Cloudflare Worker API
- Dashboard
- Authentication
- D1 schema and migrations
- Git integration
- Agent adapters
- Scheduler
- Runtime logic

### Iris Memory Repo

Contains the durable memory of one Iris instance:

- Project documents
- PRDs
- Notes
- Articles
- Novels
- Knowledge
- References
- Prompts
- Skills
- Scripts
- Identity
- Personality

### D1

Stores structured operational state:

- Projects
- Milestones
- Tasks
- Resources
- Capabilities
- Reminders
- Rules
- Other runtime state

### Cloud Agent

Executes work that should not run inside the Worker:

- Read and modify repository files
- Execute Skills
- Run Scripts
- Produce artifacts
- Commit and push changes

---

## Core Model

Iris follows one central rule:

> **Everything lives in a Project.**

This does **not** mean everything becomes a Project.

### Project

A long-lived context.

Examples:

```text
Iris
DeepUsername
Meta Ads
Daily Weather
Weight Loss
Novel A
```

### Milestone

An optional stage inside a Project.

```text
Iris
├── v0.1
├── v0.5
└── v1.0
```

### Task

A concrete action.

```text
Implement Bearer Auth
Write Chapter 10
Deploy Iris API
```

### Resource

A real material reference.

```text
PRD.md
Chapter-10.md
scripts/check-provider.ts
skills/project-secretary/
external documentation URL
```

### Capability

An executable ability registered in Iris.

```text
Project Secretary
Check Provider Health
Novel Consistency Checker
Fetch Weather
```

Relationship:

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

## State vs Memory

Iris keeps a strict boundary between structured state and durable content.

```text
D1
→ state

Git
→ memory, content, skills, scripts

Cloud Agent
→ execution
```

Example:

```text
D1:
Task = "Write Chapter 10"
status = doing
```

```text
Git:
projects/novel-a/chapters/chapter-10.md
```

The database tracks the work.

The repository stores the actual content.

---

## Resource and Capability

A Resource says:

> Where is the real thing?

A Capability says:

> What can Iris do with it?

Example:

```text
Resource:
scripts/check-provider.ts

Capability:
Check Provider Health
type = script
```

Or:

```text
Resource:
skills/project-secretary/

Capability:
Project Secretary
type = skill
```

Scripts and Skills live in the Iris Memory repository.

The Worker registers and routes capabilities.

The Cloud Agent executes them.

---

## Memory

A standard Iris Memory repository may look like:

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

The Memory repository is not a file-based copy of D1.

It stores durable content, not runtime state.

---

## Life OS

Iris is ultimately intended to become a personal Life OS.

It should eventually help answer:

```text
What am I working on?
What matters next?
What did I decide before?
What am I forgetting?
What does this project know?
What skills do I already have?
What should I do under the current context?
What has changed in my life?
```

A future Dashboard becomes the visual layer of this system — a personal cockpit for work, projects, reminders, finances, context, knowledge, and agent activity.

---

## LLM-Light by Design

Execution preference:

```text
Can a deterministic rule handle it?
→ use the rule

Can an existing script handle it?
→ run the script

Can an existing skill handle it?
→ use the skill

Does it require ambiguous reasoning?
→ use the LLM
```

The long-term learning loop is:

```text
Experience
→ Pattern
→ Rule
→ Skill
→ Script
```

Over time:

```text
LLM dependency ↓
deterministic execution ↑
personalization ↑
reliability ↑
```

---

## Roadmap

### v0.1 — Reliable Personal Secretary

Focus:

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
- Grok Bot integration

Goal:

> Make Iris reliable enough to manage real daily work and life.

### v0.5 — Personal Knowledge Steward

Focus:

- Long-term knowledge
- Knowledge items
- Search
- Project-linked knowledge
- Source tracking
- Summaries
- Tags

Goal:

> Let Iris actively organize and retrieve long-term knowledge.

### v1.0 — Self-Evolving Personal Assistant

Focus:

- Capability Registry
- Skill Registry
- Skill Runtime
- Skill Factory
- Workflow learning
- Preference learning
- Capability evolution

Goal:

> Turn repeated successful reasoning into reusable capability.

### v1.1 — Personality System

Focus:

- Persistent identity
- Behavioral traits
- Communication style
- Decision style
- Initiative
- Principles
- Personality versioning
- Controlled personality evolution

Goal:

> Give each Iris instance a stable, understandable, versioned behavioral identity.

---

## Multiple Iris Instances

```text
Iris System
    │
    ├── Iris #1 → Memory #1
    ├── Iris #2 → Memory #2
    └── Iris #100 → Memory #100
```

The code may be identical.

The instances can differ through:

- Working state
- Memory
- Capabilities
- Personality
- Experience

---

## Current Development Focus

Current work is centered on the v0.1 foundation:

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

Next:

```text
Deploy API
→ Dogfood with real Iris data
→ Connect Iris Memory repository
→ Add Git integration
→ Connect Cloud Agent
```

---

## Technology

Current stack:

- Cloudflare Workers
- Hono
- TypeScript
- Cloudflare D1
- Drizzle ORM
- Zod
- OpenAPI
- Git-backed memory
- Cloud Agent execution

---

## Design Principles

- Do not store the same truth twice.
- Preserve history instead of destructive deletion.
- Prefer deterministic execution over repeated LLM reasoning.
- Keep structured state in D1.
- Keep durable content and executable memory in Git.
- Keep secrets out of the Memory repository.
- Use existing capabilities before inventing new workflows.
- Turn repeated successful reasoning into reusable rules, skills, or scripts.
- Keep the core model small until real usage proves a need for more complexity.

---

## Status

Iris is currently under active development.

The current goal is not to make Iris look intelligent.

The goal is to make it **reliable, persistent, useful, and increasingly capable over time**.
