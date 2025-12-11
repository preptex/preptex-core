import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import type { CoreOptions } from '../../src/lib/options';
import { transform, type Transformer } from '../../src/lib/transform/transform';
import { NodeType } from '../../src/lib/parse/types';
import { suppressComments } from '../../src/lib/transform/transformers';

function createParser(input: string): Parser {
  const p = new Parser({} as CoreOptions);
  p.parse(input);
  return p;
}

describe('Transformer pipeline', () => {
  it('parses, transforms, removes nodes, and aggregates text', () => {
    const input = `Hello $x$ \\command{param} \\section{Title}\n% comment\nWorld`;
    const parser = createParser(input);

    const transformers: Transformer[] = [
      // boolean-only: return false to skip node output; true to process
      (node) => (node as any).type !== NodeType.Comment,
    ];
    const result = transform(parser.getRoot(), transformers);
    expect(result).toBe('Hello $x$ \\command{param} \\section{Title}\nWorld');
  });

  it('emits input commands as part of the rendered text', () => {
    const parser = createParser('Load \\input{chapter.tex} now');
    const result = transform(parser.getRoot(), []);
    expect(result).toBe('Load \\input{chapter.tex} now');
  });

  it('flattens input files when requested', () => {
    const main = createParser('Start \\input{intro.tex} End');
    const intro = createParser('Intro contents');

    const text = transform(main.getRoot(), [], { 'intro.tex': intro.getRoot() }, { flatten: true });

    expect(text).toBe('Start Intro contents End');
  });

  it('omits comments from the aggregated output text', () => {
    const input = `Text % comment\nMore`;
    const parser = createParser(input);
    const text = transform(parser.getRoot(), [suppressComments]);
    expect(text).toBe('Text More');
  });

  it('flattens nested inputs and still applies transformers', () => {
    const main = createParser('Header \\input{mid.tex} Footer');
    const mid = createParser('Hello % comment\n\\input{sub.tex}');
    const sub = createParser('World');

    const text = transform(
      main.getRoot(),
      [suppressComments],
      { 'mid.tex': mid.getRoot(), 'sub.tex': sub.getRoot() },
      { flatten: true }
    );

    expect(text).toBe('Header Hello World Footer');
  });
});
