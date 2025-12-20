import { LayoutNode } from '../../types/LayoutNode';
import { TreeNode } from '..';

interface ASTviewProps {
  root: LayoutNode;
}

export default function ASTview({ root }: ASTviewProps) {
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

  // Compute bounds for a stable, centered viewBox.
  // (Padding is generous so node boxes/labels don't clip at edges.)
  const pad = 120;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }

  // Fallback for safety (shouldn't happen since root exists)
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }

  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = Math.max(1, maxX - minX + pad * 2);
  const vbH = Math.max(1, maxY - minY + pad * 2);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#fafafa' }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g stroke="#999" strokeWidth={1}>
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
          ))}
        </g>

        <g>
          {nodes.map((n, i) => (
            <TreeNode key={i} node={n} />
          ))}
        </g>
      </svg>
    </div>
  );
}
