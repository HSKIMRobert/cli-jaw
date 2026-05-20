<div align=”center”>

# CLI-JAW

### Your personal AI agent. 2 lines to install. 10 AI runtime surfaces in one dashboard.

[![npm](https://img.shields.io/npm/v/cli-jaw)](https://npmjs.com/package/cli-jaw)
[![Version](https://img.shields.io/badge/v2.0.0-GA-brightgreen)](https://github.com/lidge-jun/cli-jaw/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%3E%3D22-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED?logo=docker&logoColor=white)](#-docker)

**English** / [한국어](README.ko.md) / [中文](README.zh-CN.md) / [日本語](README.ja.md)

</div>

## Install

<details>
<summary><b>Safe install</b> — for existing users who want minimal changes</summary>

```bash
# macOS / Linux
JAW_SAFE=1 npm install -g cli-jaw    # skips optional tool/runtime setup
jaw init                              # interactive setup later when you're ready
```

Windows users should use the WSL install path below. Native PowerShell is not the supported CLI-JAW install target.

</details>

```bash
# macOS / Linux / WSL with Node.js 22+ already installed
npm install -g cli-jaw
jaw dashboard
```

That's it. Open **http://localhost:3457** and you have a personal AI agent. Requires [Node.js 22+](https://nodejs.org).

> **First time?** The default npm install initializes CLI-JAW and attempts native Claude setup. Other AI CLIs are optional; install them all during npm setup with `CLI_JAW_INSTALL_CLI_TOOLS=1 npm install -g cli-jaw` on macOS/Linux. On Windows, use the WSL install path below.

<details>
<summary><b>macOS one-click</b> — don't have Node.js? This installs everything</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/install.sh | bash
source "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null || true
bash "$(npm root -g)/cli-jaw/scripts/verify-fresh-install.sh"
```

</details>

<details>
<summary><b>Windows (WSL — Windows Subsystem for Linux)</b> — one-click from scratch</summary>

```powershell
# 1. Install WSL (PowerShell as Admin)
wsl --install
```

Restart, open **Ubuntu**, then:

```bash
# 2. Install CLI-JAW + all dependencies
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/install-wsl.sh | bash
source ~/.bashrc
jaw dashboard
bash "$(npm root -g)/cli-jaw/scripts/verify-fresh-install.sh"
```

From Windows PowerShell into WSL, run commands through a login shell so the WSL profile PATH is loaded:

```powershell
wsl.exe -d Ubuntu -- bash -lc "jaw dashboard"
```

</details>

<details>
<summary><b>Fresh-machine evidence</b> — maintainer release check</summary>

Run this on a clean VM before publishing installer changes. It writes environment snapshots, installer logs, the exact collector/installer/verifier scripts that ran, their SHA-256 hashes, verifier logs, and new-shell PATH probes into `~/cli-jaw-fresh-install-evidence-*`.

```bash
# macOS Terminal
COLLECTOR=/tmp/cli-jaw-collect-fresh-install-evidence.sh
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/collect-fresh-install-evidence.sh -o "$COLLECTOR"
bash "$COLLECTOR" --target macos

# Ubuntu inside WSL
COLLECTOR=/tmp/cli-jaw-collect-fresh-install-evidence.sh
curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/collect-fresh-install-evidence.sh -o "$COLLECTOR"
bash "$COLLECTOR" --target wsl
```

From Windows PowerShell, enter the supported WSL path:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'COLLECTOR=/tmp/cli-jaw-collect-fresh-install-evidence.sh; curl -fsSL https://raw.githubusercontent.com/lidge-jun/cli-jaw/master/scripts/collect-fresh-install-evidence.sh -o "$COLLECTOR"; bash "$COLLECTOR" --target wsl'
```

If the collector says `powershell.exe` is not available inside WSL, run this from Windows PowerShell before auditing:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'EVIDENCE_DIR="$(ls -dt ~/cli-jaw-fresh-install-evidence-* | head -1)"; { echo "command=wsl.exe -d Ubuntu -- bash -lc jaw --version"; jaw --version; } | tee "$EVIDENCE_DIR/33-powershell-to-wsl-probe.log"'
```

For an unmerged branch or local VM checkout, pass the local installer and verifier explicitly:

```bash
bash scripts/collect-fresh-install-evidence.sh --target macos --install-script scripts/install.sh --verifier-script scripts/verify-fresh-install.sh
bash scripts/collect-fresh-install-evidence.sh --target wsl --install-script scripts/install-wsl.sh --verifier-script scripts/verify-fresh-install.sh
```

Audit each collected directory before treating it as target evidence:

```bash
EVIDENCE_DIR="$(ls -dt ~/cli-jaw-fresh-install-evidence-* | head -1)"
AUDITOR="$(npm root -g)/cli-jaw/scripts/audit-fresh-install-evidence.mjs"
node "$AUDITOR" "$EVIDENCE_DIR" --target macos
node "$AUDITOR" "$EVIDENCE_DIR" --target wsl

# For a local checkout, audit with the checkout's auditor:
node scripts/audit-fresh-install-evidence.mjs "$EVIDENCE_DIR" --target macos
node scripts/audit-fresh-install-evidence.mjs "$EVIDENCE_DIR" --target wsl
```

Before publishing installer changes, run the matrix gate with both strict evidence directories:

```bash
GATE="$(npm root -g)/cli-jaw/scripts/verify-release-evidence.mjs"
node "$GATE" --macos /path/to/macos-evidence --wsl /path/to/wsl-evidence

# For a local checkout:
node scripts/verify-release-evidence.mjs --macos /path/to/macos-evidence --wsl /path/to/wsl-evidence
```

The matrix gate rejects evidence collected with stale collector, installer, or verifier scripts; archived evidence scripts must match the current package or checkout that runs the gate.

When `scripts/release.sh`, `scripts/release-preview.sh`, or `npm publish` detects installer-sensitive changes since the previous tag, it runs this same matrix gate before any git push or npm publish. Set the evidence directories before starting a release:

```bash
CLI_JAW_MACOS_EVIDENCE_DIR=/path/to/macos-evidence \
CLI_JAW_WSL_EVIDENCE_DIR=/path/to/wsl-evidence \
bash scripts/release.sh patch
```

</details>

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up -d       # → http://localhost:3457
```

</details>

---

## What is CLI-JAW?

CLI-JAW is an open-source platform that unifies the AI coding CLIs you already use — Claude, Codex, Gemini, Grok, OpenCode, Copilot — into **one assistant with one memory and one dashboard**.

Your main CLI (the “Boss”) calls the others as “employees.” You stop copy-pasting between apps and start giving orders from a single place.

- **No API keys needed** — routes through subscriptions you already pay for
- **No per-token billing** — flat monthly cost, same as what you already have
- **Runs locally** — your code never leaves your machine

<div align=”center”>

![CLI-JAW Manager Dashboard](docs/screenshots/manager-dashboard-light.png)

</div>

---

## Authenticate

You only need **one**. Pick whichever subscription you already have:

```bash
# Free options (no credit card needed)
copilot login        # GitHub Copilot (free tier available)
opencode             # OpenCode — free models available

# Paid (monthly subscription you already pay for)
claude auth login    # Anthropic Claude Max
codex login          # OpenAI ChatGPT Pro
gemini               # Google Gemini Advanced
grok login --oauth   # xAI Grok / Grok Heavy
```

Check everything at once: `jaw doctor`

<details>
<summary>Example jaw doctor output</summary>

```
🦈 CLI-JAW Doctor — 12 checks

 ✅ Node.js        v22.15.0
 ✅ Claude CLI      installed
 ✅ Codex CLI       installed
 ⚠️ Gemini CLI      not found (optional)
 ✅ OpenCode CLI    installed
 ✅ Copilot CLI     installed
 ✅ Database        jaw.db OK
 ✅ Skills          32 active, 194 reference
 ✅ MCP (plugins)   3 servers configured
 ✅ Memory          structured/ exists
 ✅ Server          port 3457 available
```

</details>

---

## The Dashboard

The dashboard is your command center. It's a local web app at `http://localhost:3457`.

### Instance Manager

See every running AI instance — start, stop, restart with one click. Preview live Web UIs directly in the dashboard.

<div align=”center”>

![Dashboard Navigator](docs/screenshots/dashboard-navigator.png)

</div>

### Kanban Board

Drag instance cards into lanes (Backlog → Ready → In Progress → Review → Done). Track what each AI session is working on.

<div align=”center”>

![Kanban Board](docs/screenshots/dashboard-kanban.png)

</div>

### Priority Matrix

Eisenhower matrix for your tasks and reminders. Prioritize what matters.

<div align=”center”>

![Priority Matrix](docs/screenshots/priority-matrix.png)

</div>

### Notes

A mini-Obsidian inside the dashboard. Folders, visual (WYSIWYG) + raw + split editing, KaTeX (math rendering), Mermaid (diagram-as-code), syntax-highlighted code blocks.

<div align=”center”>

![Notes Editor](docs/screenshots/notes-wysiwyg.png)

</div>

### Agent Status

Monitor each AI engine's health and usage at a glance.

<div align=”center”>

![Claude Status](docs/screenshots/claude-status-widget.png)

</div>

---

## How the Employee System Works

This is the core idea: **your main CLI calls other CLIs as workers.**

You talk to one AI (the "Boss"). When it needs specialized work, it dispatches tasks to employees — each running their own CLI with their own model:

```
You: "Fix the frontend styling and update the API endpoint"

Boss (Claude) thinks...
  ├── Dispatches to Frontend employee (OpenCode) → "Fix the CSS grid layout in dashboard.tsx"
  ├── Dispatches to Backend employee (Codex)     → "Update /api/users to return pagination metadata"
  └── Synthesizes both results for you
```

```bash
# Under the hood, it's one command:
jaw dispatch --agent "Frontend" --task "Fix the CSS grid layout in dashboard.tsx"
```

Employees are other AI CLIs configured in your settings. Each has its own session, its own model, its own context. The Boss reviews their output before presenting it to you.

### Employees vs. Sub-agents

These are different things:

| | Employees | Sub-agents |
|---|---|---|
| **What** | Other AI CLIs (Codex, OpenCode, etc.) configured as workers | Built-in parallel task tool within a single CLI |
| **When** | Multi-specialist work across different codebases or domains | Internal research, file reads, parallel analysis |
| **How** | `jaw dispatch --agent "Name" --task "..."` | Automatic — the CLI spawns them internally |

Use employees for "Frontend does CSS, Backend does API." Use sub-agents for "read these 5 files in parallel before deciding."

---

## AI Runtime Surfaces

No per-token API billing. Route through subscriptions you already pay for.

| CLI | Default Model | Auth | Cost |
|---|---|---|---|
| **Claude** | `opus-4-6` | `claude auth login` | Claude Max subscription |
| **Claude E** | `opus-4-6` | underlying `claude auth login` | Experimental interactive Claude wrapper |
| **AI-E** | provider-selected | selected provider auth | Multi-provider runtime wrapper |
| **Antigravity** | `gemini-3.5-flash` | checked by `agy` at run time | Experimental AGY print-mode runtime |
| **Codex** | `gpt-5.5` | `codex login` | ChatGPT Pro subscription |
| **Codex App** | `gpt-5.4` | `codex login` | ChatGPT Pro subscription |
| **Gemini** | `gemini-3.1-pro-preview` | `gemini` | Gemini Advanced subscription |
| **Grok** | `grok-build` | `grok login --oauth` | Grok subscription; quota is auth/status-only |
| **OpenCode** | `minimax-m2.7` | `opencode` | Free models available |
| **Copilot** | `gpt-5-mini` | `copilot login` | Free tier available |

The quota/status panel keeps the same runtime keyset as the registry. Wrapper runtimes (`ai-e`, `claude-e`, `codex-app`) delegate to their underlying provider, while AGY/Grok/OpenCode are shown as auth/status-only when their CLIs do not expose quota windows.

**Fallback chain**: if one engine is rate-limited, the next picks up. Configure with `/fallback [cli1 cli2...]`.

**OpenCode wildcard**: connect any model endpoint — OpenRouter, local LLMs (Large Language Models), any OpenAI-compatible API.

> Switch engines live: `/cli codex`. Switch models: `/model gpt-5.5`. Works from Web, Terminal, Telegram, or Discord.

---

## PABCD Orchestration (Plan → Audit → Build → Check → Done)

For complex tasks, CLI-JAW uses a structured 5-phase workflow. You approve every transition — nothing ships without your OK.

```
P (Plan) → A (Audit) → B (Build) → C (Check) → D (Done) → IDLE
   ⛔          ⛔          ⛔         auto        auto
```

| Phase | What happens |
|---|---|
| **P — Plan** | Boss writes a diff-level plan. Stops for your review |
| **A — Audit** | Read-only worker verifies the plan is feasible (imports exist, signatures match) |
| **B — Build** | Boss implements. Read-only worker verifies the result |
| **C — Check** | Type-check (`tsc --noEmit`), docs update, consistency check |
| **D — Done** | Summary of all changes. Returns to idle |

State is database-persisted and survives restarts. Workers cannot modify files — only verify. Activate with `jaw orchestrate`, `/orchestrate`, or `/pabcd`; resume an active worklog explicitly with `/continue`.

---

## Memory

Three layers, each covering a different recall horizon.

| Layer | What it stores | How it works |
|---|---|---|
| **History Block** | Recent session context | Last 10 sessions, max 8000 chars, scoped to working directory. Injected at prompt start |
| **Memory Flush** | Structured knowledge from conversations | Triggered after threshold (default 10 turns). Extracts episodes, daily logs, semantic notes as markdown |
| **Soul + Task Snapshot** | Identity and semantic recall | Core values, tone, boundaries. Full-text search index returns up to 4 semantically relevant hits per prompt |

All three layers feed into the system prompt automatically. Memory is searchable:

```bash
jaw memory search "how did we set up the API auth?"
```

---

## Skills

230+ skills covering dev workflows, office documents, automation, and media.

| Category | Skills | What they cover |
|---|---|---|
| **Office** | `pdf`, `docx`, `xlsx`, `pptx`, `hwp` | Read, create, edit documents. HWP/HWPX (Korean word-processor formats) supported natively |
| **Automation** | `browser`, `vision-click`, `screen-capture`, `desktop-control` | Chrome DevTools Protocol (CDP) browser control, AI-powered coordinate click, macOS screenshots, Computer Use |
| **Media** | `video`, `imagegen`, `lecture-stt`, `tts` | Remotion video, OpenAI image generation, lecture transcription, text-to-speech |
| **Integration** | `github`, `notion`, `telegram-send`, `memory` | Issues/PRs/CI, Notion pages, Telegram media delivery, persistent memory |
| **Visualization** | `diagram` | SVG diagrams, charts, interactive visualizations rendered in chat |
| **Dev Guides** | `dev`, `dev-frontend`, `dev-backend`, `dev-data`, `dev-testing`, `dev-pabcd` | Engineering guidelines injected into agent prompts |

Reference skills live in `skills_ref/` and install into the active runtime on demand; active skills are loaded from the user runtime home.

```bash
jaw skill install <name>    # activate a reference skill
jaw skill list              # see what's available
```

---

## Browser & Desktop Automation

| Capability | How it works |
|---|---|
| **Chrome DevTools Protocol** | Navigate, click, type, screenshot, evaluate JS, scroll, press keys — remote control for Chrome |
| **Vision-click** | Screenshot the screen → AI extracts target coordinates → clicks. `jaw browser vision-click "Login button"` |
| **Computer Use** | Desktop app automation via Codex Computer Use. Use Safari for localhost and it feels like the Codex app |
| **Web-AI vendors** | `jaw browser web-ai --vendor chatgpt\|gemini\|grok` with session lifecycle, diagnostics, and source-audit/answer-artifact support where implemented |
| **Diagram Skill** | Generate SVG diagrams and interactive visualizations, rendered inline in chat |

Computer Use lets you control any macOS app — Finder, Safari, System Settings, Xcode — through natural language. Point it at your localhost dev server in Safari and you get a full visual testing loop.

---

## Messaging

### Telegram

```
📱 Telegram ←→ 🦈 CLI-JAW ←→ 🤖 AI Engines
```

Text chat, voice messages (auto-transcribed via STT — speech-to-text), file/photo upload, slash commands (`/cli`, `/model`, `/status`), scheduled task delivery via `every`/`cron` (recurring schedule) heartbeat jobs.

<details>
<summary>Setup (3 steps)</summary>

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
2. `jaw init --telegram-token YOUR_TOKEN` or use Web UI settings
3. Send any message to your bot. Chat ID is auto-saved on first message

</details>

### Discord

Same capabilities as Telegram — text, files, commands. Channel/thread routing, canonical `/api/channel/send`, and forwarder support for agent result broadcast. Setup via Web UI settings.

### Voice & STT

Voice input works on Web (mic button), Telegram (voice messages), and Discord. Providers: OpenAI-compatible, Google Vertex AI, or any custom endpoint.

---

## MCP (Model Context Protocol)

[MCP](https://modelcontextprotocol.io) is a standard that lets AI tools share capabilities — like plugins for AI agents. CLI-JAW manages MCP config for all your engines from one file.

```bash
jaw mcp install @anthropic/context7
# → syncs to Claude, Codex, Gemini, OpenCode, Copilot, and Antigravity config files simultaneously
```

No more editing several different JSON files. Install once, every MCP-aware engine gets it. Grok CLI is a standard runtime here, but it is not counted as MCP-sync capable until Grok exposes a compatible config surface. Antigravity MCP sync is a separate config target from the `agy` runtime registry entry.

```bash
jaw mcp sync       # re-sync after manual edits
```

---

## CLI Commands

```bash
# Core
jaw dashboard                     # launch manager dashboard
jaw serve                         # start server (http://localhost:3457)
jaw chat                          # terminal chat UI
jaw doctor                        # 12-point diagnostics

# Instances
jaw clone ~/project               # clone instance to new directory
jaw --home ~/project serve --port 3458  # run second instance
jaw service install               # auto-start on boot

# AI & Orchestration
jaw dispatch --agent "Backend" --task "..."  # dispatch employee
jaw orchestrate                   # enter/control PABCD workflow
# in chat: /continue               # explicit worklog/PABCD resume

# Skills & MCP
jaw skill install <name>          # activate a skill
jaw skill list                    # list available skills
jaw mcp install <package>         # install MCP → syncs supported MCP-aware engines
jaw mcp sync                      # re-sync MCP configs

# Memory
jaw memory search <query>         # search across all memory layers
jaw memory save <file> <content>  # save to structured memory

# Browser
jaw browser start                 # launch Chrome automation
jaw browser fetch "https://example.com" --json --trace  # adaptive URL reader
jaw browser snapshot              # capture page state
jaw browser vision-click "Login"  # AI-powered click

# Maintenance
jaw reset                         # full reset
```

---

## Multi-Instance

Run isolated instances with separate settings, memory, and database:

```bash
jaw clone ~/my-project
jaw --home ~/my-project serve --port 3458
```

Each instance is fully independent — different working directory, different memory, different MCP config. The manager dashboard sees them all.

---

## Development

```bash
npm run build          # tsc → dist/
npm run dev            # tsx server.ts (hot-reload)
npm test               # native Node.js test runner
npm run gate:all       # named release/docs parity gates
```

Architecture details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · Test coverage: [TESTS.md](TESTS.md) · Internal structure docs: [structure/](structure/)

---

## How It Compares

| | CLI-JAW 2.0 | Hermes Agent | Claude Code |
|---|---|---|---|
| **Model access** | Claude, Codex, Codex App, Gemini, Grok, OpenCode, and Copilot through vendor auth where supported | API keys (OpenRouter 200+, Nous Portal) | Anthropic only |
| **Cost model** | Monthly subscriptions you already pay for | Per-token API billing | Anthropic subscription |
| **Primary UI** | Manager dashboard + Web app + Mac app + terminal UI | Terminal only | CLI + IDE plugins |
| **Dashboard** | Multi-instance manager, Kanban, Notes workspace | None | None |
| **Messaging** | Telegram (voice) + Discord | Telegram/Discord/Slack/WhatsApp/Signal | None |
| **Memory** | 3-layer (History/Flush/Soul) + full-text search | Self-improving loop + Honcho | File-based auto-memory |
| **Multi-agent** | Employee system (dispatch other CLIs) + PABCD | Subagent spawn | Task tool |
| **Browser automation** | Chrome DevTools + vision-click + Computer Use | Limited | Via MCP |
| **Execution** | Local + Docker | Local/Docker/SSH/Daytona/Modal | Local |
| **Skills** | 230+ bundled | Self-creating + agentskills.io | User-configured |
| **Languages** | English, Korean, Chinese, Japanese | English | English |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `cli-jaw: command not found` | `npm install -g cli-jaw` again. macOS/Linux/WSL: check `~/.local/bin` or `npm prefix -g` + `/bin` is in `$PATH`. From Windows PowerShell, invoke WSL through a login shell: `wsl.exe -d Ubuntu -- bash -lc "jaw dashboard"`. |
| `Error: node version` | Upgrade to Node.js 22+: `nvm install 22` |
| `NODE_MODULE_VERSION` mismatch | `npm run ensure:native` (auto-rebuilds native modules) |
| `EADDRINUSE: port 3457` | Another instance running. Use `--port 3458` or stop it first |
| Telegram / Discord auth fails | Run `jaw doctor`, check tokens, restart `jaw serve` |
| Browser commands fail | Install Chrome/Chromium. Run `jaw browser start` first |
| Employee dispatch hangs | Ensure the employee CLI is authenticated (`jaw doctor`) |
| Computer Use not working | macOS only. Codex CLI required. Check Automation permission in System Settings |

---

## Contributing

1. Fork and branch from `master`
2. `npm run build && npm test`
3. Submit a PR

Bug reports and feature ideas: [Open an issue](https://github.com/lidge-jun/cli-jaw/issues)

---

<div align="center">

**[MIT License](LICENSE)** · Built by developers who got tired of tab-switching between AI apps.

</div>
