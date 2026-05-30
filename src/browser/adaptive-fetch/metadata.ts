// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while cli-jaw mirror remains experimental.

import { extractTitleFromHtml, htmlToReadableText, normalizeWhitespace } from './transforms.js';

export function extractMetadataFromHtml(html: string = '', finalUrl: string = '') {
    const title = firstNonEmpty(
        getMetaContent(html, 'property', 'og:title'),
        getMetaContent(html, 'name', 'twitter:title'),
        extractTitleFromHtml(html),
    );
    const description = firstNonEmpty(
        getMetaContent(html, 'name', 'description'),
        getMetaContent(html, 'property', 'og:description'),
        getMetaContent(html, 'name', 'twitter:description'),
    );
    const canonicalUrl = resolveMaybeUrl(getLinkHref(html, 'canonical'), finalUrl);
    const feedUrls = extractFeedUrls(html, finalUrl);
    const oEmbedUrls = extractOembedUrls(html, finalUrl);
    const jsonLd = extractJsonLdBlocks(html);
    const text = htmlToReadableText(html);
    return {
        source: 'metadata',
        finalUrl,
        title,
        text,
        metadata: {
            canonicalUrl,
            description,
            feedUrls,
            oEmbedUrls,
            openGraph: extractOpenGraph(html),
            jsonLd,
        },
        evidence: [
            title ? 'title' : null,
            description ? 'description' : null,
            canonicalUrl ? 'canonical' : null,
            feedUrls.length > 0 ? 'feed-link' : null,
            oEmbedUrls.length > 0 ? 'oembed-link' : null,
            jsonLd.length > 0 ? 'json-ld' : null,
        ].filter(Boolean),
        warnings: [] as string[],
    };
}

export function extractJsonLdBlocks(html: string = ''): unknown[] {
    const blocks: unknown[] = [];
    const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
        const raw = match[1]!.trim();
        if (!raw) continue;
        try {
            blocks.push(JSON.parse(raw));
        } catch {
            blocks.push({ raw, parseError: true });
        }
    }
    return blocks;
}

function extractOpenGraph(html: string): Record<string, string> {
    const og: Record<string, string> = {};
    const re = /<meta\s+[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) og[match[1]!] = normalizeWhitespace(match[2]!);
    return og;
}

export function extractFeedUrls(html: string = '', base: string = ''): string[] {
    const urls: string[] = [];
    const re = /<link\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
        const tag = match[0];
        const rel = getTagAttr(tag, 'rel').toLowerCase();
        const type = getTagAttr(tag, 'type').toLowerCase();
        const href = getTagAttr(tag, 'href');
        if (!href || !/\balternate\b/.test(rel)) continue;
        if (!/(application\/rss\+xml|application\/atom\+xml|application\/feed\+json|text\/xml|application\/xml)/i.test(type)) continue;
        const resolved = resolveMaybeUrl(href, base);
        if (resolved && !urls.includes(resolved)) urls.push(resolved);
    }
    return urls;
}

export function extractOembedUrls(html: string = '', base: string = ''): string[] {
    const urls: string[] = [];
    const re = /<link\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
        const tag = match[0];
        const rel = getTagAttr(tag, 'rel').toLowerCase();
        const type = getTagAttr(tag, 'type').toLowerCase();
        const href = getTagAttr(tag, 'href');
        if (!href || !/\balternate\b/.test(rel)) continue;
        if (!/(application\/json\+oembed|text\/xml\+oembed|application\/xml\+oembed)/i.test(type)) continue;
        const resolved = resolveMaybeUrl(href, base);
        if (resolved && !urls.includes(resolved)) urls.push(resolved);
    }
    return urls;
}

function getMetaContent(html: string, attr: string, key: string): string {
    const re = new RegExp(`<meta\\s+[^>]*${escapeRegExp(attr)}=["']${escapeRegExp(key)}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
    const match = html.match(re);
    return match ? normalizeWhitespace(match[1]!) : '';
}

function getLinkHref(html: string, rel: string): string {
    const re = new RegExp(`<link\\s+[^>]*rel=["']${escapeRegExp(rel)}["'][^>]*href=["']([^"']*)["'][^>]*>`, 'i');
    const match = html.match(re);
    return match ? normalizeWhitespace(match[1]!) : '';
}

function getTagAttr(tag: string, attr: string): string {
    const re = new RegExp(`\\b${escapeRegExp(attr)}=["']([^"']*)["']`, 'i');
    const match = tag.match(re);
    return match ? normalizeWhitespace(match[1]!) : '';
}

function resolveMaybeUrl(raw: string, base: string): string {
    if (!raw) return '';
    try {
        return new URL(raw, base || undefined).href;
    } catch {
        return raw;
    }
}

function firstNonEmpty(...values: string[]): string {
    return values.find(v => typeof v === 'string' && v.trim()) || '';
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
