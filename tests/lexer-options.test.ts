import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../src/lib/parse/tokens';
import { collectPairs } from './util';

describe('Lexer options: enabledTokens', () => {
  it('emits all by default (no options)', () => {
    const input = '\n text $x$ \\% \\text{a}';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    // Basic sanity: should contain Command and MathDelim
    const types = pairs.map(([t]) => t);
    expect(types).toContain(TokenType.Command);
    expect(types).toContain(TokenType.MathDelim);
  });

  it('can suppress Command tokens (fold into Text)', () => {
    const input = 'prefix \\text{abc} suffix';
    const enabled = new Set<TokenType>([
      TokenType.Text,
      TokenType.LBrace,
      TokenType.RBrace,
      TokenType.MathDelim,
      TokenType.Comment,
    ]);
    const lex = new Lexer(input, { enabledTokens: enabled });
    const pairs = collectPairs(lex);
    const types = pairs.map(([t]) => t);
    expect(types).not.toContain(TokenType.Command);
    // Expect Text around braces and inside group
    expect(types.filter((t) => t === TokenType.Text).length).toBeGreaterThan(0);
  });

  it('can suppress MathDelim tokens', () => {
    const input = 'a $ b $$ c $ d $$';
    const enabled = new Set<TokenType>([
      TokenType.Text,
      TokenType.Comment,
      TokenType.Command,
      TokenType.LBrace,
      TokenType.RBrace,
    ]);
    const lex = new Lexer(input, { enabledTokens: enabled });
    const pairs = collectPairs(lex);
    const math = pairs.filter(([t]) => t === TokenType.MathDelim);
    expect(math.length).toBe(0);
    // Should collapse into Text since math delims are suppressed
    const types = pairs.map(([t]) => t);
    expect(types).toContain(TokenType.Text);
  });

  it('letter escapable rule is inherent (\\+letter always starts a command)', () => {
    const input = '\\n X \\next';
    const lex = new Lexer(input);
    const pairs = collectPairs(lex);
    const types = pairs.map(([t]) => t);
    // \\n followed by space -> single-letter Command('n') then Text
    expect(types[0]).toBe(TokenType.Command);
    // \\next -> Command('next')
    const cmdNames = pairs.filter(([t]) => t === TokenType.Command).map(([, v]) => v);
    expect(cmdNames).toContain('next');
  });
});
