import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { NodeType, AstRoot, ConditionBranchType } from '../../src/lib/parse/types';
import type { CoreOptions } from '../../src/lib/options';

function findFirstCondition(root: AstRoot) {
  return (root.children as any[]).find((n) => n.type === NodeType.Condition);
}

describe('conditions parsing', () => {
  it('parses if/else/fi and splits branches', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('\\ifX A \\else B \\fi');
    const ast = parser.getRoot();

    const cond: any = findFirstCondition(ast);
    expect(cond).toBeTruthy();
    expect(cond.type).toBe(NodeType.Condition);
    expect(cond.name).toBe('X');
    expect(cond.prefix).toBe('');
    expect(cond.suffix).toBe('\\fi');

    // Branch children now are explicit ConditionBranch nodes
    const branches = (cond.children as any[]).filter((n) => n.type === NodeType.ConditionBranch);
    const ifBranch = branches.find((b) => (b as any).branch === ConditionBranchType.If);
    const elseBranch = branches.find((b) => (b as any).branch === ConditionBranchType.Else);
    expect(ifBranch).toBeTruthy();
    expect(elseBranch).toBeTruthy();
    expect((ifBranch as any).prefix).toBe('\\ifX');
    expect((ifBranch as any).suffix).toBe('');
    expect((elseBranch as any).prefix).toBe('\\else');
    expect((elseBranch as any).suffix).toBe('');
    expect(ifBranch.children.length).toBeGreaterThan(0);
    expect(elseBranch.children.length).toBeGreaterThan(0);
    expect(ifBranch.children[0].type).toBe(NodeType.Text);
    expect(elseBranch.children[0].type).toBe(NodeType.Text);
  });

  it('parses if/fi without else', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('\\ifY Only \\fi');
    const ast = parser.getRoot();

    const cond: any = findFirstCondition(ast);
    expect(cond).toBeTruthy();
    expect(cond.type).toBe(NodeType.Condition);
    expect(cond.name).toBe('Y');
    expect(cond.prefix).toBe('');
    expect(cond.suffix).toBe('\\fi');

    const branches = (cond.children as any[]).filter((n) => n.type === NodeType.ConditionBranch);
    const ifBranch = branches.find((b) => (b as any).branch === ConditionBranchType.If);
    const elseBranch = branches.find((b) => (b as any).branch === ConditionBranchType.Else);
    expect(ifBranch).toBeTruthy();
    expect((ifBranch as any).prefix).toBe('\\ifY');
    expect((ifBranch as any).suffix).toBe('');
    expect((ifBranch as any).children.length).toBeGreaterThan(0);
    expect(elseBranch).toBeUndefined();
  });

  it('parses \\newif declarations into dedicated nodes', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('\\newif\\ifCool\nBody');
    const ast = parser.getRoot();

    const decl = ast.children.find((n) => n.type === NodeType.ConditionDeclaration) as any;
    expect(decl).toBeTruthy();
    expect(decl.name).toBe('Cool');
    expect(decl.value).toBe('\\newif\\ifCool\n');

    const textNode = ast.children.find((n) => n.type === NodeType.Text) as any;
    expect(textNode).toBeTruthy();
    expect(textNode.value).toBe('Body');
  });
});
