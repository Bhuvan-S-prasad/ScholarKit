# AGENTS.md — ScholarKit

This file is the persistent context for any coding agent working in this repo. Read this before making structural changes. If you make a decision that contradicts or extends this file, update the file in the same commit.

`AGENTS.md` in this repo is a symlink/copy of this file — keep them identical if both exist.

---

## 1. What this project is

**ScholarKit** — a research paper analyst + newsletter tool, built as a shared-core, multi-adapter monorepo. One core of validated operations, exposed through several thin adapters (CLI, local MCP, remote MCP, Telegram delivery).

Three functional pillars, all built on the same core:

1. **Research Paper Analyzer** — ingest papers → extract methodology/results → compare → identify limitations → generate literature notes
2. **Literature Review Manager** — search → deduplicate → classify → rank relevance → summarize → build a literature review
3. **Newsletter Operator** — generate → personalize → review → schedule → send → track, delivered via Telegram only

Pillars 1–2 are the **content engine**. Pillar 3 is the **delivery layer** that packages output from 1–2 (or general research digests) into something sendable.

**Full design doc:** see `docs/implementation-plan.md` (the plan this file is derived from) for the complete rationale, schema details, and open decisions. This file is the condensed, agent-facing summary — the plan doc is the source of truth for anything not covered here.

---

## 2. Architecture rules (non-negotiable)

This project follows a **shared-core pattern**. The rules that make that pattern actually hold:

- **`packages/core` has no I/O concerns.** No HTTP, no CLI parsing, no direct `PrismaClient` construction, no hardcoded API keys. It exports pure(ish) functions that take validated input and return validated output. Every adapter (`cli`, `local-mcp`, `remote-mcp`) calls into `core` — logic never gets duplicated in an adapter "just this once."
- **Zod is the runtime contract.** Every operation's input and output is validated against a Zod schema in `packages/core/src/schemas.ts`, including LLM-generated output. Nothing crosses an operation boundary unvalidated.
- **LLM-backed operations use an injected client.** `extraction.ts`, `analysis.ts`, and the classify/rank functions in `literature.ts` take a model client as a parameter (see `operations/llm-client.ts`), never import the Anthropic SDK and call it inline. This is what keeps `core`'s test suite from needing a live API key.
- **Structured output from the LLM is validated, not trusted.** Prompt for JSON matching the target Zod schema → parse → validate. One retry with the validation error fed back into the prompt on failure. Two failures → typed error, never silently-wrong data.
- **`packages/db` owns the Prisma client lifecycle; `core` doesn't.** `core` depends on the Prisma-generated types, not on constructing its own client. Each app (`cli`, `local-mcp`, `remote-mcp`) owns its own client instance/connection lifecycle via `packages/db`.
- **Papers and literature review entries do not go through the review/approval state machine.** Only `Newsletter`/digest records do (`draft → in_review → approved → scheduled → sending → sent`, with `changes_requested` and `failed → retry` branches). Don't add approval gates to paper ingestion/extraction — that's scope creep from the content-hub project this pattern was originally built for.

---

## 3. Tech stack

| Layer                     | Choice                               | Notes                                                                                                                                    |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Language                  | TypeScript, ESM, workspaces monorepo | `package.json` workspaces: `packages/*`, `apps/*`                                                                                        |
| Validation                | Zod                                  | Single source of truth for runtime shapes                                                                                                |
| Database                  | **Neon** (serverless Postgres)       | One Postgres story for dev and prod via Neon branches — no SQLite anywhere                                                               |
| ORM                       | **Prisma**                           | `schema.prisma` in `packages/db`. Use the **pooled** connection string at runtime, the **direct** connection string for `prisma migrate` |
| LLM                       | Anthropic SDK, injected client       | Never imported directly inside `core` operation files                                                                                    |
| MCP transport (remote)    | Hono, streamable HTTP                | `apps/remote-mcp`                                                                                                                        |
| Auth (remote MCP clients) | Clerk                                | Authenticates MCP _clients_, unrelated to Telegram                                                                                       |
| Delivery                  | Telegram Bot API                     | Single delivery target for v1 — no other platforms in scope                                                                              |
| CLI                       | commander                            | `packages/cli`                                                                                                                           |

**Deployment target for `remote-mcp`: plain Node, not edge**, unless a specific reason emerges to move it. This matters because standard Prisma (`node-postgres` engine) doesn't run on edge runtimes (Cloudflare Workers, Vercel Edge) — that would require swapping in `@prisma/adapter-neon`. Don't add that adapter speculatively; add it only if/when an edge deployment is actually decided.

---

## 4. Folder structure

```
scholarkit/
├── package.json                 # workspaces: packages/*, apps/*
├── docs/
│   └── implementation-plan.md   # full design doc — source of truth for detail
├── packages/
│   ├── cli/
│   │   └── src/index.ts         # commander: paper, review, newsletter sub-commands
│   ├── core/
│   │   └── src/
│   │       ├── schemas.ts
│   │       ├── operations/
│   │       │   ├── ingestion.ts
│   │       │   ├── extraction.ts      # LLM-backed
│   │       │   ├── analysis.ts        # LLM-backed
│   │       │   ├── literature.ts      # LLM-backed (classify/rank)
│   │       │   ├── newsletter.ts
│   │       │   ├── workflow.ts
│   │       │   ├── scheduling.ts
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
ContentType = "paper_note" | "literature_review" | "newsletter" | "digest";
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

**Prisma models:** `Paper`, `PaperExtraction`, `LitReviewProject`, `LitReviewEntry`, `Newsletter`, `NewsletterSection`, `Subscriber`, `DeliveryLog`

**State machine (newsletters/digests only):**

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
- **LLM extraction confidence is not decoration.** `PaperExtractionSchema.confidence` should drive behavior — low confidence should flag the extraction for human review rather than being silently treated as fact downstream (e.g. in a generated literature review or newsletter section).
- **Don't add per-platform OAuth.** This project deliberately has one delivery target and one bot token. If a request implies adding Slack/email/another platform, that's a different project (the content-publishing-hub pattern), not this one.

---

## 7. Build order (current status: not yet started)

Work through in this order — each step is meant to prove the previous one before adding complexity:

1. [ ] `core` + `db` scaffolding — schemas, ingestion/extraction Zod schemas, stub extraction with fixed test data (no LLM call yet). Stand up the Neon project, write `schema.prisma`, run first `prisma migrate dev`.
2. [ ] arXiv ingestion (`ingestPaperFromArxiv`) — no auth, proves ingest → store end to end.
3. [ ] LLM-backed extraction — wire the injectable model client, validate against `PaperExtractionSchema`. Highest-risk piece; get it solid before building on top.
4. [ ] `cli` — enough commands to ingest/extract papers locally.
5. [ ] `literature.ts` — search, dedupe, classify, rank, build review.
6. [ ] Telegram publish path — `sendMessage` (port from prior SendKit work if available), `sendDigest` chunking + rate pacing.
7. [ ] Subscriber webhook — `/start`/`/stop`, `Subscriber` table.
8. [ ] `newsletter.ts` + scheduling — generate, personalize, review workflow, scheduled send.
9. [ ] `local-mcp` — expose operations as agent tools.
10. [ ] `remote-mcp` + Clerk auth — **only if** multi-client remote access is actually needed (see open decisions below; may be skippable for a solo-researcher deployment).
11. [ ] `skill` — write once the tool surface and confidence-handling conventions are stable.

Update the checkboxes in this file as steps complete. Don't jump ahead to a later step's polish while an earlier step is still unproven — e.g. don't build rate-limit pacing for Telegram before extraction is validated end to end.

---

## 8. Open decisions (resolve before the relevant build step, not before)

- **Single-user tool vs. multi-subscriber newsletter?** Determines whether `Subscriber`/`DeliveryLog`/webhook/`remote-mcp`+Clerk are needed at all in v1. Default assumption until told otherwise: **build solo-mode first** (steps 1–5, 9), defer the subscriber/delivery machinery.
- **Channel broadcast vs. per-subscriber DM** for Telegram — DM is implied by "personalize" being in the newsletter spec, but channel is the faster MVP if personalization can wait.
- Paper sources beyond arXiv (Semantic Scholar, PubMed) — not needed for v1.
- PDF handling — local upload only, or also fetch-by-URL?
- Extraction confidence threshold — exact cutoff for "flag to human" not yet set.
- Node vs. edge for `remote-mcp` — defaults to Node (see §3); only revisit if there's a concrete reason.

If you're an agent picking up work and one of these blocks the next step, ask rather than guessing — these are product decisions, not implementation details.

---

## 9. Commands (fill in once scaffolded)

```bash
# install
pnpm install   # or npm/yarn — confirm which once package.json exists

# db
pnpm --filter db prisma migrate dev      # local schema changes
pnpm --filter db prisma generate         # regenerate client after schema edits

# dev
pnpm --filter cli dev
pnpm --filter local-mcp dev
pnpm --filter remote-mcp dev

# test
pnpm test               # core operations should be testable with mocked llm-client, no live API key needed
```

Update this section with real scripts as soon as `package.json` files exist — don't leave it aspirational once the project is running.
