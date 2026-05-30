// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while cli-jaw mirror remains experimental.

import type { FetchTextCandidateOptions, ReaderCandidate } from './types.js';
import { fetchTextCandidate } from './fetcher.js';
import { validateThirdPartyReaderTarget } from './safety.js';

const JINA_READER_PREFIX = 'https://r.jina.ai/';

export function shouldUseThirdPartyReader(options: { allowThirdPartyReader?: boolean } = {}): boolean {
    return Boolean(options.allowThirdPartyReader);
}

export function buildJinaReaderUrl(rawUrl: string): string {
    const target = validateThirdPartyReaderTarget(rawUrl);
    return `${JINA_READER_PREFIX}${target.href}`;
}

export async function fetchThirdPartyReaderCandidate(rawUrl: string, options: { allowThirdPartyReader?: boolean; maxBytes?: number; timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<ReaderCandidate | null> {
    if (!shouldUseThirdPartyReader(options)) return null;
    const target = validateThirdPartyReaderTarget(rawUrl);
    const readerUrl = buildJinaReaderUrl(target.href);
    const fetched = await fetchTextCandidate(readerUrl, {
        maxBytes: options.maxBytes,
        timeoutMs: options.timeoutMs,
        allowPrivateNetwork: false,
        fetchImpl: options.fetchImpl,
    } as FetchTextCandidateOptions);
    return {
        ...fetched,
        finalUrl: target.href,
        readerUrl,
        contentType: fetched.contentType || 'text/plain',
        evidence: [...(fetched.evidence || []), 'third-party-reader:jina'],
        warnings: fetched.ok ? fetched.warnings : [...(fetched.warnings || []), 'third-party-reader-failed'],
    } as unknown as ReaderCandidate;
}
