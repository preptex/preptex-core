import type { SourceFile } from '../../api-types.js';
import type {
  BranchContext,
  FactContext,
  LiteralArgument,
  NormalizedScanOptions,
  ProjectIssue,
  ScannedFile,
  SyntaxFact,
} from '../../project-types.js';
import { coverage, issue, lineStarts, rangeAt, testKind } from './shared.js';
import {
  matchVerbatimTokens,
  readBracedGroupTokens,
  readDefinitionTokens,
  readOptionalBracketTokens,
  skipTriviaTokens,
  spliceVerbatimMatch,
  tokenizeFile,
  type BracedGroupTokenMatch,
} from './tokenize.js';

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

export function literalFromGroup(
  arg: BracedGroupTokenMatch | null,
  starts: readonly number[]
): LiteralArgument {
  if (arg && arg.text.length > 0 && !/[\\{}%#\r\n]/.test(arg.text)) {
    return {
      kind: 'literal',
      value: arg.text,
      range: rangeAt(starts, arg.innerStart, arg.innerEnd),
    };
  }
  return {
    kind: 'unresolved',
    source: arg?.text ?? '',
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
  const tokens = tokenizeFile(source);
  let scanTokens: readonly (typeof tokens)[number][] = tokens;
  const issues: ProjectIssue[] = [];
  const facts: SyntaxFact[] = [];

  function scan(
    fromIndex: number,
    untilIndex: number,
    fromOffset: number,
    untilOffset: number,
    context: FactContext,
    depth: number
  ): number {
    if (depth > options.maxNesting) {
      issues.push(
        issue('scan-limit', 'Inventory nesting limit reached; the remaining region is retained.', {
          path: file.path,
          range: rangeAt(starts, fromOffset, untilOffset - 1),
        })
      );
      return 0;
    }
    let totalDelta = 0;
    const branches: BranchContext[] = [...context.branches];
    const inheritedBranches = branches.length;
    for (let idx = fromIndex; idx < untilIndex;) {
      const token = scanTokens[idx]!;
      idx++;
      if (token.kind !== 'command') continue;

      if (token.name === 'verb' || token.name === 'begin') {
        let verb = matchVerbatimTokens(scanTokens, token.index, options.verbatimEnvironments);
        if (verb) {
          if (verb.error) {
            issues.push(
              issue(
                'malformed-syntax',
                verb.error,
                { path: file.path, range: rangeAt(starts, verb.startOffset, verb.endOffset) },
                'error'
              )
            );
          } else {
            const spliced = spliceVerbatimMatch(scanTokens, verb, source, starts);
            if (spliced) {
              scanTokens = spliced.tokens;
              verb = spliced.verb;
              untilIndex += spliced.delta;
              totalDelta += spliced.delta;
            }
          }
          idx = verb.endIndex + 1;
          continue;
        }
      }

      const makeBase = (
        endOffset = token.range.end + 1,
        recognition: 'recognized' | 'candidate' = 'recognized'
      ) => ({
        id: '',
        path: file.path,
        range: rangeAt(starts, token.range.start, endOffset - 1),
        context: { ...context, branches: [...branches] },
        recognition,
      });

      if (DEFINITIONS.has(token.name)) {
        const def = readDefinitionTokens(scanTokens, token.index, untilIndex);
        facts.push({
          ...makeBase(def.endOffset, def.valid ? 'recognized' : 'candidate'),
          kind: 'definition',
          name: def.name,
          form: token.name,
          starred: def.starred,
          arguments: def.arguments.map((a) => rangeAt(starts, a.innerStart, a.innerEnd)),
          body: def.body ? rangeAt(starts, def.body.innerStart, def.body.innerEnd) : null,
        });
        let nextIndex = def.body ? def.nextIndex : untilIndex;
        if (def.body) {
          let argShift = 0;
          for (const arg of def.arguments) {
            const d = scan(
              arg.innerStartIndex + argShift,
              arg.innerEndIndex + 1 + argShift,
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
            argShift += d;
          }
          const bodyRange = rangeAt(starts, def.body.innerStart, def.body.innerEnd);
          const bodyDelta = scan(
            def.body.innerStartIndex + argShift,
            def.body.innerEndIndex + 1 + argShift,
            def.body.innerStart,
            def.body.innerEnd + 1,
            {
              ...context,
              branches: [...branches],
              definitionBodies: [...context.definitionBodies, bodyRange],
            },
            depth + 1
          );
          const combined = argShift + bodyDelta;
          untilIndex += combined;
          totalDelta += combined;
          nextIndex += combined;
        }
        if (!def.valid) {
          issues.push(
            issue(
              'malformed-syntax',
              'Unrecognized or unterminated command definition.',
              {
                path: file.path,
                range: rangeAt(
                  starts,
                  token.range.start,
                  Math.max(token.range.end + 1, def.endOffset) - 1
                ),
              },
              'error'
            )
          );
        }
        idx = nextIndex;
        continue;
      }

      if (UNSUPPORTED_DEFINITIONS.has(token.name)) {
        facts.push({
          ...makeBase(token.range.end + 1, 'candidate'),
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
            { path: file.path, range: rangeAt(starts, token.range.start, untilOffset - 1) }
          )
        );
        break;
      }

      facts.push({ ...makeBase(), kind: 'command-use', name: token.name });

      if (token.name === 'newif') {
        const nextIdx = skipTriviaTokens(scanTokens, idx, untilIndex);
        const target = nextIdx < untilIndex ? scanTokens[nextIdx]! : null;
        const name =
          target?.kind === 'command' &&
          /^if[A-Za-z]+$/.test(target.name) &&
          testKind(target.name) === 'named-candidate'
            ? target.name.slice(2)
            : null;
        const targetEnd = target ? target.range.end + 1 : token.range.end + 1;
        facts.push({
          ...makeBase(targetEnd, name ? 'recognized' : 'candidate'),
          kind: 'condition-declaration',
          name,
        });
        if (!name) {
          issues.push(
            issue(
              'malformed-syntax',
              'newif requires a direct named boolean target.',
              {
                path: file.path,
                range: rangeAt(starts, token.range.start, targetEnd - 1),
              },
              'error'
            )
          );
        }
        idx = target ? nextIdx + 1 : idx;
        continue;
      }

      const kind = testKind(token.name);
      if (kind) {
        facts.push({
          ...makeBase(token.range.end + 1, kind === 'named-candidate' ? 'candidate' : 'recognized'),
          kind: 'condition-test',
          command: token.name,
          testKind: kind,
        });
        branches.push({
          test: rangeAt(starts, token.range.start, token.range.end),
          arm: 'then',
        });
      } else if (token.name === 'else' || token.name === 'fi') {
        facts.push({ ...makeBase(), kind: 'condition-delimiter', delimiter: token.name });
        if (branches.length > inheritedBranches) {
          if (token.name === 'fi') branches.pop();
          else branches[branches.length - 1] = { ...branches[branches.length - 1]!, arm: 'else' };
        }
      }

      const setter = /^([A-Za-z]+)(true|false)$/.exec(token.name);
      if (setter && !kind) {
        facts.push({
          ...makeBase(token.range.end + 1, 'candidate'),
          kind: 'condition-assignment',
          name: setter[1]!,
          value: setter[2] === 'true',
        });
      }
      if (kind || setter || token.name === 'else' || token.name === 'fi' || token.name === 'global')
        continue;

      if (
        token.name === 'input' ||
        token.name === 'label' ||
        ['ref', 'pageref', 'eqref'].includes(token.name)
      ) {
        const arg = readBracedGroupTokens(scanTokens, idx, untilIndex);
        const key = literalFromGroup(arg, starts);
        const base = makeBase(
          arg?.end ?? token.range.end + 1,
          key.kind === 'literal' ? 'recognized' : 'candidate'
        );
        if (token.name === 'input') facts.push({ ...base, kind: 'input', target: key });
        else if (token.name === 'label') facts.push({ ...base, kind: 'label', key });
        else if (token.name === 'ref' || token.name === 'pageref' || token.name === 'eqref')
          facts.push({ ...base, kind: 'reference', command: token.name, key });
        if (!arg) {
          issues.push(
            issue(
              'opaque-region',
              `No complete braced argument for \\${token.name}; subsequent syntax has limited coverage.`,
              { path: file.path, range: rangeAt(starts, token.range.start, untilOffset - 1) }
            )
          );
        }
      }

      // Inventory contents of braced arguments as stored syntax, never document execution.
      let argIdx = idx;
      let argCharOffset = 0;
      if (
        argIdx < untilIndex &&
        scanTokens[argIdx]!.kind === 'text' &&
        scanTokens[argIdx]!.value.startsWith('*')
      ) {
        if (scanTokens[argIdx]!.value.length === 1) argIdx++;
        else argCharOffset = 1;
      }
      const opt = readOptionalBracketTokens(scanTokens, argIdx, untilIndex, argCharOffset);
      if (opt) {
        const region = rangeAt(starts, opt.innerStart, opt.innerEnd);
        const subDelta = scan(
          opt.innerStartIndex,
          opt.innerEndIndex + 1,
          opt.innerStart,
          opt.innerEnd + 1,
          {
            ...context,
            branches: [...branches],
            opaqueArguments: [...context.opaqueArguments, region],
          },
          depth + 1
        );
        untilIndex += subDelta;
        totalDelta += subDelta;
        argIdx = (opt.nextCharOffset > 0 ? opt.nextIndex + 1 : opt.nextIndex) + subDelta;
      } else if (argCharOffset > 0) {
        argIdx++;
      }

      const knownCount =
        storedArgumentCount(token.name) ??
        (sectionLevel(token.name) !== undefined || TEXT_ARGUMENTS.has(token.name) ? 1 : undefined);
      let consumed = 0;
      while (knownCount === undefined || consumed < knownCount) {
        const arg = readBracedGroupTokens(scanTokens, argIdx, untilIndex);
        if (!arg) break;
        const region = rangeAt(starts, arg.innerStart, arg.innerEnd);
        const subDelta = scan(
          arg.innerStartIndex,
          arg.innerEndIndex + 1,
          arg.innerStart,
          arg.innerEnd + 1,
          {
            ...context,
            branches: [...branches],
            opaqueArguments: [...context.opaqueArguments, region],
          },
          depth + 1
        );
        untilIndex += subDelta;
        totalDelta += subDelta;
        argIdx = arg.nextIndex + subDelta;
        consumed++;
      }
      if (argIdx > idx) idx = argIdx;
    }
    return totalDelta;
  }

  let startTokenIndex = 0;
  if (inventoryFrom > 0) {
    while (
      startTokenIndex < tokens.length &&
      tokens[startTokenIndex]!.range.start < inventoryFrom
    ) {
      startTokenIndex++;
    }
  }
  scan(
    startTokenIndex,
    tokens.length,
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
