import { describe, expect, it } from 'vitest';
import {
  CommentKind,
  ConditionBranchKind,
  DiagnosticCode,
  DiagnosticSeverity,
  InputHandlingMode,
  NodeType,
  PrepTexError,
  PrepTexErrorCode,
  PrepTexSyntaxError,
  TokenType,
  isContainerNode,
  mergeProjects,
  parseDocument,
  parseProject,
  serializeDocument,
  transformProject,
  type AstNode,
  type ParsedFile,
  type SourceFile,
} from '../src/index';

function allNodes(root: AstNode): AstNode[] {
  const result: AstNode[] = [];
  const pending: AstNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    result.push(node);
    if (isContainerNode(node)) {
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index];
        if (child) pending.push(child);
      }
    }
  }
  return result;
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw.');
}

function expectPrepTexCode(error: unknown, code: PrepTexErrorCode): PrepTexError {
  expect(error).toBeInstanceOf(PrepTexError);
  const prepTexError = error as PrepTexError;
  expect(prepTexError.code).toBe(code);
  return prepTexError;
}

function sourceFile(path: string, source: string, version = 1): SourceFile {
  return { path, source, version };
}

function findFile(files: readonly ParsedFile[], path: string): ParsedFile {
  const file = files.find((candidate) => candidate.path === path);
  expect(file, `Expected parsed file ${path}`).toBeDefined();
  return file!;
}

describe('public document API', () => {
  it('round-trips supported source exactly with default options', () => {
    const source = [
      '\\section*{Intro}',
      'Text $x + 1$ % keep this comment',
      '\\input{chapters/body}',
    ].join('\n');

    const parsed = parseDocument(source, { sourcePath: 'main.tex' });

    expect(serializeDocument(parsed.root)).toBe(source);
    expect(parsed.path).toBe('main.tex');
    expect(parsed.referencedFiles).toEqual(['chapters/body']);
  });

  it('exposes named metadata instead of legacy AST fields', () => {
    const source = [
      '\\section*{Intro}\\cmd* $x$',
      '% line comment',
      '\\begin{comment}',
      'hidden',
      '\\end{comment}',
      '\\ifFlag yes\\else no\\fi',
    ].join('\n');
    const nodes = allNodes(parseDocument(source).root);

    const section = nodes.find((node) => node.type === NodeType.Section);
    const command = nodes.find((node) => node.type === NodeType.Command && node.name === 'cmd');
    const math = nodes.find((node) => node.type === NodeType.Math);
    const comments = nodes.filter((node) => node.type === NodeType.Comment);
    const branches = nodes.filter((node) => node.type === NodeType.ConditionBranch);

    expect(section?.type === NodeType.Section && section.starred).toBe(true);
    expect(command?.type === NodeType.Command && command.starred).toBe(true);
    expect(math?.type === NodeType.Math && math.delimiter).toBe('$');
    expect(comments.map((comment) => comment.kind)).toEqual([
      CommentKind.Line,
      CommentKind.Environment,
    ]);
    expect(branches.map((branch) => branch.branch)).toEqual([
      ConditionBranchKind.If,
      ConditionBranchKind.Else,
    ]);
  });

  it('deeply freezes parse results, diagnostics, and every AST node', () => {
    const parsed = parseDocument('\\ifFlag\\section{Nested}yes\\fi', {
      sourcePath: 'nested.tex',
    });
    const nodes = allNodes(parsed.root);

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.root)).toBe(true);
    expect(Object.isFrozen(parsed.root.children)).toBe(true);
    expect(nodes.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(parsed.diagnostics)).toBe(true);
    expect(Object.isFrozen(parsed.declaredConditions)).toBe(true);
    expect(Object.isFrozen(parsed.referencedFiles)).toBe(true);
    expect(parsed.diagnostics).toHaveLength(1);
    const diagnostic = parsed.diagnostics[0];
    expect(diagnostic).toMatchObject({
      code: DiagnosticCode.SectionReclassified,
      severity: DiagnosticSeverity.Warning,
      path: 'nested.tex',
    });
    expect(Object.isFrozen(diagnostic!)).toBe(true);
    expect(Object.isFrozen(diagnostic!.range)).toBe(true);

    const mutableChildren = parsed.root.children as unknown as AstNode[];
    expect(() => mutableChildren.push(parsed.root)).toThrow(TypeError);
  });

  it('throws a structured syntax error for an unclosed construct', () => {
    const source = 'first\n\\begin{itemize}\nitem';
    const openOffset = source.indexOf('\\begin');

    const error = thrownBy(() => parseDocument(source, { sourcePath: 'chapters/list.tex' }));

    expect(error).toBeInstanceOf(PrepTexSyntaxError);
    const syntaxError = expectPrepTexCode(error, PrepTexErrorCode.SyntaxError);
    expect(syntaxError).toBeInstanceOf(PrepTexSyntaxError);
    const diagnostic = (syntaxError as PrepTexSyntaxError).diagnostic;
    expect(diagnostic).toEqual({
      code: DiagnosticCode.SyntaxError,
      severity: DiagnosticSeverity.Error,
      message: expect.stringContaining('Unclosed Environment'),
      path: 'chapters/list.tex',
      range: { start: openOffset, end: openOffset, line: 2 },
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.range)).toBe(true);
  });

  it('uses inclusive source ranges that stop at EOF', () => {
    const source = '\\section{Last}text\\cmd';
    const parsed = parseDocument(source);

    expect(parsed.root).toMatchObject({ start: 0, end: source.length - 1, line: 1 });
    for (const node of allNodes(parsed.root)) {
      expect(node.start).toBeGreaterThanOrEqual(0);
      expect(node.end).toBeLessThanOrEqual(source.length - 1);
      expect(node.end).toBeGreaterThanOrEqual(node.start);
    }

    expect(parseDocument('').root).toMatchObject({ start: 0, end: -1, line: 1 });
  });

  it('coalesces long runs of syntax that is classified as text without recursion', () => {
    const source = '['.repeat(20_000);
    const parsed = parseDocument(source);

    expect(serializeDocument(parsed.root)).toBe(source);
    expect(parsed.root.children).toHaveLength(1);
  });

  it('preserves orphan comment closers when comments are suppressed', () => {
    const source = 'before\\end{comment}after';
    const parsed = parseDocument(source);

    expect(serializeDocument(parsed.root, { suppressComments: true })).toBe(source);
  });

  it('ends a percent comment at a lone carriage return', () => {
    const parsed = parseDocument('A % hide\rVISIBLE');

    expect(serializeDocument(parsed.root, { suppressComments: true })).toBe('A  VISIBLE');
  });

  it('preserves mixed dollar delimiters after a documented tokenization fallback', () => {
    const source = '$a$$$a$';
    const parsed = parseDocument(source);

    expect(serializeDocument(parsed.root)).toBe(source);
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: DiagnosticCode.TokenizationAdjusted,
        severity: DiagnosticSeverity.Warning,
      }),
    ]);
  });

  it('does not recognize input commands inside disabled comments', () => {
    const source = '% \\input{secret.tex}\nVisible';
    const parsed = parseDocument(source, {
      enabledTokens: [TokenType.Text, TokenType.NewLine, TokenType.Input],
    });

    expect(parsed.referencedFiles).toEqual([]);
    expect(serializeDocument(parsed.root)).toBe(source);
  });

  it('reports an orphan explicit math closer as a syntax error', () => {
    expect(() => parseDocument('\\)')).toThrow(PrepTexSyntaxError);
  });
});

describe('public immutable project API', () => {
  it('returns deeply frozen plain data from parse and transform operations', () => {
    const project = parseProject([
      sourceFile('main.tex', 'Before \\input{part.tex} after'),
      sourceFile('part.tex', 'Part'),
    ]);
    const transformed = transformProject('main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });

    expect(Object.getPrototypeOf(project)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(project.files[0]!)).toBe(Object.prototype);
    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(project.files)).toBe(true);
    expect(project.files.every(Object.isFrozen)).toBe(true);
    expect(project.files.flatMap((file) => allNodes(file.root)).every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(transformed)).toBe(true);
    expect(Object.isFrozen(transformed.files)).toBe(true);
    expect(transformed.files.every(Object.isFrozen)).toBe(true);
    expect(transformed.files).toEqual([{ path: 'main.tex', source: 'Before Part after' }]);
  });

  it('resolves an input relative to the including file before project-root fallbacks', () => {
    const project = parseProject([
      sourceFile('book/main.tex', 'Book: \\input{chapters/intro}'),
      sourceFile('book/chapters/intro.tex', 'Correct chapter'),
      sourceFile('chapters/intro.tex', 'Wrong root-level chapter'),
    ]);

    const transformed = transformProject('book/main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });

    expect(transformed.files).toEqual([{ path: 'book/main.tex', source: 'Book: Correct chapter' }]);
  });

  it('resolves parent-directory input segments from the including file', () => {
    const project = parseProject([
      sourceFile('book/chapters/main.tex', 'Chapter: \\input{../intro}'),
      sourceFile('book/intro.tex', 'Book introduction'),
      sourceFile('intro.tex', 'Wrong root-level introduction'),
    ]);

    const transformed = transformProject('book/chapters/main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });

    expect(transformed.files).toEqual([
      {
        path: 'book/chapters/main.tex',
        source: 'Chapter: Book introduction',
      },
    ]);
  });

  it('throws a typed missing-input error while flattening', () => {
    const project = parseProject([sourceFile('book/main.tex', '\\input{chapters/missing}')]);

    const error = thrownBy(() =>
      transformProject('book/main.tex', project, {
        inputHandling: InputHandlingMode.Flatten,
      })
    );

    expectPrepTexCode(error, PrepTexErrorCode.MissingInput);
  });

  it('throws a typed circular-input error while flattening', () => {
    const project = parseProject([
      sourceFile('a.tex', 'A \\input{b.tex}'),
      sourceFile('b.tex', 'B \\input{a.tex}'),
    ]);

    const error = thrownBy(() =>
      transformProject('a.tex', project, {
        inputHandling: InputHandlingMode.Flatten,
      })
    );

    expectPrepTexCode(error, PrepTexErrorCode.CircularInput);
  });

  it('keeps merge operations pure and preserves unchanged file identities', () => {
    const base = parseProject([sourceFile('a.tex', 'base a', 2), sourceFile('b.tex', 'base b', 1)]);
    const updates = parseProject([
      sourceFile('a.tex', 'stale a', 1),
      sourceFile('c.tex', 'new c', 1),
    ]);
    const baseFilesBefore = [...base.files];
    const updateFilesBefore = [...updates.files];

    const merged = mergeProjects(base, updates);

    expect(merged).not.toBe(base);
    expect(merged).not.toBe(updates);
    expect(base.files).toEqual(baseFilesBefore);
    expect(updates.files).toEqual(updateFilesBefore);
    expect(findFile(merged.files, 'a.tex')).toBe(findFile(base.files, 'a.tex'));
    expect(findFile(merged.files, 'b.tex')).toBe(findFile(base.files, 'b.tex'));
    expect(findFile(merged.files, 'c.tex')).toBe(findFile(updates.files, 'c.tex'));
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.files)).toBe(true);
  });
});
