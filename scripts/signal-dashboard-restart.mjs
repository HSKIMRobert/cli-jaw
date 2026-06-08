import { execSync } from 'node:child_process';

try {
    const output = execSync("pgrep -f 'manager/server\\.js'", { encoding: 'utf8' });
    const pids = output.trim().split('\n').filter(Boolean).map(Number);
    for (const pid of pids) {
        process.kill(pid, 'SIGUSR2');
        console.log(`[jaw:restart] SIGUSR2 → pid ${pid}`);
    }
} catch {
    console.log('[jaw:restart] no running dashboard — skip');
}
