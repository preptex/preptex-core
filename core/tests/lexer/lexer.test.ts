import { describe, it, expect } from 'vitest';
import { Lexer, Token, TokenType } from '../../src/lib/lexer/tokens';
import { collectTokens } from '../util';

const sample = `% comment line\n\\begin{doc}Text \\ifXYZ more \\else alt \\fi{inner} \\end{doc}`;

function sliceToken(input: string, start: number, end: number): string {
  if (end < start) return '';
  return input.slice(start, end + 1);
}

describe('Lexer', () => {
  it('tokenizes sample input', () => {
    const lex = new Lexer(sample);
    const tokens = collectTokens(lex);
    // Assert first few tokens carry full data
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('%');
    expect(sliceToken(sample, tokens[0].start, tokens[0].end)).toContain('comment line');
    // Newline is included in the comment; next is Environment begin
    expect(tokens[1].type).toBe(TokenType.Environment);
    expect(tokens[1].name).toBe('doc');
    expect(tokens[1].isBegin).toBe(true);
    // Check matching end environment token at the end
    const envs = tokens.filter((t) => t.type === TokenType.Environment);
    expect(envs.length).toBe(2);
    const lastEnv = envs[envs.length - 1];
    expect(lastEnv.name).toBe('doc');
    expect(lastEnv.isBegin).toBe(false);
    // Compare simplified name sequence for entire stream
    const names = tokens.map((t) =>
      t.type === TokenType.Text ? sliceToken(sample, t.start, t.end) : t.name
    );
    expect(names).toEqual([
      '%',
      'doc',
      'Text ',
      'if',
      'more ',
      'else',
      'alt ',
      'fi',
      '{',
      'inner',
      '}',
      ' ',
      'doc',
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
    const out = collectTokens(lex);
    expect(out.map((o) => o.type)).toEqual([TokenType.Text, TokenType.Command]);
    expect(sliceToken('\\'.repeat(5) + 'more', out[0].start, out[0].end)).toBe('\\'.repeat(4)); // 4 backslashes consumed as text
    expect(out[1].name).toBe('more'); // last backslash starts command
  });

  it('treats solitary backslash as command', () => {
    const lex = new Lexer('\\ifXYZ'); // single backslash then command name
    const out = collectTokens(lex);
    expect(out.map((o) => o.type)).toEqual([TokenType.Condition]);
    expect(out[0].name).toBe('if');
    expect(out[0].condition).toBe('XYZ');
    // Ensure positions are sane
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeGreaterThan(out[0].start);
  });

  it('handles text with interleaved backslash runs by leaving solitary command', () => {
    const input = 'some text\\more text' + '\\'.repeat(3) + 'and more text\\';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const names = tokens.map((t) =>
      t.type === TokenType.Text ? sliceToken(input, t.start, t.end) : t.name
    );
    expect(names).toEqual(['some text', 'more', 'text\\\\', 'and', 'more text\\']);
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
    const tokens = collectTokens(lex);
    expect(tokens.map((t) => t.type)).toEqual([TokenType.Text]);
    expect(sliceToken(input, tokens[0].start, tokens[0].end)).toBe(input);
  });

  it('tests escapables vs commands', () => {
    const input = '\n \t\\text{abc}\\%abc';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const names = tokens.map((t) =>
      t.type === TokenType.Text ? sliceToken(input, t.start, t.end) : t.name
    );
    expect(names).toEqual(['\n \t', 'text', '{', 'abc', '}', '\\%abc']);
  });

  it('captures exact inline comment name and text', () => {
    const input = '% inline comment here\nNext';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('%');
    expect(sliceToken(input, tokens[0].start, tokens[0].end)).toBe('% inline comment here\n');
    // Following text starts immediately after newline
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(sliceToken(input, tokens[1].start, tokens[1].end)).toBe('Next');
  });

  it('captures exact env comment name and text for \\begin{comment}...\\end{comment}', () => {
    const input = 'Before\n\\begin{comment}\nHidden content\n\\end{comment}\nAfter';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    // First text chunk
    expect(tokens[0].type).toBe(TokenType.Text);
    expect(sliceToken(input, tokens[0].start, tokens[0].end)).toBe('Before\n');
    // Environment comment token should include begin and body up to end
    const c = tokens[1];
    expect(c.type).toBe(TokenType.Comment);
    expect(c.name).toBe('env-comment');
    expect(sliceToken(input, c.start, c.end)).toBe(
      '\\begin{comment}\nHidden content\n\\end{comment}\n'
    );
  });

  it('produces condition declaration tokens for \\newif lines', () => {
    const input = '\\newif\\ifExample\nNext';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens[0].type).toBe(TokenType.ConditionDeclaration);
    expect(tokens[0].name).toBe('Example');
    expect(sliceToken(input, tokens[0].start, tokens[0].end)).toBe('\\newif\\ifExample\n');
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(sliceToken(input, tokens[1].start, tokens[1].end)).toBe('Next');
  });

  it('Throw error when \\newif lacks condition name', () => {
    const input = '\\newif something';
    const lex = new Lexer(input);
    expect(() => collectTokens(lex)).toThrowError();
  });
});
describe('Lexer line numbers', () => {
  it('annotates tokens with line numbers', () => {
    const input = 'line1\\begin{env}\ntext\n\\end{env}% comment\nline3';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.Text,
      TokenType.Environment,
      TokenType.Text,
      TokenType.Environment,
      TokenType.Comment,
      TokenType.Text,
    ]);
    expect(tokens.map((t) => t.start)).toEqual([0, 5, 16, 22, 31, 41]);
    expect(tokens.map((t) => t.line)).toEqual([1, 1, 1, 3, 3, 4]);
  });

  it('counts lines in comments', () => {
    const input = '% first line\n\\begin{comment}\n\n\n\\end{comment}\n\n% second line\nText';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    const last_text = tokens[tokens.length - 1];
    expect(last_text.type).toBe(TokenType.Text);
    expect(last_text.line).toBe(8);
  });

  it('does not terminate env comment when \\end{comment} has trailing content', () => {
    const input = '\\begin{comment}\nHidden\\end{comment} % trailing\nAfter';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    // Entire rest of document is a single env-comment, matching comment.sty semantics.
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('env-comment');
    expect(sliceToken(input, tokens[0].start, tokens[0].end)).toBe(
      '\\begin{comment}\nHidden\\end{comment} % trailing\nAfter'
    );
  });

  it('counts lines in condition declarations', () => {
    const input = '\\newif\\ifA\n\\newif\\ifB\nText';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.ConditionDeclaration,
      TokenType.ConditionDeclaration,
      TokenType.Text,
    ]);
    expect(tokens.map((t) => t.line)).toEqual([1, 2, 3]);
  });

  it('assigns text starting with new line correctly', () => {
    const input = '\\section{first}\n\nText line3\n';
    const lex = new Lexer(input);
    const tokens = collectTokens(lex);
    expect(tokens.length).toBe(2);
    const textToken = tokens[1];
    expect(textToken.type).toBe(TokenType.Text);
    expect(textToken.start).toBe(15);
    expect(textToken.end).toBe(27);
    expect(textToken.line).toBe(1);
    expect((textToken as any).text).toBeUndefined();
  });
});
