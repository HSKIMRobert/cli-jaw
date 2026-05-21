import { settings } from '../core/config.js';
import { getProjectDirs, setProjectDirs, clearProjectDirs } from '../core/config.js';
import { resolveHomePath } from '../core/path-expand.js';
import path from 'node:path';
import fs from 'node:fs';
import type { SlashHandler } from './types.js';

export const projectHandler: SlashHandler = async (args) => {
    const sub = (args[0] || 'list').toLowerCase();

    switch (sub) {
        case 'set': {
            const input = args.slice(1).join(' ');
            if (!input.trim()) {
                return { text: '❌ No paths specified. Usage: /project set <path>[, <path>...]' };
            }
            const raw = input.split(',').map(s => s.trim()).filter(Boolean);
            const resolved: string[] = [];
            const warnings: string[] = [];
            for (const p of raw) {
                const abs = resolveHomePath(p);
                if (!path.isAbsolute(abs)) {
                    return { text: `❌ Absolute paths only: ${p}` };
                }
                if (!fs.existsSync(abs)) {
                    warnings.push(`⚠ Path does not exist: ${abs}`);
                }
                resolved.push(abs);
            }
            const deduped = [...new Set(resolved)];
            setProjectDirs(deduped);
            const lines = ['✅ projectDirs set:', ...deduped.map(d => `   ${d}`)];
            if (warnings.length) lines.push('', ...warnings);
            return { text: lines.join('\n') };
        }
        case 'reset':
        case 'clear': {
            clearProjectDirs();
            return { text: '✅ projectDirs cleared' };
        }
        case 'list':
        default: {
            const dirs = getProjectDirs();
            if (!dirs || dirs.length === 0) {
                return { text: 'No active project directories.' };
            }
            return { text: ['Active project directories:', ...dirs.map(d => `   ${d}`)].join('\n') };
        }
    }
};
