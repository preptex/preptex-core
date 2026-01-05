import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { transform } from '../../src/lib/transform/transform';
import { filterConditions, suppressComments } from '../../src/lib/transform/transformers';
import { getParser } from '../util';

function runFilter(parser: Parser, keep: Iterable<string>) {
  const declared = parser.getDeclaredConditions();
  return transform(parser.getRoot(), [filterConditions(keep, declared)]);
}

describe('conditions transform', () => {
  it('keeps IF branch when name is in list, else keeps ELSE (aggregated text)', () => {
    const input = `\\ifX Hello\\else World\\fi`;
    const parser = getParser(input);
    const text = runFilter(parser, ['X']);
    expect(parser.getRoot()).toBeTruthy();
    expect(text).toBe('Hello');
  });

  it('keeps ELSE branch when name not in list (aggregated text)', () => {
    const input = `\\ifY Alpha\\else Beta\\fi`;
    const parser = getParser(input);
    const text = runFilter(parser, ['X']);
    expect(parser.getRoot()).toBeTruthy();
    expect(text).toBe('Beta');
  });

  it('handles condition without else by skipping when not kept (aggregated text)', () => {
    const input = `Start \\ifZ Hidden \\fi End`;
    const parser = getParser(input);
    const text = runFilter(parser, ['X']);
    expect(parser.getRoot()).toBeTruthy();
    expect(text).toBe('Start End');
  });

  it('handles multiple conditions with mixed decisions', () => {
    const input = `A \\ifA KeepIf \\else KeepElse \\fi B \\ifB One \\else Two \\fi C`;
    const parser = getParser(input);
    const text = runFilter(parser, ['A']);
    expect(text).toBe('A KeepIf B Two C');
  });

  it('supports nested conditions and applies decisions independently', () => {
    const input = `Top \\ifOuter X \\ifInner InIf \\else InElse \\fi Y \\else Z \\fi End`;
    const parser = getParser(input);
    const text = runFilter(parser, ['Inner']);
    expect(text).toBe('Top Z End');
  });

  it('suppresses \\newif declarations from output', () => {
    const input = `\\newif\\ifCool\n\\ifCool Hit\\else Miss\\fi`;
    const parser = getParser(input);
    const text = runFilter(parser, ['Cool']);
    expect(text).toBe('Hit');
  });

  it('suppresses \\newif declarations even when ELSE branch kept', () => {
    const input = `\\newif\\ifCool\n\\ifCool Hit\\else Miss\\fi`;
    const parser = getParser(input);
    const text = runFilter(parser, ['Other']);
    expect(text).toBe('Miss');
  });

  it('removes toggle commands for declared conditions', () => {
    const input = `\\newif\\ifFoo\n\\Footrue ShouldNotShow\n\\Foofalse NeitherThis`;
    const parser = getParser(input);
    const text = runFilter(parser, []);
    expect(text).toBe('ShouldNotShow\nNeitherThis');
  });

  it('parses a space after conditions', () => {
    const input = `Start \\ifA HasSpace\\fi End`;
    const parser = getParser(input);
    const text = runFilter(parser, ['A']);
    expect(text).toBe('Start HasSpaceEnd');
  });
});
