import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import type { CoreOptions } from '../../src/lib/options';
import { transform, Transformer } from '../../src/lib/transform/transform';
import { NodeType, AstRoot } from '../../src/lib/parse/types';

function parse(input: string): AstRoot {
  const p = new Parser({} as CoreOptions);
  return p.parse(input);
}

describe('Transformer pipeline', () => {
  it('parses, transforms, removes nodes, and aggregates text', () => {
    const input = `Hello $x$ \\section{Title}\n% comment\nWorld`;
    const ast = parse(input);

    const transformers: Transformer[] = [
      // boolean-only: return false to skip node output; true to process
      (node) => (node as any).type !== NodeType.Comment,
    ];

    const result = transform(ast, transformers);
    expect(result.root).toBeTruthy();
    // Assert exact aggregated text after suppressing comments
    expect(result.text).toBe('Hello $x$ \\section{Title}\nWorld');
  });
});
