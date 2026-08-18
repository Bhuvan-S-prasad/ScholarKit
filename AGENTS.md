# AGENTS.md — ScholarKit

This file is the persistent context for any coding agent ( Code, etc.) working in this repo. Read this before making structural changes. If you make a decision that contradicts or extends this file, update the file in the same commit.

`AGENTS.md` in this repo is a symlink/copy of this file — keep them identical if both exist.

---

## 1. What this project is

**ScholarKit** — a research paper analyst + newsletter tool, built as a shared-core, multi-adapter monorepo. One core of validated operations, exposed through several thin adapters (CLI, local MCP, remote MCP, Telegram delivery).

Three functional pillars, all built on the same core:

1. **Research Paper Analyzer** — ingest papers → extract methodology/results → compare → identify limitations → generate literature notes
2. **Literature Review Manager** — search → deduplicate → classify → rank relevance → summarize → build a literature review
3. **Research Briefing Operator** — generate → personalize → review → schedule → send → track, delivered via Telegram only

Pillars 1–2 are the **content engine**. Pillar 3 is the **delivery layer** that packages output from 1–2 (or general research digests) into something sendable.

**Full design doc:** see `docs/implementation-plan.md` (the plan this file is derived from) for the complete rationale, schema details, and open decisions. This file is the condensed, agent-facing summary — the plan doc is the source of truth for anything not covered here.

---

## 2. Architecture rules (non-negotiable)

This project follows a **shared-core pattern**. The rules that make that pattern actually hold:

- **`packages/core` has no I/O concerns.** No HTTP, no CLI parsing, no direct `PrismaClient` construction, no hardcoded API keys. It exports pure(ish) functions that take validated input and return validated output. Every adapter (`cli`, `local-mcp`, `remote-mcp`) calls into `core` — logic never gets duplicated in an adapter "just this once."
- **Zod is the runtime contract.** Every operation's input and output is validated against a Zod schema in `packages/core/src/schemas.ts`, including LLM-generated output. Nothing crosses an operation boundary unvalidated.
- **LLM-backed operations use an injected client.** `extraction.ts`, `analysis.ts`, and the classify/rank functions in `literature.ts` take a model client as a parameter (see `operations/llm-client.ts`), never import an LLM provider SDK directly inside `core` operation files. This is what keeps `core`'s test suite from needing a live API key.
- **Structured output from the LLM is validated, not trusted.** Prompt for JSON matching the target Zod schema → parse → validate. One retry with the validation error fed back into the prompt on failure. Two failures → typed error, never silently-wrong data.
- **`packages/db` owns the Prisma client lifecycle; `core` doesn't.** `core` depends on the Prisma-generated types, not on constructing its own client. Each app (`cli`, `local-mcp`, `remote-mcp`) owns its own client instance/connection lifecycle via `packages/db`.
- **Papers and literature review entries do not go through the review/approval state machine.** Only `Briefing`/digest records do (`draft → in_review → approved → scheduled → sending → sent`, with `changes_requested` and `failed → retry` branches). Don't add approval gates to paper ingestion/extraction — that's scope creep from the content-hub project this pattern was originally built for.
- **Docker is not the database.** Neon (cloud Postgres) is the one and only dev/prod database. Docker's job is local disposable infrastructure (test DB, Prisma shadow DB) and packaging `remote-mcp` for deployment — never a substitute persistent datastore. See §6a.

---

## 3. Tech stack

| Layer                     | Choice                               | Notes                                                                                                                                                                                       |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                  | TypeScript, ESM, workspaces monorepo | `package.json` workspaces: `packages/*`, `apps/*`                                                                                                                                           |
| Validation                | Zod                                  | Single source of truth for runtime shapes                                                                                                                                                   |
| Database                  | **Neon** (serverless Postgres)       | One Postgres story for dev and prod via Neon branches — no SQLite anywhere                                                                                                                  |
| ORM                       | **Prisma**                           | `schema.prisma` in `packages/db`. Use the **pooled** connection string at runtime, the **direct** connection string for `prisma migrate`                                                    |
| Containerization          | **Docker / Docker Compose**          | `docker-compose.yml` at repo root runs a disposable local Postgres for tests + Prisma shadow DB; `apps/remote-mcp` ships a `Dockerfile` for deployment. Does **not** replace Neon — see §6a |
| LLM Provider              | **OpenRouter** (Injected Client)     | Supports Claude, GPT, Llama, and reasoning models via unified OpenRouter endpoint (`OPENROUTER_API_KEY`)                                                                                   |
| MCP transport (remote)    | Hono, streamable HTTP                | `apps/remote-mcp`                                                                                                                                                                           |
| Auth (remote MCP clients) | Clerk                                | Authenticates MCP _clients_, unrelated to Telegram                                                                                                                                          |
| Delivery                  | Telegram Bot API                     | Single delivery target for v1 — no other platforms in scope                                                                                                                                 |
| CLI                       | commander                            | `packages/cli`                                                                                                                                                                              |

**Deployment target for `remote-mcp`: plain Node container, not edge**, unless a specific reason emerges to move it. This matters because standard Prisma (`node-postgres` engine) doesn't run on edge runtimes (Cloudflare Workers, Vercel Edge) — that would require swapping in `@prisma/adapter-neon`. Don't add that adapter speculatively; add it only if/when an edge deployment is actually decided. The `Dockerfile` in `apps/remote-mcp` targets a standard Node base image (e.g. `node:22-slim`) for exactly this reason.

---

## 4. Folder structure

```
scholarkit/
├── package.json                 # workspaces: packages/*, apps/*
├── docker-compose.yml           # local Postgres (test DB + Prisma shadow DB) — NOT the dev/prod DB
├── docs/
│   └── implementation-plan.md   # full design doc — source of truth for detail
├── packages/
│   ├── cli/
│   │   └── src/index.ts         # commander: paper, review, briefing sub-commands
│   ├── core/
│   │   └── src/
│   │       ├── schemas.ts
│   │       ├── config.ts              # centralized model defaults & configuration
│   │       ├── operations/
│   │       │   ├── ingestion.ts       # arXiv fetch & multi-paper search parsing
│   │       │   ├── extraction.ts      # LLM-backed structured extraction & confidence
│   │       │   ├── analysis.ts        # LLM-backed comparative matrix & gap analysis
│   │       │   ├── literature.ts      # LLM-backed (4-tier classification, ranking & review draft)
│   │       │   ├── briefing.ts        # review-to-briefing & recent papers roundup synthesis
│   │       │   ├── workflow.ts        # review state machine transitions
│   │       │   ├── scheduler.ts       # pure scheduled queue evaluations
│   │       │   ├── subscribers.ts
│   │       │   ├── tracking.ts
│   │       │   ├── llm-client.ts      # injectable model client
│   │       │   └── publish/
│   │       │       └── telegram.ts
│   │       └── index.ts
│   ├── db/
│   │   └── src/
│   │       ├── schema.prisma          # single Prisma schema, Neon Postgres provider
│   │       ├── client.ts              # PrismaClient singleton (pooled connection)
│   │       └── migrations/            # generated by `prisma migrate dev`
│   └── local-mcp/
│       └── src/index.ts
├── apps/
│   └── remote-mcp/
│       └── src/
│           ├── index.ts         # Hono app, streamable HTTP transport
│           ├── auth.ts          # Clerk OAuth (MCP client access)
│           ├── webhooks.ts      # Telegram webhook: /start, /stop, incoming updates
│           └── scheduler.ts     # polling worker for scheduled sends
│       ├── Dockerfile           # Node image, builds + runs the Hono app
│       └── .dockerignore
├── skills/
│   └── scholarkit-skill/
│       └── SKILL.md
└── mcp.json
```

Keep new files inside this structure. If something doesn't obviously fit, flag it in the PR/commit description rather than inventing a new top-level folder.

---

## 5. Domain model (summary — see `docs/implementation-plan.md` §3 for full field lists)

**Enums:**

```ts
PaperSource = "arxiv" | "doi" | "pdf_upload" | "url";
PaperStatus = "ingested" | "extracting" | "extracted" | "analyzed" | "archived";
ContentType = "paper_note" | "literature_review" | "research_briefing" | "briefing" | "newsletter" | "digest";
ReviewStatus =
  "draft" |
  "in_review" |
  "changes_requested" |
  "approved" |
  "scheduled" |
  "sending" |
  "sent" |
  "failed";
DeliveryTarget = "telegram_dm" | "telegram_channel" | "telegram_group";
```

**Prisma models:** `Paper`, `PaperExtraction`, `LitReviewProject`, `LitReviewEntry`, `Briefing`, `BriefingSection`, `Subscriber`, `DeliveryLog`

**State machine (briefings/digests only):**

```
draft ──submit──▶ in_review ──approve──▶ approved ──schedule──▶ scheduled ──(worker fires)──▶ sending ──▶ sent
  ▲                    │                                                                          │
  └──request_changes───┘                                                                      (error)──▶ failed ──retry──▶ sending
```

---

## 6. Things that will bite you if ignored

- **Telegram message length is 4096 chars.** `sendDigest` must chunk, not truncate.
- **Telegram rate limits:** ~1 msg/sec to the same chat, ~30/sec aggregate across chats. Pace broadcasts from day one — don't fire a tight loop over `subscribers`.
- **Telegram bots can't DM a user until that user has `/start`ed the bot.** The subscriber "connect" flow is the webhook capturing `chat_id` on `/start`, not an OAuth redirect. There is no consent screen to build.
- **Neon connection limits:** always use the **pooled** connection string (`?pgbouncer=true`) for the Prisma client used at runtime (`packages/db/src/client.ts`). Use the **direct** connection string only for `prisma migrate`. Getting this backwards exhausts Neon's connection limit fast, especially from short-lived CLI invocations.
- **PDF text extraction happens locally, before anything reaches the LLM.** Use a parsing library, not the model, to pull raw text out of a PDF. Very long papers may need chunking before extraction — don't assume a whole paper fits in one prompt.
- **LLM extraction confidence is not decoration.** `PaperExtractionSchema.confidence` should drive behavior — low confidence should flag the extraction for human review rather than being silently treated as fact downstream (e.g. in a generated literature review or briefing section).
- **Don't add per-platform OAuth.** This project deliberately has one delivery target and one bot token. If a request implies adding Slack/email/another platform, that's a different project (the content-publishing-hub pattern), not this one.
- **Don't point the app's runtime `DATABASE_URL` at the Docker Compose Postgres.** That container exists for tests and the Prisma shadow DB only — it's ephemeral and has no real data. Dev/prod always use a Neon connection string. See §6a.

---

## 6a. Docker & local test database

Docker is scoped narrowly here — it is **not** a replacement for Neon, and it is **not** how `cli` or `local-mcp` get run day-to-day (those are invoked directly on the host/in the agent's shell, since they're stdio-based tools a user or agent runs locally).

What Docker _is_ for in this repo:

- **`docker-compose.yml` (repo root) — a disposable local Postgres container**, used for two things only:
  1. **Prisma's shadow database.** `prisma migrate dev` needs a shadow DB to detect drift when generating migrations. Point `shadowDatabaseUrl` in `schema.prisma` at this container instead of provisioning a second Neon branch for it — faster, free, and fully disposable.
  2. **The test suite's database**, when a test needs a real Postgres instead of a mocked Prisma client (most `core` unit tests shouldn't need this at all — see §2's injected-client rule — but integration tests around `packages/db` will). Tests should be able to run against this container with zero effect on the Neon dev database.
  - Bring it up with `docker compose up -d`, tear down with `docker compose down -v` (the `-v` matters — it's meant to be wiped, not persisted).
- **`apps/remote-mcp/Dockerfile` — packaging for deployment.** Multi-stage build (install + build in one stage, slim runtime image in the final stage), standard Node base image, connects out to Neon via the pooled connection string exactly like a non-containerized deployment would. This is the only Dockerfile in the repo that's about _shipping_ something rather than local dev support.
- `packages/cli` and `packages/local-mcp` are **not** containerized — no `Dockerfile` for either. They're meant to run directly where the user/agent is working.

If a task seems to call for a database inside Docker for anything other than tests/shadow-DB, stop and check whether it should actually be a second Neon branch instead — that's almost always the right call for anything that needs to persist or be shared.

---

## 7. Build order (sequenced by adapter phase)

Work through each phase sequentially — each phase completes an entire adapter surface on top of the shared core before moving to the next:

### Phase 0: Foundation (Completed)
- [x] `core` + `db` scaffolding — schemas, Zod validation contracts, stub extraction, Neon Postgres schema setup, and Prisma migrations.

### Phase 1: CLI & Interactive TUI (`packages/cli`) (Completed)
- [x] **Paper Ingestion & Extraction**:
  - `scholarkit paper ingest <arxiv-id | url>` — fetch arXiv Atom feed, validate, and persist in Neon DB.
  - `scholarkit paper extract <paper-id>` — run LLM-backed structured extraction, score confidence, and store in DB.
  - `scholarkit paper analyze <paper-ids...>` — compare methodology, findings, and identify research gaps across papers.
- [x] **Literature Review**:
  - `scholarkit review init <title>` — create new literature review project.
  - `scholarkit review search <project-id>` — search arXiv for project query, deduplicate, auto-ingest, and rank.
  - `scholarkit review rank <project-id>` — classify (4 tiers) and rank ingested papers against project criteria with LLM.
  - `scholarkit review draft <project-id>` — generate structured literature review draft.
  - `scholarkit review to-briefing <project-id>` — bridge synthesized review into a structured research briefing issue draft.
- [x] **Research Briefing & Telegram Publishing**:
  - `scholarkit briefing draft <title>` — create research briefing draft from recent papers or reviews.
  - `scholarkit briefing transition <id> <action>` — advance review state machine (`submit`, `approve`, `schedule`).
  - `scholarkit briefing schedule <id> [time]` — schedule approved issues for future delivery.
  - `scholarkit briefing worker [--run-once]` — cron-friendly queue worker to dispatch due scheduled sends to Telegram.
  - `scholarkit briefing preview <id>` — chunk analysis and formatting.
  - `scholarkit briefing send <id>` — send digest to Telegram with rate pacing and 4096-char chunking.
- [x] **Interactive Dashboard (TUI)**:
  - `scholarkit tui [--dev]` — dual-pane master-detail dashboard with debounced filtering (`/`), full keyboard navigation, arXiv ingestion modal (`[i]`), live extraction (`[e]`), review project auto-search prompt, on-demand search (`[s]`), review ranking (`[r]`), draft synthesis (`[d]`), review-to-briefing bridge (`[N]`), contextual workflow hints, editorial approvals (`[a]`/`[c]`), schedule triggers (`[S]`), worker dispatcher (`[w]`), briefing state machine (`[t]`), and Telegram preview (`[p]`).

### Phase 2: Local MCP Server (`packages/local-mcp`) (Completed)
Expose all validated core domain operations as agent tools over stdio:
- [x] Stdio MCP Server setup using `@modelcontextprotocol/sdk`.
- [x] Register Paper Tools (`ingest_paper`, `extract_paper`, `analyze_papers`, `list_papers`, `get_paper`).
- [x] Register Literature Review Tools (`create_review_project`, `search_arxiv_papers`, `rank_papers`, `draft_literature_review`, `bridge_review_to_briefing`, `list_review_projects`).
- [x] Register Briefing & Workflow Tools (`draft_briefing`, `transition_briefing_status`, `schedule_briefing`, `dispatch_scheduled_briefings`, `send_briefing`, `preview_briefing_telegram`, `list_briefings`).
- [x] Connect and test with local IDE / Claude Desktop / Antigravity via `mcp.json`.

### Phase 3: Remote MCP Server (`apps/remote-mcp`)
Build multi-client remote MCP deployment:
- [ ] Hono app with streamable HTTP transport for remote MCP clients.
- [ ] Clerk authentication middleware for MCP client access control.
- [ ] Telegram Webhooks for subscriber `/start` & `/stop` management.
- [ ] Background polling worker / scheduler for scheduled sends (using core `evaluateScheduledQueue`).
- [ ] `apps/remote-mcp/Dockerfile` multi-stage build for container deployment.

### Phase 4: Agent Skill (`skills/scholarkit-skill`)
- [ ] Write `SKILL.md` documenting tool usage patterns, confidence threshold handling, and workflow state machines for coding agents.

---

## 8. Open decisions (resolved & documented)

- **Literature Review Scope (v1 vs Roadmap)**: **RESOLVED (v1 = Ingested Repository Classification & Synthesis + arXiv Query Search)**. In v1, the Literature Review manager queries arXiv Atom API for project research queries (`searchArxivPapers`), deduplicates by arXiv `sourceId` against Neon DB, classifies (into 4 tiers: `highly_relevant`, `relevant`, `background`, `irrelevant`) and ranks papers (`classifyAndRankPapers`), synthesizes structured drafts (`buildLiteratureReviewDraft`), and bridges drafts into research briefings (`createBriefingFromLiteratureReview`). Multi-provider external search APIs (Semantic Scholar / PubMed) are deferred to future roadmap.
- **Production Scheduling Mechanism**: **RESOLVED (CLI Cron-Worker + Remote Poller)**. In CLI/standalone mode, `scholarkit briefing worker --run-once` (triggered via OS cron, GitHub Actions, or task scheduler) is the production queue executor. In Phase 3 (`apps/remote-mcp`), the Hono background scheduler calls the same shared core evaluation logic (`evaluateScheduledQueue`).
- **Single-user tool vs. multi-subscriber briefing?** Determines whether `Subscriber`/`DeliveryLog`/webhook/`remote-mcp`+Clerk are needed at all in v1. Default assumption until told otherwise: **build solo-mode first** (CLI and Local MCP), defer the subscriber/delivery machinery.
- **Channel broadcast vs. per-subscriber DM** for Telegram — DM is implied by "personalize" being in the briefing spec, but channel is the faster MVP if personalization can wait.
- Paper sources beyond arXiv (Semantic Scholar, PubMed) — not needed for v1.
- PDF handling — local upload only, or also fetch-by-URL?
- Extraction confidence threshold — exact cutoff for "flag to human" not yet set (defaults to 0.75).
- Node vs. edge for `remote-mcp` — defaults to Node/Docker (see §3); only revisit if there's a concrete reason.

---

## 9. Commands

```bash
# install
bun install

# local test/shadow database (Docker)
docker compose up -d          # start disposable local Postgres for tests + Prisma shadow DB
docker compose down -v        # stop and wipe it — safe, it holds no real data

# db (Neon — dev/prod)
bun run --filter @scholarkit/db generate         # regenerate Prisma client after schema edits
bun run --filter @scholarkit/db migrate:dev      # apply schema changes to Neon
bun run --filter @scholarkit/db studio           # open Prisma Studio DB viewer

# cli dev
bun run dev:cli --help
bun run dev:cli paper ingest 2312.12456

# local mcp
bun run --filter @scholarkit/local-mcp dev

# remote mcp
bun run --filter @scholarkit/remote-mcp dev
docker build -t scholarkit-remote-mcp apps/remote-mcp
docker run --env-file apps/remote-mcp/.env -p 3000:3000 scholarkit-remote-mcp

# test
bun test
```

