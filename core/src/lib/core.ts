import {
  DiagnosticCode,
  DiagnosticSeverity,
  NodeType,
  TokenType,
  isContainerNode,
  type AstNode,
  type AstRoot,
  type ConditionName,
  type Diagnostic,
  type ParseResult,
  type ParsedFile,
  type ParsedProject,
  type ProjectFilePath,
  type SourceFile,
  type SourceRange,
  type SyntaxDiagnostic,
  type TransformResult,
  type TransformedFile,
  type WarningDiagnostic,
  type WarningDiagnosticCode,
} from '../api-types.js';
import { PrepTexError, PrepTexErrorCode, PrepTexSyntaxError } from '../errors.js';
import {
  InputHandlingMode,
  type ParseOptions,
  type ProjectParseOptions,
  type SerializeOptions,
  type TransformOptions,
} from './options.js';
import { Lexer, type LexerOptions } from './lexer/tokens.js';
import { Parser } from './parse/parser.js';
import { sanityCheck, type SanityResult } from './parse/sanity.js';
import type { ParseNotice } from './parse/notices.js';
import { ParseFailure } from './parse/failure.js';
import { transform as renderAst, type Transformer } from './transform/transform.js';
import { filterConditions, suppressComments } from './transform/transformers.js';
import {
  assertOptionsObject,
  normalizeParsedProjectFiles,
  normalizeProjectFilePath,
  validateAstRoot,
  validateParsedProject,
} from './validation.js';

const DEFAULT_SOURCE_PATH = '<input>';

function freezeRange(range: SourceRange): SourceRange {
  return Object.freeze(range);
}

function freezeDiagnostic<TDiagnostic extends Diagnostic>(diagnostic: TDiagnostic): TDiagnostic {
  freezeRange(diagnostic.range);
  return Object.freeze(diagnostic);
}

function freezeAst(root: AstRoot): AstRoot {
  const stack: AstNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (isContainerNode(node)) {
      for (const child of node.children) stack.push(child);
      Object.freeze(node.children);
    }
    Object.freeze(node);
  }
  return root;
}

function makeWarningDiagnostic(
  path: ProjectFilePath,
  code: WarningDiagnosticCode,
  message: string,
  range: SourceRange
): WarningDiagnostic {
  return freezeDiagnostic({
    path,
    code,
    severity: DiagnosticSeverity.Warning,
    message,
    range: { ...range },
  });
}

function makeSyntaxDiagnostic(
  path: ProjectFilePath,
  message: string,
  range: SourceRange
): SyntaxDiagnostic {
  return freezeDiagnostic({
    path,
    code: DiagnosticCode.SyntaxError,
    severity: DiagnosticSeverity.Error,
    message,
    range: { ...range },
  });
}

function diagnosticFromNotice(path: ProjectFilePath, notice: ParseNotice): WarningDiagnostic {
  return makeWarningDiagnostic(path, notice.code, notice.message, {
    start: notice.start,
    end: notice.end,
    line: notice.line,
  });
}

function diagnosticsFromSanity(path: ProjectFilePath, sanity: SanityResult): WarningDiagnostic[] {
  const diagnostics = sanity.notices.map((notice) => diagnosticFromNotice(path, notice));
  for (const pair of sanity.intersectingPairs ?? []) {
    diagnostics.push(
      makeWarningDiagnostic(
        path,
        DiagnosticCode.IntersectingConstructs,
        `${pair.openCtx} opened on line ${pair.openLine} intersects ${pair.closeCtx} closing on line ${pair.closeLine}.`,
        { start: pair.closePos, end: pair.closePos, line: pair.closeLine }
      )
    );
  }
  return diagnostics;
}

function sourceOffsetForLine(source: string, requestedLine: number): number {
  if (requestedLine <= 1) return 0;
  let line = 1;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\r') {
      if (source[index + 1] === '\n') index++;
      line++;
    } else if (character === '\n') {
      line++;
    }
    if (line === requestedLine) return index + 1;
  }
  return Math.max(0, source.length - 1);
}

function sourceLineForOffset(source: string, requestedOffset: number): number {
  let line = 1;
  const end = Math.min(requestedOffset, source.length);
  for (let index = 0; index < end; index++) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n') index++;
      line++;
    } else if (source[index] === '\n') {
      line++;
    }
  }
  return line;
}

function syntaxErrorFromParseFailure(
  error: ParseFailure,
  source: string,
  path: ProjectFilePath
): PrepTexSyntaxError {
  const message = error.message;
  let start = 0;
  let line = 1;
  if (error.position !== undefined) {
    start = Math.min(Math.max(0, error.position), Math.max(0, source.length - 1));
    line = error.line ?? sourceLineForOffset(source, start);
  } else if (error.line !== undefined) {
    line = Math.max(1, error.line);
    start = sourceOffsetForLine(source, line);
  }
  const diagnostic = makeSyntaxDiagnostic(path, message, { start, end: start, line });
  return new PrepTexSyntaxError(`Cannot parse "${path}": ${message}`, diagnostic);
}

function syntaxErrorForUnclosed(
  path: ProjectFilePath,
  source: string,
  grouping: { readonly ctx: NodeType; readonly pos: number; readonly line: number }
): PrepTexSyntaxError {
  const start = Math.min(grouping.pos, Math.max(0, source.length - 1));
  const message = `Unclosed ${grouping.ctx} construct opened on line ${grouping.line}.`;
  return new PrepTexSyntaxError(
    `Cannot parse "${path}": ${message}`,
    makeSyntaxDiagnostic(path, message, {
      start,
      end: start,
      line: grouping.line,
    })
  );
}

function validateSourcePath(path: unknown, label: string): ProjectFilePath {
  return normalizeProjectFilePath(path, label);
}

function normalizeLexerOptions(options: ParseOptions | ProjectParseOptions): LexerOptions {
  let enabledTokens: ReadonlySet<TokenType> | undefined;
  if (options.enabledTokens !== undefined) {
    if (!Array.isArray(options.enabledTokens)) {
      throw new PrepTexError(
        'enabledTokens must be an array of TokenType values.',
        PrepTexErrorCode.InvalidArgument
      );
    }
    const validTokens = new Set(Object.values(TokenType));
    for (const token of options.enabledTokens) {
      if (!validTokens.has(token)) {
        throw new PrepTexError(
          `Unsupported token type: ${String(token)}.`,
          PrepTexErrorCode.InvalidArgument
        );
      }
    }
    enabledTokens = new Set(options.enabledTokens);
  }

  const sectionMaxLevel = options.maximumSectionLevel;
  if (
    sectionMaxLevel !== undefined &&
    (!Number.isInteger(sectionMaxLevel) || sectionMaxLevel < 0 || sectionMaxLevel > 5)
  ) {
    throw new PrepTexError(
      'maximumSectionLevel must be an integer from 0 through 5.',
      PrepTexErrorCode.InvalidArgument
    );
  }
  return {
    ...(enabledTokens === undefined ? {} : { enabledTokens }),
    ...(sectionMaxLevel === undefined ? {} : { sectionMaxLevel }),
  };
}

function freezeParseResult(result: ParseResult): ParseResult {
  Object.freeze(result.diagnostics);
  Object.freeze(result.declaredConditions);
  Object.freeze(result.referencedFiles);
  return Object.freeze(result);
}

/**
 * Parses a LaTeX document into a PrepTeX syntax tree.
 *
 * This function is synchronous, does not mutate `source` or `options`, and returns
 * deeply frozen tree data. PrepTeX recognizes a practical structural subset of
 * LaTeX; it does not expand macros or run TeX.
 *
 * @param source - Complete LaTeX source text.
 * @param options - Optional tokenization and source-label settings.
 * @returns The immutable tree, declarations, references, and non-fatal diagnostics.
 * @throws {@link PrepTexSyntaxError} When supported syntax is malformed or unbalanced.
 * @throws {@link PrepTexError} When a runtime argument violates the public contract.
 */
export function parseDocument(source: string, options: ParseOptions = {}): ParseResult {
  if (typeof source !== 'string') {
    throw new PrepTexError('source must be a string.', PrepTexErrorCode.InvalidArgument);
  }
  assertOptionsObject(options);
  const path =
    options.sourcePath === undefined
      ? DEFAULT_SOURCE_PATH
      : validateSourcePath(options.sourcePath, 'sourcePath');
  const lexerOptions = normalizeLexerOptions(options);

  try {
    const sanity = sanityCheck(source, lexerOptions);
    const unclosed = [...(sanity.openedUnclosedGroupings ?? [])].sort((a, b) => a.pos - b.pos)[0];
    if (unclosed) throw syntaxErrorForUnclosed(path, source, unclosed);

    const parser = new Parser(options);
    parser.parse(new Lexer(source, sanity.lexerOptions), source);
    const root = freezeAst(parser.getRoot());
    const diagnostics = [
      ...diagnosticsFromSanity(path, sanity),
      ...parser.getNotices().map((notice) => diagnosticFromNotice(path, notice)),
    ].sort((left, right) => left.range.start - right.range.start);
    for (const diagnostic of diagnostics) freezeDiagnostic(diagnostic);

    return freezeParseResult({
      path,
      root,
      diagnostics,
      declaredConditions: Object.freeze([...parser.getDeclaredConditions()].sort()),
      referencedFiles: Object.freeze([...parser.getInputFiles()]),
    });
  } catch (error) {
    if (error instanceof PrepTexSyntaxError) throw error;
    if (error instanceof ParseFailure) {
      throw syntaxErrorFromParseFailure(error, source, path);
    }
    throw error;
  }
}

function createParsedProject(files: readonly ParsedFile[]): ParsedProject {
  const sortedFiles = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  const conditions = new Set<ConditionName>();
  const diagnostics: WarningDiagnostic[] = [];
  for (const file of sortedFiles) {
    for (const condition of file.declaredConditions) conditions.add(condition);
    diagnostics.push(...file.diagnostics);
  }
  Object.freeze(sortedFiles);
  Object.freeze(diagnostics);
  const declaredConditions = Object.freeze([...conditions].sort());
  return Object.freeze({ files: sortedFiles, declaredConditions, diagnostics });
}

/**
 * Parses a collection of versioned virtual files into an immutable project.
 *
 * Every supplied file is parsed, including files that are not reachable from a
 * later entry point. Paths are normalized to forward-slash project-relative paths.
 * The function is synchronous and does not mutate the input array or its entries.
 *
 * @param files - Versioned virtual source files. Paths must be unique after normalization.
 * @param options - Tokenization settings applied to every file.
 * @returns A transport-safe project containing plain objects and arrays.
 * @throws {@link PrepTexSyntaxError} When any file contains malformed supported syntax.
 * @throws {@link PrepTexError} When a path, source, version, or option is invalid.
 */
export function parseProject(
  files: readonly SourceFile[],
  options: ProjectParseOptions = {}
): ParsedProject {
  if (!Array.isArray(files)) {
    throw new PrepTexError(
      'files must be an array of SourceFile values.',
      PrepTexErrorCode.InvalidArgument
    );
  }
  assertOptionsObject(options);
  normalizeLexerOptions(options);
  const paths = new Set<ProjectFilePath>();
  const parsedFiles: ParsedFile[] = [];

  for (const [index, file] of files.entries()) {
    if (typeof file !== 'object' || file === null) {
      throw new PrepTexError(
        `files[${index}] must be a SourceFile object.`,
        PrepTexErrorCode.InvalidArgument
      );
    }
    const path = validateSourcePath(file.path, `files[${index}].path`);
    if (paths.has(path)) {
      throw new PrepTexError(
        `Duplicate project path: "${path}".`,
        PrepTexErrorCode.InvalidArgument
      );
    }
    paths.add(path);
    if (typeof file.source !== 'string') {
      throw new PrepTexError(
        `Source for "${path}" must be a string.`,
        PrepTexErrorCode.InvalidArgument
      );
    }
    if (typeof file.version !== 'number' || !Number.isFinite(file.version)) {
      throw new PrepTexError(
        `Version for "${path}" must be finite.`,
        PrepTexErrorCode.InvalidArgument
      );
    }

    const parsed = parseDocument(file.source, {
      ...(options.enabledTokens === undefined ? {} : { enabledTokens: options.enabledTokens }),
      ...(options.maximumSectionLevel === undefined
        ? {}
        : { maximumSectionLevel: options.maximumSectionLevel }),
      sourcePath: path,
    });
    parsedFiles.push(Object.freeze({ ...parsed, version: file.version }));
  }

  return createParsedProject(parsedFiles);
}

/**
 * Combines two parsed projects without mutating either input.
 *
 * A file from `updates` replaces the matching base file when its version is greater
 * than or equal to the base version. Canonical, deeply frozen files retain object
 * identity when they win; mutable transported files are copied and frozen first.
 *
 * @param base - Existing parsed project.
 * @param updates - Incremental files to add or replace.
 * @returns A new immutable project snapshot.
 * @throws {@link PrepTexError} When either snapshot violates the public data contract.
 */
export function mergeProjects(base: ParsedProject, updates: ParsedProject): ParsedProject {
  const baseFiles = normalizeParsedProjectFiles(base, 'base');
  const updateFiles = normalizeParsedProjectFiles(updates, 'updates');
  const byPath = new Map(baseFiles.map((file) => [file.path, file]));
  for (const file of updateFiles) {
    const existing = byPath.get(file.path);
    if (!existing || file.version >= existing.version) byPath.set(file.path, file);
  }
  return createParsedProject([...byPath.values()]);
}

function collectDeclaredConditions(root: AstRoot): readonly ConditionName[] {
  const conditions = new Set<ConditionName>();
  const stack: AstNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === NodeType.ConditionDeclaration) conditions.add(node.name);
    if (isContainerNode(node)) {
      for (const child of node.children) stack.push(child);
    }
  }
  return [...conditions];
}

function createTransformers(
  options: SerializeOptions,
  declaredConditions: readonly ConditionName[]
): Transformer[] {
  const transformers: Transformer[] = [];
  if (options.suppressComments !== undefined && typeof options.suppressComments !== 'boolean') {
    throw new PrepTexError('suppressComments must be a boolean.', PrepTexErrorCode.InvalidArgument);
  }
  if (options.suppressComments) transformers.push(suppressComments);
  if (options.enabledConditions !== undefined) {
    if (!Array.isArray(options.enabledConditions)) {
      throw new PrepTexError(
        'enabledConditions must be an array of condition names.',
        PrepTexErrorCode.InvalidArgument
      );
    }
    if (options.enabledConditions.some((name) => typeof name !== 'string')) {
      throw new PrepTexError(
        'Every enabled condition name must be a string.',
        PrepTexErrorCode.InvalidArgument
      );
    }
    transformers.push(filterConditions(options.enabledConditions, declaredConditions));
  }
  return transformers;
}

/**
 * Serializes one parsed syntax tree back to LaTeX.
 *
 * With no options, this preserves the source spelling represented by the tree.
 * Transformations are read-only and node objects and IDs retain their identity.
 * `\input` commands are always preserved because no project is available here.
 *
 * @param root - Immutable tree returned by {@link parseDocument} or {@link parseProject}.
 * @param options - Optional comment and conditional transformations.
 * @returns Serialized LaTeX source.
 * @throws {@link PrepTexError} When the tree or a runtime option is invalid.
 */
export function serializeDocument(root: AstRoot, options: SerializeOptions = {}): string {
  assertOptionsObject(options);
  const validatedRoot = validateAstRoot(root);
  const conditions = collectDeclaredConditions(validatedRoot);
  return renderAst(validatedRoot, createTransformers(options, conditions));
}

/**
 * Transforms a parsed project into one or more LaTeX output files.
 *
 * The operation is synchronous and does not mutate the project or its trees.
 * Relative `\input` paths are resolved from the including file. Flattening rejects
 * missing, ambiguous, and circular inputs with typed errors.
 *
 * @param entryPath - Project-relative path of the entry file.
 * @param project - Project returned by {@link parseProject} or {@link mergeProjects}.
 * @param options - Serialization and input-handling settings.
 * @returns Immutable generated files. `Separate` emits every project file; other modes emit one.
 * @throws {@link PrepTexError} When an argument is invalid, the entry is absent, or
 * an input target is unresolved or circular.
 */
export function transformProject(
  entryPath: ProjectFilePath,
  project: ParsedProject,
  options: TransformOptions = {}
): TransformResult {
  assertOptionsObject(options);
  const normalizedEntry = validateSourcePath(entryPath, 'entryPath');
  const validatedProject = validateParsedProject(project);
  const byPath = new Map(validatedProject.files.map((file) => [file.path, file]));
  const entry = byPath.get(normalizedEntry);
  if (!entry) {
    throw new PrepTexError(
      `Project entry not found: "${normalizedEntry}".`,
      PrepTexErrorCode.MissingEntry
    );
  }

  const roots: Record<ProjectFilePath, AstRoot> = Object.create(null) as Record<
    ProjectFilePath,
    AstRoot
  >;
  for (const file of validatedProject.files) roots[file.path] = file.root;
  const transformers = createTransformers(options, validatedProject.declaredConditions);
  const mode = options.inputHandling ?? InputHandlingMode.Preserve;
  if (!Object.values(InputHandlingMode).includes(mode)) {
    throw new PrepTexError(
      `Unsupported inputHandling mode: ${String(mode)}.`,
      PrepTexErrorCode.InvalidArgument
    );
  }

  const generated: TransformedFile[] = [];
  if (mode === InputHandlingMode.Separate) {
    for (const file of validatedProject.files) {
      generated.push(
        Object.freeze({
          path: file.path,
          source: renderAst(file.root, transformers, roots, { sourcePath: file.path }),
        })
      );
    }
  } else {
    generated.push(
      Object.freeze({
        path: entry.path,
        source: renderAst(entry.root, transformers, roots, {
          flatten: mode === InputHandlingMode.Flatten,
          sourcePath: entry.path,
        }),
      })
    );
  }

  Object.freeze(generated);
  return Object.freeze({ files: generated });
}
