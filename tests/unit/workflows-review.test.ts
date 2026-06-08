import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';
import {
    buildReviewArtifact,
    buildReviewSteerPrompt,
    buildReviewTargetContext,
    parseReviewFlags,
} from '../../src/workflows/review.ts';

const repoRoot = '/Users/jun/Developer/new/700_projects/cli-jaw';
const jawHome = '/Users/jun/.cli-jaw';

function sectionBody(artifact: ReturnType<typeof buildReviewArtifact>, id: string): string {
    const section = artifact.sections.find(s => s.id === id);
    assert.ok(section, `missing artifact section: ${id}`);
    return section.body;
}

test('/review artifact prefers projectDirs over workingDir', () => {
    const artifact = buildReviewArtifact(parseReviewFlags([]), 'en', {
        workingDir: jawHome,
        projectDirs: [repoRoot],
    });

    assert.equal(sectionBody(artifact, 'review-target'), repoRoot);
    assert.equal(sectionBody(artifact, 'configured-project-dirs'), repoRoot);
    assert.match(sectionBody(artifact, 'markdown-report'), /review-reports\/cli-jaw-/);
    assert.equal(artifact.storage.projectKey.startsWith('cli-jaw-'), true);
});

test('/review artifact does not turn JAW_HOME or process cwd into a project target', () => {
    const artifact = buildReviewArtifact(parseReviewFlags([]), 'en', {
        workingDir: jawHome,
        projectDirs: null,
    });

    assert.equal(sectionBody(artifact, 'review-target'), 'Infer from recent context, then validate git repo');
    assert.equal(sectionBody(artifact, 'configured-project-dirs'), '(none configured)');
    assert.match(sectionBody(artifact, 'target-policy'), /No projectDirs are configured/);
    assert.doesNotMatch(sectionBody(artifact, 'review-target'), /\.cli-jaw/);
    assert.doesNotMatch(sectionBody(artifact, 'review-target'), new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('/review steer prompt contains project-dir validation and markdown report contract', () => {
    const context = buildReviewTargetContext({
        workingDir: jawHome,
        projectDirs: null,
    }, '20260608110000-reviewReport-test');
    const prompt = buildReviewSteerPrompt(parseReviewFlags([]), context);

    assert.match(prompt, /Never use JAW_HOME, ~\/\.cli-jaw\*, settings\.workingDir, or process\.cwd\(\) as a fallback review target/);
    assert.match(prompt, /infer the most likely repository from recent conversation\/context/i);
    assert.match(prompt, /git rev-parse --show-toplevel/);
    assert.match(prompt, /Save the final human-readable report as Markdown at the exact Markdown report path/);
    assert.match(prompt, new RegExp(context.reportPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(prompt, new RegExp(`Project root: ${jawHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('/review --fix remains scoped to Critical and High findings in the resolved repo', () => {
    const context = buildReviewTargetContext({
        projectDirs: [repoRoot],
    }, '20260608110000-reviewReport-fix');
    const prompt = buildReviewSteerPrompt(parseReviewFlags(['--fix']), context);

    assert.match(prompt, /auto-fix all Critical and High severity findings only/);
    assert.match(prompt, /Apply fixes only inside the validated Project root/);
    assert.match(prompt, /Update the Markdown report with the fix summary and verification result/);
});

test('/review command result carries project-dir artifact without workingDir fallback', async () => {
    const parsed = parseCommand('/review');
    const result = await executeCommand(parsed, {
        interface: 'telegram',
        locale: 'en',
        getSettings: () => ({ workingDir: jawHome, projectDirs: null }),
    });

    assert.equal(result?.ok, true);
    assert.equal(result?.artifact?.kind, 'reviewReport');
    assert.equal(result?.artifact?.sections.some(s => s.id === 'project-root'), false);
    assert.equal(result?.artifact?.sections.find(s => s.id === 'review-target')?.body, 'Infer from recent context, then validate git repo');
    assert.match(result?.steerPrompt || '', /BLOCKED: project directory required/);
});
