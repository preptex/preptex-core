import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import type { CoreOptions } from '../../src/lib/options';
import { suppressComments } from '../../src/lib/transform/transformers';
import { collectNodesDFS } from '../util';
import { AstNode, NodeType } from '../../src/lib/parse/types';

describe('Parser', () => {
  it('retains the parsed AST in memory', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('Hello% comment\n');
    const root = parser.getRoot();
    expect(root.type).toBe('Root');
    expect(root.children[0].type).toBe('Text');
    expect((root.children[0] as any).value).toBe('Hello');
    expect(root.children[1].type).toBe('Comment');
    expect((root.children[1] as any).value).toBe('% comment\n');
  });

  it('exposes the original input', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('Input body\n');
    expect(parser.getInput()).toBe('Input body\n');
  });

  it('routes transform calls through the stored AST', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('A %comment\nB');
    const text = parser.transform([]);
    expect(text).toBe('A %comment\nB');
  });

  it('transforms correctly with transformers', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('A %comment\nB');
    const text = parser.transform([suppressComments]);
    expect(text).toBe('A B');
  });

  it('keeps exportJSON unimplemented placeholder', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('Anything');
    expect(() => parser.exportJSON({} as CoreOptions)).toThrow('Export not implemented yet');
  });

  it('collects condition declarations from newif statements', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse(['\\newif\\iffoo', '\\newif\\ifbar', '\\newif\\iffoo'].join('\n'));

    const conditions = parser.getDeclaredConditions();
    expect(conditions.has('foo')).toBe(true);
    expect(conditions.has('bar')).toBe(true);
    expect(conditions.size).toBe(2);
  });

  it('annotates nodes with source line numbers', () => {
    const parser = new Parser({} as CoreOptions);
    parser.parse('first\n\\section{Mid}\nlast');
    const root = parser.getRoot();
    const nodes = collectNodesDFS(root);

    const types = nodes.map((n) => n.type);
    const lines = nodes.map((n) => (n as AstNode).line);
    const childrenCount = nodes.map((n) => (n as any).children?.length);
    const values = nodes.map((n) => (n as any).value);
    expect(nodes.length).toBe(6);
    expect(types).toEqual([
      NodeType.Root,
      NodeType.Text,
      NodeType.Section,
      NodeType.Group,
      NodeType.Text,
      NodeType.Text,
    ]);
    expect(childrenCount).toEqual([2, undefined, 2, 1, undefined, undefined]);
    expect(values).toEqual([undefined, 'first\n', undefined, undefined, 'Mid', '\nlast']);
    expect(lines).toEqual([1, 1, 2, 2, 2, 2]);
  });
});
