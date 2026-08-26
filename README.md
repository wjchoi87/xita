# XITA

> **Human-Controlled, Agent-Operated Product Operating System**
> **System of Context for continuously evolving products**

**XITA = X + VITA**
- **X** — intelligence, transformation, and connection in the AI era
- **VITA** — life

**XITA connects the life of products that stay alive and keep evolving with AI.**

---

## The Problem

AI coding has made building software radically faster. But the faster you ship, the faster your context falls apart:

- Important decisions are made in conversations, then quickly forgotten.
- Documents are stale from the moment they are created.
- Over time it becomes unclear why a product looks the way it does.
- Every time an AI agent changes, its context has to be re-built from scratch.

Planning tools, issue trackers, and documentation tools only solve part of this. The product itself — what it is, how it got here, and where it's going — remains scattered.

## What XITA Does

XITA is **not** another repository or project tracker. It is a living record that keeps your product's context whole and connected: a single place that shows what your product is right now, why it became this way, and what's changing.

It links the tools you already use — GitHub, Linear, Figma, docs — and owns what they can't: **context, decisions, and meaning.** It is the **System of Context** for continuously evolving products.

## How It Works

- **A product is permanent.** Products never "finish." They evolve.
- **Changes are temporary.** A change is the smallest unit of evolution (`IDEA → PLAN ⇄ BUILD → SHIP`), and completed changes fold into the product's history.
- **Humans decide *why* and *when*. Agents execute *how*.** Agents research, analyze, propose, and maintain context; humans approve direction and make the final calls.
- **Zero complexity for humans.** The internal engine can be as complex as it needs to be — the human experience stays simple: **say → see → decide → (when needed) "work on this."** If you're managing tags, linking relations, or manually updating status, the design is wrong.
- **No one manages the product by hand.** Agents handle state, history, and documentation so you stay in control without doing the bookkeeping.

## Key Ideas

| Concept | Meaning |
| --- | --- |
| **Change** | Basic unit of product evolution, from idea to ship |
| **Capability** | What the product can currently do |
| **Living Artifact** | Documents that keep evolving with revisions, not one-time outputs |
| **Needs You** | An inbox that shows only what needs your judgment |
| **Agent Handoff** | A clean context snapshot handed to an agent when it's time to build |

## Where It Runs

| Platform | Role |
| --- | --- |
| **macOS** (SwiftUI) | Primary full experience — explore, review, and execute |
| **Mobile** (React Native) | Capture and decide on the go |
| **Core** (AdonisJS + PostgreSQL) | Product OS engine and API |
| **Web** | Fallback / admin only |

## Getting Started

The repository is a monorepo scaffold. Platform and package directories are ready for implementation:

```
apps/server        XITA Core — AdonisJS / PostgreSQL API
apps/mobile        XITA Mobile — React Native / Expo
macos/xita         XITA macOS — SwiftUI
packages/shared    Shared types and utilities
packages/agent-contracts   Agent interface contracts
```

## License

[MIT](./LICENSE)