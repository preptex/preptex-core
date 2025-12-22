import { LayoutNode } from '../../types/LayoutNode';
import { TreeNode } from '..';
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface ASTviewProps {
  root: LayoutNode;
}

export default function ASTview({ root }: ASTviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);

  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  const nodes: LayoutNode[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

  function collect(node: LayoutNode) {
    nodes.push(node);
    for (const child of node.children || []) {
      edges.push({
        x1: node.x,
        y1: node.y,
        x2: child.x,
        y2: child.y,
      });
      collect(child);
    }
  }

  collect(root);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <svg ref={svgRef} width="100%" height="100%" style={{ background: '#fafafa' }}>
        <g ref={gRef}>
          <g stroke="#999" strokeWidth={1}>
            {edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </g>

          <g>
            {nodes.map((n, i) => (
              <TreeNode key={i} node={n} hoveredId={hoveredId} setHoveredId={setHoveredId} />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
