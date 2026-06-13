import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const nodeDir = dirname(process.execPath);
const safePath = [nodeDir, '/usr/bin', '/bin'].join(':');
const env = { ...process.env, PATH: safePath };

const globalJwc = spawnSync('sh', ['-lc', 'command -v jwc'], {
	encoding: 'utf8',
	env,
});
assert.notEqual(globalJwc.status, 0, `expected no global jwc in smoke PATH, got ${globalJwc.stdout.trim()}`);

const runtimeSource = readFileSync(join(repoRoot, 'src/agent/jwc-runtime.ts'), 'utf8');
assert.ok(runtimeSource.includes("'jawcode/sdk'"), 'jwc runtime must default to jawcode/sdk');
assert.ok(!runtimeSource.includes("'jwc/sdk'"), 'jwc runtime must not default to jwc/sdk');

const importer = [
	"const sdk = await import('jawcode/sdk');",
	"if (typeof sdk.createAgentSession !== 'function') throw new Error('missing createAgentSession');",
	"console.log(`[jwc no-global] jawcode/sdk import OK — ${Object.keys(sdk).length} exports`);",
].join('\n');

const result = spawnSync(process.execPath, ['--input-type=module', '-e', importer], {
	cwd: repoRoot,
	encoding: 'utf8',
	env,
});

if (result.status !== 0) {
	process.stderr.write(result.stderr || result.stdout);
	process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
process.stdout.write('[jwc no-global] global jwc absent; embedded package import path OK\n');
