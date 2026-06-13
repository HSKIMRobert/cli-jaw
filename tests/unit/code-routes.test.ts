import test from 'node:test';
import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response } from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerCodeRoutes } from '../../src/routes/code.ts';

const noAuth = (_req: Request, _res: Response, next: NextFunction) => next();

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
	const app = express();
	app.use(express.json());
	registerCodeRoutes(app, noAuth);
	const server = app.listen(0);
	try {
		const address = server.address();
		assert.ok(address && typeof address === 'object');
		await fn(`http://127.0.0.1:${address.port}`);
	} finally {
		await new Promise<void>(resolve => server.close(() => resolve()));
	}
}

test('code routes expose read-only session and permission surfaces without starting jwc', async () => {
	await withServer(async baseUrl => {
		const sessions = await fetch(`${baseUrl}/api/code/sessions`);
		assert.equal(sessions.status, 200);
		assert.deepEqual(await sessions.json(), { ok: true, sessions: [] });

		const permissions = await fetch(`${baseUrl}/api/code/permissions`);
		assert.equal(permissions.status, 200);
		assert.deepEqual(await permissions.json(), { ok: true, permissions: [] });
	});
});

test('code git-info rejects missing cwd and reports non-repo absolute cwd', async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), 'cli-jaw-code-routes-'));
	try {
		await withServer(async baseUrl => {
			const missing = await fetch(`${baseUrl}/api/code/git-info`);
			assert.equal(missing.status, 400);
			assert.deepEqual(await missing.json(), { ok: false, error: 'absolute cwd required' });

			const nonRepo = await fetch(`${baseUrl}/api/code/git-info?cwd=${encodeURIComponent(cwd)}`);
			assert.equal(nonRepo.status, 200);
			assert.deepEqual(await nonRepo.json(), { ok: true, isRepo: false, branch: null, worktrees: [] });
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
