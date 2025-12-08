import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { filterConditions } from '../../src/lib/transform/transforems';
import { suppressComments } from '../../src/lib/transform/transforems';

function createParser(input: string): Parser {
  const p = new Parser({} as any);
  p.parse(input);
  return p;
}

describe('conditions transform', () => {
  it('keeps IF branch when name is in list, else keeps ELSE (aggregated text)', () => {
    const input = `\\ifX Hello\\else World\\fi`;
    const parser = createParser(input);
    const { root, text } = parser.transform([filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe(' Hello');
  });

  it('keeps ELSE branch when name not in list (aggregated text)', () => {
    const input = `\\ifY Alpha\\else Beta\\fi`;
    const parser = createParser(input);
    const { root, text } = parser.transform([filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe(' Beta');
  });

  it('handles condition without else by skipping when not kept (aggregated text)', () => {
    const input = `Start \\ifZ Hidden \\fi End`;
    const parser = createParser(input);
    const { root, text } = parser.transform([filterConditions(['X'])]);
    expect(root).toBeTruthy();
    expect(text).toBe('Start  End');
  });

  it('handles multiple conditions with mixed decisions', () => {
    const input = `A \\ifA KeepIf \\else KeepElse \\fi B \\ifB One \\else Two \\fi C`;
    const parser = createParser(input);
    const { text } = parser.transform([filterConditions(['A'])]);
    expect(text).toBe('A  KeepIf  B  Two  C');
  });

  it('supports nested conditions and applies decisions independently', () => {
    const input = `Top \\ifOuter X \\ifInner InIf \\else InElse \\fi Y \\else Z \\fi End`;
    const parser = createParser(input);
    const { text } = parser.transform([filterConditions(['Inner'])]);
    expect(text).toBe('Top  Z  End');
  });

  it('suppresses \\newif declarations from output', () => {
    const input = `\\newif\\ifCool\n\\ifCool Hit\\else Miss\\fi`;
    const parser = createParser(input);
    const { text } = parser.transform([filterConditions(['Cool'])]);
    expect(text).toBe(' Hit');
  });

  it('suppresses \\newif declarations even when ELSE branch kept', () => {
    const input = `\\newif\\ifCool\n\\ifCool Hit\\else Miss\\fi`;
    const parser = createParser(input);
    const { text } = parser.transform([filterConditions(['Other'])]);
    expect(text).toBe(' Miss');
  });
});

describe('suppress comments transform', () => {
  it('omits comments from the aggregated output text', () => {
    const input = `Text % comment\nMore`;
    const parser = createParser(input);
    const { text } = parser.transform([suppressComments]);
    expect(text).toBe('Text More');
  });
});
