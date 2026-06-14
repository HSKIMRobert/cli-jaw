/**
 * Full-screen region solver. Transcript and bottom composer cluster are separate.
 */

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Regions {
    header: Rect;
    transcript: Rect;
    statusLine: Rect;
    composer: Rect;
    help: Rect;
    /** Compatibility alias for the status line while older callers migrate. */
    footer: Rect;
}

export function solveLayout(
    cols: number,
    rows: number,
    composerLines: number,
    headerLines = 0,
): Regions {
    const safeCols = Math.max(20, cols);
    const safeRows = Math.max(6, rows);
    const statusH = 1;
    const borderH = 2;
    const helpH = 1;
    const reservedWithoutComposer = statusH + borderH + helpH + 1;
    const composerH = Math.max(1, Math.min(composerLines, safeRows - reservedWithoutComposer));
    const headerH = Math.max(0, Math.min(headerLines, safeRows - statusH - composerH - borderH - helpH - 1));
    const transcriptH = Math.max(1, safeRows - headerH - statusH - composerH - borderH - helpH);
    const headerY = 1;
    const transcriptY = headerY + headerH;
    const statusY = transcriptY + transcriptH;
    const composerY = statusY + statusH + 1;
    const helpY = composerY + composerH + 1;
    const statusLine = { x: 1, y: statusY, width: safeCols, height: statusH };

    return {
        header: { x: 1, y: headerY, width: safeCols, height: headerH },
        transcript: { x: 1, y: transcriptY, width: safeCols, height: transcriptH },
        statusLine,
        composer: { x: 1, y: composerY, width: safeCols, height: composerH },
        help: { x: 1, y: helpY, width: safeCols, height: helpH },
        footer: statusLine,
    };
}
