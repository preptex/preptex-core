import * as d3 from 'd3';
import { AstNode } from '@preptex/core';
import { LayoutNode } from '../types/LayoutNode';

export class TreeLayoutBuilder {
  private readonly nodeX = 120; // horizontal spacing
  private readonly nodeY = 60; // vertical spacing

  build(rootNode: AstNode): LayoutNode {
    const hierarchy = d3.hierarchy<AstNode>(rootNode, (d: AstNode) =>
      Array.isArray((d as any).children) ? ((d as any).children as AstNode[]) : undefined
    );

    // d3.tree uses x for breadth and y for depth.
    // For a vertical tree: x is horizontal, y increases downward by depth.
    const treeLayout = d3.tree<AstNode>().nodeSize([this.nodeX, this.nodeY]);

    const layoutRoot = treeLayout(hierarchy);

    return this.convert(layoutRoot);
  }

  private convert(node: d3.HierarchyPointNode<AstNode>): LayoutNode {
    return {
      type: node.data.type,
      x: node.x,
      y: node.y,
      children: node.children ? node.children.map((child: any) => this.convert(child)) : [],
    };
  }
}
