import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { NodeType, AstRoot, ConditionBranchType } from '../../src/lib/parse/types';
import { InnerNode } from '../../dist';
import { getParser } from '../util';

function findFirstCondition(root: AstRoot) {
  return (root.children as any[]).find((n) => n.type === NodeType.Condition);
}

describe('conditions parsing', () => {
  it('parses if/else/fi and splits branches', () => {
    const parser = getParser('\\ifX A \\else B \\fi');
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
    expect((ifBranch as any).prefix).toBe('\\ifX ');
    expect((ifBranch as any).suffix).toBe('');
    expect((elseBranch as any).prefix).toBe('\\else ');
    expect((elseBranch as any).suffix).toBe('');
    expect(ifBranch.children.length).toBeGreaterThan(0);
    expect(elseBranch.children.length).toBeGreaterThan(0);
    expect(ifBranch.children[0].type).toBe(NodeType.Text);
    expect(elseBranch.children[0].type).toBe(NodeType.Text);
  });

  it('parses if/fi without else', () => {
    const parser = getParser('\\ifY Only \\fi');
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
    expect((ifBranch as any).prefix).toBe('\\ifY ');
    expect((ifBranch as any).suffix).toBe('');
    expect((ifBranch as any).children.length).toBeGreaterThan(0);
    expect(elseBranch).toBeUndefined();
  });

  it('parses \\newif declarations into dedicated nodes', () => {
    const parser = getParser('\\newif\\ifCool\nBody');
    const ast = parser.getRoot();

    const decl = ast.children.find((n) => n.type === NodeType.ConditionDeclaration) as any;
    expect(decl).toBeTruthy();
    expect(decl.name).toBe('Cool');
    expect(decl.value).toBe('\\newif\\ifCool\n');

    const textNode = ast.children.find((n) => n.type === NodeType.Text) as any;
    expect(textNode).toBeTruthy();
    expect(textNode.value).toBe('Body');
  });

  it('parses iff command correctly', () => {
    const input = ['\\begin{lemma}\n\\[X\\iff Y\\]\\end{lemma}'].join('');
    const parser = getParser(input);
    const root = parser.getRoot();
    expect(root.children.length).toBe(1);
    const defEnv = root.children[0] as InnerNode;
  });

  it('handles suppressed sections', () => {
    const input =
      '\\iflong\n' +
      '\\subsection{The Upper Bound}\n' +
      '\\fi\n' +
      '\\ifshort\n' +
      '\\section\n' +
      '{The Upper Bound.}' +
      '\\fi';
    const parser = getParser(input);
    const ast = parser.getRoot();
    expect(ast.children.length).toBe(2);
    const firstCond: any = (ast.children[0] as any).children[0];
    expect(firstCond.type).toBe(NodeType.ConditionBranch);
    expect(firstCond.name).toBe('long');
    const fc = firstCond.children;
    expect(fc.length).toBe(3);
    expect(fc.map((x: InnerNode) => x.type)).toEqual([
      NodeType.Command,
      NodeType.Group,
      NodeType.Text,
    ]);

    const secondCond: any = (ast.children[1] as any).children[0];
    expect(secondCond.type).toBe(NodeType.ConditionBranch);
    expect(secondCond.name).toBe('short');
    const sc = secondCond.children;
    expect(secondCond.children.length).toBe(2);
    expect(sc.map((x: InnerNode) => x.type)).toEqual([NodeType.Command, NodeType.Group]);
  });
});
