import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { NoteGraphNode, NoteGraphEdge } from '../types';

type NotesGraphViewProps = {
    graph: { nodes: NoteGraphNode[]; edges: NoteGraphEdge[] };
    selectedPath: string | null;
    onNavigate: (path: string) => void;
};

type SimNode = NoteGraphNode & d3.SimulationNodeDatum;
type SimEdge = { source: SimNode; target: SimNode; raw: string };

function connectionCount(nodeId: string, edges: NoteGraphEdge[]): number {
    return edges.filter(e => e.source === nodeId || e.target === nodeId).length;
}

function nodeColor(node: NoteGraphNode, selectedPath: string | null): string {
    if (node.id === selectedPath) return 'var(--accent-primary, #8ab4ff)';
    if (node.kind === 'missing') return 'var(--status-error, #f87171)';
    if (node.kind === 'ambiguous') return 'var(--status-warning, #fbbf24)';
    return 'var(--text-tertiary, #888)';
}

export function NotesGraphView(props: NotesGraphViewProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const navigateRef = useRef(props.onNavigate);
    navigateRef.current = props.onNavigate;

    const { graph, selectedPath } = props;

    useEffect(() => {
        if (!svgRef.current || graph.nodes.length === 0) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = svgRef.current.clientWidth || 800;
        const height = svgRef.current.clientHeight || 600;

        const nodes: SimNode[] = graph.nodes.map(n => ({ ...n }));
        const nodeById = new Map(nodes.map(n => [n.id, n]));
        const edges: SimEdge[] = graph.edges
            .filter(e => nodeById.has(e.source) && nodeById.has(e.target))
            .map(e => ({
                source: nodeById.get(e.source)!,
                target: nodeById.get(e.target)!,
                raw: e.raw,
            }));

        const maxConn = d3.max(nodes, n => connectionCount(n.id, graph.edges)) ?? 1;
        const radiusScale = d3.scaleSqrt().domain([0, maxConn]).range([4, 16]);

        const g = svg.append('g');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => { g.attr('transform', event.transform); });
        svg.call(zoom);

        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(80))
            .force('charge', d3.forceManyBody().strength(-120))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius((d: any) =>
                radiusScale(connectionCount(d.id, graph.edges)) + 4,
            ));

        const link = g.append('g')
            .selectAll('line')
            .data(edges)
            .join('line')
            .attr('stroke', 'var(--border-secondary, #444)')
            .attr('stroke-width', 1)
            .attr('stroke-opacity', 0.5);

        const node = g.append('g')
            .selectAll<SVGGElement, SimNode>('g')
            .data(nodes)
            .join('g')
            .attr('class', 'graph-node')
            .attr('cursor', 'pointer')
            .on('click', (_event: MouseEvent, d: SimNode) => {
                if (d.kind === 'note') navigateRef.current(d.id);
            });

        node.append('circle')
            .attr('r', d => radiusScale(connectionCount(d.id, graph.edges)))
            .attr('fill', d => nodeColor(d, selectedPath))
            .attr('stroke', d => d.id === selectedPath ? 'var(--accent-hover, #aac8ff)' : 'none')
            .attr('stroke-width', 2);

        node.append('text')
            .text(d => d.title)
            .attr('dx', d => radiusScale(connectionCount(d.id, graph.edges)) + 4)
            .attr('dy', '0.35em')
            .attr('fill', 'var(--text-secondary, #aaa)')
            .attr('font-size', '11px')
            .attr('pointer-events', 'none');

        const drag = d3.drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
        node.call(drag);

        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);
            node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
        });

        return () => { simulation.stop(); };
    }, [graph, selectedPath]);

    if (graph.nodes.length === 0) {
        return (
            <div className="notes-graph-view notes-graph-empty">
                No notes to display
            </div>
        );
    }

    return (
        <div className="notes-graph-view">
            <svg ref={svgRef} className="notes-graph-svg" width="100%" height="100%" />
            <div className="notes-graph-info">
                {graph.nodes.filter(n => n.kind === 'note').length} notes · {graph.edges.length} links
            </div>
        </div>
    );
}
