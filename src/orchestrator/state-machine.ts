// ─── PABCD State Machine ────────────────────────────
// Sole orchestration state manager. Replaces the old round-loop pipeline entirely.
// State persisted in jaw.db orc_state table.
// CLI (bin/commands/orchestrate.ts) and server share the same DB.

import { getOrcState, setOrcState, resetOrcState, resetAllOrcStates, deleteNonDefaultOrcStates } from '../core/db.js';
import { broadcast } from '../core/bus.js';
import { readLatestWorklog } from '../memory/worklog.js';
import type { RemoteTarget } from '../messaging/types.js';
import type { ResolvedSelection } from './parser.js';

// ─── Types ──────────────────────────────────────────

export type OrcStateName = 'IDLE' | 'I' | 'P' | 'A' | 'B' | 'C' | 'D';

export type AuditVerdict = 'pending' | 'pass' | 'fail';
export type VerificationVerdict = 'pending' | 'done' | 'needs_fix';

export interface OrcContext {
  originalPrompt: string;
  workingDir: string | null;
  scopeId?: string;
  plan: string | null;
  workerResults: string[];
  origin: string;
  target?: RemoteTarget;
  chatId?: string | number;
  // ─── Phase 56.1: Plan lives in worklog ## Plan, not in project-root file ──
  worklogPath?: string;
  planHash?: string;
  planUpdatedAt?: string;
  taskAnchor?: string;
  resolvedSelection?: ResolvedSelection;
  // ─── Phase 58: Phase-transition gates ─────────────
  auditStatus?: AuditVerdict;
  verificationStatus?: VerificationVerdict;
  userApproved?: boolean;
  projectDirs?: string[] | null;
  // ─── Phase 2.1: Interview state ──────────────────
  interview?: {
    request: string;
    round: number;
    known: string[];
    unknown: string[];
  };
}

// ─── State Read/Write (DB-backed) ───────────────────

export function getState(scope = 'default'): OrcStateName {
  const row = getOrcState.get(scope) as { state?: string } | undefined;
  return (row?.state as OrcStateName) || 'IDLE';
}

export function getCtx(scope = 'default'): OrcContext | null {
  const row = getOrcState.get(scope) as { ctx?: string | null } | undefined;
  if (!row?.ctx) return null;
  try {
    const parsed = JSON.parse(row.ctx);
    if (parsed && parsed.workingDir === undefined) parsed.workingDir = null;
    return parsed;
  } catch { return null; }
}

export function setState(
  s: OrcStateName,
  ctx?: OrcContext | null,
  scope = 'default',
  titleOverride?: string | null,
): void {
  const ctxJson = ctx !== undefined
    ? (ctx ? JSON.stringify(ctx) : null)
    : (s === 'P'
      ? null
      : ((getOrcState.get(scope) as { ctx?: string | null } | undefined)?.ctx || null));
  setOrcState.run(scope, s, ctxJson);

  // Parse worklog title (max 2 words + …)
  let title = titleOverride || 'PABCD';
  if (!titleOverride) {
    try {
      const wl = readLatestWorklog();
      if (wl?.content) {
        const firstLine = wl.content.split('\n')[0] || '';
        const raw = firstLine.replace(/^#\s*Work Log:\s*"?/, '').replace(/"?\s*$/, '').trim();
        if (raw) {
          const words = raw.split(/\s+/);
          title = words.slice(0, 2).join(' ') + (words.length > 2 ? '…' : '');
        }
      }
    } catch { /* fallback to PABCD */ }
  }

  broadcast('orc_state', {
    state: s,
    title,
    scope,
    taskAnchor: ctx?.taskAnchor || null,
    resolvedSelection: ctx?.resolvedSelection || null,
    interview: ctx?.interview || null,
  });
}

export function resetState(scope = 'default'): void {
  resetOrcState.run(scope);
  broadcast('orc_state', { state: 'IDLE', title: '', scope });
}

export function resetAllStaleStates(): number {
  const result = resetAllOrcStates.run();
  const cleared = result.changes;
  if (cleared > 0) {
    console.log(`[jaw:pabcd] cleared ${cleared} stale orchestration state(s)`);
    broadcast('orc_state', { state: 'IDLE', title: '', scope: 'all' });
  }
  const pruned = deleteNonDefaultOrcStates.run();
  if (pruned.changes > 0) {
    console.log(`[jaw:pabcd] pruned ${pruned.changes} non-default scope row(s)`);
  }
  return cleared;
}

// ─── Prefix Map ─────────────────────────────────────
// B state: only worker results get Bb2 prefix, user messages get no prefix.

const PREFIXES: Record<string, string> = {
  Ip: `[INTERVIEW MODE — User Response]
You are conducting a requirements interview. The user has responded to your question.

Rules:
- Ask 1–3 clarifying questions per turn. Group related questions together.
- Separate known facts from assumptions.
- After processing the user's response, update and include the <interview_tracker> block.
- Do NOT dispatch employees, write files, or start implementation.
- When the request is clear enough for PABCD P, suggest: "Ready for planning. Run \`cli-jaw orchestrate P\` or \`/orchestrate P\` to proceed."
- The user can also end the interview with \`cli-jaw orchestrate reset\` to return to IDLE.

User says:`,

  Pb2: `[PLANNING MODE — User Feedback]
The user has reviewed your plan. Apply their feedback and present the revised plan.
If user explicitly approves, run \`cli-jaw orchestrate A\` to advance.
Otherwise revise and present again.

⛔ STOP after presenting the revision. WAIT for another user response.

User says:`,

  // Phase 59: A-phase user (non-worker) message — e.g. first entry after P approval.
  // Was previously reusing Ab2 ("Employee Results") which misled the model.
  Ap: `[PLAN AUDIT — User Message]
You are in PLAN AUDIT phase. The approved plan is auto-injected at the top of every
dispatch task body under \`## Approved Plan\` — you do not need to read any file.
Do NOT tell the worker to read a plan file; just write the audit task itself.

⛔ STOP after dispatching and reporting audit results. WAIT for user approval.

User says:`,

  Ab2: `[PLAN AUDIT — Employee Results]
Below are the plan audit results from the verification employee.
If issues found: fix the plan and re-audit (output employee JSON again).
If PASS: report results to the user and wait for approval.
When user approves, run \`cli-jaw orchestrate B\` to advance to Build.

Reporting: distill the verdict and key findings into a concise bullet list (≤5 items).
Use a diagram when the audit covers 3+ files or integration points.
Do NOT paste the full employee output verbatim.

⛔ STOP after reporting. WAIT for user approval.

Employee results:`,

  Bb2: `[IMPLEMENTATION REVIEW — Employee Results]
Below are verification results for your code.
If NEEDS_FIX: fix and re-verify (output employee JSON again).
If DONE: report results to the user and wait for approval.
When user approves, run \`cli-jaw orchestrate C\` to advance to Check.

Reporting: distill the verdict and key findings into a concise bullet list (≤5 items).
Use a diagram when the verification covers 3+ files.
Do NOT paste the full employee output verbatim.

⛔ STOP after reporting. WAIT for user approval.

Employee results:`,
};

export function getPrefix(state: OrcStateName, source: 'user' | 'worker' = 'user'): string | null {
  if (state === 'I') return PREFIXES["Ip"]!;
  if (state === 'P') return PREFIXES["Pb2"]!;
  // Phase 59: distinguish first-entry user message (Ap) from worker verdict (Ab2).
  if (state === 'A') return source === 'worker' ? PREFIXES["Ab2"]! : PREFIXES["Ap"]!;
  if (state === 'B' && source === 'worker') return PREFIXES["Bb2"]!;
  return null;
}

// ─── State Prompts (stdout on transition) ───────────

const STATE_PROMPTS: Record<string, string> = {
  I: `[INTERVIEW — Requirements Clarification]

You are now in Interview mode. Your ONLY job is to clarify requirements.

Rules:
- Ask 1–3 high-value clarifying questions per turn. Group related questions.
- For each question, optionally suggest 2-3 recommended answer choices.
- Track what is known, unknown, and what assumptions are risky.

At the end of every response, include this structured block (it will be parsed and stripped from display):

<interview_tracker>
known: ["fact 1", "fact 2"]
unknown: ["question 1", "question 2"]
</interview_tracker>

- \`known\`: facts confirmed by the user or clearly stated in the request
- \`unknown\`: items still needing clarification
- Update both arrays cumulatively each turn — carry forward all prior items
- If a previously unknown item becomes known, move it to known
- Do NOT dispatch employees, write project files, or start implementation.
- Do NOT invent business decisions — ask the user.
- Prefer concise Korean-friendly questions when locale is Korean.

When the request is clear enough for PABCD Planning:
- Summarize: Known facts, Remaining unknowns (if minor), Risky assumptions.
- Suggest: "Ready for planning. Run \`cli-jaw orchestrate P\` to proceed, or \`cli-jaw orchestrate reset\` to end the interview."

The user can exit interview at any time via \`cli-jaw orchestrate reset\` (→ IDLE) or \`cli-jaw orchestrate P\` (→ Planning).`,

  P: `[PABCD — P: PLANNING]

You are now in Planning mode. Your ONLY job right now is to write a plan.

Steps:
1. Read the project's structural documentation and dev skill docs.
2. Write a plan with TWO parts:
   - Part 1 (chat): Easy explanation + a Mermaid/SVG diagram showing the file change map.
   - Part 2 (file): Diff-level plan — exact file paths (NEW/MODIFY/DELETE),
     before/after diffs for MODIFY, complete content for NEW.
     Save Part 2 to a file (ask the user where to save, or use the project's existing plan folder).
3. In chat, present ONLY: Part 1 summary (≤5 sentences), diagram, and the Part 2 file path.
   Do NOT paste diffs, full file contents, or line-by-line changes into chat.
4. Ask: "Any business logic I shouldn't decide alone?" and "Does Part 1 match your intent?"

⛔ STOP HERE. Do NOT proceed to the next phase.
⛔ WAIT for the user to review and approve your plan.
⛔ When user approves, run: \`cli-jaw orchestrate A\`

You will receive user feedback with a [PLANNING MODE] prefix. Revise until approved.

IMPORTANT — Project Workspace:
Before writing a plan, you MUST confirm the project workspace with the user.
Even if projectDirs is already set in settings, ask: "작업할 프로젝트 디렉토리를 확인합니다: <current dirs>. 이대로 진행할까요?"
If projectDirs is not set, ask: "어떤 프로젝트 디렉토리에서 작업하시겠습니까? (예: jaw project set ~/Developer/my-project)"
Do NOT proceed with planning until project workspace is confirmed.`,

  A: `[PABCD — A: PLAN AUDIT]

You are now in Plan Audit mode. This phase audits YOUR PLAN — not the code.
An employee must verify that your plan from P phase is feasible and safe before any coding begins.

⚠️ You MUST dispatch an audit employee. Do NOT skip this step.
⚠️ Do NOT say "audit is unnecessary" — every plan must be verified before coding.

FIRST: The approved plan is auto-injected at the top of every \`cli-jaw dispatch\`
task body under \`## Approved Plan\`. Do NOT tell the worker to read any file —
just write the audit task itself.

Run this command now:
\`\`\`bash
cli-jaw dispatch --agent "Backend" --task "Project root: <absolute path to the current working repository from pwd -P>

⛔ READ-ONLY: Do NOT create, modify, or delete ANY files. You are an auditor, not a builder.

The approved plan is already injected above under \`## Approved Plan\` — read it there.

Resolve every repository-relative path against Project root.
Do NOT use ~/.cli-jaw*, JAW_HOME, process.cwd(), or the employee temp cwd as the repository root.

Audit the PLAN (not code). Verify:
1) All imports in the plan resolve to real files.
2) Function signatures match actual code.
3) No copy-paste integration risks.

Report PASS or FAIL with itemized issues. ⛔ REPEAT: Do NOT touch any files."
\`\`\`

The result is returned via stdout. Review it:
- If FAIL: fix the plan and re-dispatch.
- If PASS: report results to the user.

⛔ STOP after reporting. WAIT for user approval.
⛔ When user approves, run: \`cli-jaw orchestrate B\``,

  B: `[PABCD — B: BUILD]

You are now in Build mode. The plan has been audited and approved.

⚠️ YOU (the Boss) must implement the code DIRECTLY. Write every file yourself.
⚠️ Do NOT delegate implementation to an employee. Employees are READ-ONLY verifiers.

⛔ Forbidden dispatch examples: "implement the feature", "write the code", "create src/x.ts".
✅ Allowed dispatch examples: "verify src/x.ts compiles", "check integration of Y reports DONE/NEEDS_FIX".

Steps:
1. Read the approved plan: the orchestrator injects it into Boss prompts and dispatch tasks under \`## Approved Plan\`.
   Before any numeric, path, resource-id, date, limit, or destructive action, compare your intended value against the Approved Plan.
2. Implement ALL changes yourself — create/modify/delete files as specified in the plan.
3. After YOU finish implementing, dispatch a verification employee:

\`\`\`bash
cli-jaw dispatch --agent "Backend" --task "Project root: <absolute path to the current working repository from pwd -P>

⛔ READ-ONLY: Do NOT create, modify, or delete ANY files. You are a verifier, not a builder.

The approved plan is already injected above under \`## Approved Plan\` — read it there.

Resolve every repository-relative path against Project root.
Do NOT use ~/.cli-jaw*, JAW_HOME, process.cwd(), or the employee temp cwd as the repository root.

Verify:
1) Files in plan exist with expected content.
2) No syntax errors (run tsc --noEmit if TS).
3) Imports resolve.
4) No integration conflicts.

Report DONE or NEEDS_FIX. ⛔ Do NOT touch any files — READ and REPORT only."
\`\`\`

Review the stdout result:
- NEEDS_FIX: YOU fix the issues yourself, then re-dispatch verification.
- DONE: Report results to the user.

⛔ STOP after reporting. WAIT for user approval.
⛔ When user approves, run: \`cli-jaw orchestrate C\``,

  C: `[PABCD — C: CHECK]

You are now in Check mode. Perform final verification:
1. Verify all files saved and consistent.
2. Run \`npx tsc --noEmit\` for build verification (if TypeScript project).
3. Update project structure documentation if applicable.
4. Report completion summary to the user.

Once verified, call \`cli-jaw orchestrate D\` to finalize.
If shell command unavailable, report completion and ask user to finalize.`,

  D: `[PABCD — D: DONE]
All phases finished. Returning to idle.
Summarize what was accomplished:
- What was planned (P), audited (A), implemented (B), verified (C).
- List of files changed.
- Any follow-up items.`,
};

export function getStatePrompt(target: string): string {
  return STATE_PROMPTS[target] || '';
}

// ─── Transition Guards ──────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  IDLE: ['I', 'P'],
  I: ['P', 'IDLE'],
  P: ['A'],
  A: ['B'],
  B: ['C'],
  C: ['D'],
  D: ['IDLE'],
};

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

export function canTransition(
  from: OrcStateName,
  to: OrcStateName,
  ctx?: OrcContext | null,
): TransitionResult {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    return { ok: false, reason: `Invalid transition: ${from} → ${to}. Force cannot skip phases; start from the next valid phase.` };
  }
  // Phase 2.1: I→P soft gate — warn if no interview context, but don't block.
  if (from === 'I' && to === 'P' && !ctx?.interview) {
    console.warn('[jaw:pabcd] I→P without interview context — proceeding anyway');
  }
  // Phase 58: Gate A→B on audit verdict (strict equality, not truthy).
  if (from === 'A' && to === 'B') {
    if (ctx?.userApproved) return { ok: true };
    if (ctx?.auditStatus !== 'pass') {
      return {
        ok: false,
        reason: `A → B requires audit verdict 'pass' or explicit user approval (current: ${ctx?.auditStatus ?? 'none'}). Run audit worker, use /orchestrate B, or use --force to override this audit gate.`,
      };
    }
  }
  // Phase 58: Gate B→C on verification verdict (strict equality, not truthy).
  if (from === 'B' && to === 'C') {
    if (ctx?.userApproved) return { ok: true };
    if (ctx?.verificationStatus !== 'done') {
      return {
        ok: false,
        reason: `B → C requires verification verdict 'done' or explicit user approval (current: ${ctx?.verificationStatus ?? 'none'}). Run verification worker, use /orchestrate C, or use --force to override this verification gate.`,
      };
    }
  }
  return { ok: true };
}

// ─── Worker Verdict Parser ──────────────────────────
// Phase 58: parses worker stdout for PASS/FAIL/DONE/NEEDS_FIX tokens.
// Input is the worker's text response (string), not the result object.
export type WorkerVerdict = 'pass' | 'fail' | 'done' | 'needs_fix';

export function parseWorkerVerdict(text: string): WorkerVerdict | null {
  if (!text || typeof text !== 'string') return null;
  // NEEDS_FIX must be checked before FAIL because the substring "FIX" can co-occur with "FAIL".
  // Use strict word-boundary matches to avoid catching prose like "passed previously" → 'pass'.
  if (/\bNEEDS_FIX\b/.test(text)) return 'needs_fix';
  if (/\bDONE\b/.test(text)) return 'done';
  if (/\bPASS\b/.test(text)) return 'pass';
  if (/\bFAIL\b/.test(text)) return 'fail';
  return null;
}
