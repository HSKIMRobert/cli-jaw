/**
 * Markdown → ANSI renderer (token-based, via the already-present `marked`).
 * Gutter-indented, theme-tokened, CJK/emoji-width aware. Phase 1 of TUI
 * modernization (devlog 260529_tui_parity, doc 06/13). Code blocks are
 * syntax-highlighted through highlight.ts.
 */
import { marked, type Token, type Tokens } from 'marked';
import { paint, attr, BOLD, ITALIC, UNDER, DIM } from './theme.js';
import { highlightCode } from './highlight.js';
import { visualWidth } from './renderers.js';

export interface MdOpts {
    width: number;
    gutter?: string;
}

export function renderMarkdown(md: string, opts: MdOpts): string {
    const gutter = opts.gutter ?? '  ';
    const tokens = marked.lexer(md);
    return renderBlocks(tokens, gutter, opts.width).replace(/\n{3,}/g, '\n\n');
}

function renderBlocks(tokens: Token[], gutter: string, width: number): string {
    let out = '';
    for (const t of tokens) {
        switch (t.type) {
            case 'heading': {
                const h = t as Tokens.Heading;
                out += '\n' + paint('heading', gutter + '#'.repeat(h.depth) + ' ' + inline(h.tokens), BOLD) + '\n';
                break;
            }
            case 'paragraph':
                out += wrap(inline((t as Tokens.Paragraph).tokens), width, gutter) + '\n';
                break;
            case 'code': {
                const c = t as Tokens.Code;
                const body = highlightCode(c.text, c.lang || undefined)
                    .split('\n').map(l => gutter + '  ' + l).join('\n');
                out += paint('code.fence', gutter + '```' + (c.lang ?? '')) + '\n'
                    + body + '\n' + paint('code.fence', gutter + '```') + '\n';
                break;
            }
            case 'blockquote':
                out += paint('quote', wrap(inline((t as Tokens.Blockquote).tokens), Math.max(8, width - 2), gutter + '│ ')) + '\n';
                break;
            case 'list': {
                const l = t as Tokens.List;
                const start = Number(l.start) || 1;
                l.items.forEach((it, i) => {
                    const marker = l.ordered ? `${start + i}. ` : '• ';
                    const hang = gutter + ' '.repeat(marker.length);
                    const wrapped = wrap(inline(it.tokens), Math.max(8, width - marker.length), hang);
                    out += gutter + marker + wrapped.slice(hang.length) + '\n';
                });
                break;
            }
            case 'hr':
                out += gutter + paint('code.fence', '─'.repeat(Math.max(4, Math.min(width, 48)))) + '\n';
                break;
            case 'table':
                out += renderTable(t as Tokens.Table, gutter) + '\n';
                break;
            case 'space':
                break;
            default:
                if ('text' in t && typeof (t as { text?: unknown }).text === 'string') {
                    out += wrap((t as { text: string }).text, width, gutter) + '\n';
                }
        }
    }
    return out;
}

function inline(tokens: Token[] | undefined): string {
    if (!tokens) return '';
    let s = '';
    for (const t of tokens) {
        switch (t.type) {
            case 'strong': s += attr(inline((t as Tokens.Strong).tokens), BOLD); break;
            case 'em': s += attr(inline((t as Tokens.Em).tokens), ITALIC); break;
            case 'del': s += attr(inline((t as Tokens.Del).tokens), DIM); break;
            case 'codespan': s += paint('code.fence', (t as Tokens.Codespan).text); break;
            case 'link': s += paint('link', inline((t as Tokens.Link).tokens), UNDER); break;
            case 'br': s += '\n'; break;
            default: s += 'text' in t ? String((t as { text: unknown }).text) : '';
        }
    }
    return s;
}

function renderTable(t: Tokens.Table, gutter: string): string {
    const cols = t.header.length;
    const widths: number[] = Array.from({ length: cols }, () => 0);
    const rows = [t.header.map(h => inline(h.tokens)), ...t.rows.map(r => r.map(c => inline(c.tokens)))];
    rows.forEach(r => r.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, visualWidth(c)); }));
    const line = (r: string[], bold = false): string =>
        gutter + r.map((c, i) => attr(c + ' '.repeat(Math.max(0, (widths[i] ?? 0) - visualWidth(c))), bold ? BOLD : '')).join('  ');
    const sep = gutter + widths.map(x => '─'.repeat(x)).join('  ');
    const header = rows[0] ?? [];
    return [line(header, true), sep, ...rows.slice(1).map(r => line(r))].join('\n');
}

/** Word-wrap to width using visual (CJK-aware) width; prefix every line with gutter. */
function wrap(text: string, width: number, gutter: string): string {
    const max = Math.max(8, width);
    return text.split('\n').map(par => {
        const words = par.split(/(\s+)/);
        let line = '';
        let out = '';
        for (const word of words) {
            if (visualWidth(line + word) > max && line.trim()) {
                out += gutter + line.trimEnd() + '\n';
                line = word.trimStart();
            } else {
                line += word;
            }
        }
        return out + gutter + line.trimEnd();
    }).join('\n');
}
