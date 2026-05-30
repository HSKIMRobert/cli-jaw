/**
 * Full-screen region solver (Phase 4). Footer + composer fixed; transcript fills rest.
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
    composer: Rect;
    footer: Rect;
}

export function solveLayout(
    cols: number,
    rows: number,
    composerLines: number,
    headerLines = 0,
): Regions {
    const safeCols = Math.max(20, cols);
    const safeRows = Math.max(4, rows);
    const footerH = 1;
    const composerH = Math.max(1, Math.min(composerLines, safeRows - footerH - 1));
    const headerH = Math.max(0, Math.min(headerLines, safeRows - footerH - composerH - 1));
    const transcriptH = Math.max(1, safeRows - headerH - composerH - footerH);
    const headerY = 1;
    const transcriptY = headerY + headerH;
    const composerY = transcriptY + transcriptH;
    const footerY = composerY + composerH;

    return {
        header: { x: 1, y: headerY, width: safeCols, height: headerH },
        transcript: { x: 1, y: transcriptY, width: safeCols, height: transcriptH },
        composer: { x: 1, y: composerY, width: safeCols, height: composerH },
        footer: { x: 1, y: footerY, width: safeCols, height: footerH },
    };
}
