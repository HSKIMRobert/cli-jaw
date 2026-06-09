// ─── Root + media static routes ───────────────────────
// Extracted from server.ts in Phase 2 (devlog 260609, 07 §3.1).
// ⚠️ registerStaticRoutes must be called BEFORE app.use(express.static(public))
// — GET / prefers the Vite build (public/dist/index.html) over public/index.html.

import type { Router, RequestHandler } from 'express';
import fs from 'fs';
import { join, basename } from 'path';
import { UPLOADS_DIR } from '../core/config.js';

export function registerStaticRoutes(app: Router, requireAuth: RequestHandler, deps: { projectRoot: string }): void {
    // Serve Vite production build (public/dist/index.html) at root when available
    const distIndex = join(deps.projectRoot, 'public', 'dist', 'index.html');
    app.get('/', (_req, res, next) => {
        if (fs.existsSync(distIndex)) {
            res.setHeader('Cache-Control', 'no-store');
            return res.sendFile('dist/index.html', { root: join(deps.projectRoot, 'public') });
        }
        next();
    });

    // Serve uploaded media files (images/videos) for inline rendering
    app.get('/media/:filename', requireAuth, (req, res) => {
        const filename = basename(String(req.params['filename'] || ''));
        if (!filename || filename.includes('..')) { res.status(400).end(); return; }
        const filePath = join(UPLOADS_DIR, filename);
        if (!fs.existsSync(filePath)) { res.status(404).end(); return; }
        res.sendFile(filename, { root: UPLOADS_DIR });
    });
}
