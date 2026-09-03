import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DiagnosticCode,
  DiagnosticSeverity,
  PrepTexSyntaxError,
  TokenType,
  parseDocument,
  serializeDocument,
} from '../../src/index';
import { Lexer } from '../../src/lib/lexer/tokens';
import { ParseFailure } from '../../src/lib/parse/failure';
import { Parser } from '../../src/lib/parse/parser';
import { parseToAst } from '../../src/lib/parse/parseToAst';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parser failure boundary', () => {
  it('translates malformed source into a located public syntax error', () => {
    const source = 'first line\n}';

    let caught: unknown;
    try {
      parseDocument(source, { sourcePath: 'chapter.tex' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PrepTexSyntaxError);
    const syntaxError = caught as PrepTexSyntaxError;
    expect(syntaxError.diagnostic).toEqual({
      code: DiagnosticCode.SyntaxError,
      severity: DiagnosticSeverity.Error,
      message: expect.stringContaining('Unexpected "}"'),
      path: 'chapter.tex',
      range: { start: source.length - 1, end: source.length - 1, line: 2 },
    });
  });

  it('uses the internal parse-failure marker only for expected source failures', () => {
    expect(() => parseToAst(new Lexer('}'), '}', {})).toThrowError(ParseFailure);
  });

  it('does not disguise unexpected parser bugs as syntax errors', () => {
    const internalError = new Error('simulated parser invariant failure');
    vi.spyOn(Parser.prototype, 'parse').mockImplementationOnce(() => {
      throw internalError;
    });

    let caught: unknown;
    try {
      parseDocument('ordinary text');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(internalError);
    expect(caught).not.toBeInstanceOf(PrepTexSyntaxError);
  });

  it('reports a supported construct left on the final stack as malformed source', () => {
    expect(() => parseToAst(new Lexer('{'), '{', {})).toThrowError(ParseFailure);
  });

  it('reports a mismatched environment closer through the public syntax boundary', () => {
    expect(() => parseDocument('\\begin{a}x\\end{b}')).toThrowError(PrepTexSyntaxError);
  });

  it('rejects an empty input path through the public syntax boundary', () => {
    expect(() => parseDocument('\\input{}')).toThrowError(PrepTexSyntaxError);
  });

  it('rejects an unbraced input path through the public syntax boundary', () => {
    expect(() => parseDocument('\\input chapter.tex')).toThrowError(PrepTexSyntaxError);
  });

  it('rejects an empty environment name through the public syntax boundary', () => {
    expect(() => parseDocument('\\begin{}')).toThrowError(PrepTexSyntaxError);
  });

  it('rejects an unbraced environment name through the public syntax boundary', () => {
    expect(() => parseDocument('\\begin itemize')).toThrowError(PrepTexSyntaxError);
  });

  it('keeps comment detection non-throwing when environment tokens are disabled', () => {
    const source = '\\begin{';
    const parsed = parseDocument(source, { enabledTokens: [TokenType.Text] });

    expect(serializeDocument(parsed.root)).toBe(source);
  });
});
