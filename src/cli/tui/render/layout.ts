/**
 * Full-screen region solver. jawcode layout order:
 *   transcript → statusBar → composer(boxed) → hint
 * StatusBar is above the input box, hint is below.
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
    statusBar: Rect;
    composer: Rect;
    hint: Rect;
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
    const statusBarH = 1;
    const hintH = 1;
    const borderH = 2;
    const composerH = Math.max(1, Math.min(composerLines, safeRows - statusBarH - hintH - borderH - 2));
    const headerH = Math.max(0, Math.min(headerLines, safeRows - statusBarH - composerH - hintH - borderH - 1));
    const transcriptH = Math.max(1, safeRows - headerH - statusBarH - borderH - composerH - hintH);

    const headerY = 1;
    const transcriptY = headerY + headerH;
    const statusBarY = transcriptY + transcriptH;
    const topBorderY = statusBarY + statusBarH;
    const composerY = topBorderY + 1;
    const botBorderY = composerY + composerH;
    const hintY = botBorderY + 1;

    return {
        header: { x: 1, y: headerY, width: safeCols, height: headerH },
        transcript: { x: 1, y: transcriptY, width: safeCols, height: transcriptH },
        statusBar: { x: 1, y: statusBarY, width: safeCols, height: statusBarH },
        composer: { x: 1, y: composerY, width: safeCols, height: composerH },
        hint: { x: 1, y: hintY, width: safeCols, height: hintH },
        footer: { x: 1, y: statusBarY, width: safeCols, height: 1 },
    };
}
