// ── One-time render event delegations ──
import { ensureCodeCopyDelegation } from './code-copy.js';
import { ensureDiagramActionDelegation } from './svg-actions.js';
import { ensureFilePathDelegation } from './file-links.js';
import { ensureElicitationDelegation } from '../features/elicitation.js';
import { ensureComposeBlockDelegation } from './compose-block.js';
import { ensureDataframeDelegation } from './dataframe.js';

export function ensureRenderDelegations(): void {
    ensureCodeCopyDelegation();
    ensureDiagramActionDelegation();
    ensureFilePathDelegation();
    ensureElicitationDelegation();
    ensureComposeBlockDelegation();
    ensureDataframeDelegation();
}
