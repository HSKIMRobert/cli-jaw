const STRIP_KEYS = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ASAR',
    'NODE_OPTIONS',
    'NODE_REPL_HISTORY',
]);

export function sanitizeEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v === undefined) continue;
        if (STRIP_KEYS.has(k)) continue;
        if (k.startsWith('ELECTRON_')) continue;
        out[k] = v;
    }
    out['TERM'] = 'xterm-256color';
    out['COLORTERM'] = 'truecolor';
    return out;
}
