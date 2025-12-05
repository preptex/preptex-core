import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { NodeType, AstNode, AstRoot } from '../../src/lib/parse/types';
import type { CoreOptions } from '../../src/lib/options';

function parse(input: string): AstRoot {
  const p = new Parser({} as CoreOptions);
  return p.parse(input);
}

describe('Parser comment handling', () => {
  it('captures standalone line comment starting with %', () => {
    const ast = parse('% this is a comment\nText');
    const rootChildren = ast.children;
    expect(rootChildren[0].type).toBe(NodeType.Comment);
    expect((rootChildren[0] as any).name).toBe('%');
    expect((rootChildren[0] as any).value).toBe('% this is a comment\n');
    expect(rootChildren[1].type).toBe(NodeType.Text);
  });

  it('captures comment after a command on same line', () => {
    const ast = parse('\\section{Title} % trailing comment\nMore');
    const hasComment = (function walk(nodes: AstNode[]): boolean {
      for (const n of nodes) {
        if (n.type === NodeType.Comment) return true;
        const children = (n as any).children as AstNode[] | undefined;
        if (children && walk(children)) return true;
      }
      return false;
    })(ast.children);
    expect(hasComment).toBe(true);
  });

  it('captures comment after environment end', () => {
    const ast = parse('\\begin{env}content\\end{env} % after end\n');
    const env = ast.children.find((n) => n.type === NodeType.Environment);
    expect(env).toBeTruthy();
    const comment = ast.children.find((n) => n.type === NodeType.Comment);
    expect(comment).toBeTruthy();
    expect((comment as any).name).toBe('%');
    expect((comment as any).value).toBe('% after end\n');
  });

  it('treats commented environment line as a comment and distinguishes name', () => {
    const ast = parse('%\\begin{figure}\n');
    const comment = ast.children.find((n) => n.type === NodeType.Comment);
    expect(comment).toBeTruthy();
    // Lexer currently labels inline comments with '%'
    expect((comment as any).name).toBe('%');
    expect((comment as any).value).toBe('%\\begin{figure}\n');
  });

  it('captures block comment using \\begin{comment} ... \\end{comment}', () => {
    const ast = parse('Before\\begin{comment}\nThis is hidden\\end{comment}After');
    const children = ast.children;
    expect(children[0].type).toBe(NodeType.Text);
    expect((children[0] as any).value).toBe('Before');
    expect(children[1].type).toBe(NodeType.Comment);
    // Lexer uses 'env-comment' for environment comments
    expect((children[1] as any).name).toBe('env-comment');
    expect((children[1] as any).value).toBe('\\begin{comment}\nThis is hidden\\end{comment}');
    expect(children[2].type).toBe(NodeType.Text);
    expect((children[2] as any).value).toBe('After');
  });
});
