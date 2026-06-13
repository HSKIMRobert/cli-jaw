/**
 * Virtualized transcript viewport for alt-screen mode (Phase 4).
 * Memoized: setItems() only re-renders cells whose content has changed.
 */
import type { TranscriptItem } from '../transcript.js';
import type { Rect } from './layout.js';

export interface ViewportCell {
    lines: string[];
    revision: number;
    cacheKey: string;
}

export class Viewport {
    private cells: ViewportCell[] = [];
    private scrollTop = 0;
    private follow = true;
    private width = 80;
    private widthChanged = false;

    setWidth(cols: number): void {
        const next = Math.max(20, cols);
        if (next !== this.width) {
            this.width = next;
            this.widthChanged = true;
        }
    }

    setItems(items: TranscriptItem[], renderLine: (item: TranscriptItem, width: number) => string[], visibleRows = 1): void {
        if (this.widthChanged || this.cells.length === 0) {
            this.cells = items.map((item, i) => ({
                lines: renderLine(item, this.width),
                revision: i,
                cacheKey: this.itemCacheKey(item),
            }));
            this.widthChanged = false;
        } else {
            const prevLen = this.cells.length;
            const nextLen = items.length;
            const shared = Math.min(prevLen, nextLen);
            for (let i = 0; i < shared; i++) {
                const item = items[i]!;
                const key = this.itemCacheKey(item);
                const cell = this.cells[i]!;
                if (item.type === 'status' || cell.cacheKey !== key) {
                    cell.lines = renderLine(item, this.width);
                    cell.cacheKey = key;
                    cell.revision += 1;
                }
            }
            if (nextLen > prevLen) {
                for (let i = prevLen; i < nextLen; i++) {
                    this.cells.push({
                        lines: renderLine(items[i]!, this.width),
                        revision: i,
                        cacheKey: this.itemCacheKey(items[i]!),
                    });
                }
            } else if (nextLen < prevLen) {
                this.cells.length = nextLen;
            }
        }
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
        tail.cacheKey = this.itemCacheKey(item);
        if (this.follow) this.scrollToBottom(visibleRows);
    }

    appendCell(item: TranscriptItem, renderLine: (item: TranscriptItem, width: number) => string[], visibleRows = 1): void {
        this.cells.push({
            lines: renderLine(item, this.width),
            revision: this.cells.length,
            cacheKey: this.itemCacheKey(item),
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
        if (this.follow && flat.length > 0 && flat.length < region.height) {
            return [
                ...new Array(region.height - flat.length).fill(''),
                ...flat,
            ];
        }
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

    private itemCacheKey(item: TranscriptItem): string {
        switch (item.type) {
            case 'user': return `u|${item.displayText.length}|${hashText(item.displayText)}|${item.agentId ?? ''}`;
            case 'assistant': return `a|${item.text.length}|${hashText(item.text)}|${item.streaming ? 1 : 0}|${item.agentId ?? ''}`;
            case 'tool': return `t|${item.text.length}|${hashText(item.text)}|${item.collapsed ? 1 : 0}|${item.detail ? hashText(item.detail) : ''}|${item.agentId ?? ''}`;
            case 'status': return `s|${item.text.length}|${hashText(item.text)}|${item.agentId ?? ''}`;
        }
    }
}

function hashText(text: string): string {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
