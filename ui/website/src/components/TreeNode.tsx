import { LayoutNode } from '../types/LayoutNode';

interface TreeNodeProps {
  node: LayoutNode;
}

const NODE_WIDTH = 80;
const NODE_HEIGHT = 30;

export default function TreeNode({ node }: TreeNodeProps) {
  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
      <rect
        x={-NODE_WIDTH / 2}
        y={-NODE_HEIGHT / 2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={4}
        fill="#eef2ff"
        stroke="#4f46e5"
      />
      <text textAnchor="middle" dominantBaseline="middle" fontSize={12}>
        {node.type}
      </text>
    </g>
  );
}
