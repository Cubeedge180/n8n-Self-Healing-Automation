# n8n Dental Lead Automation

A self-healing automation system for dental clinic lead workflows. When an n8n workflow fails, this system automatically diagnoses the root cause using AI, applies a surgical fix, and re-executes the workflow — no human intervention required.

## How It Works

```
  n8n Workflow Fails
        │
        ▼
  ┌─────────────────────┐
  │   Express Bridge     │  ← Receives failure webhook from n8n
  │   (server.js)        │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Gemini AI          │  ← Root cause analysis on the error
  │   Root Cause Analyst │     + pattern matching against error history
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Claude Code        │  ← Reads error log, fetches workflow,
  │   Auto-Fix Agent     │     applies surgical fix via MCP tools
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │   Auto-Retry         │  ← Re-executes the fixed workflow
  │   + Error Logging    │     and logs the fix for future learning
  └─────────────────────┘
```

## Key Features

- **Self-Healing Workflows** — Failed n8n workflows are automatically diagnosed and repaired
- **AI-Powered Root Cause Analysis** — Gemini analyzes error messages and matches them against past patterns
- **Automated Repair** — Claude Code acts as a specialized fix agent, applying surgical patches via n8n's API
- **Error Memory** — Every fix is logged so future instances learn from past failures
- **Auto-Retry** — After fixing, the workflow is automatically re-executed to verify the repair
- **3-Layer Architecture** — Separation of directives (what), orchestration (decisions), and execution (deterministic scripts)

## Architecture

The project follows a **3-layer architecture** designed to maximize reliability when combining AI with business logic:

| Layer | Purpose | Location |
|-------|---------|----------|
| **Directive** | SOPs and instructions (what to do) | `directives/` |
| **Orchestration** | AI decision-making and routing | `CLAUDE.md`, `GEMINI.md` |
| **Execution** | Deterministic scripts and services | `execution/`, `server.js` |

This separation ensures that AI handles reasoning while critical operations stay in reliable, testable code.

## Tech Stack

- **Node.js / Express** — Bridge server receiving failure webhooks
- **Google Gemini API** — Root cause analysis and error pattern matching
- **Claude Code (Anthropic)** — Autonomous workflow repair agent
- **n8n** — Workflow automation platform (cloud-hosted)
- **MCP Protocol** — Model Context Protocol for n8n tool access
- **Python** — Execution scripts for auxiliary tasks

## Project Structure

```
├── server.js              # Express bridge — receives n8n failure webhooks,
│                          #   runs Gemini analysis, spawns Claude Code fixer
├── CLAUDE.md              # Agent instructions (auto-fix + creative implementer)
├── GEMINI.md              # Multi-model orchestration config
├── directives/            # SOP-style directives for automation tasks
│   ├── create_landing_page.md
│   └── template.md
├── execution/             # Deterministic Python scripts
│   ├── gemini_cli.py      # CLI wrapper for Gemini API
│   └── template_script.py
├── workflows/             # Exported n8n workflow definitions (JSON)
├── .env.example           # Environment variable template
├── .mcp.json.example      # MCP server configuration template
└── package.json           # Node.js dependencies
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+ (for execution scripts)
- An [n8n](https://n8n.io) instance (cloud or self-hosted)
- Google Gemini API key
- Claude Code CLI (`npm i -g @anthropic-ai/claude-code`)
- [n8n-mcp](https://github.com/czlonkowski/n8n-mcp) server (for n8n tool access)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Cubeedge180/n8n-Dental-Lead-Automation.git
   cd n8n-Dental-Lead-Automation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   cp .mcp.json.example .mcp.json
   # Edit both files with your actual credentials
   ```

4. **Set up n8n-mcp** (required for Claude Code to interact with n8n)
   ```bash
   git clone https://github.com/czlonkowski/n8n-mcp.git
   cd n8n-mcp && npm install && npm run build
   ```

5. **Run the bridge server**
   ```bash
   node server.js
   ```

6. **Configure n8n** — Add an Error Trigger workflow that sends a POST to `http://your-server:3456/fix-workflow` with the workflow and execution data.

## How the Self-Healing Loop Works

1. An n8n workflow fails during execution
2. n8n's error trigger sends the failure details to the Express bridge (`POST /fix-workflow`)
3. The bridge calls **Gemini** for root cause analysis, cross-referencing the error log for known patterns
4. **Claude Code** is spawned as an auto-fix agent with full context (error details, AI analysis, workflow data)
5. Claude Code reads the error log, fetches the broken workflow via MCP, identifies the broken node, and applies a fix
6. The fix is logged to the error memory for future reference
7. The bridge automatically re-executes the workflow to confirm the fix

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fix-workflow` | POST | Receives n8n failure webhooks, triggers auto-fix pipeline |
| `/health` | GET | Health check — returns service status |

## License

MIT License — see [LICENSE](LICENSE) for details.
