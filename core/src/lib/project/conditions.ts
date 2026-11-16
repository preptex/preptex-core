import type { SourceRange } from '../../api-types.js';
import type {
  ConditionDecision,
  ConditionPolicy,
  ConditionRealizationRequest,
  ConditionRealizationResult,
  GeneratedArtifact,
  InputOccurrence,
  OperationProvenance,
  ProjectEditPlan,
  ProjectIssue,
  ProjectIssueCode,
  ProjectSnapshot,
  ReachedFact,
  ScannedFile,
  SelectedToken,
  SourceOrigin,
  SourceScope,
  SourceToken,
  ViewLimits,
} from '../../project-types.js';
import { normalizeVirtualPath, virtualDirname, withTexExtension } from '../virtual-path.js';
import { normalizeProjectFilePath } from '../validation.js';
import { normalizeConditionPolicy, normalizeViewLimits } from './configuration.js';
import { dependencies, emit, sourceCopier, type Segment } from './emission.js';
import { reject } from './fail.js';
import { DEFINITIONS, literalFromGroup, scanFile, UNSUPPORTED_DEFINITIONS } from './scan.js';
import {
  bounded,
  coverage,
  fields,
  freeze,
  identity,
  invalid,
  issue,
  lineStarts,
  ORDINARY_IF_COMMANDS,
  rangeAt,
  record,
  testKind,
} from './shared.js';
import { normalizeScope, validateSnapshot } from './snapshot.js';
import { sourceChanges, type TextChange } from './text-edits.js';
import {
  matchVerbatimTokens,
  readBracedGroupTokens,
  readDefinitionTokens,
  readOptionalBracketTokens,
  skipTriviaTokens,
  spliceVerbatimMatch,
} from './tokenize.js';

const OPAQUE_KEY_ARGUMENTS: Readonly<Record<string, number>> = {
  label: 1,
  ref: 1,
  pageref: 1,
  eqref: 1,
  input: 1,
  documentclass: 1,
  usepackage: 1,
  RequirePackage: 1,
  cite: 1,
  citep: 1,
  citet: 1,
  url: 1,
  href: 1,
  includegraphics: 1,
};

type Binding =
  | { readonly kind: 'test'; readonly flag: string }
  | { readonly kind: 'setter'; readonly flag: string; readonly value: boolean }
  | { readonly kind: 'opaque' };

interface ConditionalFrame {
  readonly testTokenIndex: number;
  elseTokenIndex: number | null;
  readonly parentActive: boolean;
  readonly value: boolean;
  elseSeen: boolean;
  readonly origin: SourceOrigin;
}

export interface RawRemovalItem {
  readonly start: number;
  readonly end: number;
  readonly eatInlineSpace: boolean;
  readonly hasBranch: boolean;
}

export interface OccurrenceTrace {
  readonly occurrence: InputOccurrence;
  readonly file: ScannedFile;
  tokens: readonly SourceToken[];
  readonly starts: readonly number[];
  readonly conditionRemovals: RawRemovalItem[];
  readonly scaffoldingRemovals: RawRemovalItem[];
  readonly activeTokens: Set<number>;
  readonly tokenInterpretations: Map<number, 'structure' | 'opaque' | 'verbatim'>;
  readonly activeInputExpansions: Map<
    number,
    { readonly endTokenIndex: number; readonly endOffset: number; readonly childTraceIndex: number }
  >;
}

interface EvalFrame {
  readonly file: ScannedFile;
  tokens: readonly SourceToken[];
  readonly occurrence: InputOccurrence;
  readonly trace: OccurrenceTrace;
  readonly traceIndex: number;
  tokenIndex: number;
  readonly conditions: ConditionalFrame[];
  readonly starts: readonly number[];
}

export interface ConditionStreamConfig {
  readonly entryFiles: readonly ScannedFile[];
  readonly traversal: 'project' | 'file-only';
  readonly stopOnFileOnlyInput: boolean;
  readonly inlineInputs: boolean;
  readonly stripDeclarationsAndSetters: boolean;
  readonly conditions: ConditionPolicy;
  readonly limits: Required<ViewLimits>;
}

export interface ConditionStreamEvaluation {
  readonly occurrences: readonly InputOccurrence[];
  readonly traces: readonly OccurrenceTrace[];
  readonly rootTraceIndices: readonly number[];
  readonly decisions: readonly ConditionDecision[];
  readonly reachedFacts: readonly ReachedFact[];
  readonly selectedTokens: readonly SelectedToken[];
  readonly failure: {
    readonly status: 'incomplete' | 'blocked';
    readonly reason: ProjectIssue;
  } | null;
}

const UNSUPPORTED_EFFECTS = new Set([
  'include',
  'includeonly',
  'catcode',
  'makeatletter',
  'makeatother',
  'csname',
  'endcsname',
  'expandafter',
  'noexpand',
  'unless',
  'aftergroup',
  'afterassignment',
  'globaldefs',
  'begingroup',
  'endgroup',
  'bgroup',
  'egroup',
  'long',
  'outer',
  'protected',
]);

/**
 * Expand raw condition/scaffolding removal items into sorted, non-overlapping half-open
 * character intervals `[start, endExcl)` applying standalone-line and inline-space cleanup.
 */
export function expandRemovalIntervals(
  source: string,
  rawItems: readonly RawRemovalItem[]
): { start: number; endExcl: number }[] {
  if (rawItems.length === 0) return [];
  const sorted = [...rawItems].sort((a, b) => a.start - b.start || a.end - b.end);
  const mergedRaw: {
    start: number;
    end: number;
    eatInlineSpace: boolean;
    hasBranch: boolean;
  }[] = [];

  for (const item of sorted) {
    const prev = mergedRaw[mergedRaw.length - 1];
    if (
      prev &&
      (item.start <= prev.end + 1 || /^[ \t]+$/.test(source.slice(prev.end + 1, item.start)))
    ) {
      if (item.end >= prev.end) {
        prev.end = item.end;
        prev.eatInlineSpace = item.eatInlineSpace;
      }
      prev.hasBranch = prev.hasBranch || item.hasBranch;
    } else {
      mergedRaw.push({ ...item });
    }
  }

  const expanded: { start: number; endExcl: number }[] = [];
  for (const item of mergedRaw) {
    let s = item.start;
    let e = item.end + 1;
    let lineStart = s;
    while (lineStart > 0 && source[lineStart - 1] !== '\n' && source[lineStart - 1] !== '\r') {
      lineStart--;
    }
    let lineEnd = e;
    while (lineEnd < source.length && source[lineEnd] !== '\n' && source[lineEnd] !== '\r') {
      lineEnd++;
    }
    let lineEndingEnd = lineEnd;
    if (source[lineEnd] === '\r' && source[lineEnd + 1] === '\n') lineEndingEnd = lineEnd + 2;
    else if (source[lineEnd] === '\r' || source[lineEnd] === '\n') lineEndingEnd = lineEnd + 1;

    const onlySpacesBefore = /^[ \t]*$/.test(source.slice(lineStart, s));
    const onlySpacesAfter = /^[ \t]*$/.test(source.slice(e, lineEnd));

    if (onlySpacesBefore && onlySpacesAfter) {
      if (lineEndingEnd > lineEnd) {
        s = lineStart;
        e = lineEndingEnd;
      } else {
        s = lineStart;
        if (
          !item.hasBranch &&
          !/[\r\n]/.test(source.slice(item.start, item.end + 1)) &&
          lineStart > 0
        ) {
          if (lineStart >= 2 && source[lineStart - 2] === '\r' && source[lineStart - 1] === '\n') {
            s = lineStart - 2;
          } else if (source[lineStart - 1] === '\r' || source[lineStart - 1] === '\n') {
            s = lineStart - 1;
          }
        }
      }
    } else if (item.eatInlineSpace) {
      while (e < lineEnd && (source[e] === ' ' || source[e] === '\t')) {
        e++;
      }
    }
    expanded.push({ start: s, endExcl: e });
  }

  expanded.sort((a, b) => a.start - b.start || a.endExcl - b.endExcl);
  const result: { start: number; endExcl: number }[] = [];
  for (const interval of expanded) {
    const prev = result[result.length - 1];
    if (prev && interval.start <= prev.endExcl) {
      prev.endExcl = Math.max(prev.endExcl, interval.endExcl);
    } else {
      result.push({ ...interval });
    }
  }
  return result;
}

function subtractIntervals(
  start: number,
  endExcl: number,
  removed: readonly { start: number; endExcl: number }[]
): { start: number; endExcl: number }[] {
  const result: { start: number; endExcl: number }[] = [];
  let cursor = start;
  for (const r of removed) {
    if (r.endExcl <= cursor) continue;
    if (r.start >= endExcl) break;
    if (r.start > cursor) {
      result.push({ start: cursor, endExcl: Math.min(endExcl, r.start) });
    }
    cursor = Math.max(cursor, r.endExcl);
    if (cursor >= endExcl) break;
  }
  if (cursor < endExcl) {
    result.push({ start: cursor, endExcl });
  }
  return result;
}

/**
 * Shared condition evaluation engine (Engine 1, INV-5).
 * Used by both Pipeline B (`realizeProjectConditions`) and Pipeline A Step 1 (`resolveProjectView`).
 */
export function evaluateConditionStream(
  snapshot: ProjectSnapshot,
  config: ConditionStreamConfig
): ConditionStreamEvaluation {
  const files = new Map(snapshot.files.map((f) => [f.path, f]));
  const factIndexes = new Map(
    snapshot.files.map((file) => {
      const index = new Map<number, (typeof file.facts)[number][]>();
      for (const fact of file.facts) {
        const bucket = index.get(fact.range.start) ?? [];
        bucket.push(fact);
        index.set(fact.range.start, bucket);
      }
      return [file.path, index] as const;
    })
  );

  const occurrences: InputOccurrence[] = [];
  const traces: OccurrenceTrace[] = [];
  const rootTraceIndices: number[] = [];
  const decisions: ConditionDecision[] = [];
  const reachedFacts: ReachedFact[] = [];
  const stack: EvalFrame[] = [];
  const bindings = new Map<string, Binding>();
  const state = new Map<string, boolean>();
  let failure: { readonly status: 'incomplete' | 'blocked'; readonly reason: ProjectIssue } | null =
    null;

  const policy = config.conditions;
  const overrides =
    policy.mode === 'manual'
      ? policy.values
      : policy.mode === 'source-with-overrides'
        ? policy.overrides
        : {};
  const seeds =
    policy.mode === 'manual' || policy.mode === 'none' ? {} : (policy.initialValues ?? {});

  function bindFlag(name: string): void {
    bindings.set(`if${name}`, { kind: 'test', flag: name });
    bindings.set(`${name}true`, { kind: 'setter', flag: name, value: true });
    bindings.set(`${name}false`, { kind: 'setter', flag: name, value: false });
  }
  function resetEntryState(): void {
    bindings.clear();
    state.clear();
    for (const name of new Set([...Object.keys(overrides), ...Object.keys(seeds)])) bindFlag(name);
    for (const [name, value] of Object.entries(seeds)) state.set(name, value);
  }
  resetEntryState();

  function origin(frame: EvalFrame, start: number, end: number): SourceOrigin {
    return {
      snapshotId: snapshot.id,
      occurrenceId: frame.occurrence.id,
      path: frame.file.path,
      range: rangeAt(frame.starts, start, end),
    };
  }

  function stop(
    code: ProjectIssueCode,
    message: string,
    at: SourceOrigin | null,
    status: 'incomplete' | 'blocked' = 'incomplete'
  ): void {
    if (!failure) {
      failure = {
        status,
        reason: {
          ...issue(
            code,
            message,
            at ? { path: at.path, range: at.range } : null,
            status === 'blocked' ? 'error' : 'warning'
          ),
          inputChain: stack.map((f) => f.occurrence.id),
        },
      };
    }
  }

  function pushFrame(file: ScannedFile, reference: SourceOrigin | null): number | null {
    if (
      stack.length >= config.limits.maxInputDepth ||
      occurrences.length >= config.limits.maxOccurrences
    ) {
      stop('interpretation-limit', 'Input depth or occurrence limit reached.', reference);
      return null;
    }
    const occurrence: InputOccurrence = {
      id: `i${occurrences.length}`,
      path: file.path,
      parentId: stack[stack.length - 1]?.occurrence.id ?? null,
      reference,
    };
    const starts = lineStarts(file.source);
    const trace: OccurrenceTrace = {
      occurrence,
      file,
      tokens: file.tokens,
      starts,
      conditionRemovals: [],
      scaffoldingRemovals: [],
      activeTokens: new Set<number>(),
      tokenInterpretations: new Map<number, 'structure' | 'opaque' | 'verbatim'>(),
      activeInputExpansions: new Map(),
    };
    const traceIndex = traces.length;
    occurrences.push(occurrence);
    traces.push(trace);
    stack.push({
      file,
      tokens: file.tokens,
      occurrence,
      trace,
      traceIndex,
      tokenIndex: 0,
      conditions: [],
      starts,
    });
    return traceIndex;
  }

  function markActive(
    frame: EvalFrame,
    startIndex: number,
    endIndex: number,
    interpretation: 'structure' | 'opaque' | 'verbatim' = 'structure'
  ): void {
    for (let i = startIndex; i <= endIndex; i++) {
      frame.trace.activeTokens.add(i);
      frame.trace.tokenInterpretations.set(i, interpretation);
    }
  }

  function reach(frame: EvalFrame, token: SourceToken): void {
    let facts = factIndexes.get(frame.file.path)!.get(token.range.start);
    if (!facts) {
      facts = scanFile(frame.file, snapshot.scanOptions, token.range.start)
        .facts.filter((f) => f.range.start === token.range.start)
        .map((f) => ({
          ...f,
          id: `r${token.range.start}:${f.id}`,
          context: {
            branches: frame.conditions.map((c) => ({
              test: c.origin.range,
              arm: c.elseSeen ? ('else' as const) : ('then' as const),
            })),
            definitionBodies: [],
            opaqueArguments: [],
          },
        }));
    }
    for (const fact of facts) {
      if (fact.context.definitionBodies.length === 0) {
        reachedFacts.push({ fact, origin: origin(frame, fact.range.start, fact.range.end) });
      }
    }
  }

  for (const entryFile of config.entryFiles) {
    if (failure) break;
    resetEntryState();
    const rootIdx = pushFrame(entryFile, null);
    if (rootIdx !== null) rootTraceIndices.push(rootIdx);

    while (stack.length > 0 && !failure) {
      const frame = stack[stack.length - 1]!;
      let tokens = frame.tokens;
      if (frame.tokenIndex >= tokens.length) {
        if (frame.conditions.length > 0) {
          const hasBoundary = stack.length > 1 || occurrences.length > 1;
          stop(
            hasBoundary ? 'cross-file-conditional' : 'malformed-syntax',
            hasBoundary
              ? 'Conditional delimiters must be paired inside each included file.'
              : 'Unclosed source conditional.',
            frame.conditions[frame.conditions.length - 1]!.origin,
            hasBoundary ? 'incomplete' : 'blocked'
          );
        } else {
          stack.pop();
        }
        continue;
      }

      const condition = frame.conditions[frame.conditions.length - 1];
      const active =
        !condition ||
        (condition.parentActive && (condition.elseSeen ? !condition.value : condition.value));
      const token = tokens[frame.tokenIndex]!;
      frame.tokenIndex++;
      const at = origin(frame, token.range.start, token.range.end);

      if (policy.mode !== 'none') {
        const binding = bindings.get(token.name);
        const syntaxTest =
          token.kind === 'command' && binding?.kind !== 'setter' ? testKind(token.name) : null;

        if (
          binding?.kind === 'opaque' &&
          (active || token.name === 'else' || token.name === 'fi')
        ) {
          stop(
            'binding-redefined',
            `\\${token.name} has a stored or redefined meaning that requires expansion.`,
            at
          );
          continue;
        }

        if (syntaxTest && binding?.kind !== 'opaque') {
          const recognized = syntaxTest !== 'named-candidate' || binding?.kind === 'test';
          if (!active && !recognized) {
            stop(
              'unknown-condition',
              'Cannot establish the meaning of a conditional candidate in skipped text.',
              at
            );
            continue;
          }
          let tracked: boolean | null = null;
          let effective: boolean | null = null;
          if (active) {
            if (syntaxTest === 'literal') {
              tracked = effective = token.name === 'iftrue';
            } else if (syntaxTest === 'primitive') {
              decisions.push({
                origin: at,
                command: token.name,
                outcome: 'unknown',
                trackedValue: null,
                effectiveValue: null,
              });
              stop(
                'unsupported-condition',
                `Primitive \\${token.name} is not evaluated by this profile.`,
                at
              );
              continue;
            } else {
              const name = binding?.kind === 'test' ? binding.flag : token.name.slice(2);
              tracked = binding?.kind === 'test' ? (state.get(name) ?? null) : null;
              const forced = Object.prototype.hasOwnProperty.call(overrides, name)
                ? overrides[name]
                : undefined;
              effective = policy.mode === 'manual' ? (forced ?? null) : (forced ?? tracked);
            }
          }
          decisions.push({
            origin: at,
            command: token.name,
            outcome: active
              ? effective === null
                ? 'unknown'
                : effective
                  ? 'true'
                  : 'false'
              : 'not-reached',
            trackedValue: tracked,
            effectiveValue: effective,
          });
          if (active) reach(frame, token);
          if (active && effective === null) {
            stop('unknown-condition', `No established value for \\${token.name}.`, at);
            continue;
          }
          if (frame.conditions.length >= config.limits.maxNesting) {
            stop('interpretation-limit', 'Conditional nesting limit reached.', at);
            continue;
          }
          frame.conditions.push({
            testTokenIndex: token.index,
            elseTokenIndex: null,
            parentActive: active,
            value: effective ?? false,
            elseSeen: false,
            origin: at,
          });
          continue;
        }

        if (token.kind === 'command' && (token.name === 'else' || token.name === 'fi')) {
          if (!condition) {
            const cross = stack.length > 1 || occurrences.length > 1;
            stop(
              cross ? 'cross-file-conditional' : 'malformed-syntax',
              'Conditional closer has no opener in this file occurrence.',
              at,
              cross ? 'incomplete' : 'blocked'
            );
          } else if (token.name === 'fi') {
            const popped = frame.conditions.pop()!;
            if (popped.parentActive) {
              const openTok = tokens[popped.testTokenIndex]!;
              if (popped.value) {
                frame.trace.conditionRemovals.push({
                  start: openTok.range.start,
                  end: openTok.range.end,
                  eatInlineSpace: true,
                  hasBranch: false,
                });
                if (popped.elseTokenIndex !== null) {
                  const elseTok = tokens[popped.elseTokenIndex]!;
                  frame.trace.conditionRemovals.push({
                    start: elseTok.range.start,
                    end: token.range.end,
                    eatInlineSpace: false,
                    hasBranch: true,
                  });
                } else {
                  frame.trace.conditionRemovals.push({
                    start: token.range.start,
                    end: token.range.end,
                    eatInlineSpace: false,
                    hasBranch: false,
                  });
                }
              } else {
                if (popped.elseTokenIndex !== null) {
                  const elseTok = tokens[popped.elseTokenIndex]!;
                  frame.trace.conditionRemovals.push({
                    start: openTok.range.start,
                    end: elseTok.range.end,
                    eatInlineSpace: true,
                    hasBranch: true,
                  });
                  frame.trace.conditionRemovals.push({
                    start: token.range.start,
                    end: token.range.end,
                    eatInlineSpace: false,
                    hasBranch: false,
                  });
                } else {
                  frame.trace.conditionRemovals.push({
                    start: openTok.range.start,
                    end: token.range.end,
                    eatInlineSpace: false,
                    hasBranch: true,
                  });
                }
              }
            }
          } else if (condition.elseSeen) {
            stop('malformed-syntax', 'A conditional has more than one else.', at, 'blocked');
          } else {
            condition.elseSeen = true;
            condition.elseTokenIndex = token.index;
          }
          continue;
        }

        if (!active) {
          if (syntaxTest && binding?.kind === 'opaque') {
            stop(
              'binding-redefined',
              'Redefined conditional candidate has unsupported meaning in skipped text.',
              at
            );
          }
          continue;
        }
      }

      // Now in active mode!
      if (token.kind !== 'command') {
        markActive(frame, token.index, token.index, 'structure');
        continue;
      }

      if (bindings.get(token.name)?.kind === 'opaque') {
        reach(frame, token);
        stop(
          'binding-redefined',
          `\\${token.name} has a stored or redefined meaning that requires expansion.`,
          at
        );
        continue;
      }

      // Active verbatim (\verb or \begin{<verbatimEnv>})
      if (token.name === 'verb' || token.name === 'begin') {
        let verb = matchVerbatimTokens(
          tokens,
          token.index,
          snapshot.scanOptions.verbatimEnvironments
        );
        if (verb) {
          reach(frame, token);
          if (verb.error) {
            stop(
              'malformed-syntax',
              verb.error,
              origin(frame, verb.startOffset, verb.endOffset),
              'blocked'
            );
            continue;
          }
          const spliced = spliceVerbatimMatch(tokens, verb, frame.file.source, frame.starts);
          if (spliced) {
            tokens = spliced.tokens;
            frame.tokens = tokens;
            frame.trace.tokens = tokens;
            verb = spliced.verb;
          }
          markActive(frame, verb.startIndex, verb.endIndex, 'verbatim');
          frame.tokenIndex = verb.endIndex + 1;
          continue;
        }
      }

      reach(frame, token);

      if (policy.mode !== 'none') {
        let current = token;
        if (current.name === 'global') {
          const nextIdx = skipTriviaTokens(tokens, frame.tokenIndex);
          if (nextIdx >= tokens.length) {
            stop('unsupported-assignment', 'Global prefix has no supported setter.', at);
            continue;
          }
          current = tokens[nextIdx]!;
          if (bindings.get(current.name)?.kind !== 'setter') {
            stop(
              'unsupported-assignment',
              'Only global followed by a direct recognized boolean setter is supported.',
              at
            );
            continue;
          }
          frame.tokenIndex = nextIdx + 1;
          reach(frame, current);
        }

        const currentBinding = bindings.get(current.name);
        if (currentBinding?.kind === 'setter') {
          const testBinding: Binding = { kind: 'test', flag: currentBinding.flag };
          bindings.set(`if${currentBinding.flag}`, testBinding);
          state.set(currentBinding.flag, currentBinding.value);
          frame.trace.scaffoldingRemovals.push({
            start: token.range.start,
            end: current.range.end,
            eatInlineSpace: true,
            hasBranch: false,
          });
          continue;
        }

        if (current.name === 'newif') {
          const nextIdx = skipTriviaTokens(tokens, frame.tokenIndex);
          const target = nextIdx < tokens.length ? tokens[nextIdx]! : null;
          if (!target || target.kind !== 'command' || testKind(target.name) !== 'named-candidate') {
            stop(
              'malformed-syntax',
              'newif requires a direct named boolean target.',
              at,
              'blocked'
            );
            continue;
          }
          const name = target.name.slice(2);
          bindFlag(name);
          state.set(name, false);
          frame.tokenIndex = nextIdx + 1;
          frame.trace.scaffoldingRemovals.push({
            start: token.range.start,
            end: target.range.end,
            eatInlineSpace: true,
            hasBranch: false,
          });
          continue;
        }
      }

      if (DEFINITIONS.has(token.name)) {
        const def = readDefinitionTokens(tokens, token.index);
        if (!def.name || !def.body || !def.valid) {
          stop('malformed-syntax', 'Malformed supported command definition.', at, 'blocked');
          continue;
        }
        const previous = bindings.get(def.name);
        const isConditionOrProtected =
          previous !== undefined ||
          testKind(def.name) !== null ||
          def.name === 'else' ||
          def.name === 'fi' ||
          def.name === 'newif' ||
          def.name === 'verb' ||
          def.name === 'begin' ||
          def.name === 'end' ||
          def.name === 'input' ||
          /^[A-Za-z]+(?:true|false)$/.test(def.name);
        if (isConditionOrProtected && (token.name !== 'providecommand' || !previous)) {
          bindings.set(def.name, { kind: 'opaque' });
        }
        markActive(frame, token.index, def.body.closeIndex, 'opaque');
        frame.tokenIndex = def.nextIndex;
        continue;
      }

      if (UNSUPPORTED_DEFINITIONS.has(token.name)) {
        stop(
          'unsupported-assignment',
          `Unsupported definition/assignment form \\${token.name}.`,
          at
        );
        continue;
      }

      if (
        UNSUPPORTED_EFFECTS.has(token.name) ||
        (ORDINARY_IF_COMMANDS.has(token.name) && token.name !== 'iff')
      ) {
        stop('unsupported-effect', `\\${token.name} has semantics outside the direct profile.`, at);
        continue;
      }

      if (policy.mode !== 'none' && /^[A-Za-z]+(?:true|false)$/.test(token.name)) {
        stop('unsupported-assignment', `No live generated setter binding for \\${token.name}.`, at);
        continue;
      }

      if (token.name === 'input') {
        if (config.traversal === 'file-only' && !config.stopOnFileOnlyInput) {
          // Pipeline B file-only mode preserves \input{...} untouched.
          markActive(frame, token.index, token.index, 'structure');
          continue;
        }
        const arg = readBracedGroupTokens(tokens, frame.tokenIndex);
        const target = literalFromGroup(arg, frame.starts);
        if (target.kind !== 'literal') {
          stop('dynamic-input', 'Only literal braced input paths are supported.', at);
          continue;
        }
        frame.tokenIndex = arg!.nextIndex;
        if (config.traversal === 'file-only') {
          stop('file-only-input', 'A file-only interpretation cannot establish input effects.', at);
          continue;
        }
        const path = target.value;
        if (/^(?:[\\/]|[A-Za-z]:)/.test(path) || path.includes('\0')) {
          stop(
            'invalid-input-path',
            'Input must remain inside the virtual project root.',
            at,
            'blocked'
          );
          continue;
        }
        const joined = normalizeVirtualPath(`${virtualDirname(frame.file.path)}/${path}`);
        if (!joined) {
          stop('invalid-input-path', 'Input escapes the virtual project root.', at, 'blocked');
          continue;
        }
        const matches = [...new Set([joined, withTexExtension(joined)])].filter((p) =>
          files.has(p)
        );
        if (!matches.length) {
          stop('missing-input', `Required input ${path} is absent.`, at, 'blocked');
          continue;
        }
        if (matches.length > 1) {
          stop(
            'ambiguous-input',
            `Input ${path} matches more than one source file.`,
            at,
            'blocked'
          );
          continue;
        }
        const included = files.get(matches[0]!)!;
        if (stack.some((f) => f.file.path === included.path)) {
          stop('input-cycle', `Active input recursion through ${included.path}.`, at, 'blocked');
          continue;
        }
        if (!config.inlineInputs) {
          markActive(frame, token.index, arg!.closeIndex, 'structure');
        }
        const childTraceIdx = pushFrame(included, origin(frame, token.range.start, arg!.end - 1));
        if (childTraceIdx !== null) {
          frame.trace.activeInputExpansions.set(token.index, {
            endTokenIndex: arg!.closeIndex,
            endOffset: arg!.end,
            childTraceIndex: childTraceIdx,
          });
        }
        continue;
      }

      // Stored key/metadata arguments (e.g., \label{...}, \ref{...}, \cite{...})
      const storedCount = Object.prototype.hasOwnProperty.call(OPAQUE_KEY_ARGUMENTS, token.name)
        ? OPAQUE_KEY_ARGUMENTS[token.name]
        : undefined;
      if (storedCount !== undefined && token.name !== 'begin' && token.name !== 'end') {
        let cursor = frame.tokenIndex;
        const opt = readOptionalBracketTokens(tokens, cursor);
        if (opt) {
          cursor = opt.nextCharOffset > 0 ? opt.nextIndex + 1 : opt.nextIndex;
        }
        let endTokenIndex = token.index;
        let ok = true;
        for (let i = 0; i < storedCount; i++) {
          const grp = readBracedGroupTokens(tokens, cursor);
          if (!grp) {
            if (
              token.name === 'label' ||
              token.name === 'ref' ||
              token.name === 'pageref' ||
              token.name === 'eqref'
            ) {
              stop(
                'malformed-syntax',
                `\\${token.name} requires a complete braced argument.`,
                at,
                'blocked'
              );
              ok = false;
            }
            break;
          }
          endTokenIndex = grp.closeIndex;
          cursor = grp.nextIndex;
        }
        if (!ok) continue;
        markActive(frame, token.index, endTokenIndex, 'opaque');
        frame.tokenIndex = cursor;
        continue;
      }

      markActive(frame, token.index, token.index, 'structure');
    }
  }

  // Build selectedTokens from the trace tree
  const selectedTokens: SelectedToken[] = [];
  let projectedOffset = 0;
  let projectedLine = 1;
  let lastCR = false;

  function appendSelectedToken(
    trace: OccurrenceTrace,
    token: SourceToken,
    interpretation: 'structure' | 'opaque' | 'verbatim'
  ): boolean {
    const value = token.value;
    if (!value) return true;
    if (projectedOffset + value.length > config.limits.maxSelectedCodeUnits) {
      if (!failure) {
        const at: SourceOrigin = {
          snapshotId: snapshot.id,
          occurrenceId: trace.occurrence.id,
          path: trace.file.path,
          range: token.range,
        };
        failure = {
          status: 'incomplete',
          reason: {
            ...issue('interpretation-limit', 'Selected source size limit reached.', {
              path: at.path,
              range: at.range,
            }),
            inputChain: [trace.occurrence.id],
          },
        };
      }
      return false;
    }
    const projectedRange: SourceRange = {
      start: projectedOffset,
      end: projectedOffset + value.length - 1,
      line: projectedLine,
    };
    for (const char of value) {
      if (char === '\r') projectedLine++;
      else if (char === '\n' && !lastCR) projectedLine++;
      lastCR = char === '\r';
    }
    const at: SourceOrigin = {
      snapshotId: snapshot.id,
      occurrenceId: trace.occurrence.id,
      path: trace.file.path,
      range: token.range,
    };
    selectedTokens.push({
      interpretation,
      token,
      origin: at,
      projectedRange,
    });
    projectedOffset += value.length;
    return true;
  }

  function collectTraceTokens(traceIndex: number): void {
    const trace = traces[traceIndex]!;
    const rawRemovals =
      policy.mode !== 'none'
        ? [...trace.conditionRemovals, ...trace.scaffoldingRemovals]
        : trace.conditionRemovals;
    const removedIntervals = expandRemovalIntervals(trace.file.source, rawRemovals);
    const tokens = trace.tokens;

    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const expansion = trace.activeInputExpansions.get(tIdx);
      if (expansion && config.inlineInputs) {
        collectTraceTokens(expansion.childTraceIndex);
        tIdx = expansion.endTokenIndex;
        continue;
      }
      if (!trace.activeTokens.has(tIdx)) continue;
      const tok = tokens[tIdx]!;
      const interp = trace.tokenInterpretations.get(tIdx) ?? 'structure';

      const keptSlices = subtractIntervals(tok.range.start, tok.range.end + 1, removedIntervals);
      for (const slice of keptSlices) {
        if (slice.start === tok.range.start && slice.endExcl === tok.range.end + 1) {
          if (!appendSelectedToken(trace, tok, interp)) return;
        } else {
          const subValue = trace.file.source.slice(slice.start, slice.endExcl);
          const subRange = rangeAt(trace.starts, slice.start, slice.endExcl - 1);
          if (
            !appendSelectedToken(
              trace,
              {
                index: tok.index,
                kind: tok.kind,
                value: subValue,
                name: tok.name,
                range: subRange,
              },
              interp
            )
          ) {
            return;
          }
        }
      }
    }
  }

  for (const rootIdx of rootTraceIndices) {
    collectTraceTokens(rootIdx);
  }

  return {
    occurrences,
    traces,
    rootTraceIndices,
    decisions,
    reachedFacts,
    selectedTokens,
    failure,
  };
}

export interface NormalizedConditionRealizationRequest {
  readonly entryPath?: string;
  readonly traversal: 'project' | 'file-only';
  readonly scope?: SourceScope;
  readonly conditions: ConditionPolicy;
  readonly inputs: 'preserve' | 'inline';
  readonly stripDeclarationsAndSetters: boolean;
  readonly limits: Required<ViewLimits>;
  readonly maxOutputCodeUnits: number;
}

export function normalizeConditionRealizationRequest(
  value: unknown
): NormalizedConditionRealizationRequest {
  const input = record(value === undefined ? {} : value, 'condition realization request');
  fields(
    input,
    [
      'entryPath',
      'traversal',
      'scope',
      'conditions',
      'inputs',
      'stripDeclarationsAndSetters',
      'limits',
      'maxOutputCodeUnits',
    ],
    'condition realization request'
  );
  const traversal = input['traversal'] === undefined ? 'project' : input['traversal'];
  if (traversal !== 'project' && traversal !== 'file-only') {
    invalid('Invalid condition realization traversal mode.');
  }
  const inputs = input['inputs'] === undefined ? 'preserve' : input['inputs'];
  if (inputs !== 'preserve' && inputs !== 'inline') {
    invalid('Invalid condition realization inputs mode.');
  }
  if (traversal === 'file-only' && inputs === 'inline') {
    invalid('Inline inputs require project traversal.');
  }
  const stripDeclarationsAndSetters =
    input['stripDeclarationsAndSetters'] === undefined
      ? true
      : input['stripDeclarationsAndSetters'];
  if (typeof stripDeclarationsAndSetters !== 'boolean') {
    invalid('stripDeclarationsAndSetters must be a boolean.');
  }
  const conditions = normalizeConditionPolicy(input['conditions'], false);
  const limits = normalizeViewLimits(input['limits']);
  const maxOutputCodeUnits = bounded(
    input['maxOutputCodeUnits'],
    10000000,
    100000000,
    'maxOutputCodeUnits'
  );

  let entryPath: string | undefined;
  if (input['entryPath'] !== undefined) {
    entryPath = normalizeProjectFilePath(input['entryPath'], 'entryPath');
  }

  let scope: SourceScope | undefined;
  if (input['scope'] !== undefined) {
    if (traversal !== 'file-only') {
      invalid('Source file scopes are only supported with file-only condition realization.');
    }
    scope = normalizeScope(input['scope']);
  } else if (traversal === 'file-only') {
    scope = entryPath ? { kind: 'files', paths: [entryPath] } : { kind: 'all-files' };
  }

  return {
    ...(entryPath !== undefined ? { entryPath } : {}),
    traversal,
    ...(scope !== undefined ? { scope } : {}),
    conditions,
    inputs,
    stripDeclarationsAndSetters,
    limits,
    maxOutputCodeUnits,
  };
}

/**
 * Realize conditional branches and boolean declarations/setters over a project snapshot
 * without constructing a structural AST (Pipeline B, INV-3 & INV-5).
 * @param snapshot - Source authority to evaluate.
 * @param request - Condition policy, traversal, input handling, and output limits.
 * @returns Frozen realization result containing decisions, checked editPlan, and realized artifacts.
 */
export function realizeProjectConditions(
  snapshot: ProjectSnapshot,
  request: ConditionRealizationRequest = {}
): ConditionRealizationResult {
  const source = validateSnapshot(snapshot);
  const normalized = normalizeConditionRealizationRequest(request);
  const provenance: OperationProvenance = {
    snapshotId: source.id,
    viewId: null,
    request: { operation: 'realize-conditions', options: normalized },
    operationVersion: 1,
  };
  const resultId = identity('condition-realization', provenance);

  let entryFiles: ScannedFile[] = [];
  if (normalized.traversal === 'project') {
    const resolvedEntryPath =
      normalized.entryPath ??
      (source.files.some((f) => f.path === 'main.tex')
        ? 'main.tex'
        : source.files.length === 1
          ? source.files[0]!.path
          : 'main.tex');
    const entry = source.files.find((f) => f.path === resolvedEntryPath);
    if (!entry) {
      const reason = issue('missing-entry', `Entry ${resolvedEntryPath} is absent.`, null, 'error');
      return freeze({
        kind: 'condition-realization',
        snapshotId: source.id,
        resultId,
        status: 'blocked',
        reason,
        provenance,
        occurrences: [],
        decisions: [],
        editPlan: null,
        artifacts: [],
        dependencies: [],
        coverage: coverage([reason]),
      });
    }
    entryFiles = [entry];
  } else {
    const scope = normalized.scope ?? { kind: 'all-files' };
    if (
      scope.kind === 'files' &&
      scope.paths.some((p) => !source.files.some((f) => f.path === p))
    ) {
      invalid('Condition realization scope contains an absent file.');
    }
    entryFiles = source.files.filter((f) => scope.kind !== 'files' || scope.paths.includes(f.path));
  }

  const evaluation = evaluateConditionStream(source, {
    entryFiles,
    traversal: normalized.traversal,
    stopOnFileOnlyInput: false,
    inlineInputs: normalized.inputs === 'inline',
    stripDeclarationsAndSetters: normalized.stripDeclarationsAndSetters,
    conditions: normalized.conditions,
    limits: normalized.limits,
  });

  if (evaluation.failure) {
    return freeze({
      kind: 'condition-realization',
      snapshotId: source.id,
      resultId,
      status: evaluation.failure.status,
      reason: evaluation.failure.reason,
      provenance,
      occurrences: evaluation.occurrences,
      decisions: evaluation.decisions,
      editPlan: null,
      artifacts: [],
      dependencies: [],
      coverage: coverage([evaluation.failure.reason]),
    });
  }

  const copy = sourceCopier(source);
  const artifacts: GeneratedArtifact[] = [];
  let editPlan: ProjectEditPlan | null = null;
  let totalCodeUnits = 0;

  if (normalized.inputs === 'preserve') {
    const byPath = new Map<string, TextChange[]>();
    const signatures = new Map<string, string>();
    const visitedPaths = new Set<string>();

    for (const trace of evaluation.traces) {
      const path = trace.file.path;
      visitedPaths.add(path);
      const rawItems = normalized.stripDeclarationsAndSetters
        ? [...trace.conditionRemovals, ...trace.scaffoldingRemovals]
        : trace.conditionRemovals;
      const intervals = expandRemovalIntervals(trace.file.source, rawItems);
      const changes: TextChange[] = intervals.map((r) => ({
        start: r.start,
        end: r.endExcl,
        text: '',
      }));
      const sig = JSON.stringify(changes);
      const prevSig = signatures.get(path);
      if (prevSig !== undefined && prevSig !== sig) {
        reject(
          'edit-conflict',
          `File ${path} is included multiple times with different condition outcomes; use inline input realization.`
        );
      }
      signatures.set(path, sig);
      byPath.set(path, changes);
    }

    const edits = sourceChanges(source, byPath);
    editPlan = { kind: 'edits', provenance, edits };

    const targetFiles = source.files.filter((f) => visitedPaths.has(f.path));
    for (const file of targetFiles) {
      const fileEdits = edits.filter((e) => e.path === file.path);
      const segments: Segment[] = [];
      let pos = 0;
      for (const edit of fileEdits) {
        const start = edit.kind === 'replace' ? edit.range.start : edit.offset;
        const end = edit.kind === 'replace' ? edit.range.end + 1 : edit.offset;
        const text = edit.kind === 'replace' ? edit.replacement : edit.text;
        if (start > pos) segments.push(copy(file, pos, start, null));
        if (text) segments.push({ text, origin: null, reason: 'Condition realization boundary.' });
        pos = end;
      }
      if (pos < file.source.length) segments.push(copy(file, pos, file.source.length, null));
      const artifact = emit(
        file.path,
        segments,
        source,
        provenance,
        normalized.traversal === 'file-only' ? 'independent-sources' : 'preserved-project',
        normalized.maxOutputCodeUnits - totalCodeUnits
      );
      totalCodeUnits += artifact.source.length;
      artifacts.push(artifact);
    }
  } else {
    // inputs === 'inline'
    const segments: Segment[] = [];
    function collectInlineSegments(traceIndex: number): void {
      const trace = evaluation.traces[traceIndex]!;
      const rawItems = normalized.stripDeclarationsAndSetters
        ? [...trace.conditionRemovals, ...trace.scaffoldingRemovals]
        : trace.conditionRemovals;
      const removedIntervals = expandRemovalIntervals(trace.file.source, rawItems);
      const expansions = [...trace.activeInputExpansions.entries()].sort((a, b) => a[0] - b[0]);

      let cursorOffset = 0;
      for (const [cmdIndex, exp] of expansions) {
        const cmdTok = trace.tokens[cmdIndex]!;
        const keptBefore = subtractIntervals(cursorOffset, cmdTok.range.start, removedIntervals);
        for (const slice of keptBefore) {
          segments.push(copy(trace.file, slice.start, slice.endExcl, trace.occurrence.id));
        }
        collectInlineSegments(exp.childTraceIndex);
        cursorOffset = exp.endOffset;
      }
      const keptAfter = subtractIntervals(cursorOffset, trace.file.source.length, removedIntervals);
      for (const slice of keptAfter) {
        segments.push(copy(trace.file, slice.start, slice.endExcl, trace.occurrence.id));
      }
    }

    for (const rootIdx of evaluation.rootTraceIndices) {
      collectInlineSegments(rootIdx);
    }
    const outPath = normalized.entryPath ?? entryFiles[0]!.path;
    const artifact = emit(
      outPath,
      segments,
      source,
      provenance,
      'active-inputs-expanded',
      normalized.maxOutputCodeUnits
    );
    artifacts.push(artifact);
  }

  return freeze({
    kind: 'condition-realization',
    snapshotId: source.id,
    resultId,
    status: 'ready',
    reason: null,
    provenance,
    occurrences: evaluation.occurrences,
    decisions: evaluation.decisions,
    editPlan,
    artifacts,
    dependencies: dependencies(artifacts, source.scanOptions),
    coverage: coverage([]),
  });
}
