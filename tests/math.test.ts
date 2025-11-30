import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../src/lib/parse/tokens';
import { collectPairs } from './util';

describe('Math delimiters', () => {
  it('tokenizes $ inline and $$ display', () => {
    const input = 'a $ b $$ c $ d $$';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    const math = pairs.filter(([t]) => t === TokenType.MathDelim).map(([, v]) => v);
    expect(math).toEqual(['$', '$$', '$', '$$']);
  });

  it('tokenizes \\[ and \\] as display math', () => {
    const input = '\\[ x \\]';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    const delims = pairs.filter(([t]) => t === TokenType.MathDelim).map(([, v]) => v);
    expect(delims).toEqual(['\\[', '\\]']);
  });

  it('tokenizes \\( and \\) as inline math (MathJax-compatible)', () => {
    const input = '\\( x \\)';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    const delims = pairs.filter(([t]) => t === TokenType.MathDelim).map(([, v]) => v);
    expect(delims).toEqual(['\\(', '\\)']);
  });

  it('does not start math on escaped dollar', () => {
    const input = '\\$ not math';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    expect(pairs.some(([t]) => t === TokenType.MathDelim)).toBe(false);
  });
});
