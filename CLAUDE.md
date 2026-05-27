# CLI-JAW Claude Guide

This repository is a Node.js ESM orchestration runtime for boss/employee dispatch, Web UI, browser/CDP automation, Telegram/Discord channels, memory, heartbeat, and PABCD orchestration.

## Documentation Map

- Start at `structure/INDEX.md` for the current architecture map.
- Keep `README.md`, `AGENTS.md`, this file, and `structure/AGENTS.md` aligned when command/API/orchestration behavior changes.
- Do not use the old `devlog/structure/` path for architecture docs; the active folder is `structure/`.

## Current Runtime Notes

- PABCD entry is explicit: `jaw orchestrate`, `/orchestrate`, or `/pabcd`. Resume is explicit `/continue`; natural-language “continue/계속/이어서” remains a normal prompt.
- Workflow helper slash commands are `/interview`, `/deliberate`, `/planaudit`, `/goal`, and `/autopilot`. `/planaudit` is the canonical remote-safe spelling; `/plan-audit` is not registered. `/goal` and `/autopilot` are visible gated stubs until their later runtime phases.
- AGY (`agy`) is a top-level runtime, not an `ai-e` provider. It runs in print mode through `agy -p` using AGY's current native selected model, captures print-mode session ids from a per-run `--log-file`, resumes exact saved sessions with `--conversation <id>`, exposes model switching only through native AGY UI (no `--model`/`--effort` flags), checks auth at run time, and uses plain-text stdout rather than NDJSON parsing.
- Claude E is the registry key `claude-e`; legacy helper/event internals still use the `claude-i` bucket and `agent:claude-i:*` events.
- Gemini full-access runs use `--skip-trust --approval-mode yolo` on both fresh and resume sessions.
- `/api/channel/send` is the canonical outbound Telegram/Discord delivery endpoint.
- Heartbeat schedules support `{ kind: "every", minutes }` and `{ kind: "cron", cron, timeZone? }`.
- Tool logs are capped by `src/shared/tool-log-sanitize.ts` before WebSocket, `agent_done`, and orchestration snapshot delivery.
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
