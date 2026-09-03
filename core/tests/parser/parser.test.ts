import { describe, it, expect } from 'vitest';
import { transform } from '../../src/lib/transform/transform';
import { suppressComments } from '../../src/lib/transform/transformers';
import { collectNodesDFS, getParser } from '../util';
import {
  NodeType,
  type AstNode,
  type InputNode,
  type SectionNode,
} from '../../src/lib/parse/types';
import { SECTION_LEVELS } from '../../src/lib/parse/constants';

describe('Parser', () => {
  it('retains the parsed AST in memory', () => {
    const parser = getParser('Hello% comment\n');
    const root = parser.getRoot();
    expect(root.type).toBe('Root');
    expect(root.children[0].type).toBe('Text');
    expect((root.children[0] as any).value).toBe('Hello');
    expect(root.children[1].type).toBe('Comment');
    expect((root.children[1] as any).value).toBe('% comment\n');
  });

  it('exposes the original input', () => {
    const parser = getParser('Input body\n');
    expect(parser.getInput()).toBe('Input body\n');
  });

  it('exposes parsed AST so callers can render it', () => {
    const parser = getParser('A %comment\nB');
    const text = transform(parser.getRoot(), []);
    expect(text).toBe('A %comment\nB');
  });

  it('transforms correctly with transformers', () => {
    const parser = getParser('A %comment\nB');
    const text = transform(parser.getRoot(), [suppressComments]);
    expect(text).toBe('A  B');
  });

  it('collects condition declarations from newif statements', () => {
    const parser = getParser(['\\newif\\iffoo', '\\newif\\ifbar', '\\newif\\iffoo'].join('\n'));

    const conditions = parser.getDeclaredConditions();
    expect(conditions.has('foo')).toBe(true);
    expect(conditions.has('bar')).toBe(true);
    expect(conditions.size).toBe(2);
  });

  it('captures input commands as dedicated nodes and tracks file list', () => {
    const parser = getParser('Before\\input {chapters/intro.tex}After');

    const root = parser.getRoot();
    const input = root.children.find((n) => n.type === NodeType.Input) as InputNode | undefined;
    expect(input).toBeTruthy();
    expect(input?.path).toBe('chapters/intro.tex');
    expect(input?.value).toBe('\\input {chapters/intro.tex}');

    const files = parser.getInputFiles();
    expect(files.has('chapters/intro.tex')).toBe(true);
    expect(files.size).toBe(1);
  });

  it('annotates nodes with source line numbers', () => {
    const parser = getParser('first\n\\section  {Mid}\nlast');
    const root = parser.getRoot();
    const nodes = collectNodesDFS(root);

    const types = nodes.map((n) => n.type);
    const ids = nodes.map((n) => (n as AstNode).id);
    const lines = nodes.map((n) => (n as AstNode).line);
    const childrenCount = nodes.map((n) => (n as any).children?.length);
    const values = nodes.map((n) => (n as any).value);
    expect(nodes.length).toBe(6);
    expect(types).toEqual([
      NodeType.Root,
      NodeType.Text,
      NodeType.NewLine,
      NodeType.Section,
      NodeType.NewLine,
      NodeType.Text,
    ]);
    expect(ids).toEqual([0, 1, 2, 3, 4, 5]);
    expect(childrenCount).toEqual([3, undefined, undefined, 2, undefined, undefined]);
    expect(values).toEqual([undefined, 'first', '\n', undefined, '\n', 'last']);
    expect(lines).toEqual([1, 1, 1, 2, 2, 3]);

    const sec: SectionNode = nodes[3] as SectionNode;
    expect(sec.level).toBe(SECTION_LEVELS.section);
    expect(sec.name).toBe('Mid');
    expect(sec.prefix).toBe('\\section  {Mid}');
  });

  it('marks whether each newline ended an originally whitespace-only line', () => {
    const parser = getParser('  \n\\ifA\nText\\fi');
    const root = parser.getRoot();
    const newLines = collectNodesDFS(root).filter((n) => n.type === NodeType.NewLine) as any[];

    expect(newLines).toHaveLength(2);
    expect(newLines[0].line).toBe(1);
    expect(newLines[0].originalLineIsWhitespaceOnly).toBe(true);
    expect(newLines[1].line).toBe(2);
    expect(newLines[1].originalLineIsWhitespaceOnly).toBe(false);
  });
});
