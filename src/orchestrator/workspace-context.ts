import { existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const REPO_PATH_PREFIXES = [
    'src/',
    'public/',
    'tests/',
    'scripts/',
    'devlog/',
    'skills/',
    'skills_ref/',
    'package.json',
    'tsconfig.json',
];

export type WorkspaceContextInput = {
    workingDir?: string | null;
    projectDirs?: string[] | null;
    worklogPath?: string | null;
    employeeName?: string | null;
    task?: string;
};

export function resolveWorkspaceRoot(workingDir?: string | null): string {
    return resolve(workingDir || process.cwd());
}

export function buildResolvedPathHints(task: string | undefined, projectRoots: string[]): string {
    if (!task || projectRoots.length === 0) return '';
    const seen = new Set<string>();
    const words = task.match(/[A-Za-z0-9_./@-]+/g) || [];
    for (const word of words) {
        const clean = word.replace(/[),.;:]+$/, '');
        if (!REPO_PATH_PREFIXES.some(prefix => clean === prefix || clean.startsWith(prefix))) continue;
        seen.add(clean);
    }
    if (!seen.size) return '';
    const lines = [...seen].flatMap(p => {
        if (p.includes('..')) return [];
        return projectRoots.map(root => {
            const absolute = resolve(root, p);
            const rel = relative(root, absolute);
            if (rel.startsWith('..') || rel.startsWith(sep + sep)) return null;
            const status = existsSync(absolute) ? 'exists' : 'not found';
            return `- ${p} -> ${JSON.stringify(absolute)} (${status})`;
        }).filter(Boolean);
    }) as string[];
    return `## Resolved Path Hints\n${lines.join('\n')}`;
}

export function buildWorkspaceContextBlock(input: WorkspaceContextInput): string {
    const roots = input.projectDirs?.length
        ? input.projectDirs.map(d => resolve(d))
        : [resolveWorkspaceRoot(input.workingDir)];

    const rootLines = roots.length === 1
        ? `Project root: ${JSON.stringify(roots[0])}`
        : roots.map((r, i) => `Project root ${i + 1}: ${JSON.stringify(r)}`).join('\n');

    const primaryRoot = roots[0]!;
    const devlogRoot = join(primaryRoot, 'devlog');
    const hints = buildResolvedPathHints(input.task, roots);

    return [
        '## Workspace Context (authoritative)',
        rootLines,
        `Devlog root: ${JSON.stringify(devlogRoot)}`,
        `Worklog path: ${input.worklogPath || '(none)'}`,
        'Employee runtime cwd: isolated temporary directory, not the project root',
        '',
        'Path rules:',
        '- Treat Project root as the source of truth.',
        '- Resolve all relative repository paths against Project root.',
        '- Use absolute paths when reading or editing files.',
        '- Do not infer repository paths from process.cwd(), ~/.cli-jaw, or the employee temp directory.',
        '- If a requested path is missing under Project root, stop and report it instead of guessing.',
        hints ? `\n${hints}` : '',
    ].filter(Boolean).join('\n');
}
