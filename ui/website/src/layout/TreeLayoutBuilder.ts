import * as d3 from 'd3';
import {
  AstNode,
  CommandNode,
  ConditionBranchNode,
  ConditionDeclarationNode,
  ConditionNode,
  EnvironmentNode,
  InnerNode,
  NodeType,
  SectionNode,
} from '@preptex/core';
import { LayoutNode } from '../types/LayoutNode';

export class TreeLayoutBuilder {
  private readonly nodeX = 120;
  private readonly nodeY = 120;

  build(rootNode: AstNode): LayoutNode {
    const hierarchy = d3.hierarchy(rootNode, (d: AstNode) => (d as InnerNode).children);

    const treeLayout = d3.tree<AstNode>().nodeSize([this.nodeY, this.nodeX]);

    const layoutRoot = treeLayout(hierarchy);
    return this.convert(layoutRoot);
  }

  private convert(node: d3.HierarchyPointNode<AstNode>): LayoutNode {
    const info = this.getNodeInfo(node.data);
    return {
      type: node.data.type,
      x: node.y,
      y: node.x,
      label: info.label,
      sublabel: info.sublabel,
      sectionLevel: info.sectionLevel,
      children: node.children ? node.children.map((c: AstNode) => this.convert(c)) : [],
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
