import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { NodeType, AstRoot } from '../../src/lib/parse/types';
import type { CoreOptions } from '../../src/lib/options';

function findFirstCondition(root: AstRoot) {
  return (root.children as any[]).find((n) => n.type === NodeType.Condition);
}

describe('conditions parsing', () => {
  it('parses if/else/fi and splits branches', () => {
    const parser = new Parser({} as CoreOptions);
    const ast = parser.parse('\\ifX A \\else B \\fi');

    const cond: any = findFirstCondition(ast);
    expect(cond).toBeTruthy();
    expect(cond.type).toBe(NodeType.Condition);
    expect(cond.name).toBe('X');

    // Branch children
    const ifChildren = cond.ifChildren as any[];
    const elseChildren = cond.elseChildren as any[];
    expect(ifChildren.length).toBeGreaterThan(0);
    expect(elseChildren.length).toBeGreaterThan(0);
    expect(ifChildren[0].type).toBe(NodeType.Text);
    expect(elseChildren[0].type).toBe(NodeType.Text);

    // Positions recorded
    expect(cond.ifStart).toBeLessThan(cond.ifEnd);
    expect(cond.elseStart).toBeLessThan(cond.elseEnd);
  });

  it('parses if/fi without else', () => {
    const parser = new Parser({} as CoreOptions);
    const ast = parser.parse('\\ifY Only \\fi');

    const cond: any = findFirstCondition(ast);
    expect(cond).toBeTruthy();
    expect(cond.type).toBe(NodeType.Condition);
    expect(cond.name).toBe('Y');

    const ifChildren = cond.ifChildren as any[];
    const elseChildren = cond.elseChildren as any[];
    expect(ifChildren.length).toBeGreaterThan(0);
    expect(elseChildren.length).toBe(0);

    // Only IF end should be set; ELSE remains undefined
    expect(cond.ifEnd).toBeGreaterThan(cond.ifStart);
    expect(cond.elseStart).toBeUndefined();
    expect(cond.elseEnd).toBeUndefined();
  });
});
