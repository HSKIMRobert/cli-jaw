import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relPath: string): string {
    return readFileSync(join(root, relPath), 'utf8');
}

test('file-links routes vault clicks through preview postMessage', () => {
    const fileLinks = read('public/js/render/file-links.ts');
    const previewOrigin = read('public/js/preview-parent-origin.ts');

    assert.ok(fileLinks.includes('postPreviewOpenNotes'), 'vault click must call postPreviewOpenNotes');
    assert.ok(fileLinks.includes('normalizeNotesVaultPath'), 'vault click must normalize paths');
    assert.ok(fileLinks.includes('REL_NOTE_PATH_RE_G'), 'relative .md paths must be linkified');
    assert.ok(fileLinks.includes('linkifyFilePathsWithNotesRoot'), 'preview chat must resolve notesRoot async');
    assert.ok(previewOrigin.includes("type: 'jaw-preview-open-notes'"), 'preview bridge message type must exist');
});

test('file-links keeps non-vault paths on /api/file/open fallback', () => {
    const fileLinks = read('public/js/render/file-links.ts');
    assert.ok(fileLinks.includes("apiJson<{ ok?: boolean; error?: string }>('/api/file/open'"), 'non-vault paths must still open via Finder');
    assert.ok(fileLinks.includes('openLocalPath(path, link)'), 'fallback must preserve existing openLocalPath behavior');
});
