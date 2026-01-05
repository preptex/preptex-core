import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { transform } from '../../src/lib/transform/transform';
import { NodeType } from '../../src/lib/parse/types';
import { suppressComments } from '../../src/lib/transform/transformers';
import { getParser } from '../util';

describe('Transformer pipeline', () => {
  it('parses, transforms, removes nodes, and aggregates text', () => {
    const input = `Hello $x$ \\command{param} \\section{Title}\n% comment\nWorld`;
    const parser = getParser(input);

    const result = transform(parser.getRoot(), [suppressComments]);
    expect(result).toBe('Hello $x$ \\command{param} \\section{Title}\n World');
  });

  it('emits input commands as part of the rendered text', () => {
    const parser = getParser('Load \\input{chapter.tex} now');
    const result = transform(parser.getRoot(), []);
    expect(result).toBe('Load \\input{chapter.tex} now');
  });

  it('flattens input files when requested', () => {
    const main = getParser('Start \\input{intro.tex} End');
    const intro = getParser('Intro contents');

    const text = transform(main.getRoot(), [], { 'intro.tex': intro.getRoot() }, { flatten: true });

    expect(text).toBe('Start Intro contents End');
  });

  it('omits comments from the aggregated output text', () => {
    const input = `Text % comment\nMore`;
    const parser = getParser(input);
    const text = transform(parser.getRoot(), [suppressComments]);
    expect(text).toBe('Text  More');
  });

  it('flattens nested inputs and still applies transformers', () => {
    const main = getParser('Header \\input{mid.tex} Footer');
    const mid = getParser('Hello % comment\n\\input{sub.tex}');
    const sub = getParser('World');

    const text = transform(
      main.getRoot(),
      [suppressComments],
      { 'mid.tex': mid.getRoot(), 'sub.tex': sub.getRoot() },
      { flatten: true }
    );

    expect(text).toBe('Header Hello  World Footer');
  });
});
