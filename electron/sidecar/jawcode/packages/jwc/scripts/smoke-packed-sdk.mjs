/**
 * Package-specifier SDK smoke.
 *
 * This verifies the contract cli-jaw will consume after publication:
 * `import("jawcode/sdk")`. It packs Jawcode and the local natives package into
 * a temporary install so omitted `files` entries and missing publish artifacts
 * fail before `npm publish`, without accidentally pulling an older dependency
 * from the public registry during a same-batch release.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const nativesRoot = path.join(repoRoot, "packages", "natives");
const distNodeSdk = path.join(packageRoot, "dist-node", "sdk.js");
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
assert.ok(existsSync(distNodeSdk), "missing dist-node/sdk.js; run `bun run build:node` first");

const tempRoot = mkdtempSync(path.join(tmpdir(), "jawcode-packed-sdk-"));
const nodeModules = path.join(tempRoot, "node_modules");
let jawcodeTarballPath;
let nativesTarballPath;

function run(command, args, options = {}, silent = false) {
	const result = spawnSync(command, args, {
		cwd: packageRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	if (result.status !== 0) {
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
		throw new Error(`${command} ${args.join(" ")} failed${output ? `\n${output}` : ""}`);
	}
	const stdout = (result.stdout ?? "").trim();
	if (!silent && stdout) console.log(stdout);
	return stdout;
}

try {
	const jawcodeTarballName = run("npm", ["pack", "--silent"], { cwd: packageRoot }, true)
		.split(/\r?\n/u)
		.filter(Boolean)
		.at(-1);
	assert.ok(jawcodeTarballName, "npm pack did not return a Jawcode tarball name");
	jawcodeTarballPath = path.join(packageRoot, jawcodeTarballName);
	assert.ok(existsSync(jawcodeTarballPath), `missing packed Jawcode tarball: ${jawcodeTarballPath}`);

	const nativesTarballName = run("npm", ["pack", "--silent"], { cwd: nativesRoot }, true)
		.split(/\r?\n/u)
		.filter(Boolean)
		.at(-1);
	assert.ok(nativesTarballName, "npm pack did not return a natives tarball name");
	nativesTarballPath = path.join(nativesRoot, nativesTarballName);
	assert.ok(existsSync(nativesTarballPath), `missing packed natives tarball: ${nativesTarballPath}`);

	writeFileSync(path.join(tempRoot, "package.json"), `${JSON.stringify({ type: "module" }, null, "\t")}\n`);
	run("npm", ["install", jawcodeTarballPath, nativesTarballPath, "--ignore-scripts=false"], { cwd: tempRoot });
	const versionOutput = run(path.join(nodeModules, ".bin", "jwc"), ["--version"], { cwd: tempRoot });
	assert.equal(versionOutput, `jwc/${packageJson.version}`);

	mkdirSync(nodeModules, { recursive: true });
	const importer = path.join(tempRoot, "importer.mjs");
	writeFileSync(
		importer,
		[
			'import assert from "node:assert/strict";',
			'const sdk = await import("jawcode/sdk");',
			'assert.equal(typeof sdk.createAgentSession, "function");',
			'console.log(`[smoke 120] jawcode/sdk import OK — ${Object.keys(sdk).length} exports`);',
		].join("\n"),
	);

	await import(pathToFileURL(importer).href);
} finally {
	if (jawcodeTarballPath && existsSync(jawcodeTarballPath)) unlinkSync(jawcodeTarballPath);
	if (nativesTarballPath && existsSync(nativesTarballPath)) unlinkSync(nativesTarballPath);
	rmSync(tempRoot, { recursive: true, force: true });
}
