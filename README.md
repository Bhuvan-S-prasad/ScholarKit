# ScholarKit 🎓⚡

> **A Model Context Protocol (MCP) Toolkit for Autonomous Research Paper Analysis, Literature Review Management, and Newsletter Delivery.**

[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol_Toolkit-FF6C37.svg?style=for-the-badge&logo=anthropic)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-black.svg?style=for-the-badge&logo=bun)](https://bun.sh/)
[![Neon](https://img.shields.io/badge/Neon-Serverless_Postgres-00E599.svg?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![OpenRouter](https://img.shields.io/badge/LLM-OpenRouter_Gateway-6366F1.svg?style=for-the-badge)](https://openrouter.ai/)

---

## 🌟 What is ScholarKit?

**ScholarKit** is an **MCP-native research intelligence toolkit** designed to empower AI coding agents (Claude Desktop, Antigravity, Cursor, Windsurf) with deep academic research paper ingestion, comparative synthesis, literature review drafting, and automated Telegram digest broadcasting.

Built on the **Model Context Protocol (MCP)** with a **Shared-Core Monorepo Architecture**, ScholarKit transforms raw scientific papers into structured knowledge graphs that both AI agents and human researchers can query, rank, and publish.

```
                               ┌────────────────────────────────────────┐
                               │  AI Agents (Claude, Antigravity, IDE)  │
                               └───────────────────┬────────────────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
            ┌─────────────────────────┐                         ┌─────────────────────────┐
            │   Local MCP (Stdio)     │                         │   Remote MCP (HTTP)     │
            │  packages/local-mcp     │                         │    apps/remote-mcp      │
            └────────────┬────────────┘                         └────────────┬────────────┘
                         │                                                   │
                         └─────────────────────────┬─────────────────────────┘
                                                   │
                                                   ▼
                               ┌───────────────────────────────────────┐
                               │       @scholarkit/core (Shared)       │
                               │   - Paper Ingestion & Extraction      │
                               │   - Literature Review & Ranking       │
                               │   - Newsletter State Machine          │
                               │   - OpenRouter Injected LLM Client    │
                               └───────────────────┬───────────────────┘
                                                   │
                                                   ▼
                               ┌───────────────────────────────────────┐
                               │       @scholarkit/db (Storage)        │
                               │        Neon Serverless Postgres       │
                               └───────────────────────────────────────┘
```

---

## 🔌 MCP Tools Reference

ScholarKit exposes its entire research engine as standardized **MCP Tools** over stdio or streamable HTTP:

### 📄 Paper Operations

| MCP Tool         | Description                                                                                                      | Input Parameters                                         |
| :--------------- | :--------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| `ingest_paper`   | Ingests a paper from arXiv ID or URL, parses Atom XML feed, and persists in Neon DB.                             | `identifier: string`                                     |
| `extract_paper`  | Runs structured methodology, findings, contributions, and limitation extraction via LLM with confidence scoring. | `paperId: string`, `useStub?: boolean`, `model?: string` |
| `analyze_papers` | Conducts cross-paper comparative matrix analysis and identifies research gaps.                                   | `paperIds: string[]`, `model?: string`                   |
| `list_papers`    | Lists all ingested papers with extraction confidence and metadata.                                               | `limit?: number`                                         |

### 📚 Literature Review Operations

| MCP Tool                  | Description                                                                                                        | Input Parameters                                                                 |
| :------------------------ | :----------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| `create_review_project`   | Initializes a new literature review project with inclusion & exclusion criteria.                                   | `title: string`, `query: string`, `inclusion?: string[]`, `exclusion?: string[]` |
| `rank_papers`             | Classifies and ranks ingested papers (`highly_relevant`, `relevant`, `background`, `irrelevant`) against criteria. | `projectId: string`, `model?: string`                                            |
| `draft_literature_review` | Generates a synthesized markdown literature review draft with thematic sections and citations.                     | `projectId: string`, `model?: string`                                            |

### 📰 Newsletter & Publishing Operations

| MCP Tool                       | Description                                                                                                    | Input Parameters                                          |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------- |
| `draft_newsletter`             | Assembles a structured newsletter draft from recent or specified papers.                                       | `title: string`, `paperIds?: string[]`, `target?: string` |
| `transition_newsletter_status` | Advances the 7-stage review state machine (`submit_for_review`, `approve`, `schedule`, `start_sending`, etc.). | `newsletterId: string`, `action: string`                  |
| `preview_newsletter`           | Generates Telegram-formatted HTML with 4096-character chunk boundary analysis.                                 | `newsletterId: string`                                    |
| `send_newsletter`              | Dispatches newsletter chunks to Telegram chat/channel with 1-second rate-limit pacing.                         | `newsletterId: string`, `chatId?: string`                 |

---

## ⚙️ Connecting to MCP Clients

### 1. Claude Desktop Configuration

Add ScholarKit to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "scholarkit": {
      "command": "bun",
      "args": ["run", "packages/local-mcp/src/index.ts"],
      "cwd": "/path/to/ScholarKit",
      "env": {
        "DATABASE_URL": "postgresql://...",
        "OPENROUTER_API_KEY": "sk-or-v1-..."
      }
    }
  }
}
```

### 2. Antigravity IDE / Cursor / Roo Code (`mcp.json`)

```json
{
  "mcpServers": {
    "scholarkit": {
      "command": "bun",
      "args": ["run", "packages/local-mcp/src/index.ts"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

---

## 🏛️ The Three Functional Pillars

### 1. Research Paper Analyst

- Direct **arXiv ingestion** with live Atom feed XML parsing.
- Structured **methodology, dataset, key findings, and limitation** extraction.
- **Extraction Confidence Evaluation**: Automatically detects ambiguous or low-confidence outputs to flag for human review.
- Cross-paper **comparative synthesis** identifying shared limitations and future research opportunities.

### 2. Literature Review Manager

- Research project tracking with **scoped inclusion and exclusion criteria**.
- Automated **relevance classification** with LLM reasoning.
- Synthesizes comprehensive markdown literature reviews with structured executive summaries, thematic sections, citations, and identified gaps.

### 3. Newsletter Operator & Telegram Delivery

- Assembles multi-section digests with deep-dive spotlights and quick takes.
- **7-Stage Review State Machine**:
  ```text
  draft ──submit──▶ in_review ──approve──▶ approved ──schedule──▶ scheduled ──send──▶ sending ──▶ sent
    ▲                    │                                                                 │
    └──request_changes───┘                                                             (err)──▶ failed ──retry
  ```
- **Telegram Broadcast Engine**: Automated 4096-character chunking and 1-message-per-second rate pacing to prevent bot rate limits.

---

## 🏗️ Monorepo Architecture

```
scholarkit/
├── packages/
│   ├── core/                    # @scholarkit/core: Pure domain logic, Zod validation, OpenRouter client
│   │   ├── src/operations/      # Pure operations: ingestion, extraction, analysis, literature, workflow, telegram
│   │   └── src/schemas.ts       # Runtime Zod validation contracts
│   ├── db/                      # @scholarkit/db: Neon Serverless Postgres + Prisma ORM
│   │   └── src/schema.prisma    # Models: Paper, Extraction, LitReview, Newsletter, Subscriber, DeliveryLog
│   ├── cli/                     # @scholarkit/cli: Interactive terminal interface
│   │   └── src/commands/        # CLI commands for paper, review, and newsletter
│   └── local-mcp/               # @scholarkit/local-mcp: Stdio MCP server for local agents
├── apps/
│   └── remote-mcp/              # apps/remote-mcp: Hono streamable HTTP MCP server (Clerk auth + Webhooks)
├── skills/
│   └── scholarkit-skill/        # Agent skill instructions & tool usage patterns
├── docker-compose.yml           # Disposable local Postgres (shadow DB & testing)
└── tsconfig.json
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **[Bun](https://bun.sh/)** (`>= 1.1.0`)
- **[Neon PostgreSQL](https://neon.tech/)** database account
- **[OpenRouter API Key](https://openrouter.ai/)**

### 2. Clone & Setup

```bash
git clone https://github.com/Bhuvan-S-prasad/ScholarKit.git
cd ScholarKit
bun install
```

### 3. Configure `.env`

```bash
cp .env.example .env
```

```env
# Database (Neon Serverless Postgres)
DATABASE_URL="postgresql://user:password@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"

# LLM Provider (OpenRouter)
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openai/gpt-oss-20b:free" # Or anthropic/claude-3.5-sonnet, google/gemini-2.5-flash

# Telegram Bot (Optional for Publishing)
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_CHAT_ID="@your_channel"
```

### 4. Apply Database Migrations

```bash
bun run --filter @scholarkit/db migrate:dev --name init
```

---

## 💻 CLI Usage

In addition to MCP tool execution, ScholarKit includes a standalone CLI:

```bash
bun run dev:cli --help
```

### 📄 Paper Commands

```bash
# Ingest arXiv paper
bun run dev:cli paper ingest 2312.12456

# List ingested papers
bun run dev:cli paper list

# Extract methodology & findings (Deterministic offline stub)
bun run dev:cli paper extract 2312.12456 --stub

# Extract with OpenRouter LLM
bun run dev:cli paper extract 2312.12456 --model "openai/gpt-oss-20b:free"

# Multi-paper comparative analysis
bun run dev:cli paper analyze 2312.12456 2401.05678
```

### 📚 Literature Review Commands

```bash
# Initialize a review project
bun run dev:cli review init "Consumer GPU LLM Serving" \
  -q "LLM inference optimizations on consumer GPUs" \
  -i "Requires GPU-CPU hybrid strategies" "Evaluates latency" \
  -e "Pre-2022 papers"

# Rank ingested papers against criteria
bun run dev:cli review rank <project-id>

# Generate markdown literature review draft
bun run dev:cli review draft <project-id> -o "./review_draft.md"
```

### 📰 Newsletter & Publishing Commands

```bash
# Draft newsletter issue
bun run dev:cli newsletter draft "ScholarKit Weekly: Issue 1"

# Advance state machine: submit -> approve
bun run dev:cli newsletter transition <id> submit_for_review
bun run dev:cli newsletter transition <id> approve

# Preview Telegram HTML chunk boundaries
bun run dev:cli newsletter preview <id>

# Dispatch to Telegram channel
bun run dev:cli newsletter send <id> --chat-id "@my_channel"
```

---

## 🧪 Testing

```bash
# Run unit tests across pure core operations
bun test packages/core
```

---

## 🛠️ Technology Stack

| Layer           | Technology                                                          | Purpose                                                     |
| :-------------- | :------------------------------------------------------------------ | :---------------------------------------------------------- |
| **Protocol**    | **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** | Native tool abstraction for AI agents                       |
| **Runtime**     | **[Bun](https://bun.sh)**                                           | Fast package manager, TypeScript runtime, and test runner   |
| **Validation**  | **[Zod](https://zod.dev)**                                          | Strict runtime schemas and validated LLM JSON contracts     |
| **Database**    | **[Neon Postgres](https://neon.tech)**                              | Serverless cloud PostgreSQL with connection pooling         |
| **ORM**         | **[Prisma](https://prisma.io)**                                     | Type-safe schema migrations and querying                    |
| **LLM Gateway** | **[OpenRouter](https://openrouter.ai)**                             | Unified API for Claude, GPT, Llama, Gemini, and open models |
| **Delivery**    | **[Telegram Bot API](https://core.telegram.org/bots/api)**          | HTML digest publishing with rate pacing                     |

---
