import * as d3 from 'd3';
import { AstNode, InnerNode } from '@preptex/core';
import { LayoutNode } from '../types/LayoutNode';

export class TreeLayoutBuilder {
  private readonly nodeX = 120;
  private readonly nodeY = 60;

  build(rootNode: AstNode): LayoutNode {
    const hierarchy = d3.hierarchy(rootNode, (d: AstNode) => (d as InnerNode).children);

    const treeLayout = d3.tree<AstNode>().nodeSize([this.nodeY, this.nodeX]);

    const layoutRoot = treeLayout(hierarchy);
    return this.convert(layoutRoot);
  }

  private convert(node: d3.HierarchyPointNode<AstNode>): LayoutNode {
    return {
      type: node.data.type,
      x: node.y,
      y: node.x,
      children: node.children ? node.children.map((c: AstNode) => this.convert(c)) : [],
    };
  }
}
