import { LayoutNode } from '../../types/LayoutNode';
import { NodeType } from '@preptex/core';

interface TreeNodeProps {
  node: LayoutNode;
  hoveredId?: number | null;
  setHoveredId?: (id: number | null) => void;
  onExpand?: (id: number) => void;
}

const NODE_WIDTH = 100;
const NODE_HEIGHT = 40;

export default function TreeNode({ node, hoveredId, setHoveredId, onExpand }: TreeNodeProps) {
  const clamp = (s: string, max = 16) =>
    s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s;
  const title = clamp(node.label ?? node.type);
  const subtitle = node.sublabel ? clamp(node.sublabel, 18) : undefined;

  const renderShape = () => {
    const common = {
      fill: hoveredId === node.id ? '#f1f5f9' : '#ffffff',
      strokeWidth: node.strokeWidth,
      stroke: node.strokeColor || '#d4d4d8',
    } as const;

    switch (node.type) {
      case NodeType.Root: {
        const r = Math.min(NODE_WIDTH, NODE_HEIGHT) / 2;
        return <circle r={r} {...common} />;
      }

      case NodeType.Text: {
        return <ellipse rx={NODE_WIDTH / 2} ry={NODE_HEIGHT / 2} {...common} />;
      }

      case NodeType.Command: {
        return (
          <rect
            x={-NODE_WIDTH / 2}
            y={-NODE_HEIGHT / 2}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={NODE_HEIGHT / 2}
            {...common}
          />
        );
      }

      case NodeType.ConditionDeclaration: {
        return (
          <rect
            x={-NODE_WIDTH / 2}
            y={-NODE_HEIGHT / 2}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={NODE_HEIGHT / 2}
            {...common}
          />
        );
      }

      case NodeType.Section: {
        return (
          <rect
            x={-NODE_WIDTH / 2}
            y={-NODE_HEIGHT / 2}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={6}
            {...common}
          />
        );
      }

      case NodeType.Environment: {
        const w = NODE_WIDTH;
        const h = NODE_HEIGHT;
        const inset = Math.round(w * 0.22);
        const points = [
          [-w / 2 + inset, -h / 2],
          [w / 2 - inset, -h / 2],
          [w / 2, 0],
          [w / 2 - inset, h / 2],
          [-w / 2 + inset, h / 2],
          [-w / 2, 0],
        ]
          .map(([x, y]) => `${x},${y}`)
          .join(' ');
        return <polygon points={points} {...common} />;
      }

      case NodeType.Condition:
      case NodeType.ConditionBranch: {
        const w = NODE_WIDTH;
        const h = NODE_HEIGHT;
        const points = [
          [0, -h / 2],
          [w / 2, 0],
          [0, h / 2],
          [-w / 2, 0],
        ]
          .map(([x, y]) => `${x},${y}`)
          .join(' ');
        return <polygon points={points} {...common} />;
      }

      default:
        return (
          <rect
            x={-NODE_WIDTH / 2}
            y={-NODE_HEIGHT / 2}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={6}
            {...common}
          />
        );
    }
  };

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={() => {
        onExpand && onExpand(node.id);
      }}
      onMouseEnter={(e) => {
        setHoveredId && setHoveredId(node.id ?? null);
      }}
      onMouseLeave={(e) => {
        setHoveredId && setHoveredId(null);
      }}
    >
      {renderShape()}
      <text textAnchor="middle" dominantBaseline="middle" fontSize={11}>
        {subtitle ? (
          <>
            <tspan x={0} dy={-4}>
              {title}
            </tspan>
            <tspan x={0} dy={14} fontSize={9} opacity={0.75}>
              {subtitle}
            </tspan>
          </>
        ) : (
          title
        )}
      </text>
    </g>
  );
}
