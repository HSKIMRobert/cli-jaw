import { sharkIcon } from './icons.js';
// jawcode bundle integration available via jawcode-render.js when needed

const SHARK_ART = [
    '            ▄▄▄▄▄▄            ',
    '         ▄▀░░░░░░░▀▄          ',
    '       ▄▀░░░░░░░░░░░▀▄       ',
    '      █░░░░░░░░░░░░░░░█      ',
    '     █░░░●░░░░░░░●░░░░░█     ',
    '    █░░░░░░░▄▄▄░░░░░░░░░█    ',
    '   █░░░░░░░░░▀▀░░░░░░░░░░█   ',
    '  █░░░░╱░░░░░░░░░░░╲░░░░░░█  ',
    ' █░░░╱░╱░░░░░░░░░╲░╲░░░░░░█ ',
    '█░░░╱░╱░░░░░░░░░░░╲░╲░░░░░░█',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈',
];

const BLUE_GRADIENT: ReadonlyArray<readonly [number, number, number]> = [
    [15, 42, 90],
    [30, 64, 175],
    [59, 130, 246],
    [96, 165, 250],
    [147, 197, 253],
];

function gradientLine(line: string, row: number, totalRows: number): string {
    const t = totalRows > 1 ? row / (totalRows - 1) : 0.5;
    const stopIdx = t * (BLUE_GRADIENT.length - 1);
    const lo = Math.floor(stopIdx);
    const hi = Math.min(lo + 1, BLUE_GRADIENT.length - 1);
    const frac = stopIdx - lo;
    const c0 = BLUE_GRADIENT[lo]!;
    const c1 = BLUE_GRADIENT[hi]!;
    const r = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * frac);
    return `\x1b[38;2;${r};${g};${b}m${line}\x1b[0m`;
}

export function renderJawWelcome(opts: {
    version: string;
    model: string;
    engine: string;
    projectRoot?: string | undefined;
    port?: number | undefined;
    gitBranch?: string | undefined;
    recentSessions?: Array<{ label: string; ago: string }> | undefined;
}, width: number): string[] {
    const W = Math.min(width, 78);
    const DIM = '\x1b[2m';
    const BOLD = '\x1b[1m';
    const RST = '\x1b[0m';
    const BLUE = '\x1b[38;2;59;130;246m';
    const LTBLUE = '\x1b[38;2;96;165;250m';
    const NAVY = '\x1b[38;2;30;64;175m';
    const MUTED = '\x1b[38;2;51;65;85m';

    const icon = sharkIcon();
    const borderH = '─';
    const bTL = '╭'; const bTR = '╮'; const bBL = '╰'; const bBR = '╯';
    const bV = '│';

    const innerW = W - 2;
    const titleText = ` ${icon} jaw v${opts.version} `;
    const titlePad = Math.max(0, innerW - titleText.length);
    const titleLeft = Math.floor(titlePad / 2);
    const titleRight = titlePad - titleLeft;

    const lines: string[] = [];

    lines.push(`${NAVY}${bTL}${borderH.repeat(titleLeft)}${LTBLUE}${titleText}${NAVY}${borderH.repeat(titleRight)}${bTR}${RST}`);

    const leftW = Math.floor(innerW * 0.55);
    const rightW = innerW - leftW - 1;

    const leftLines: string[] = [
        `${BOLD}${BLUE}${icon} jaw${RST}`,
        `${DIM}${MUTED}bite anything!${RST}`,
        `${MUTED}v${opts.version}${RST}`,
        '',
    ];

    for (let i = 0; i < SHARK_ART.length; i++) {
        leftLines.push(gradientLine(SHARK_ART[i]!, i, SHARK_ART.length));
    }

    leftLines.push('');
    leftLines.push(`${BLUE}⬢${RST} ${LTBLUE}${opts.model}${RST}`);
    leftLines.push(`${MUTED}engine:${RST} ${BOLD}${LTBLUE}${opts.engine}${RST}`);

    const rightLines: string[] = [
        `${BOLD}${LTBLUE}Flow keys${RST}`,
        `${MUTED}/  ·  #  ·  !  ·  $  ·  ?${RST}`,
        `${MUTED}ctrl+l · shift+tab${RST}`,
        '',
    ];

    rightLines.push(`${BOLD}${LTBLUE}Project${RST}`);
    if (opts.projectRoot) {
        const display = opts.projectRoot.replace(process.env['HOME'] || '', '~');
        rightLines.push(`${MUTED}📁 ${display}${RST}`);
        if (opts.gitBranch) rightLines.push(`${MUTED}ⴲ ${opts.gitBranch}${RST}`);
    } else {
        rightLines.push(`${MUTED}(no project set)${RST}`);
    }
    if (opts.port) rightLines.push(`${MUTED}:${opts.port}${RST}`);
    rightLines.push('');

    rightLines.push(`${BOLD}${LTBLUE}Session trail${RST}`);
    if (opts.recentSessions && opts.recentSessions.length > 0) {
        for (const s of opts.recentSessions.slice(0, 3)) {
            rightLines.push(`${MUTED}▸ ${s.label} (${s.ago})${RST}`);
        }
    } else {
        rightLines.push(`${MUTED}No saved trails${RST}`);
    }
    rightLines.push('');
    rightLines.push(`${MUTED}/resume${RST}`);

    const maxRows = Math.max(leftLines.length, rightLines.length);
    for (let i = 0; i < maxRows; i++) {
        const l = leftLines[i] || '';
        const r = rightLines[i] || '';
        const lStripped = l.replace(/\x1b\[[0-9;]*m/g, '');
        const pad = Math.max(0, leftW - lStripped.length);
        lines.push(`${NAVY}${bV}${RST} ${l}${' '.repeat(pad)}${NAVY}${bV}${RST} ${r}${' '.repeat(Math.max(0, rightW - r.replace(/\x1b\[[0-9;]*m/g, '').length))}${NAVY}${bV}${RST}`);
    }

    lines.push(`${NAVY}${bBL}${borderH.repeat(innerW)}${bBR}${RST}`);

    return lines;
}
