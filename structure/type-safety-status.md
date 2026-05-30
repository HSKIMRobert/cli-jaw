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

### `@ts-nocheck` (18 files — all in one module)

All in `src/browser/adaptive-fetch/`:
- index.ts (592 lines, 63 errors)
- endpoint-resolvers.ts (367 lines, 21 errors)
- safety.ts (286 lines, 21 errors)
- metadata.ts (177 lines, 18 errors)
- browser-escalation.ts (173 lines, 22 errors)
- reader-adapters.ts (145 lines, 30 errors)
- content-scorer.ts (139 lines, 14 errors)
- waf-profiles.ts (134 lines, 5 errors)
- human-loop.ts (109 lines, 10 errors)
- fetcher.ts (107 lines, 14 errors)
- validators.ts (103 lines, 10 errors)
- browser-session.ts (97 lines, 8 errors)
- challenge-detector.ts (91 lines, 13 errors)
- transforms.ts (85 lines, 0 errors)
- output.ts (70 lines, 9 errors)
- trace.ts (61 lines, 13 errors)
- third-party-readers.ts (46 lines, 6 errors)
- browser-runtime.ts (38 lines, 6 errors)

**Total**: 2820 lines, 283 errors when `@ts-nocheck` removed.
**Error breakdown**: 149 TS7006 (implicit any params), 95 TS2339 (missing properties), 39 others.

### `as any` (4 occurrences)

| File | Line | Context |
|------|------|---------|
| src/agent/memory-flush-controller.ts | 91 | `getRecentMessages.all(...) as any[]` |
| src/browser/connection.ts | 489 | `(opts as any)._retried` |
| src/browser/connection.ts | 493 | `{ ...opts, _retried: true } as any` |
| src/discord/channel-types.ts | 9 | Comment only (not actual cast) |

### `@ts-ignore` / `@ts-expect-error`

None (outside adaptive-fetch).

## Remediation Plan for adaptive-fetch

The module was written without types (likely rapid prototype). Fixing requires:
1. Define interfaces for fetch options, response shapes, WAF profiles, reader configs
2. Add parameter type annotations (149 implicit-any params)
3. Add proper property access via interfaces (95 missing-property errors)
4. Estimated effort: medium (mechanical, not architectural)
