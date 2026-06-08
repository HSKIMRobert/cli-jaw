# CLI-JAW Claude Guide

This repository is a Node.js ESM orchestration runtime for boss/employee dispatch, Web UI, browser/CDP automation, Telegram/Discord channels, memory, heartbeat, and PABCD orchestration.

## Documentation Map

- Start at `structure/INDEX.md` for the current architecture map.
- Keep `README.md`, `AGENTS.md`, this file, and `structure/AGENTS.md` aligned when command/API/orchestration behavior changes.
- Do not use the old `devlog/structure/` path for architecture docs; the active folder is `structure/`.

## Current Runtime Notes

- PABCD entry is explicit: `jaw orchestrate`, `/orchestrate`, or `/pabcd`. Resume is explicit `/continue`; natural-language “continue/계속/이어서” remains a normal prompt.
- Workflow helper slash commands are `/plan`, `/interview`, `/deliberate`, `/planaudit`, and `/goal`. `/plan` is a compatibility guide for users expecting a plan command; it maps to PABCD P and does not create another planning mode. `/planaudit` is the canonical remote-safe spelling; `/plan-audit` is not registered. Bounded automation is a `/goal run ...` subcommand family, not a separate top-level `/autopilot` command. In Phase 1, `/goal` is a visible gated stub; `/goal run ...` remains blocked until later runtime controls land.
- `/review` is a project-dir review workflow: it uses configured `projectDirs` or a validated recent-context git repo, never JAW_HOME/`process.cwd()` fallback, resolves the review scope from the current conversation focus plus recent goal/chat context and commit history/diffs/worktree/untracked files, saves a Markdown report with scope evidence, and scopes `--fix` to Critical/High findings as new working-tree patches on top of current `HEAD` without rewriting commits. Git ranges are evidence for the conversation-selected work item, not permission to include unrelated recent commits.
- Pi (`pi`) is a top-level runtime above AI-E, not a hosted-provider SDK inside cli-jaw. It runs per turn through `pi --mode rpc` with cli-jaw-owned `settings.pi` profiles, isolated `PI_CODING_AGENT_DIR` config generation, Settings profile registration, and npm-exec fallback for machines without a global `pi` binary.
- AGY (`agy`) is a top-level runtime, not an `ai-e` provider. It runs in print mode through `agy -p` using AGY's current native selected model, captures print-mode session ids from a per-run `--log-file`, resumes exact saved sessions with `--conversation <id>`, exposes model switching only through native AGY UI (no `--model`/`--effort` flags), checks auth at run time, and uses plain-text stdout rather than NDJSON parsing.
- Cursor (`cursor`) is a top-level experimental runtime, not an `ai-e` provider. It runs through `cursor-agent -p --trust --output-format stream-json`, resumes with `--resume <chatId>`, uses `--model <resolvedModelId>`, and encodes effort in the model id rather than passing a separate `--effort`/`--thinking` flag. Cursor quota is auth/status-only until the CLI exposes quota windows.
- Kiro (`kiro-code`) is a top-level runtime, not an `ai-e` provider. It runs through `kiro-cli chat --no-interactive`, resumes with `--resume-id <sessionId>`, passes `--model` and optional `--trust-all-tools`, parses plain-text stdout (ANSI stripped), emits `agent_tool` steps from Kiro tool progress lines, shows AGY-style working indicators while busy, and captures session ids from the kiro-cli v2 session store (`conversations_v2` in the kiro-cli data sqlite, keyed by the canonical cwd) — the legacy `~/.kiro/sessions/cli/*.json` files are not used by `chat --no-interactive`. Live models come from `kiro-cli chat --list-models --format json`; quota uses reverse-engineered `AmazonCodeWhispererService.GetUsageLimits` with the Kiro CLI auth store token.
- Claude E is the registry key `claude-e`; legacy helper/event internals still use the `claude-i` bucket and `agent:claude-i:*` events.
- Gemini full-access runs use `--skip-trust --approval-mode yolo` on both fresh and resume sessions.
- `/api/channel/send` is the canonical outbound Telegram/Discord delivery endpoint.
- Heartbeat schedules support `{ kind: "every", minutes }` and `{ kind: "cron", cron, timeZone? }`.
- Tool logs are capped by `src/shared/tool-log-sanitize.ts` before WebSocket, `agent_done`, and orchestration snapshot delivery.
- Employee worker progress is query-first via `jaw worker status [agent]`, watchable via `jaw worker watch [agent]` or `jaw dispatch --watch`, memory-only for current plus previous completed run, and safe-summary only with thinking detail hidden.
- `jaw employee list [--json]` lists DB and static employees, including Control. `jaw dispatch` reads response bodies defensively and reports stale/missing server routes when an old manager returns HTML instead of JSON.
- `npm run build` is a pure backend build/link operation and must not signal, kill, or restart live manager processes.
- Web/CLI `jaw dashboard serve` defaults to manager port `24576`; Electron implicit spawn owns the separate `24577-24590` manager lane and does not reuse `24576`.
- `jaw browser fetch <url>` is the adaptive URL-reader mirror from agbrowse: use it for a known URL/search-result URL, not as generic search.

## Build

Backend and frontend are separate builds. **Both must run after source changes.**

```bash
npm run build            # backend only (tsc → dist/)
npm run build:frontend   # frontend only (vite → public/dist/)
```

- `public/js/**/*.ts` changes require `npm run build:frontend` — the browser loads Vite-bundled output from `public/dist/`, not raw TS.
- Backend `src/**/*.ts` changes require `npm run build`.
- After editing frontend code, ALWAYS run `npm run build:frontend` before reporting the change is applied.

## Local Gates

Prefer the existing gates only:

```bash
npm run gate:all
npm test
bash structure/audit-fin-status.sh
```

Doc-only changes should not modify `.mjs`, `.js`, or `.ts` source files unless explicitly requested.
