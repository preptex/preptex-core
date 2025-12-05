import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../../src/lib/parse/tokens';
import { collectPairs } from '../util';

const sample = `% comment line\n\\begin{doc}Text \\ifXYZ more \\else alt \\fi{inner} \\end{doc}`;

describe('Lexer', () => {
  it('tokenizes sample input', () => {
    const lex = new Lexer(sample);
    const tokens = collectPairs(lex);
    // Assert first few tokens carry full data
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('%');
    expect(tokens[0].text).toContain('comment line');
    // Newline is included in the comment; next is Environment begin
    expect(tokens[1].type).toBe(TokenType.Environment);
    expect(tokens[1].name).toBe('doc');
    expect(tokens[1].isBegin).toBe(true);
    // Check matching end environment token at the end
    const lastEnv = tokens.filter((t) => t.type === TokenType.Environment).at(-1)!;
    expect(lastEnv.name).toBe('doc');
    expect(lastEnv.isBegin).toBe(false);
    // Compare simplified name sequence for entire stream
    const names = tokens.map((t) => (t.type === TokenType.Text ? t.text : t.name));
    expect(names).toEqual([
      '%',
      'doc',
      'Text ',
      'if',
      ' more ',
      'else',
      ' alt ',
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
    const out: { type: TokenType; value: string }[] = [];
    let t;
    while ((t = lex.next())) out.push(t);
    expect(out.map((o) => o.type)).toEqual([TokenType.Text, TokenType.Command]);
    expect(out[0].text).toBe('\\'.repeat(4)); // 4 backslashes consumed as text
    expect(out[1].name).toBe('more'); // last backslash starts command
  });

  it('treats solitary backslash as command', () => {
    const lex = new Lexer('\\ifXYZ'); // single backslash then command name
    const out: { type: TokenType; value: string }[] = [];
    let t;
    while ((t = lex.next())) out.push(t);
    expect(out.map((o) => o.type)).toEqual([TokenType.Condition]);
    expect(out[0].name).toBe('if');
    expect(out[0].text).toBe('XYZ');
    // Ensure positions are sane
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeGreaterThan(out[0].start);
  });

  it('handles text with interleaved backslash runs by leaving solitary command', () => {
    const input = 'some text\\more text' + '\\'.repeat(3) + 'and more text\\';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    const names = tokens.map((t) => (t.type === TokenType.Text ? t.text : t.name));
    expect(names).toEqual(['some text', 'more', ' text\\\\', 'and', ' more text', '']);
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
    const tokens = collectPairs(lex);
    expect(tokens.map((t) => t.type)).toEqual([TokenType.Text]);
    expect(tokens[0].text).toBe(input);
  });

  it('teses escapables vs escapables as prefixes', () => {
    const input = '\n \t\\text{abc}\\%abc';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    const names = tokens.map((t) => (t.type === TokenType.Text ? t.text : t.name));
    expect(names).toEqual(['\n \t', 'text', '{', 'abc', '}', '\\%abc']);
  });

  it('captures exact inline comment name and text', () => {
    const input = '% inline comment here\nNext';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    expect(tokens[0].type).toBe(TokenType.Comment);
    expect(tokens[0].name).toBe('%');
    expect(tokens[0].text).toBe('% inline comment here\n');
    // Following text starts immediately after newline
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(tokens[1].text).toBe('Next');
  });

  it('captures exact env comment name and text for \\begin{comment}...\\end{comment}', () => {
    const input = 'Before\\begin{comment}\nHidden content\\end{comment}After';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    // First text chunk
    expect(tokens[0].type).toBe(TokenType.Text);
    expect(tokens[0].text).toBe('Before');
    // Environment comment token should include begin and body up to end
    const c = tokens[1];
    expect(c.type).toBe(TokenType.Comment);
    expect(c.name).toBe('env-comment');
    expect(c.text).toBe('\\begin{comment}\nHidden content\\end{comment}');
  });

  it('produces condition declaration tokens for \\newif lines', () => {
    const input = '\\newif\\ifExample\nNext';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    expect(tokens[0].type).toBe(TokenType.ConditionDeclaration);
    expect(tokens[0].name).toBe('Example');
    expect(tokens[0].text).toBe('\\newif\\ifExample\n');
    expect(tokens[1].type).toBe(TokenType.Text);
    expect(tokens[1].text).toBe('Next');
  });

  it('falls back to command when \\newif lacks condition name', () => {
    const input = '\\newif something';
    const lex = new Lexer(input);
    const tokens = collectPairs(lex);
    expect(tokens[0].type).toBe(TokenType.Command);
    expect(tokens[0].name).toBe('newif');
    expect(tokens[1].type).toBe(TokenType.Text);
  });
});
