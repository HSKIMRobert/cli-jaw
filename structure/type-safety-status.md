# Type Safety Status

Last updated: 2026-05-31

## tsconfig.json Strict Flags (ALL ENABLED)

| Flag | Status |
|------|--------|
| `strict` | ✅ true (implies noImplicitAny, strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, noImplicitThis, alwaysStrict, useUnknownInCatchVariables) |
| `noUnusedLocals` | ✅ true |
| `noUnusedParameters` | ✅ true |
| `noImplicitReturns` | ✅ true |
| `noFallthroughCasesInSwitch` | ✅ true |
| `noUncheckedIndexedAccess` | ✅ true |
| `noImplicitOverride` | ✅ true |
| `noPropertyAccessFromIndexSignature` | ✅ true |
| `exactOptionalPropertyTypes` | ✅ true |
| `allowUnusedLabels` | ✅ false |
| `allowUnreachableCode` | ✅ false |

**Result**: `npx tsc --noEmit` → 0 errors

## Type Escape Hatch Inventory

### `@ts-nocheck` — RESOLVED

Previously 18 files in `src/browser/adaptive-fetch/` (2820 lines, 283 errors). All `@ts-nocheck` directives have been removed and all 283 type errors fixed. A dedicated `src/browser/adaptive-fetch/types.ts` was created to house shared interfaces and type definitions for the module.

**Current count: 0 files with `@ts-nocheck`.**

### `as any` (4 occurrences — 3 actual casts)

| File | Line | Context |
|------|------|---------|
| src/agent/memory-flush-controller.ts | 91 | `getRecentMessages.all(...) as any[]` |
| src/browser/connection.ts | 489 | `(opts as any)._retried` |
| src/browser/connection.ts | 493 | `{ ...opts, _retried: true } as any` |
| src/discord/channel-types.ts | 9 | Comment only (not actual cast) |

### `@ts-ignore` / `@ts-expect-error`

None.

## Completion

Strict type safety achieved across the entire codebase on **2026-05-31** (commit `a33e3cf5`). The adaptive-fetch module was the last holdout — 18 files, 283 errors (149 implicit-any params, 95 missing properties, 39 others) resolved by creating `types.ts` and adding proper annotations throughout.
