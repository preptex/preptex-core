import type { SourceRange } from '../../api-types.js';
import type {
  ConditionDecision,
  InputOccurrence,
  ProjectIssue,
  ProjectIssueCode,
  ProjectSnapshot,
  ProjectView,
  ReachedFact,
  ScannedFile,
  SelectedToken,
  SourceOrigin,
  ViewConfiguration,
} from '../../project-types.js';
import { normalizeVirtualPath, virtualDirname, withTexExtension } from '../virtual-path.js';
import {
  argument,
  definition,
  DEFINITIONS,
  lex,
  literal,
  scanFile,
  sectionLevel,
  skipTrivia,
  storedArgumentCount,
  TEXT_ARGUMENTS,
  UNSUPPORTED_DEFINITIONS,
  type Lexeme,
} from './scan.js';
import {
  coverage,
  freeze,
  identity,
  issue,
  lineStarts,
  ORDINARY_IF_COMMANDS,
  rangeAt,
  testKind,
} from './shared.js';
import { validateSnapshot } from './snapshot.js';
import { normalizeConfiguration } from './configuration.js';
import { parseConfiguredStructure } from './structure.js';

type Binding =
  | { kind: 'test'; flag: string }
  | { kind: 'setter'; flag: string; value: boolean }
  | { kind: 'opaque' };
interface Scope {
  kind: 'group' | 'environment';
  name: string;
  bindings: Map<string, Binding>;
  values: Map<string, boolean>;
}
interface Conditional {
  parentActive: boolean;
  value: boolean;
  elseSeen: boolean;
  origin: SourceOrigin;
}
interface Frame {
  file: ScannedFile;
  occurrence: InputOccurrence;
  pos: number;
  conditions: Conditional[];
  starts: readonly number[];
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
const SAFE_COMMANDS = new Set([
  'relax',
  'item',
  'par',
  'noindent',
  'indent',
  'maketitle',
  'tableofcontents',
  'clearpage',
  'newpage',
  'hline',
  'centering',
  'small',
  'large',
  'LaTeX',
  'TeX',
  'ldots',
  'dots',
  'quad',
  'qquad',
  'newline',
  'linebreak',
  'vfill',
  'hfill',
  'iff',
]);

/**
 * Resolve reached boolean tests and active literal inputs, then parse the selected token stream.
 * @param snapshot - Exact source snapshot; unrelated malformed files do not block a healthy entry.
 * @param configuration - Entry, traversal, boolean policy, profile, and bounded interpretation settings.
 * @returns A deeply frozen ready view or explicit incomplete/blocked trace with no complete AST.
 * @throws {@link PrepTexError} with InvalidArgument for malformed options or stale source identity.
 */
export function resolveProjectView(
  snapshot: ProjectSnapshot,
  configuration: ViewConfiguration
): ProjectView {
  const source = validateSnapshot(snapshot);
  const config = normalizeConfiguration(configuration);
  const id = identity('view', [source.id, config]);
  const files = new Map(source.files.map((f) => [f.path, f]));
  const factIndexes = new Map(
    source.files.map((file) => {
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
  const decisions: ConditionDecision[] = [];
  const reachedFacts: ReachedFact[] = [];
  const selectedTokens: SelectedToken[] = [];
  const stack: Frame[] = [];
  const scopes: Scope[] = [];
  let bindings = new Map<string, Binding>();
  let state = new Map<string, boolean>();
  let failure: { status: 'incomplete' | 'blocked'; reason: ProjectIssue } | undefined;
  let projectedOffset = 0;
  let projectedLine = 1;
  let lastCR = false;
  const policy = config.conditions;
  const overrides =
    policy.mode === 'manual'
      ? policy.values
      : policy.mode === 'source-with-overrides'
        ? policy.overrides
        : {};
  const seeds = policy.mode === 'manual' ? {} : (policy.initialValues ?? {});
  function bindFlag(name: string): void {
    bindings.set(`if${name}`, { kind: 'test', flag: name });
    bindings.set(`${name}true`, { kind: 'setter', flag: name, value: true });
    bindings.set(`${name}false`, { kind: 'setter', flag: name, value: false });
  }
  for (const name of new Set([...Object.keys(overrides), ...Object.keys(seeds)])) bindFlag(name);
  for (const [name, value] of Object.entries(seeds)) state.set(name, value);
  function origin(frame: Frame, start: number, end: number): SourceOrigin {
    return {
      snapshotId: source.id,
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
    if (!failure)
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
  function addFrame(file: ScannedFile, reference: SourceOrigin | null): void {
    if (
      stack.length >= config.limits.maxInputDepth ||
      occurrences.length >= config.limits.maxOccurrences
    ) {
      stop('interpretation-limit', 'Input depth or occurrence limit reached.', reference);
      return;
    }
    const occurrence = {
      id: `i${occurrences.length}`,
      path: file.path,
      parentId: stack[stack.length - 1]?.occurrence.id ?? null,
      reference,
    };
    occurrences.push(occurrence);
    stack.push({ file, occurrence, pos: 0, conditions: [], starts: lineStarts(file.source) });
  }
  function append(frame: Frame, start: number, end: number, opaque = false): void {
    for (let pos = start; pos < end && !failure; ) {
      const token = lex(frame.file.source, pos, source.scanOptions);
      const until = Math.min(token.end, end);
      const value = frame.file.source.slice(pos, until);
      if (projectedOffset + value.length > config.limits.maxSelectedCodeUnits) {
        stop(
          'interpretation-limit',
          'Selected source size limit reached.',
          origin(frame, pos, until - 1)
        );
        break;
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
      const at = origin(frame, pos, until - 1);
      selectedTokens.push({
        interpretation: opaque ? 'opaque' : 'structure',
        token: { kind: token.kind, value, range: at.range },
        origin: at,
        projectedRange,
      });
      projectedOffset += value.length;
      pos = until;
    }
  }
  function reach(frame: Frame, token: Lexeme): void {
    let facts = factIndexes.get(frame.file.path)!.get(token.start);
    if (!facts) {
      // Skipping can end inside a region the ordinary source scan protected.
      // Recognize newly reached syntax at its original offsets, without executing
      // the verbatim/definition macro that appeared in the skipped arm.
      facts = scanFile(frame.file, source.scanOptions, token.start)
        .facts.filter((f) => f.range.start === token.start)
        .map((f) => ({
          ...f,
          id: `r${token.start}:${f.id}`,
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
      if (fact.context.definitionBodies.length === 0)
        reachedFacts.push({ fact, origin: origin(frame, fact.range.start, fact.range.end) });
    }
  }
  function pushScope(kind: Scope['kind'], name: string, at: SourceOrigin): void {
    if (scopes.length >= config.limits.maxNesting) {
      stop('interpretation-limit', 'Execution scope nesting limit reached.', at);
      return;
    }
    scopes.push({ kind, name, bindings: new Map(bindings), values: new Map(state) });
  }
  function popScope(kind: Scope['kind'], name: string, at: SourceOrigin): void {
    const scope = scopes.pop();
    if (!scope || scope.kind !== kind || scope.name !== name) {
      stop('structural-error', 'Mismatched selected execution scope.', at, 'blocked');
      return;
    }
    bindings = scope.bindings;
    state = scope.values;
  }
  const entry = files.get(config.entryPath);
  if (!entry) stop('missing-entry', `Entry ${config.entryPath} is absent.`, null, 'blocked');
  else addFrame(entry, null);
  while (stack.length && !failure) {
    const frame = stack[stack.length - 1]!;
    const text = frame.file.source;
    if (frame.pos >= text.length) {
      if (frame.conditions.length) {
        const hasBoundary = stack.length > 1 || occurrences.length > 1;
        stop(
          hasBoundary ? 'cross-file-conditional' : 'malformed-syntax',
          hasBoundary
            ? 'Conditional delimiters must be paired inside each included file.'
            : 'Unclosed source conditional.',
          frame.conditions[frame.conditions.length - 1]!.origin,
          hasBoundary ? 'incomplete' : 'blocked'
        );
      } else stack.pop();
      continue;
    }
    const condition = frame.conditions[frame.conditions.length - 1];
    const active =
      !condition ||
      (condition.parentActive && (condition.elseSeen ? !condition.value : condition.value));
    const token = lex(text, frame.pos, source.scanOptions, active);
    frame.pos = token.end;
    const at = origin(frame, token.start, token.end - 1);
    const binding = bindings.get(token.name);
    const syntaxTest =
      token.kind === 'command' && binding?.kind !== 'setter' ? testKind(token.name) : null;
    if (binding?.kind === 'opaque' && (active || token.name === 'else' || token.name === 'fi')) {
      stop(
        'binding-redefined',
        `\\${token.name} has a stored or redefined meaning that requires expansion.`,
        at
      );
      continue;
    }
    // Skipped mode reads primitive tokens: verbatim and definition macros do not execute.
    // Unknown if-prefixed names cannot safely establish TeX's delimiter depth.
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
        if (syntaxTest === 'literal') tracked = effective = token.name === 'iftrue';
        else if (syntaxTest === 'primitive') {
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
      } else if (token.name === 'fi') frame.conditions.pop();
      else if (condition.elseSeen)
        stop('malformed-syntax', 'A conditional has more than one else.', at, 'blocked');
      else condition.elseSeen = true;
      continue;
    }
    if (!active) {
      if (syntaxTest && binding?.kind === 'opaque')
        stop(
          'binding-redefined',
          'Redefined conditional candidate has unsupported meaning in skipped text.',
          at
        );
      continue;
    }
    if (token.error) {
      stop('malformed-syntax', token.error, at, 'blocked');
      continue;
    }
    if (token.kind === 'open') pushScope('group', '', at);
    if (token.kind === 'close') popScope('group', '', at);
    if (token.kind !== 'command') {
      append(frame, token.start, token.end);
      continue;
    }
    reach(frame, token);
    if (binding?.kind === 'opaque') {
      stop(
        'binding-redefined',
        `\\${token.name} has a stored or redefined meaning that requires expansion.`,
        at
      );
      continue;
    }
    let global = false;
    let current = token;
    if (current.name === 'global') {
      const pos = skipTrivia(text, token.end, source.scanOptions);
      if (pos >= text.length) {
        stop('unsupported-assignment', 'Global prefix has no supported setter.', at);
        continue;
      }
      current = lex(text, pos, source.scanOptions);
      global = true;
      if (bindings.get(current.name)?.kind !== 'setter') {
        stop(
          'unsupported-assignment',
          'Only global followed by a direct recognized boolean setter is supported.',
          at
        );
        continue;
      }
      frame.pos = current.end;
      reach(frame, current);
    }
    const currentBinding = bindings.get(current.name);
    if (currentBinding?.kind === 'setter') {
      const testBinding: Binding = { kind: 'test', flag: currentBinding.flag };
      // Generated setters assign the conditional control sequence itself.
      // A global setter can therefore preserve the test binding of a locally
      // declared flag, without promoting its locally defined setter macros.
      bindings.set(`if${currentBinding.flag}`, testBinding);
      state.set(currentBinding.flag, currentBinding.value);
      if (global)
        for (const scope of scopes) {
          scope.values.set(currentBinding.flag, currentBinding.value);
          scope.bindings.set(`if${currentBinding.flag}`, testBinding);
        }
      append(frame, token.start, frame.pos, true);
      continue;
    }
    if (current.name === 'newif') {
      const pos = skipTrivia(text, token.end, source.scanOptions);
      const target = pos < text.length ? lex(text, pos, source.scanOptions, false) : null;
      if (!target || target.kind !== 'command' || testKind(target.name) !== 'named-candidate') {
        stop('malformed-syntax', 'newif requires a direct named boolean target.', at, 'blocked');
        continue;
      }
      const name = target.name.slice(2);
      bindFlag(name);
      state.set(name, false);
      frame.pos = target.end;
      append(frame, token.start, frame.pos, true);
      continue;
    }
    if (DEFINITIONS.has(current.name)) {
      const def = definition(text, current, source.scanOptions);
      if (!def.name || !def.body || !def.valid) {
        stop('malformed-syntax', 'Malformed supported command definition.', at, 'blocked');
        continue;
      }
      const previous = bindings.get(def.name);
      if (current.name !== 'providecommand' || !previous)
        bindings.set(def.name, { kind: 'opaque' });
      frame.pos = def.end;
      append(frame, token.start, frame.pos, true);
      continue;
    }
    if (UNSUPPORTED_DEFINITIONS.has(current.name)) {
      stop(
        'unsupported-assignment',
        `Unsupported definition/assignment form \\${current.name}.`,
        at
      );
      continue;
    }
    if (
      UNSUPPORTED_EFFECTS.has(current.name) ||
      (ORDINARY_IF_COMMANDS.has(current.name) && current.name !== 'iff')
    ) {
      stop('unsupported-effect', `\\${current.name} has semantics outside the direct profile.`, at);
      continue;
    }
    if (/^[A-Za-z]+(?:true|false)$/.test(current.name)) {
      stop('unsupported-assignment', `No live generated setter binding for \\${current.name}.`, at);
      continue;
    }
    if (current.name === 'input') {
      const arg = argument(text, current.end, source.scanOptions);
      const target = literal(arg, frame.starts);
      if (target.kind !== 'literal') {
        stop('dynamic-input', 'Only literal braced input paths are supported.', at);
        continue;
      }
      frame.pos = arg!.end;
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
      const matches = [...new Set([joined, withTexExtension(joined)])].filter((p) => files.has(p));
      if (!matches.length) {
        stop('missing-input', `Required input ${path} is absent.`, at, 'blocked');
        continue;
      }
      if (matches.length > 1) {
        stop('ambiguous-input', `Input ${path} matches more than one source file.`, at, 'blocked');
        continue;
      }
      const included = files.get(matches[0]!)!;
      if (stack.some((f) => f.file.path === included.path)) {
        stop('input-cycle', `Active input recursion through ${included.path}.`, at, 'blocked');
        continue;
      }
      addFrame(included, origin(frame, token.start, frame.pos - 1));
      continue;
    }
    if (current.name === 'begin' || current.name === 'end') {
      const arg = argument(text, current.end, source.scanOptions);
      const name = literal(arg, frame.starts);
      if (name.kind !== 'literal') {
        stop('malformed-syntax', 'Environment name must be a literal braced name.', at, 'blocked');
        continue;
      }
      if (current.name === 'begin') pushScope('environment', name.value, at);
      else popScope('environment', name.value, at);
      frame.pos = arg!.end;
      append(frame, token.start, frame.pos);
      continue;
    }
    const count = storedArgumentCount(current.name);
    const section = sectionLevel(current.name);
    if (count !== undefined || section !== undefined || TEXT_ARGUMENTS.has(current.name)) {
      let pos = current.end;
      if (section !== undefined && text[pos] === '*') pos++;
      const optional = argument(text, pos, source.scanOptions, true);
      if (optional) pos = optional.end;
      for (let i = 0; i < (count ?? 1); i++) {
        const arg = argument(text, pos, source.scanOptions);
        if (!arg) {
          stop(
            'malformed-syntax',
            `\\${current.name} requires a complete braced argument.`,
            at,
            'blocked'
          );
          break;
        }
        // Formatting arguments execute in TeX. Until argument execution is modeled,
        // literal text is safe, while effect-bearing contents are explicitly incomplete.
        if (
          (section !== undefined || TEXT_ARGUMENTS.has(current.name)) &&
          /[\\$]/.test(arg.value)
        ) {
          stop(
            'unsupported-effect',
            'Nonliteral executable command arguments require unsupported expansion.',
            origin(frame, arg.innerStart, arg.innerEnd)
          );
          break;
        }
        pos = arg.end;
      }
      if (failure) continue;
      frame.pos = pos;
      append(frame, token.start, pos, section === undefined);
      continue;
    }
    // Unknown ordinary commands are retained under the documented no-expansion
    // assumption. Braced arguments may store effects, so their semantics must stop.
    const nextArg = argument(text, current.end, source.scanOptions);
    if (nextArg && !SAFE_COMMANDS.has(current.name)) {
      stop(
        'unsupported-effect',
        `Arguments of \\${current.name} have no supported execution grammar.`,
        at
      );
      continue;
    }
    append(frame, token.start, frame.pos);
  }
  if (!failure && scopes.length) {
    const last = selectedTokens[selectedTokens.length - 1];
    stop('structural-error', 'Unclosed selected execution scope.', last?.origin ?? null, 'blocked');
  }
  const base = {
    kind: 'view' as const,
    id,
    snapshotId: source.id,
    configuration: config,
    occurrences,
    decisions,
    reachedFacts,
    selectedTokens,
  };
  if (failure)
    return freeze({ ...base, ...failure, root: null, coverage: coverage([failure.reason]) });
  const parsed = parseConfiguredStructure(selectedTokens, id, config.limits.maxNesting);
  if (parsed.kind === 'error') {
    const inputChain: string[] = [];
    let occurrence = occurrences.find((o) => o.id === parsed.issue.inputChain[0]);
    while (occurrence) {
      inputChain.unshift(occurrence.id);
      const parentId = occurrence.parentId;
      occurrence = parentId === null ? undefined : occurrences.find((o) => o.id === parentId);
    }
    const reason = { ...parsed.issue, inputChain };
    return freeze({
      ...base,
      status: 'blocked',
      root: null,
      reason,
      coverage: coverage([reason]),
    });
  }
  return freeze({ ...base, status: 'ready', root: parsed.root, coverage: coverage([]) });
}
