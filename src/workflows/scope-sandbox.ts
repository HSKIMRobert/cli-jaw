// Physical directory sandboxing and post-dispatch scope verification.
// Uses only Node.js built-ins — no new dependencies.

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const PROTECTED_PATTERNS = [
    /\.git\//,
    /\.env$/,
    /settings\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
];

export function normalizeScope(projectRoot: string, scopePath: string): string {
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedScope = path.resolve(projectRoot, scopePath);

    if (!resolvedScope.startsWith(resolvedRoot)) {
        throw new Error(`Security Error: Scope [${scopePath}] escapes project root.`);
    }

    if (fs.existsSync(resolvedScope)) {
        const realScope = fs.realpathSync(resolvedScope);
        if (!realScope.startsWith(resolvedRoot)) {
            throw new Error(`Security Error: Realpath of scope is outside project root.`);
        }
    }

    return resolvedScope;
}

export function isProtectedPath(filePath: string): boolean {
    return PROTECTED_PATTERNS.some(regex => regex.test(filePath));
}

export function postDispatchDiffCheck(
    projectRoot: string, allowedScope?: string,
): { ok: boolean; modifiedOutside: string[] } {
    if (!allowedScope) return { ok: true, modifiedOutside: [] };

    const diffOutput = execSync('git diff --name-only', { cwd: projectRoot }).toString();
    const modifiedFiles = diffOutput.split('\n').filter(Boolean);

    const absoluteAllowedScope = path.resolve(projectRoot, allowedScope);
    const outsideFiles = modifiedFiles.filter(file => {
        const absFile = path.resolve(projectRoot, file);
        return !absFile.startsWith(absoluteAllowedScope) || isProtectedPath(file);
    });

    return {
        ok: outsideFiles.length === 0,
        modifiedOutside: outsideFiles,
    };
}
