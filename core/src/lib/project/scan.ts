import type { SourceFile, SourceRange } from '../../api-types.js';
import type {
  BranchContext,
  FactContext,
  LiteralArgument,
  NormalizedScanOptions,
  ProjectIssue,
  ScannedFile,
  SourceToken,
  SyntaxFact,
} from '../../project-types.js';
import { coverage, issue, lineStarts, rangeAt, testKind } from './shared.js';

export interface Lexeme {
  kind: SourceToken['kind'];
  start: number;
  end: number;
  value: string;
  name: string;
  error?: string;
}

export function lex(
  source: string,
  start: number,
  options: NormalizedScanOptions,
  protectedMode = true
): Lexeme {
  const c = source[start]!;
  let end = start + 1;
  let kind: SourceToken['kind'] = 'text';
  let name = '';
  let error: string | undefined;
  if (c === '%') {
    kind = 'comment';
    while (end < source.length && source[end] !== '\r' && source[end] !== '\n') end++;
    if (source[end] === '\r') end++;
    if (source[end] === '\n') end++;
  } else if (/\s/.test(c)) {
    kind = 'space';
    while (end < source.length && /\s/.test(source[end]!)) end++;
  } else if (c === '{') kind = 'open';
  else if (c === '}') kind = 'close';
  else if (c === '$') {
    kind = 'math';
    if (source[end] === '$') end++;
  } else if (c === '\\') {
    kind = 'command';
    if (/[A-Za-z@]/.test(source[end] ?? '')) {
      while (end < source.length && /[A-Za-z@]/.test(source[end]!)) end++;
    } else if (end < source.length) end++;
    name = source.slice(start + 1, end);
    if (['(', ')', '[', ']'].includes(name)) kind = 'math';
    if (protectedMode && name === 'verb') {
      if (source[end] === '*') end++;
      const delimiter = source[end];
      kind = 'verbatim';
      if (delimiter === undefined || /\s/.test(delimiter))
        error = 'Missing inline verbatim delimiter.';
      else {
        end++;
        while (end < source.length && source[end] !== delimiter && !/[\r\n]/.test(source[end]!))
          end++;
        if (source[end] === delimiter) end++;
        else error = 'Unterminated inline verbatim region; recovery starts at the next line.';
      }
    } else if (protectedMode && name === 'begin') {
      const match = /^\s*\{([A-Za-z*]+)\}/.exec(source.slice(end));
      if (match && options.verbatimEnvironments.includes(match[1]!)) {
        const closing = `\\end{${match[1]}}`;
        const found = source.indexOf(closing, end + match[0].length);
        end = found < 0 ? source.length : found + closing.length;
        kind = 'verbatim';
        if (found < 0) error = 'Unterminated protected environment; coverage stops at its opener.';
      }
    }
  } else {
    while (end < source.length && !/[\\%{}$\s]/.test(source[end]!)) end++;
  }
  return { kind, start, end, value: source.slice(start, end), name, ...(error ? { error } : {}) };
}

export function skipTrivia(source: string, start: number, options: NormalizedScanOptions): number {
  let pos = start;
  while (pos < source.length) {
    const token = lex(source, pos, options, false);
    if (token.kind !== 'space' && token.kind !== 'comment') break;
    pos = token.end;
  }
  return pos;
}

export interface Argument {
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
  value: string;
}

export function argument(
  source: string,
  from: number,
  options: NormalizedScanOptions,
  optional = false
): Argument | null {
  const start = skipTrivia(source, from, options);
  const open = optional ? '[' : '{';
  if (source[start] !== open) return null;
  let depth = 1;
  let braces = 0;
  let pos = start + 1;
  while (pos < source.length) {
    const t = lex(source, pos, options, false);
    if (!optional) {
      if (t.kind === 'open') depth++;
      if (t.kind === 'close') depth--;
      if (!depth)
        return {
          start,
          end: t.end,
          innerStart: start + 1,
          innerEnd: t.start - 1,
          value: source.slice(start + 1, t.start),
        };
    } else {
      if (t.kind === 'open') braces++;
      if (t.kind === 'close') braces--;
      // Brackets are text tokens; examine their characters only outside braces.
      if (braces === 0 && t.kind === 'text') {
        for (let i = t.start; i < t.end; i++) {
          if (source[i] === '[') depth++;
          if (source[i] === ']') depth--;
          if (!depth)
            return {
              start,
              end: i + 1,
              innerStart: start + 1,
              innerEnd: i - 1,
              value: source.slice(start + 1, i),
            };
        }
      }
    }
    pos = t.end;
  }
  return null;
}

export const DEFINITIONS = new Set(['newcommand', 'renewcommand', 'providecommand', 'def']);
export const UNSUPPORTED_DEFINITIONS = new Set([
  'gdef',
  'edef',
  'xdef',
  'let',
  'futurelet',
  'DeclareRobustCommand',
  'NewDocumentCommand',
  'RenewDocumentCommand',
  'ProvideDocumentCommand',
  'DeclareDocumentCommand',
]);
export const SECTIONS: Readonly<Record<string, 1 | 2 | 3 | 4 | 5>> = {
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};
export const STORED_ARGUMENTS: Readonly<Record<string, number>> = {
  label: 1,
  ref: 1,
  pageref: 1,
  eqref: 1,
  input: 1,
  begin: 1,
  end: 1,
  documentclass: 1,
  usepackage: 1,
  RequirePackage: 1,
  title: 1,
  author: 1,
  date: 1,
  cite: 1,
  citep: 1,
  citet: 1,
  url: 1,
  href: 2,
  includegraphics: 1,
};
export const TEXT_ARGUMENTS = new Set([
  'textbf',
  'textit',
  'textrm',
  'textsf',
  'texttt',
  'emph',
  'underline',
  'mbox',
]);
export function sectionLevel(name: string): 1 | 2 | 3 | 4 | 5 | undefined {
  return Object.prototype.hasOwnProperty.call(SECTIONS, name) ? SECTIONS[name] : undefined;
}
export function storedArgumentCount(name: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(STORED_ARGUMENTS, name)
    ? STORED_ARGUMENTS[name]
    : undefined;
}

export interface Definition {
  name: string | null;
  starred: boolean;
  end: number;
  body: Argument | null;
  arguments: Argument[];
  valid: boolean;
}

export function definition(
  source: string,
  token: Lexeme,
  options: NormalizedScanOptions
): Definition {
  let pos = token.end;
  let starred = false;
  if (source[pos] === '*') {
    starred = true;
    pos++;
  }
  pos = skipTrivia(source, pos, options);
  let name: string | null = null;
  if (source[pos] === '\\') {
    const target = lex(source, pos, options, false);
    if (target.kind === 'command' && /^[A-Za-z@]+$/.test(target.name)) name = target.name;
    pos = target.end;
  } else if (token.name !== 'def') {
    const target = argument(source, pos, options);
    if (target) {
      name = /^\\([A-Za-z@]+)$/.exec(target.value.trim())?.[1] ?? null;
      pos = target.end;
    }
  }
  const args: Argument[] = [];
  if (token.name === 'def') {
    const parameterStart = pos;
    while (pos < source.length) {
      const t = lex(source, pos, options, false);
      if (t.kind === 'open') break;
      pos = t.end;
    }
    if (pos > parameterStart)
      args.push({
        start: parameterStart,
        end: pos,
        innerStart: parameterStart,
        innerEnd: pos - 1,
        value: source.slice(parameterStart, pos),
      });
  } else {
    for (let i = 0; i < 2; i++) {
      const arg = argument(source, pos, options, true);
      if (!arg) break;
      args.push(arg);
      pos = arg.end;
    }
  }
  const body = argument(source, pos, options);
  const valid =
    Boolean(name && body) &&
    (token.name === 'def' ||
      args.length === 0 ||
      (/^[0-9]$/.test(args[0]!.value.trim()) &&
        (args.length === 1 || args[0]!.value.trim() !== '0')));
  return {
    name,
    starred,
    end: body?.end ?? Math.max(pos, token.end),
    body,
    arguments: args,
    valid,
  };
}

export function literal(arg: Argument | null, starts: readonly number[]): LiteralArgument {
  if (arg && arg.value.length > 0 && !/[\\{}%#\r\n]/.test(arg.value))
    return {
      kind: 'literal',
      value: arg.value,
      range: rangeAt(starts, arg.innerStart, arg.innerEnd),
    };
  return {
    kind: 'unresolved',
    source: arg?.value ?? '',
    range: arg ? rangeAt(starts, arg.innerStart, arg.innerEnd) : null,
  };
}

export function scanFile(
  file: SourceFile,
  options: NormalizedScanOptions,
  inventoryFrom = 0
): ScannedFile {
  const source = file.source;
  const starts = lineStarts(source);
  const tokens: SourceToken[] = [];
  const issues: ProjectIssue[] = [];
  for (let pos = 0; pos < source.length; ) {
    const token = lex(source, pos, options);
    const range = rangeAt(starts, pos, token.end - 1);
    tokens.push({ kind: token.kind, value: token.value, range });
    if (token.error)
      issues.push(issue('malformed-syntax', token.error, { path: file.path, range }, 'error'));
    pos = token.end;
  }
  const facts: SyntaxFact[] = [];
  function scan(from: number, until: number, context: FactContext, depth: number): void {
    if (depth > options.maxNesting) {
      issues.push(
        issue('scan-limit', 'Inventory nesting limit reached; the remaining region is retained.', {
          path: file.path,
          range: rangeAt(starts, from, until - 1),
        })
      );
      return;
    }
    const branches: BranchContext[] = [...context.branches];
    const inheritedBranches = branches.length;
    for (let pos = from; pos < until; ) {
      const token = lex(source, pos, options);
      pos = token.end;
      if (token.kind !== 'command') continue;
      const makeBase = (
        end = token.end,
        recognition: 'recognized' | 'candidate' = 'recognized'
      ) => ({
        id: '',
        path: file.path,
        range: rangeAt(starts, token.start, end - 1),
        context: { ...context, branches: [...branches] },
        recognition,
      });
      if (DEFINITIONS.has(token.name)) {
        const def = definition(source, token, options);
        facts.push({
          ...makeBase(def.end, def.valid ? 'recognized' : 'candidate'),
          kind: 'definition',
          name: def.name,
          form: token.name,
          starred: def.starred,
          arguments: def.arguments.map((a) => rangeAt(starts, a.innerStart, a.innerEnd)),
          body: def.body ? rangeAt(starts, def.body.innerStart, def.body.innerEnd) : null,
        });
        if (def.body) {
          const bodyRange = rangeAt(starts, def.body.innerStart, def.body.innerEnd);
          scan(
            def.body.innerStart,
            def.body.innerEnd + 1,
            {
              ...context,
              branches: [...branches],
              definitionBodies: [...context.definitionBodies, bodyRange],
            },
            depth + 1
          );
          for (const arg of def.arguments)
            scan(
              arg.innerStart,
              arg.innerEnd + 1,
              {
                ...context,
                branches: [...branches],
                definitionBodies: [
                  ...context.definitionBodies,
                  rangeAt(starts, arg.innerStart, arg.innerEnd),
                ],
              },
              depth + 1
            );
        }
        if (!def.valid)
          issues.push(
            issue(
              'malformed-syntax',
              'Unrecognized or unterminated command definition.',
              {
                path: file.path,
                range: rangeAt(starts, token.start, Math.max(token.end, def.end) - 1),
              },
              'error'
            )
          );
        pos = def.body ? def.end : until;
        continue;
      }
      if (UNSUPPORTED_DEFINITIONS.has(token.name)) {
        facts.push({
          ...makeBase(token.end, 'candidate'),
          kind: 'definition',
          name: null,
          form: token.name,
          starred: false,
          arguments: [],
          body: null,
        });
        issues.push(
          issue(
            'opaque-region',
            `Unsupported definition form \\${token.name}; coverage of the remaining region is limited.`,
            { path: file.path, range: rangeAt(starts, token.start, until - 1) }
          )
        );
        // No invented document uses in an unsupported stored body.
        break;
      }
      facts.push({ ...makeBase(), kind: 'command-use', name: token.name });
      if (token.name === 'newif') {
        const next = skipTrivia(source, token.end, options);
        const target = next < until ? lex(source, next, options, false) : null;
        const name =
          target?.kind === 'command' &&
          /^if[A-Za-z]+$/.test(target.name) &&
          testKind(target.name) === 'named-candidate'
            ? target.name.slice(2)
            : null;
        facts.push({
          ...makeBase(target?.end ?? token.end, name ? 'recognized' : 'candidate'),
          kind: 'condition-declaration',
          name,
        });
        if (!name)
          issues.push(
            issue(
              'malformed-syntax',
              'newif requires a direct named boolean target.',
              {
                path: file.path,
                range: rangeAt(starts, token.start, (target?.end ?? token.end) - 1),
              },
              'error'
            )
          );
        pos = target?.end ?? token.end;
        continue;
      }
      const kind = testKind(token.name);
      if (kind) {
        facts.push({
          ...makeBase(token.end, kind === 'named-candidate' ? 'candidate' : 'recognized'),
          kind: 'condition-test',
          command: token.name,
          testKind: kind,
        });
        branches.push({ test: rangeAt(starts, token.start, token.end - 1), arm: 'then' });
      } else if (token.name === 'else' || token.name === 'fi') {
        facts.push({ ...makeBase(), kind: 'condition-delimiter', delimiter: token.name });
        if (branches.length > inheritedBranches) {
          if (token.name === 'fi') branches.pop();
          else branches[branches.length - 1] = { ...branches[branches.length - 1]!, arm: 'else' };
        }
      }
      const setter = /^([A-Za-z]+)(true|false)$/.exec(token.name);
      if (setter && !kind)
        facts.push({
          ...makeBase(token.end, 'candidate'),
          kind: 'condition-assignment',
          name: setter[1]!,
          value: setter[2] === 'true',
        });
      if (kind || setter || token.name === 'else' || token.name === 'fi' || token.name === 'global')
        continue;
      if (
        token.name === 'input' ||
        token.name === 'label' ||
        ['ref', 'pageref', 'eqref'].includes(token.name)
      ) {
        const arg = argument(source, pos, options);
        const key = literal(arg, starts);
        const base = makeBase(
          arg?.end ?? token.end,
          key.kind === 'literal' ? 'recognized' : 'candidate'
        );
        if (token.name === 'input') facts.push({ ...base, kind: 'input', target: key });
        else if (token.name === 'label') facts.push({ ...base, kind: 'label', key });
        else if (token.name === 'ref' || token.name === 'pageref' || token.name === 'eqref')
          facts.push({ ...base, kind: 'reference', command: token.name, key });
        if (!arg)
          issues.push(
            issue(
              'opaque-region',
              `No complete braced argument for \\${token.name}; subsequent syntax has limited coverage.`,
              { path: file.path, range: rangeAt(starts, token.start, until - 1) }
            )
          );
      }
      // Inventory contents of braced arguments as stored syntax, never document execution.
      let argPos = pos;
      if (source[argPos] === '*') argPos++;
      const opt = argument(source, argPos, options, true);
      if (opt) {
        const region = rangeAt(starts, opt.innerStart, opt.innerEnd);
        scan(
          opt.innerStart,
          opt.innerEnd + 1,
          {
            ...context,
            branches: [...branches],
            opaqueArguments: [...context.opaqueArguments, region],
          },
          depth + 1
        );
        argPos = opt.end;
      }
      const knownCount =
        storedArgumentCount(token.name) ??
        (sectionLevel(token.name) !== undefined || TEXT_ARGUMENTS.has(token.name) ? 1 : undefined);
      let consumed = 0;
      while (knownCount === undefined || consumed < knownCount) {
        const arg = argument(source, argPos, options);
        if (!arg) break;
        const region = rangeAt(starts, arg.innerStart, arg.innerEnd);
        scan(
          arg.innerStart,
          arg.innerEnd + 1,
          {
            ...context,
            branches: [...branches],
            opaqueArguments: [...context.opaqueArguments, region],
          },
          depth + 1
        );
        argPos = arg.end;
        consumed++;
      }
      if (argPos > pos) pos = argPos;
    }
  }
  scan(
    inventoryFrom,
    source.length,
    { branches: [], definitionBodies: [], opaqueArguments: [] },
    0
  );
  facts.sort(
    (a, b) => a.range.start - b.range.start || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
  );
  const identified = facts.map((fact, index) => ({ ...fact, id: `f${index}` }));
  issues.sort((a, b) => (a.location?.range.start ?? 0) - (b.location?.range.start ?? 0));
  return { ...file, tokens, facts: identified, coverage: coverage(issues) };
}
