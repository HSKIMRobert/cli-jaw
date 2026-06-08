import { loadUnifiedMcp } from '../../lib/mcp-sync.js';

export interface AcpMcpServer {
    name: string;
    type?: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
}

export function getEmployeeMcpServers(): AcpMcpServer[] {
    try {
        const config = loadUnifiedMcp();
        const servers = config?.servers || {};
        return Object.entries(servers).map(([name, srv]: [string, any]) => ({
            name,
            ...(srv.url ? { type: srv.type || 'http', url: srv.url } : {}),
            ...(srv.command ? { command: srv.command } : {}),
            ...(srv.args ? { args: srv.args } : {}),
            ...(srv.env ? { env: srv.env } : {}),
        }));
    } catch {
        return [];
    }
}
