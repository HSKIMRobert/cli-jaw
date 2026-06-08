// ── Shared Mermaid configuration and type detection ──
// Extracted from mermaid.ts so Notes (MermaidBlock.tsx) can import
// config without pulling in the Chat DOM adapter, render queue, etc.

export function getMermaidThemeVars() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    return isLight ? {
        primaryColor: '#e2e8f0',
        primaryTextColor: '#1a202c',
        primaryBorderColor: '#a0aec0',
        lineColor: '#718096',
        secondaryColor: '#ebf8ff',
        tertiaryColor: '#f7fafc',
        background: 'transparent',
        mainBkg: '#e2e8f0',
        nodeBorder: '#a0aec0',
        clusterBkg: '#f7fafc',
        clusterBorder: '#cbd5e0',
        titleColor: '#1a202c',
        edgeLabelBackground: '#f7fafc',
    } : {
        primaryColor: '#2d3748',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#4a5568',
        lineColor: '#718096',
        secondaryColor: '#1a365d',
        tertiaryColor: '#1a202c',
        background: 'transparent',
        mainBkg: '#2d3748',
        nodeBorder: '#4a5568',
        clusterBkg: '#1a202c',
        clusterBorder: '#2d3748',
        titleColor: '#e2e8f0',
        edgeLabelBackground: '#1a202c',
    };
}

export function getMermaidInitConfig() {
    return {
        startOnLoad: false,
        theme: 'base' as const,
        htmlLabels: false,
        themeVariables: getMermaidThemeVars(),
        securityLevel: 'strict' as const,
        suppressErrorRendering: true,
        gantt: { useMaxWidth: false, useWidth: 800 },
    };
}

export const WIDE_MERMAID_TYPES = new Set([
    'gantt',
    'sequencediagram',
    'timeline',
    'sankey',
    'sankey-beta',
    'architecture-beta',
    'block',
    'block-beta',
    'xychart',
    'xychart-beta',
    'packet',
    'radar-beta',
    'treemap-beta',
]);

export function detectMermaidDiagramType(code: string): string | null {
    for (const rawLine of code.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('%%')) continue;
        if (line.startsWith('---')) continue;
        return line.split(/\s+/)[0].toLowerCase();
    }
    return null;
}

export function isWideMermaidDiagram(code: string): boolean {
    const type = detectMermaidDiagramType(code);
    return !!type && WIDE_MERMAID_TYPES.has(type);
}
