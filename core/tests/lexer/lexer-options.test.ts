import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../../src/lib/lexer/tokens';
import { collectTokens } from '../util';

describe('Lexer options: enabledTokens', () => {
  it('emits all by default (no options)', () => {
    const input = '\n text $x$ \\% \\text{a}';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    // Basic sanity: should contain Command and MathDelim
    const types = tokens.map((t) => t.type);
    expect(types).toContain(TokenType.Command);
    expect(types).toContain(TokenType.MathDelim);
  });

  it('can suppress Command tokens (fold into Text)', () => {
    const input = 'prefix \\text{abc} suffix';
    const enabled = new Set<TokenType>([
      TokenType.Text,
      TokenType.Brace,
      TokenType.MathDelim,
      TokenType.Comment,
    ]);
    const lex = new Lexer(input, { enabledTokens: enabled });
    const tokens = collectTokens(lex);

    const types = tokens.map((t) => t.type);
    expect(tokens.length).toBe(5);
    expect(types).toEqual([
      TokenType.Text,
      TokenType.Brace,
      TokenType.Text,
      TokenType.Brace,
      TokenType.Text,
    ]);
    let texts = tokens
      .filter((t) => t.type === TokenType.Text)
      .map((t) => (t.end < t.start ? '' : input.slice(t.start, t.end + 1)));
    expect(texts).toEqual(['prefix \\text', 'abc', ' suffix']);
  });

  it('can suppress MathDelim tokens', () => {
    const input = 'a $ b $$ c $ d $$';
    const enabled = new Set<TokenType>([
      TokenType.Text,
      TokenType.Comment,
      TokenType.Command,
      TokenType.Brace,
    ]);
    const lex = new Lexer(input, { enabledTokens: enabled });
    const tokens = collectTokens(lex);
    const math = tokens.filter((t) => t.type === TokenType.MathDelim);
    expect(math.length).toBe(0);
    // Should collapse into Text since math delims are suppressed
    const types = tokens.map((t) => t.type);
    expect(types).toContain(TokenType.Text);
  });

  it('letter escapable rule is inherent (\\+letter always starts a command)', () => {
    const input = '\\n X \\next';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const types = tokens.map((t) => t.type);
    // \\n followed by space -> single-letter Command('n') then Text
    expect(types[0]).toBe(TokenType.Command);
    // \\next -> Command('next')
    const cmdNames = tokens.filter((t) => t.type === TokenType.Command).map((t) => t.name);
    expect(cmdNames).toContain('next');
  });
});
