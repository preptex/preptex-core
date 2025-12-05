import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { transform } from '../../src/lib/transform/transform';
import { filterConditions, filterConditionsByDecisions } from '../../src/lib/transform/conditions';
import { suppressComments } from '../../src/lib/transform/suppressComments';
import { NodeType, AstRoot } from '../../src/lib/parse/types';

function parse(input: string): AstRoot {
  const p = new Parser({} as any);
  return p.parse(input);
}

function findTypes(root: AstRoot, type: NodeType): any[] {
  const out: any[] = [];
  const stack: any[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.type === type) out.push(n);
    const children = (n as any).children as any[] | undefined;
    if (Array.isArray(children)) stack.push(...children);
  }
  return out;
}

describe('conditions transform', () => {
  it('keeps IF branch when name is in list, else keeps ELSE (aggregated text)', () => {
    const input = `\\ifX Hello\\else World\\fi`;
    const ast = parse(input);
    const { root, text } = transform(ast, [filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe(' Hello');
  });

  it('keeps ELSE branch when name not in list (aggregated text)', () => {
    const input = `\\ifY Alpha\\else Beta\\fi`;
    const ast = parse(input);
    const { root, text } = transform(ast, [filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe(' Beta');
  });

  it('handles condition without else by skipping when not kept (aggregated text)', () => {
    const input = `Start \\ifZ Hidden \\fi End`;
    const ast = parse(input);
    const { root, text } = transform(ast, [filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe('Start  End');
  });

  it('handles multiple conditions with mixed decisions', () => {
    const input = `A \\ifA KeepIf \\else KeepElse \\fi B \\ifB One \\else Two \\fi C`;
    const ast = parse(input);
    const { text } = transform(ast, [filterConditions(['A'])]);
    expect(text).toBe('A  KeepIf  B  Two  C');
  });

  it('supports nested conditions and applies decisions independently', () => {
    const input = `Top \\ifOuter X \\ifInner InIf \\else InElse \\fi Y \\else Z \\fi End`;
    const ast = parse(input);
    const { text } = transform(ast, [filterConditions(['Inner'])]);
    expect(text).toBe('Top  Z  End');
  });
});

describe('suppress comments transform', () => {
  it('omits comments from the aggregated output text', () => {
    const input = `Text % comment\nMore`;
    const ast = parse(input);
    const { text } = transform(ast, [suppressComments()]);
    expect(text).toBe('Text More');
  });
});
