import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../../src/lib/parse/tokens';
import { collectTokens } from '../util';

describe('Math delimiters', () => {
  it('tokenizes $ inline and $$ display', () => {
    const input = 'a $ b $$ c $ d $$';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const delims = tokens.filter((t) => t.type === TokenType.MathDelim);
    expect(delims.map((t) => t.name)).toEqual(['$', '$$', '$', '$$']);
    // Ensure positions and ordering are consistent
    expect(delims[0].start).toBeLessThan(delims[0].end);
    expect(delims[2].name).toBe('$');
  });

  it('tokenizes \\[ and \\] as display math', () => {
    const input = '\\[ x \\]';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const delims = tokens.filter((t) => t.type === TokenType.MathDelim);
    expect(delims.map((t) => t.name)).toEqual(['\\[', '\\]']);
    // Verify open then close ordering
    expect(delims[0].name).toBe('\\[');
    expect(delims[1].name).toBe('\\]');
  });

  it('tokenizes \\( and \\) as inline math (MathJax-compatible)', () => {
    const input = '\\( x \\)';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const delims = tokens.filter((t) => t.type === TokenType.MathDelim);
    expect(delims.map((t) => t.name)).toEqual(['\\(', '\\)']);
    expect(delims[0].name).toBe('\\(');
    expect(delims[1].name).toBe('\\)');
  });

  it('does not start math on escaped dollar', () => {
    const input = '\\$ not math';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens.some((t) => t.type === TokenType.MathDelim)).toBe(false);
  });
});
