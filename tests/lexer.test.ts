import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../src/lib/parse/tokens';
import { collectPairs } from './util';

const sample = `% comment line\n\\begin{doc}Text \\ifXYZ more \\else alt \\fi{inner} \\end{doc}`;

describe('Lexer', () => {
  it('tokenizes sample input', () => {
    const lex = new Lexer(sample);
    expect(collectPairs(lex)).toEqual([
      [TokenType.Comment, '% comment line'],
      [TokenType.Text, '\n'],
      [TokenType.BeginEnv, 'doc'],
      [TokenType.Text, 'Text '],
      [TokenType.If, 'ifXYZ'],
      [TokenType.Text, ' more '],
      [TokenType.Else, 'else'],
      [TokenType.Text, ' alt '],
      [TokenType.Fi, 'fi'],
      [TokenType.LBrace, '{'],
      [TokenType.Text, 'inner'],
      [TokenType.RBrace, '}'],
      [TokenType.Text, ' '],
      [TokenType.EndEnv, 'doc'],
    ]);
  });

  it('emits comments (no suppression in lexer)', () => {
    const lex = new Lexer('% c\ntext');
    const tokens: TokenType[] = [];
    let t;
    while ((t = lex.next())) tokens.push(t.type);
    expect(tokens[0]).toBe(TokenType.Comment);
    expect(tokens).toContain(TokenType.Comment);
  });

  it('consumes even pairs from odd run, leaving one for command', () => {
    const lex = new Lexer('\\'.repeat(5) + 'more'); // 5 backslashes then 'more'
    const out: { type: TokenType; value: string }[] = [];
    let t;
    while ((t = lex.next())) out.push(t);
    expect(out.map((o) => o.type)).toEqual([TokenType.Text, TokenType.Command]);
    expect(out[0].value).toBe('\\'.repeat(4)); // 4 backslashes consumed as text
    expect(out[1].value).toBe('more'); // last backslash starts command
  });

  it('treats solitary backslash as command', () => {
    const lex = new Lexer('\\ifXYZ'); // single backslash then command name
    const out: { type: TokenType; value: string }[] = [];
    let t;
    while ((t = lex.next())) out.push(t);
    expect(out.map((o) => o.type)).toEqual([TokenType.If]);
    expect(out[0].value).toBe('ifXYZ');
  });

  it('handles text with interleaved backslash runs by leaving solitary command', () => {
    const input = 'some text\\more text' + '\\'.repeat(3) + 'and more text\\';
    const lex = new Lexer(input);
    expect(collectPairs(lex)).toEqual([
      [TokenType.Text, 'some text'],
      [TokenType.Command, 'more'],
      [TokenType.Text, ' text\\\\'],
      [TokenType.Command, 'and'],
      [TokenType.Text, ' more text'],
      [TokenType.Command, ''],
    ]);
  });

  it('tokenizes even backslashes + escapables as one Text', () => {
    const input =
      '\\\\' + // 2 literal backslashes
      ' ' +
      '\\%' + // escaped percent
      '  ' +
      '\\$' + // escaped dollar
      '\n' +
      '\\{' + // escaped left brace
      '\\}' + // escaped right brace
      ' \n ' +
      '\\ ' + // backslash-space pair
      ' ' +
      '\\\\\\%\\\\'; // 2 more literal backslashes
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    expect(pairs.map((p) => p[0])).toEqual([TokenType.Text]);
    expect(pairs[0][1]).toBe(input);
  });
});
