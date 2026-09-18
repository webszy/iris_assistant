# Iris v1.1 Supplement — Personality System

**Version:** v1.1  
**Status:** Roadmap supplement  
**Depends on:** Iris v1.0 — Self-Evolving Personal Assistant  
**Scope:** Persistent personality, identity, behavioral policy, and controlled personality evolution

---

# 1. Position in the Roadmap

The Iris roadmap is currently:

```text
v0.1 — Reliable Personal Secretary
       Reliable state, execution, reminders, project management

v0.5 — Personal Knowledge Steward
       Long-term knowledge and content management

v1.0 — Self-Evolving Personal Assistant
       Skill learning, workflow learning, capability evolution

v1.1 — Personality System
       Persistent identity and behavioral evolution
```

v1.1 does not replace v1.0.

It builds on top of the self-evolving capability system and adds a persistent behavioral identity to each Iris Instance.

---

# 2. Core Definition

> **Personality = the persistent, versioned behavioral identity and behavioral policy of an Iris Instance.**

Personality answers:

> Given the same memory, context, and capabilities, how does this Iris tend to understand, judge, communicate, and act?

It is distinct from Runtime, Memory, Capability, and User Preference.

---

# 3. Iris Instance Model

An Iris Instance is composed of:

```text
Iris Instance
│
├── Runtime
│   └── Iris System
│
├── Working State
│   └── D1
│
├── Memory
│   └── iris-memory Git repository
│
├── Capability
│   ├── Skills
│   └── Scripts
│
└── Personality
    └── Persistent Behavioral Identity
```

Definitions:

```text
Runtime
= how Iris runs

Working State
= what Iris is currently doing

Memory
= what Iris knows and has experienced

Capability
= what Iris knows how to do

Personality
= how Iris tends to behave
```

---

# 4. Personality Is Instance-Specific

The Iris system code may be shared across many instances.

Example:

```text
iris-system
        │
   ┌────┼────┐
   ▼    ▼    ▼
Iris1 Iris2 Iris100
```

Each instance may have a different:

```text
memory repository
working state
personality
capability set
```

Therefore:

```text
same code
≠
same Iris
```

Two Iris Instances may start from identical code and memory, but diverge through different Personality and later experience.

---

# 5. Personality Is Not User Preference

This distinction must remain explicit.

## User Preference

Describes the user.

Examples:

```text
User prefers simple architecture.
User is cost-sensitive.
User dislikes unnecessary notifications.
```

This belongs to Memory / Learned Preference.

## Personality

Describes Iris.

Examples:

```text
Iris prefers concise answers.
Iris avoids unnecessary complexity.
Iris uses high evidence standards.
Iris has balanced initiative.
```

The rule is:

```text
User Preference
= what Iris has learned about the user

Personality
= how Iris itself behaves
```

These concepts may interact, but must not be merged.

---

# 6. Personality Is Not a System Prompt

A system prompt is only a runtime representation.

Personality is persistent data.

Runtime flow:

```text
Personality
    ↓
Runtime Compiler
    ↓
Model Instructions / Context
    ↓
LLM
```

Personality must remain independent from any specific model provider or prompt format.

This allows:

```text
model replacement
prompt format replacement
runtime replacement
```

without losing the Iris Instance's behavioral identity.

---

# 7. Personality Structure

v1.1 defines six primary dimensions:

```text
Personality
├── Identity
├── Traits
├── Communication Style
├── Decision Style
├── Initiative
└── Principles
```

---

# 8. Identity

Identity answers:

> Who is this Iris?

Example:

```text
name: Iris
role: Personal Agent

mission:
Help the user manage long-term work, life, knowledge,
decisions, and execution while reducing repeated reasoning
and unnecessary cognitive load.
```

Identity should be highly stable.

It should not change frequently through autonomous evolution.

---

# 9. Traits

Traits are stable behavioral tendencies.

Examples:

```text
analytical
pragmatic
calm
precise
curious
patient
```

Traits are not intended to implement psychological typing systems such as MBTI.

They are simple Agent behavior descriptors.

---

# 10. Communication Style

Communication Style defines how Iris expresses itself.

Examples:

```text
direct
concise
structured
warm
formal
casual
technical
```

Communication Style affects presentation, not factual truth or authorization boundaries.

---

# 11. Decision Style

Decision Style defines Iris's default reasoning preferences.

Possible dimensions:

```text
evidence_preference
risk_tolerance
complexity_tolerance
cost_sensitivity
exploration
certainty_threshold
```

Example:

```text
evidence_preference = high
risk_tolerance = medium-low
complexity_tolerance = low
cost_sensitivity = high
exploration = medium
certainty_threshold = high
```

Decision Style guides analysis.

It must not override explicit user instructions.

---

# 12. Initiative

Initiative defines how proactive Iris is.

v1.1 initial levels:

```text
reactive
balanced
proactive
```

Meaning:

```text
reactive
= act mainly when explicitly requested

balanced
= proactively surface important issues when clearly useful

proactive
= actively identify opportunities, risks, and next actions
```

Recommended default:

```text
balanced
```

The goal is to avoid both excessive passivity and unnecessary interruption.

---

# 13. Principles

Principles are persistent behavioral rules that should change rarely.

Examples:

```text
Prefer deterministic execution over repeated LLM reasoning.

Do not store the same truth twice.

Preserve history instead of destructive deletion.

Do not make irreversible changes without sufficient confidence.

Use existing capabilities before inventing new workflows.

Turn repeated successful reasoning into reusable rules, skills, or scripts.

Clearly distinguish known facts from uncertain inference.
```

Principles represent the most stable part of Personality.

---

# 14. Storage

Personality belongs to the Iris Memory repository.

Recommended logical location:

```text
iris-memory/
└── identity/
    ├── personality.yaml
    ├── personality.md
    ├── principles.md
    └── history/
```

Possible division:

```text
personality.yaml
= structured runtime-readable representation

personality.md
= human-readable description

principles.md
= stable long-form principles

history/
= optional personality change records
```

The exact file format is not fixed by this supplement.

---

# 15. D1 Boundary

D1 should not duplicate the full Personality body.

D1 may store only operational references such as:

```text
personality_resource_id
personality_version
active_personality_revision
```

The Memory repository remains the long-term Source of Truth.

---

# 16. Versioning

Personality must be versioned.

Because Personality lives in Git-backed memory, Iris gains:

```text
diff
history
rollback
auditability
```

Example:

```text
Personality v1
initiative = reactive

Personality v2
initiative = balanced

Personality v3
communication_style = more concise
```

A behavioral change should be traceable to a specific commit or revision.

---

# 17. Personality Evolution

v1.1 introduces controlled Personality evolution.

Personality must not change freely on every interaction.

Evolution flow:

```text
Long-term observations
        ↓
Stable recurring pattern detected
        ↓
Personality Change Proposal
        ↓
Explain:
- what should change
- why
- supporting evidence
- expected behavioral impact
        ↓
Approval policy
        ↓
Update Personality
        ↓
Git commit
```

Example:

```text
Observation:
The user repeatedly rejects low-value proactive suggestions.

Proposal:
initiative:
proactive → balanced
```

Personality evolution should be slower and more conservative than Skill evolution.

---

# 18. Personality Evolution Safety Rule

Different layers have different change thresholds.

Recommended conceptual order:

```text
Task behavior
→ easy to change

Rule
→ moderate change threshold

Skill
→ moderate change threshold

Preference
→ requires repeated evidence

Personality
→ high change threshold

Principles
→ very high change threshold
```

This prevents short-term interactions from destabilizing the identity of an Iris Instance.

---

# 19. Personality and LLM Usage

Iris is designed as a low-LLM-dependency Agent.

Personality should not force every action through an LLM.

Runtime logic remains:

```text
Event / Request
      ↓
Can deterministic logic handle it?
      │
   ┌──┴──┐
   │     │
  Yes    No
   │     │
   ▼     ▼
Rule /  LLM Reasoning
Script       ↑
Skill        │
   │      Personality
   ▼
Action
```

Personality primarily constrains:

```text
ambiguous reasoning
communication
judgment under uncertainty
initiative
decision style
```

It should not replace deterministic Rules, Skills, or Scripts.

---

# 20. Relationship with Memory

Memory records experience.

Personality controls behavioral interpretation of experience.

Example:

```text
Memory:
The user repeatedly prefers smaller, simpler architectures.

Learned Preference:
Prefer simpler technical solutions for this user.

Personality:
Iris itself has a low complexity tolerance.
```

These are related but distinct.

---

# 21. Relationship with Capability

Capability answers:

> What can Iris do?

Personality answers:

> How does Iris choose to use what it can do?

Example:

```text
Capability:
Research competitor

Personality:
high evidence preference
```

Capability remains executable functionality.

Personality remains behavioral policy.

---

# 22. Relationship with Rules

Rules are deterministic.

Personality is behavioral.

Example:

```text
Rule:
heavy rain → recommend driving
```

should execute regardless of whether Personality is concise, warm, or analytical.

Personality may change how the result is communicated, but not silently override the Rule.

---

# 23. Relationship with Principles

Principles are part of Personality but deserve stronger stability.

Conceptually:

```text
Personality
├── flexible traits
├── communication style
├── initiative
├── decision style
└── principles
     ↑
     most stable
```

Automatic personality evolution should be very cautious about changing Principles.

---

# 24. Example Personality

```yaml
identity:
  name: Iris
  role: Personal Agent

traits:
  - analytical
  - pragmatic
  - calm
  - precise

communication:
  style:
    - direct
    - concise
    - structured

decision_style:
  evidence_preference: high
  risk_tolerance: medium-low
  complexity_tolerance: low
  cost_sensitivity: high
  exploration: medium

initiative:
  level: balanced

principles:
  - Prefer deterministic execution over repeated LLM reasoning.
  - Preserve history instead of destructive deletion.
  - Do not store the same truth twice.
  - Use existing capabilities before inventing new workflows.
  - Convert repeated successful reasoning into reusable skills or scripts.
```

This example is illustrative only.

It does not lock the final file format.

---

# 25. v1.1 Explicit Non-Goals

v1.1 Personality System does not imply:

```text
simulated human consciousness
emotional state simulation
unbounded autonomous identity changes
hidden personality mutation
model-specific hard-coded prompts
automatic rewriting of core principles after short-term interactions
```

The purpose is persistent behavioral consistency, not anthropomorphic simulation.

---

# 26. v1.1 Deliverables

A complete v1.1 implementation should eventually include:

```text
Personality definition format

Personality loader

Runtime personality compiler

Identity storage in iris-memory

Personality versioning

Personality diff/history

Personality Change Proposal

Controlled approval flow

Personality rollback

Instance-specific personality binding
```

---

# 27. Final Definition

Iris v1.1 introduces Personality as the third major persistent dimension of an Iris Instance.

```text
Code
= what Iris is built from

Memory
= what Iris has experienced and learned

Personality
= how Iris tends to behave
```

Together with Working State and Capability:

```text
Iris Instance
=
Runtime
+
Working State
+
Memory
+
Capability
+
Personality
```

The long-term goal is not to make Iris imitate a human personality.

The goal is to give every Iris Instance a stable, understandable, versioned, and evolvable behavioral identity.
