# ScholarKit 🎓⚡

> **A Model Context Protocol (MCP) Toolkit for Autonomous Research Paper Analysis, Literature Review Management, and Research Briefing Delivery.**

[![MCP](https://img.shields.io/badge/MCP-Model_Context_Protocol_Toolkit-FF6C37.svg?style=for-the-badge&logo=anthropic)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-black.svg?style=for-the-badge&logo=bun)](https://bun.sh/)
[![Neon](https://img.shields.io/badge/Neon-Serverless_Postgres-00E599.svg?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![OpenRouter](https://img.shields.io/badge/LLM-OpenRouter_Gateway-6366F1.svg?style=for-the-badge)](https://openrouter.ai/)

---

## 🌟 What is ScholarKit?

**ScholarKit** is an **MCP-native research intelligence toolkit** designed to empower AI coding agents (Antigravity IDE, Claude Desktop, Cursor, Roo Code, Windsurf) with deep academic research paper ingestion, comparative synthesis, literature review drafting, and automated Telegram research briefing broadcasting.

Built on the **Model Context Protocol (MCP)** with a **Shared-Core Monorepo Architecture**, ScholarKit transforms raw scientific papers into structured knowledge that both AI agents and human researchers can query, rank, synthesize, and publish.

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
                               │   - Briefing Editorial State Machine  │
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

## 🔌 MCP Tools Catalog (18 Tools)

ScholarKit exposes its complete research engine as 18 standardized **MCP Tools** over stdio:

### 📄 Pillar 1: Research Paper Operations
| MCP Tool | Description | Input Parameters |
| :--- | :--- | :--- |
| `ingest_paper` | Ingests research paper metadata from arXiv ID (e.g. `2312.12456`) or URL into Neon DB. | `arxivIdOrUrl: string` |
| `extract_paper` | Extracts structured methodology, key findings, contributions, and limitations with confidence scoring. | `paperId: string`, `useStub?: boolean`, `model?: string` |
| `analyze_papers` | Conducts cross-paper comparative matrix analysis, common limitations, and identifies research gaps. | `paperIds: string[]`, `model?: string` |
| `list_papers` | Lists ingested papers with filtering by status and search query. | `status?: enum`, `search?: string`, `limit?: number` |
| `get_paper` | Retrieves full paper metadata, abstract, and structured extraction record. | `paperIdOrSourceId: string` |

### 📚 Pillar 2: Literature Review Operations
| MCP Tool | Description | Input Parameters |
| :--- | :--- | :--- |
| `create_review_project` | Initializes a literature review project with research query, inclusion & exclusion criteria. | `title: string`, `query: string`, `description?: string`, `inclusionCriteria?: string[]`, `exclusionCriteria?: string[]` |
| `search_arxiv_papers` | Queries arXiv Atom API, deduplicates against Neon DB, and auto-ingests candidate papers. | `query: string`, `maxResults?: number`, `projectId?: string`, `model?: string` |
| `rank_papers` | Classifies and ranks candidate papers into 4 tiers (`highly_relevant`, `relevant`, `background`, `irrelevant`). | `projectId: string`, `paperIds?: string[]`, `model?: string` |
| `draft_literature_review` | Synthesizes a structured markdown literature review draft (executive summary, citations, gaps). | `projectId: string`, `model?: string` |
| `bridge_review_to_briefing` | Converts a literature review directly into a structured Research Briefing issue draft. | `projectId: string`, `model?: string` |
| `list_review_projects` | Lists literature review projects and entry counts. | `status?: enum` |

### 📰 Pillar 3: Research Briefing & Telegram Delivery Operations
| MCP Tool | Description | Input Parameters |
| :--- | :--- | :--- |
| `draft_briefing` | Assembles a structured research briefing issue draft from recent papers or custom sections. | `title: string`, `paperIds?: string[]`, `target?: enum` |
| `transition_briefing_status` | Advances the 7-stage editorial review state machine (`submit_for_review`, `approve`, `request_changes`, `schedule`, `start_sending`, etc.). | `briefingId: string`, `action: enum` |
| `schedule_briefing` | Schedules an approved research briefing for future delivery (`now`, `+1h`, `+30m`, ISO timestamp). | `briefingId: string`, `time?: string` |
| `dispatch_scheduled_briefings` | Evaluates queue and dispatches all due scheduled briefings to Telegram with 1s rate pacing. | `chatIdOverride?: string` |
| `send_briefing` | Immediately publishes and dispatches a briefing to Telegram with 4096-char chunking. | `briefingId: string`, `chatId?: string` |
| `preview_briefing_telegram` | Previews rendered Telegram HTML and 4096-character chunk boundaries. | `briefingId: string` |
| `list_briefings` | Lists research briefings filtered by editorial review status. | `status?: enum` |

---

## ⚙️ Connecting to MCP Clients

### 1. Antigravity IDE Setup
Antigravity automatically discovers ScholarKit via `.agents/mcp_config.json` in the workspace root, or you can register it globally in `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "scholarkit": {
      "command": "bun",
      "args": ["run", "packages/local-mcp/src/index.ts"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}",
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "OPENROUTER_MODEL": "${OPENROUTER_MODEL}",
        "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
        "TELEGRAM_CHAT_ID": "${TELEGRAM_CHAT_ID}"
      }
    }
  }
}
```

### 2. Claude Desktop Setup
Add ScholarKit to `%APPDATA%\Claude\claude_desktop_config.json`:

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

### 3. Cursor / Roo Code / Windsurf (`mcp.json`)
Add to your project root `mcp.json`:

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

## 🖥️ Interactive Dashboard (TUI)

ScholarKit includes a full terminal user interface (inspired by `lazygit` and `k9s`):

```bash
bun run dev:cli tui
```

```text
 ┌─────────────────────────────────────────────────────────────────────────────────────┐ 
 │ ScholarKit │ Research Briefings      Model: gpt-4o-mini                  │ DB: Neon │ 
 └─────────────────────────────────────────────────────────────────────────────────────┘ 
                                                       
  1. Papers  │   2. Reviews  │  [3. Briefings (Active)]

 ┌───────────────────┐ ┌───────────────────────────────────────────────────────────────┐ 
 │ Briefings (1)     │ │ Briefing Details & Workflow                                   │ 
 │                   │ │                                                               │ 
 │ ▶ #1 AI Systems   │ │ #1 AI Systems Research Briefing                       [DRAFT] │ 
 │                   │ │ Target: telegram_channel │ Updated: 2026-08-18                │ 
 │ 1–1 of 1   P.1/1  │ │                                                               │ 
 │                   │ │ Review Workflow Stepper:                                      │ 
 │                   │ │ [● DRAFT] ──▶ [○ IN_REVIEW] ──▶ [○ APPROVED] ──▶              │ 
 │                   │ │ [○ SCHEDULED] ──▶ [○ SENDING] ──▶ [○ SENT]                    │ 
```

### Keyboard Navigation:
- `1` / `2` / `3`: Switch views between **Papers**, **Reviews**, and **Briefings**.
- `Tab`: Switch focus between Master List and Detail View.
- `i` / `e`: Ingest paper from arXiv / Run LLM extraction.
- `c` / `s` / `r` / `d` / `N`: Create review project, search arXiv, rank papers, draft review, bridge to briefing.
- `n` / `t` / `a` / `S` / `w` / `p`: Draft briefing, transition status, approve, schedule, run worker, preview Telegram HTML.

---

## 🏛️ The Three Functional Pillars

### 1. Research Paper Analyst
- Direct **arXiv ingestion** with live Atom XML parsing and duplicate prevention.
- Structured **methodology, dataset, key findings, and limitation** extraction.
- **Confidence Evaluation**: Flags extractions below 75% confidence for human review.
- Cross-paper **comparative synthesis** identifying shared tradeoffs and research gaps.

### 2. Literature Review Manager
- Research project tracking with **scoped inclusion and exclusion criteria**.
- Automated **4-tier relevance classification** (`highly_relevant`, `relevant`, `background`, `irrelevant`) with LLM reasoning.
- Synthesizes comprehensive markdown literature reviews with structured executive summaries, thematic sections, citations, and identified gaps.
- **Bridge to Briefing**: Direct 1-click transformation into a publishable briefing issue.

### 3. Research Briefing Operator & Telegram Delivery
- Assembles multi-section research digests with deep-dive spotlights and roundups.
- **7-Stage Review State Machine**:
  ```text
  draft ──submit──▶ in_review ──approve──▶ approved ──schedule──▶ scheduled ──(worker)──▶ sending ──▶ sent
    ▲                    │                                                                    │
    └──request_changes───┘                                                                (err)──▶ failed ──retry
  ```
- **Telegram Broadcast Engine**: Automated 4096-character chunking and 1-second rate pacing to guarantee delivery without rate-limit errors.

---

## 🏗️ Monorepo Structure

```
scholarkit/
├── packages/
│   ├── core/                    # @scholarkit/core: Pure domain logic, Zod validation, OpenRouter client
│   │   ├── src/operations/      # Pure operations: ingestion, extraction, analysis, literature, briefing, telegram
│   │   └── src/schemas.ts       # Runtime Zod validation contracts
│   ├── db/                      # @scholarkit/db: Neon Serverless Postgres + Prisma ORM
│   │   └── src/schema.prisma    # Models: Paper, PaperExtraction, LitReviewProject, Briefing, DeliveryLog
│   ├── cli/                     # @scholarkit/cli: CLI and dual-pane TUI dashboard
│   │   ├── src/commands/        # CLI subcommands: paper, review, briefing
│   │   └── src/ui/              # Ink-powered reactive terminal UI
│   └── local-mcp/               # @scholarkit/local-mcp: Stdio MCP server exposing 18 native tools
├── apps/
│   └── remote-mcp/              # apps/remote-mcp: Hono streamable HTTP MCP server (Clerk auth + Webhooks)
├── skills/
│   └── scholarkit-skill/        # Agent skill instructions & tool usage patterns
├── docker-compose.yml           # Disposable local Postgres (shadow DB & testing)
├── mcp.json                     # Workspace MCP configuration
└── tsconfig.json
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **[Bun](https://bun.sh/)** (`>= 1.1.0`)
- **[Neon PostgreSQL](https://neon.tech/)** database
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
# Database (Neon Serverless Postgres - Pooled)
DATABASE_URL="postgresql://user:password@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"

# LLM Provider (OpenRouter)
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openai/gpt-4o-mini" # Or anthropic/claude-3.5-sonnet, google/gemini-2.5-flash

# Telegram Bot (Optional for Publishing)
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_CHAT_ID="@your_channel"
```

### 4. Apply Database Schema
```bash
bun run --filter @scholarkit/db db:push
```

---

## 💻 CLI Commands

```bash
# 📄 Paper Commands
bun run dev:cli paper ingest 2312.12456
bun run dev:cli paper extract 2312.12456
bun run dev:cli paper analyze <paper-id-1> <paper-id-2>
bun run dev:cli paper list

# 📚 Literature Review Commands
bun run dev:cli review init "Speculative Decoding LLM Inference" -q "Speculative Decoding"
bun run dev:cli review search <project-id>
bun run dev:cli review rank <project-id>
bun run dev:cli review draft <project-id>
bun run dev:cli review to-briefing <project-id>

# 📰 Research Briefing & Publishing Commands
bun run dev:cli briefing draft "ScholarKit Research Briefing: Issue 1"
bun run dev:cli briefing list
bun run dev:cli briefing transition <briefing-id> submit_for_review
bun run dev:cli briefing transition <briefing-id> approve
bun run dev:cli briefing schedule <briefing-id> +1h
bun run dev:cli briefing worker --run-once
bun run dev:cli briefing preview <briefing-id>
bun run dev:cli briefing send <briefing-id>

# 🖥️ Interactive Dashboard
bun run dev:cli tui
```

---

## 🧪 Testing

```bash
# Run all unit tests (Core schemas & operations)
bun test packages/core

# Run Local MCP server test suite (Tool registration & stdio handshake)
bun test packages/local-mcp

# Run interactive MCP Stdio test client
bun run packages/local-mcp/test/test-client.ts
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Protocol** | **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** | Native tool abstraction for AI coding agents |
| **Runtime** | **[Bun](https://bun.sh)** | Fast package manager, TypeScript runtime, and test runner |
| **Validation** | **[Zod](https://zod.dev)** | Strict runtime schemas and validated LLM JSON contracts |
| **Database** | **[Neon Postgres](https://neon.tech)** | Serverless cloud PostgreSQL with connection pooling |
| **ORM** | **[Prisma](https://prisma.io)** | Type-safe schema migrations and relational queries |
| **LLM Gateway** | **[OpenRouter](https://openrouter.ai)** | Unified API for Claude, GPT, Llama, Gemini, and reasoning models |
| **Terminal UI** | **[Ink](https://github.com/vadimdemedes/ink)** | React-based reactive interactive terminal dashboard |
| **Delivery** | **[Telegram Bot API](https://core.telegram.org/bots/api)** | HTML digest publishing with chunking and rate pacing |
