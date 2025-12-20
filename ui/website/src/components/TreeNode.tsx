import { LayoutNode } from '../types/LayoutNode';
import { NodeType } from '@preptex/core';

interface TreeNodeProps {
  node: LayoutNode;
}

const NODE_WIDTH = 100;
const NODE_HEIGHT = 40;

export default function TreeNode({ node }: TreeNodeProps) {
  const clamp = (s: string, max = 16) =>
    s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s;
  const title = clamp(node.label ?? node.type);
  const subtitle = node.sublabel ? clamp(node.sublabel, 18) : undefined;

  const renderShape = () => {
    const common = {
      fill: '#eef2ff',
      stroke: '#4f46e5',
    } as const;

    const sectionStrokeWidth = (level?: number) => {
      if (level == null) return 2;
      // level 0 (document) thickest, level 5 thinnest
      return Math.max(1, 5 - level);
    };

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
            strokeWidth={2}
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
            strokeWidth={2}
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
            strokeWidth={sectionStrokeWidth(node.sectionLevel)}
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
        return <polygon points={points} strokeWidth={2} {...common} />;
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
        return <polygon points={points} strokeWidth={2} {...common} />;
      }

      default:
        return (
          <rect
            x={-NODE_WIDTH / 2}
            y={-NODE_HEIGHT / 2}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={6}
            strokeWidth={2}
            {...common}
          />
        );
    }
  };

  return (
    <g transform={`translate(${node.x}, ${node.y})`}>
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
