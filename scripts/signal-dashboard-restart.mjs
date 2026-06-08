import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(repoRoot, 'dist/src/manager/server.js');

try {
    const output = execSync("pgrep -f 'manager/server\\.js'", { encoding: 'utf8' });
    const pids = output.trim().split('\n').filter(Boolean).map(Number);
    for (const pid of pids) {
        try {
            const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
            if (!cmdline.includes(serverPath)) continue;
        } catch {
            // /proc not available (macOS) — check via ps
            try {
                const ps = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim();
                if (!ps.includes(repoRoot)) continue;
            } catch { continue; }
        }
        process.kill(pid, 'SIGUSR2');
        console.log(`[jaw:restart] SIGUSR2 → pid ${pid}`);
    }
} catch {
    console.log('[jaw:restart] no running dashboard — skip');
}
