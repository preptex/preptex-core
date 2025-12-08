import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import type { CoreOptions } from '../../src/lib/options';
import type { Transformer } from '../../src/lib/transform/transform';
import { NodeType } from '../../src/lib/parse/types';

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
    const result = parser.transform(transformers);
    expect(result.root).toBeTruthy();
    // Assert exact aggregated text after suppressing comments
    expect(result.text).toBe('Hello $x$ \\command{param} \\section{Title}\nWorld');
  });
});
