import { describe, it, expect } from 'vitest';
import { Lexer, Token, TokenType } from '../../src/lib/lexer/tokens';
import { collectTokens } from '../util';

function sliceToken(input: string, start: number, end: number): string {
  if (end < start) return '';
  return input.slice(start, end + 1);
}

describe('Comment env token', () => {
  it('tokenizes sample input', () => {
    const sample = `\\begin{comment}This is a comment\n\\end{comment}\n`;
    const lex = new Lexer(sample);
    const tokens = collectTokens(lex);
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('env-comment');
    expect(sliceToken(sample, tokens[0].start, tokens[0].end)).toBe(
      '\\begin{comment}This is a comment\n\\end{comment}\n'
    );
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].start).toBe(0);
    expect(tokens[0].end).toBe(sample.length - 1);
  });

  it('identifies windows line ending in comment env', () => {
    const sample = `\\begin{comment}This is a comment\r\n\\end{comment}\r\ntext`;
    const lex = new Lexer(sample);
    const tokens = collectTokens(lex);
    expect(tokens.length).toBe(2);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(sliceToken(sample, tokens[1].start, tokens[1].end)).toBe('text');
  });

  it('ignores bad comment endings', () => {
    const sample = `\\begin{comment}This is a comment\n\\end{comment} texta after\ntext before \\end{comment}\nReal end\n\\end{comment}\ntext`;
    const lex = new Lexer(sample);
    const tokens = collectTokens(lex);
    expect(tokens.length).toBe(2);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(sliceToken(sample, tokens[1].start, tokens[1].end)).toBe('text');
  });
});
