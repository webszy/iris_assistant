# Iris

[简体中文](README.zh-CN.md)

> **Status: Development paused while monitoring the landscape**<br>
> **Reason: The upcoming OpenAI Bot appears likely to cover most Iris capabilities**

**A stateful, long-running personal agent designed to become a Life OS.**

Iris is more than a chatbot, Todo List, or project management tool.

It aims to become a persistent personal operating system: one that knows what you are doing, remembers what you have done, understands what should happen next, reuses accumulated capabilities, and gradually reduces repeated reasoning.

> **Organize life, work, knowledge, memory, rules, and execution into one unified personal system.**

---

# Why Iris

Most AI assistants are conversation-first:

```text
You ask a question
→ The model answers
→ The conversation ends
```

Iris aims to be state-first:

```text
Life continues
→ Iris continuously maintains state
→ Memory continuously accumulates
→ Context continuously changes
→ Rules / Capabilities continue to operate
→ LLM reasoning is invoked only when truly needed
```

The LLM is one component of Iris, not Iris itself.

The core of Iris is:

- Persistent state
- Long-term memory
- Deterministic rules
- Reusable Skills
- Executable Scripts
- Agent Runtime

---

# Core Ideas

```text
Runtime
= How Iris runs

Working State
= What Iris is doing now

Memory
= What Iris has experienced and knows

Capability
= What Iris can do

Personality
= How Iris tends to act
```

Iris is designed to minimize unnecessary LLM calls.

```text
Repeated reasoning
→ Rule

Repeated workflow
→ Skill

Stable execution
→ Script / API
```

The LLM mainly handles:

- Ambiguous problems
- New situations
- Conflicting information
- Natural-language understanding
- Open-ended reasoning
- Decisions that require combined context

Behavior that has become stable and deterministic should gradually be extracted from LLM reasoning.

---

# System Architecture

```text
                        User / Any Agent
                               │
                               ▼
                         Iris Skill
                               │
                               ▼
                      Cloudflare Worker
                       Control Plane / API
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
                        Execution Layer
                           (Future)
```

Iris currently has two clearly defined data planes:

```text
D1
→ Working State

Git
→ Durable Memory
```

The Worker is responsible for:

- API
- Authorization
- State
- Data validation
- Scheduling
- Deterministic business logic
- Memory routing

In the future, Cloud Agent will handle complex execution tasks that are not suitable for the Worker itself.

---

# Iris System Repo

The Iris System Repo stores the Iris application code.

It mainly includes:

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

The Iris System Repo answers:

> **How does Iris run?**

---

# Iris Memory Repo

Iris supports a separate Git-backed Memory Repo.

The Memory Repo stores the long-term accumulated knowledge of an Iris Instance, such as:

- Project documentation
- PRDs
- Notes
- Technical articles
- Novels
- Knowledge
- References
- Prompts
- Skills
- Scripts
- Identity
- Personality

Iris Worker accesses the Memory Repo through a Git Provider.

It currently primarily uses:

```text
GitHub Contents API
```

Agents do not need, and should not directly hold, the GitHub Token.

Call path:

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

D1 stores structured runtime state.

For example:

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
- Future Rule / Watch
- Other runtime state

D1 answers:

> **What is happening now?**

---

# Git-backed Memory

The Memory Repo answers:

> **What content is worth preserving long term?**

A standard Iris Memory Repo can be organized as:

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

Project content uses a stable Project ID as its physical directory identity:

```text
projects/<project-id>/
```

For example:

```text
projects/018f.../
├── specs/
│   └── v0.1-prd.md
├── notes/
├── references/
└── ...
```

A Project's:

```text
name
slug
```

can change.

The underlying Memory path does not drift when the name changes.

---

# State and Memory Boundaries

Iris explicitly separates:

```text
D1
→ State

Git
→ Long-term memory, content, Skills, and Scripts

Cloud Agent
→ Execution
```

For example:

```text
D1:

Task = "Complete chapter 10 of the novel"
status = doing
```

The actual chapter content is stored in:

```text
Git:

projects/<project-id>/chapters/chapter-10.md
```

The database records:

> How far this work has progressed.

Git stores:

> The content that must persist long term.

This prevents D1 and Git from storing two copies of the same truth.

---

# Core Model

Iris has one important principle:

> **Everything can live in a Project.**

But that does not mean:

> Everything becomes a Project.

A Project is a long-term context and organizational boundary.

Not every entity must belong to a Project.

For example:

```text
Reminder
```

can exist independently or optionally be associated with a Project.

---

# Project

A Project represents a long-term context.

For example:

```text
Iris
DeepUsername
Meta Ads
Daily Weather
Fat Loss
A Novel
```

A Project can represent:

- A product
- Long-term work
- Operations
- Automation
- A personal goal
- A content project
- Any other long-term context

---

# Milestone

A Milestone represents a phase goal within a Project.

For example:

```text
Iris
├── v0.1
├── v0.2
├── v0.5
└── v1.0
```

A Milestone answers:

> **What phase is this Project currently in?**

Milestones are optional.

---

# Task

A Task represents a specific executable action.

For example:

```text
Implement Bearer Auth
Complete chapter 10 of the novel
Deploy the Iris API
Update DeepUsername Pricing
```

A Task must belong to a Project.

Its Milestone can be empty.

---

# Resource

A Resource is a structured reference to a real asset.

For example:

```text
PRD.md
Chapter-10.md
scripts/check-provider.ts
skills/project-secretary/
External document URL
Git Repository
Directory
```

A Resource does not store the real content itself.

It answers:

> **Where is the real asset?**

---

# Capability

A Capability represents a reusable capability registered with Iris.

For example:

```text
Project Secretary
Check Provider Health
Novel Consistency Checker
Fetch Weather
```

Currently supported types are:

```text
Skill
Script
```

For example:

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

A Resource answers:

> Where is it?

A Capability answers:

> What can Iris do with it?

---

# Markdown Memory

Iris supports direct API operations on Markdown content in the Memory Repo.

Currently supported:

```text
CREATE Markdown
READ Markdown
UPDATE Markdown
```

For example:

```text
User:
"Save this PRD in the Iris project."

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

Markdown content uses Git Revision for optimistic concurrency control.

Typical flow:

```text
GET content
↓
revision = A
↓
Modify content
↓
PUT expected_revision = A
```

If the remote content changes in the meantime:

```text
CONTENT_CONFLICT
```

The Agent must not silently overwrite the newer content.

This gives Git-backed Memory basic data safety when multiple people, Agents, or Runtimes access it concurrently.

---

# Finance

Iris v0.2 adds Project Expense Tracking.

Finance is not currently intended to be a complete accounting system. It solves a more direct problem:

> **How much has a Project actually cost?**

Core structure:

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

Expense supports:

- Project Scope
- Multiple currencies
- Reporting Currency
- Saving the applied exchange rate at creation time
- Expense Summary
- Stable historical amounts

For example:

```text
DeepUsername

Meta Ads
$120

Domain
¥300

API
€20
```

Iris can summarize these amounts in the user's configured Reporting Currency.

Historical Expenses are not recalculated when exchange rates change later.

---

# Reminder

Reminder is a key capability in Iris's transition from passive record keeping to a proactive secretary.

A Reminder represents:

> **What needs to return to the user's attention, and when.**

Core structure:

```text
Reminder
= Scheduling definition

ReminderOccurrence
= One specific reminder execution
```

For example:

```text
Reminder:
Exercise every day at 8:00 PM

Occurrence:
2026-09-23 20:00
2026-09-24 20:00
2026-09-25 20:00
```

Reminder supports:

```text
CREATE
DONE
DELAY
SKIP
CANCEL
RESCHEDULE
```

For example:

```text
"Remind me to submit the materials tomorrow at 3:00 PM"
→ CREATE

"Done"
→ DONE

"Remind me again tomorrow"
→ DELAY

"Skip today"
→ SKIP

"Stop reminding me"
→ CANCEL

"Change all future reminders to 9:00 PM"
→ RESCHEDULE
```

Reminder and Task are different.

```text
Task
→ What to do

Reminder
→ When to bring it back to attention
```

Reminder only handles time-based scheduling.

For example:

```text
"Remind me tomorrow at 3:00 PM"
```

is a Reminder.

But:

```text
"Remind me when USD drops below 7"
```

belongs to a future:

```text
Watch / Rule / Trigger
```

rather than Reminder.

---

# Notification

Notification is responsible for:

> **Reliably delivering something Iris has decided the user needs to know.**

Reminder and Notification are separate domains.

```text
Reminder
→ Decides when to say something

Notification
→ Records what to say

NotificationDelivery
→ Determines which channel delivers it
```

Structure:

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

A Notification itself is an:

```text
Immutable Durable Event
```

Once formally accepted, its historical content is no longer modified.

Delivery is responsible for:

- Sending
- Retry
- Failure
- Channel Fallback

---

## Multiple Channels

Notification supports multiple channels.

The default is not:

```text
Push
+
Email
+
Conduit
```

all sending to the user at once.

Instead:

```text
Primary
↓ failure
Backup #1
↓ failure
Backup #2
```

That is:

> **Priority with fallback channels.**

For example:

```text
Conduit
↓
Push
↓
Email
```

Under normal conditions, only one channel needs to succeed.

---

# Iris Skill

Iris provides a dedicated Agent Skill.

The Skill does not store business state.

It teaches the Agent:

- How to understand the Iris data model
- When to read which API reference
- How to resolve a Project / Task / Reminder
- How to modify state safely
- How to handle Finance
- How to create a Reminder
- How to process user replies to Notifications
- How to read and write Git-backed Markdown Memory

Core control flow:

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

The Skill uses Progressive Loading.

Each task loads only the references it needs.

For example:

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

Only read:

```text
openapi.json
```

when exact schemas, debugging, or documentation drift checks are required.

A simple operation does not load the complete API documentation.

---

# Proactive Closed Loop

Starting with v0.2, Iris is no longer limited to:

```text
User
→ Iris
→ State
```

It begins to support a real asynchronous closed loop:

```text
User
↓
Create Reminder
↓
Time passes
↓
ReminderOccurrence
↓
Notification
↓
Delivery
↓
Iris proactively contacts the user
↓
The user replies
↓
DONE / DELAY / SKIP
↓
State continues to evolve
```

For example:

```text
Iris:
Time to exercise.

User:
I'm too tired today. Tomorrow.

Iris:
→ Find the ReminderOccurrence associated with the Notification
→ DELAY
→ Put it back into the schedule tomorrow
```

This means Iris starts evolving from:

> **A system that records**

into:

> **A secretary that continuously tracks work and proactively returns to the user's attention.**

---

# Cloud Agent

Cloud Agent is the future execution layer.

The Worker is better suited to:

- API
- Auth
- State
- Validation
- Scheduler
- Deterministic Logic

Cloud Agent is better suited to:

- Reading and modifying complex repository content
- Executing Skills
- Running Scripts
- Generating Artifacts
- Calling Coding Agents
- commit / push
- Long-running tasks
- Multi-step execution

Long-term structure:

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

Iris's long-term direction is to become a personal Life OS.

It should eventually help answer:

```text
What am I doing now?

What is the most important next step?

Why did I make this decision before?

Am I forgetting anything?

What has this Project accumulated?

What capabilities do I already have?

How much have I spent recently?

What is coming due soon?

Which reminders are still unhandled?

What has already been brought to my attention but is still incomplete?

Given my current environment, what should I do now?

What has changed in my life recently?
```

The future Dashboard will become the visual layer of this system:

> **A personal Life Cockpit.**

---

# Reducing LLM Calls by Design

Iris does not want everything to depend on LLM reasoning forever.

Execution priority:

```text
Can a deterministic Rule handle it?
→ Use the Rule

Can an existing Script handle it?
→ Run the Script

Can an existing Skill handle it?
→ Use the Skill

Can an existing API execute it deterministically?
→ Call the API

Does it truly require ambiguous reasoning?
→ Invoke the LLM
```

Long-term evolution:

```text
Experience
→ Pattern
→ Rule
→ Skill
→ Script / API
```

Over time:

```text
Repeated LLM reasoning ↓
Deterministic execution ↑
Personalization ↑
Reliability ↑
```

Iris's goal is not to make the Agent perform more and more reasoning forever.

Instead:

> **Gradually turn behavior that has proven stable into deterministic capabilities.**

---

# Version Roadmap

## v0.1 — Reliable Personal Secretary

v0.1 completed the core foundation and can already be deployed and run.

Main capabilities:

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

Goal:

> **Make Iris a reliable, stateful personal secretary foundation with long-term memory.**

---

## v0.2 — Proactive Personal Secretary

v0.2 begins to give Iris proactive secretary capabilities.

Main modules:

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

Goal:

> **Upgrade Iris from a system that records into one that continuously tracks work and proactively contacts the user.**

---

## v0.5 — Personal Knowledge Steward

Focus:

- Long-term Knowledge
- Knowledge Item
- Search
- Project Link
- Source
- Summary
- Tags
- Knowledge Maintenance

Goal:

> **Enable Iris to genuinely manage, organize, and retrieve long-term knowledge.**

---

## v1.0 — Self-Evolving Personal Assistant

Focus:

- Capability Registry
- Skill Registry
- Skill Runtime
- Skill Factory
- Workflow Learning
- Preference Learning
- Capability Evolution
- Controlled Self-Extension

Goal:

> **Turn repeatedly successful reasoning and workflows into reusable, executable capabilities.**

Iris's self-evolution does not mean modifying itself without constraints.

Instead:

```text
Observe repeated behavior
↓
Identify patterns that can be made permanent
↓
Create an improvement task
↓
User approval
↓
Call a development Agent
↓
Implement
↓
Test
↓
Register a new Capability
```

That is:

> **Controlled Self-Evolution**

---

## v1.1 — Personality System

Focus:

- Persistent Identity
- Behavioral Traits
- Communication Style
- Decision Style
- Initiative
- Principles
- Personality Versioning
- Controlled Personality Evolution

Goal:

> **Give each Iris Instance a stable, understandable, versioned, and evolving behavioral identity.**

---

# Multiple Iris Instances

In the long term:

```text
Iris System
    │
    ├── Iris #1 → State #1 + Memory #1
    ├── Iris #2 → State #2 + Memory #2
    └── Iris #100 → State #100 + Memory #100
```

The system code can be exactly the same.

Each Iris becomes a distinct individual because these differ:

- Working State
- Memory
- Capability
- Personality
- Experience

Iris is therefore intended to become more than one specific personal assistant.

It aims to become:

> **An instantiable, long-running personal Agent System that can continue to grow.**

---

# Technology Stack

The current technology stack mainly includes:

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

# Deployment

Iris can now be deployed to Cloudflare Workers + D1 and connected to a separate Iris Memory Git Repository.

Complete deployment flow:

```text
Configure wrangler.jsonc
↓
Run memory:init to generate the Git repository template and push it
↓
Configure the GitHub Token Secret
↓
Run the remote database Migration
↓
Deploy the Worker
↓
Create a remote Iris API Token
↓
Configure the local Iris Skill
↓
Run API connectivity tests
↓
Run Memory connectivity tests
```
---

## 1. Prepare Cloudflare and GitHub

Before deployment, you need at least:

- Cloudflare Account
- Cloudflare Workers
- Cloudflare D1 Database
- GitHub Account
- An Iris Memory Repository
- A GitHub fine-grained token

The recommended setting for the Iris Memory Repo is:

```text
Private Repository
```

Grant the GitHub Token access only to the Repository permissions Iris actually needs.

---

## 2. Configure `wrangler.jsonc`

First configure:

```text
wrangler.jsonc
```

At minimum, confirm:

- Worker Name
- D1 Binding
- D1 Database Name
- D1 Database ID
- Scheduled Triggers
- Runtime Vars

For example:

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

Use the runtime configuration names in the current code as the source of truth.

---

## 3. Configure Regular Runtime Vars

Non-sensitive configuration can be placed in:

```text
wrangler.jsonc
```

under:

```text
vars
```

For example:

```text
GitHub Owner
Memory Repository
Runtime Mode
Other non-sensitive configuration
```

Do not put:

```text
GitHub Token
Iris API Token
Provider Token
Other Secrets
```

directly in `vars`.

---

## 4. Configure the GitHub Token

The GitHub Token is a Secret.

Do not write it to:

```text
wrangler.jsonc
Git Repository
Iris Memory Repo
README
```

Use a Cloudflare Worker Secret:

```bash
pnpm wrangler secret put GITHUB_TOKEN
```

Then enter the GitHub fine-grained token when prompted.

Recommended:

```text
Token
↓
Authorize only the Iris Memory Repo
↓
Grant only the Repository Contents permissions Iris actually needs
```

The Agent should not obtain this Token directly.

Correct structure:

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

## 5. Run the Remote Database Migration

After configuration, run:

```bash
pnpm run db:migrate:remote
```

This command applies the database Migrations in the project to the remote Cloudflare D1 database.

It must be run for the first deployment.

Run it again when deploying code that adds a:

```text
Table
Column
Index
Migration
```

Keep this order:

```text
Migration
↓
Deploy
```

This prevents new code from depending on database structures that do not yet exist.

---

## 6. Deploy Iris Worker

Run:

```bash
pnpm run deploy
```

After deployment, you will receive an online Worker URL, for example:

```text
https://iris.<your-subdomain>.workers.dev
```

If a custom domain is configured, use the actual Iris API URL.

At this point:

```text
Worker
+
D1
+
Memory Integration
```

is running.

The Agent still does not have credentials to access the Iris API.

---

## 7. Create a Remote Iris API Token

Run:

```bash
pnpm run auth:create-remote
```

This command creates an API Token in the remote Iris D1 database.

The generated Token looks like:

```text
iris_xxxxxxxxx
```

Client requests use:

```http
Authorization: Bearer iris_xxx
```

The raw Token should only be exposed when it is created.

The Server stores only:

```text
SHA-256 Token Hash
```

Do not store the plaintext Token.

Save it securely immediately after creation.

Do not:

- commit it to Git
- Write it to the Memory Repo
- Write it in the README
- Put it in public configuration

---

# Configure the Local Iris Skill

After the remote API is deployed, the local Agent / Runtime must be configured to call Iris.

At minimum, it needs:

```text
IRIS_API_BASE_URL
IRIS_API_TOKEN
```

For example:

```text
IRIS_API_BASE_URL=https://iris.example.com
IRIS_API_TOKEN=iris_xxx
```

The exact configuration method depends on the Agent Runtime that runs the Iris Skill.

The Skill itself should not hardcode:

- Iris API URL
- Iris API Token
- GitHub Token
- Provider Secret

---

# Local Skill Connectivity Tests

Do not immediately write large amounts of real data after deployment.

First complete a minimal connectivity test.

Test order:

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

## 1. Test Auth + API

Ask the local Agent to execute:

```text
List my Iris Projects.
```

Verify that:

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

connects successfully.

---

## 2. Create a Test Project

For example:

```text
Create a test Project named Iris Deployment Test.
```

Confirm:

- CREATE succeeds
- A Project ID is returned
- GET can read it again
- User Scope is correct

---

## 3. Test Git-backed Memory

Ask the Agent to execute:

```text
Create test.md in the Iris Deployment Test project.

Content:

# Iris Memory Test

Memory connection works.
```

Complete call path:

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

Then read the file again.

Confirm:

- The Resource was created
- The Git file exists
- The Markdown content is correct
- A valid Revision is returned

---

## 4. Test Memory Update

Read:

```text
revision = A
```

Then update:

```text
test.md
```

Submit:

```text
expected_revision = A
```

Confirm:

- The content is updated successfully
- The Revision changes
- The Git commit succeeds

This confirms that optimistic concurrency works correctly.

---

# Deployment Checklist

Minimum checks:

```text
[ ] Worker is reachable

[ ] D1 Migration is complete

[ ] Iris API Token authenticates successfully

[ ] Project API can read and write

[ ] Milestone API can read and write

[ ] Task API can read and write

[ ] Resource API works

[ ] Capability API works

[ ] Iris Memory Repo can create Markdown

[ ] Markdown can be read

[ ] Markdown can be updated

[ ] Git Revision works correctly

[ ] Content Conflict Protection works correctly

[ ] Iris Skill can connect to the remote Iris API
```

For v0.2, also check:

```text
[ ] Finance API

[ ] Reminder API

[ ] Reminder Scheduled Trigger

[ ] Notification API

[ ] Notification Settings

[ ] Notification Channel
```

If a real Notification Provider is not yet configured:

The production Notification Delivery Channel may remain unavailable temporarily.

In that case, ReminderOccurrence should remain:

```text
pending
```

instead of falsely reporting that the notification was delivered successfully.

---

# Routine Update Deployment

After the first deployment, routine code updates usually require only:

```bash
pnpm run db:migrate:remote
pnpm run deploy
```

If the update contains no new Migration, the database Migration can be omitted according to the project's actual needs.

---

# First Deployment Quick Flow

```text
1. Create Cloudflare D1

2. Create the Iris Memory Repo

3. Create a GitHub fine-grained Token

4. Configure wrangler.jsonc

5. Configure vars

6. Configure the GITHUB_TOKEN Secret

7. pnpm run db:migrate:remote

8. pnpm run deploy

9. pnpm run auth:create-remote

10. Configure the local Iris Skill

11. Test the Project API

12. Test Git-backed Memory
```

After completion, a minimal runnable Iris Instance is established:

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

# Design Principles

Iris currently follows these principles:

- Do not store two copies of the same truth.
- Preserve history instead of using destructive deletion.
- Do not repeatedly call an LLM when deterministic execution is possible.
- Store structured runtime state in D1.
- Store long-term content and executable memory in Git.
- Secrets do not enter the Memory Repo.
- Agents do not directly hold underlying Provider Secrets.
- Agents do not directly hold the GitHub Token.
- Prefer reusing existing Capabilities instead of reinventing workflows each time.
- Gradually turn repeatedly successful reasoning into Rules / Skills / Scripts / APIs.
- Historical facts should not be reinterpreted because current configuration changes.
- The Agent is responsible for understanding ambiguous intent.
- The Server is responsible for deterministic execution.
- Do not make the core model more complex before real usage proves the need.
- Self-evolution must be controlled.
- Resolve the correct entity before modifying existing data.
- Never silently overwrite long-term content during concurrent updates.

---

# Current Status

Iris has moved beyond the conceptual design stage into:

> **A deployable, usable, and continuously evolving personal Agent Runtime.**

v0.1 has completed:

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

v0.2 begins to add:

```text
Finance
+
Reminder
+
Notification
```

Iris now has the foundation to move from:

```text
Recording
```

toward:

```text
Continuous tracking
+
Proactive reminders
+
Long-term memory
```

The next priority is not to expand the model without limit.

It is:

```text
Deploy a real Iris
↓
Continuously dogfood it
↓
Let Iris manage real work and life
↓
Observe actual behavior
↓
Identify friction
↓
Correct the model and Skill
↓
Find repeated patterns
↓
Turn them into Rules / Skills / Scripts / APIs
```

The real goal has never been:

> Build a Demo that looks intelligent.

It is:

> **Make Iris persist reliably, become part of daily life, and understand you and act more effectively through long-term use.**
