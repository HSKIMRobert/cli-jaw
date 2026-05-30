/**
 * Virtualized transcript viewport for alt-screen mode (Phase 4).
 */
import type { TranscriptItem } from '../transcript.js';
import type { Rect } from './layout.js';

export interface ViewportCell {
    lines: string[];
    revision: number;
}

export class Viewport {
    private cells: ViewportCell[] = [];
    private scrollTop = 0;
    private follow = true;
    private width = 80;

    setWidth(cols: number): void {
        this.width = Math.max(20, cols);
        for (const c of this.cells) c.revision += 1;
    }

    setItems(items: TranscriptItem[], renderLine: (item: TranscriptItem, width: number) => string[], visibleRows = 1): void {
        this.cells = items.map((item, i) => ({
            lines: renderLine(item, this.width),
            revision: i,
        }));
        if (this.follow) this.scrollToBottom(visibleRows);
    }

    updateTail(item: TranscriptItem, renderLine: (item: TranscriptItem, width: number) => string[], visibleRows = 1): void {
        if (!this.cells.length) {
            this.setItems([item], renderLine);
            return;
        }
        const tail = this.cells[this.cells.length - 1]!;
        tail.lines = renderLine(item, this.width);
        tail.revision += 1;
        if (this.follow) this.scrollToBottom(visibleRows);
    }

    appendCell(item: TranscriptItem, renderLine: (item: TranscriptItem, width: number) => string[], visibleRows = 1): void {
        this.cells.push({
            lines: renderLine(item, this.width),
            revision: this.cells.length,
        });
        if (this.follow) this.scrollToBottom(visibleRows);
    }

    followTail(on: boolean, visibleRows = 1): void {
        this.follow = on;
        if (on) this.scrollToBottom(visibleRows);
    }

    scrollBy(lines: number, visibleRows = 1): void {
        this.follow = false;
        this.scrollTop = Math.max(0, this.scrollTop + lines);
        this.clampScroll(visibleRows);
    }

    pageUp(regionHeight: number): void { this.scrollBy(-Math.max(1, regionHeight - 1), regionHeight); }
    pageDown(regionHeight: number): void { this.scrollBy(Math.max(1, regionHeight - 1), regionHeight); }

    scrollToBottom(visibleRows = 1): void {
        this.follow = true;
        this.scrollTop = Math.max(0, this.totalLines() - visibleRows);
    }

    scrollToTop(): void {
        this.scrollTop = 0;
        this.follow = false;
    }

    isFollowingTail(): boolean {
        return this.follow;
    }

    totalLines(): number {
        return this.cells.reduce((n, c) => n + c.lines.length, 0);
    }

    composeRegion(region: Rect): string[] {
        const flat: string[] = [];
        for (const cell of this.cells) flat.push(...cell.lines);
        this.clampScroll(region.height);
        const start = this.scrollTop;
        const out: string[] = [];
        for (let i = 0; i < region.height; i++) {
            out.push(flat[start + i] ?? '');
        }
        return out;
    }

    private clampScroll(visibleRows = 1): void {
        const max = Math.max(0, this.totalLines() - visibleRows);
        if (this.scrollTop > max) this.scrollTop = max;
    }
}
