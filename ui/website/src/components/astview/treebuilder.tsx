import * as d3 from 'd3';
import {
  AstNode,
  CommandNode,
  ConditionBranchNode,
  ConditionDeclarationNode,
  ConditionNode,
  EnvironmentNode,
  NodeType,
  SectionNode,
} from '@preptex/core';
import { LayoutNode } from '../../types/LayoutNode';

function sectionStrokeWidth(node?: AstNode): { strokeWidth: number; strokeColor?: string } {
  if (!node || ![NodeType.Root, NodeType.Section].includes(node.type)) return { strokeWidth: 1 };
  if (node.type === NodeType.Root || (node as SectionNode).level === 0) {
    return { strokeWidth: 3, strokeColor: '#000' };
  }
  if ((node as SectionNode).level <= 3) return { strokeWidth: 2 };
  return { strokeWidth: 1 };
}

export class TreeLayoutBuilder {
  private readonly nodeX = 120; // horizontal spacing
  private readonly nodeY = 120; // vertical spacing (increase to prevent node/edge overlap)

  build(rootNode: AstNode): LayoutNode {
    const hierarchy = d3.hierarchy<AstNode>(rootNode, (d: AstNode) =>
      Array.isArray((d as any).children) ? ((d as any).children as AstNode[]) : undefined
    );

    // d3.tree uses x for breadth and y for depth.
    // For a vertical tree: x is horizontal, y increases downward by depth.
    const treeLayout = d3.tree<AstNode>().nodeSize([this.nodeX, this.nodeY]);

    const layoutRoot = treeLayout(hierarchy);
    let id = 0;
    return this.convert(layoutRoot, { id });
  }

  private convert(node: d3.HierarchyPointNode<AstNode>, idObj: { id: number }): LayoutNode {
    const info = this.getNodeInfo(node.data);
    const strokeInfo = sectionStrokeWidth(node.data);
    return {
      ...strokeInfo,
      id: idObj.id++,
      type: node.data.type,
      x: node.x,
      y: node.y,
      label: info.label,
      sublabel: info.sublabel,
      children: node.children ? node.children.map((child: any) => this.convert(child, idObj)) : [],
    };
  }

  private getNodeInfo(data: AstNode): { label?: string; sublabel?: string; sectionLevel?: number } {
    switch (data.type) {
      case NodeType.Section: {
        const s = data as SectionNode;
        return {
          label: s.name || 'section',
          sublabel: `section L${s.level}`,
          sectionLevel: s.level,
        };
      }

      case NodeType.Environment: {
        const e = data as EnvironmentNode;
        return {
          label: e.name || 'env',
          sublabel: 'environment',
        };
      }

      case NodeType.Command: {
        const c = data as CommandNode;
        return {
          label: `\\${c.name}`,
          sublabel: 'command',
        };
      }

      case NodeType.Condition: {
        const c = data as ConditionNode;
        return {
          label: c.name,
          sublabel: 'if',
        };
      }

      case NodeType.ConditionBranch: {
        const b = data as ConditionBranchNode;
        return {
          label: b.branch,
          sublabel: b.name,
        };
      }

      case NodeType.ConditionDeclaration: {
        const d = data as ConditionDeclarationNode;
        return {
          label: d.name,
          sublabel: 'declare',
        };
      }

      default:
        return {};
    }
  }
}
