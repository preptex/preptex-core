import type {
  EnvironmentDelimiter,
  EnvironmentInventory,
  SourceEnvironment,
  EnvironmentSelection,
} from '../../node-types.js';
import type { ProjectSnapshot, ScannedFile, SourceScope } from '../../project-types.js';
import { argument, lex, skipTrivia } from './scan.js';
import { normalizeScope, validateSnapshot } from './snapshot.js';
import {
  coverage,
  fields,
  freeze,
  identity,
  invalid,
  issue,
  lineStarts,
  rangeAt,
  record,
} from './shared.js';
import { reject } from './fail.js';
import { environmentContext } from './environment-context.js';

const lineCache = new WeakMap<ScannedFile, readonly number[]>();
export function fileLines(file: ScannedFile): readonly number[] {
  let lines = lineCache.get(file);
  if (!lines) {
    lines = lineStarts(file.source);
    lineCache.set(file, lines);
  }
  return lines;
}

/** Internal common literal-name grammar; no expansion or raw TeX arguments. */
export function environmentName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9@*-]{0,127}$/.test(value))
    invalid(
      'Environment names must be 1–128 literal letters/digits/@/*/-, starting with a letter.'
    );
  return value;
}

export function readDelimiter(
  file: ScannedFile,
  start: number,
  snapshot: ProjectSnapshot
): EnvironmentDelimiter | null {
  const token = lex(file.source, start, snapshot.scanOptions, false);
  if (token.name !== 'begin' && token.name !== 'end') return null;
  const arg = argument(file.source, token.end, snapshot.scanOptions);
  if (!arg || !/^[A-Za-z][A-Za-z0-9@*-]{0,127}$/.test(arg.value)) return null;
  const lines = fileLines(file);
  return {
    path: file.path,
    name: arg.value,
    range: rangeAt(lines, start, arg.end - 1),
    nameRange: rangeAt(lines, arg.innerStart, arg.innerEnd),
  };
}

function scanEnvironments(snapshot: ProjectSnapshot, file: ScannedFile): SourceEnvironment[] {
  const lines = fileLines(file);
  const result: SourceEnvironment[] = [];
  const stacks = new Map<string, number[]>();
  const contextAt = environmentContext(file);
  const groups = new Map<string, number[]>();
  function add(start: number, protectedRegion: boolean, closer = false): number {
    const delimiter = readDelimiter(file, start, snapshot);
    const token = lex(file.source, start, snapshot.scanOptions, false);
    const context = contextAt(start);
    const index = result.length;
    result.push({
      id: '',
      snapshotId: snapshot.id,
      path: file.path,
      version: file.version,
      name: delimiter?.name ?? null,
      status: 'candidate',
      range: delimiter?.range ?? rangeAt(lines, start, token.end - 1),
      opening: closer ? null : delimiter,
      closing: closer ? delimiter : null,
      body: null,
      context,
      protected: protectedRegion,
      reason: 'Unmatched or ambiguous environment delimiter.',
    });
    return index;
  }
  function pair(open: number, closing: EnvironmentDelimiter): void {
    const old = result[open]!;
    result[open] = {
      ...old,
      status: 'matched',
      closing,
      range: rangeAt(lines, old.range.start, closing.range.end),
      body: rangeAt(lines, old.opening!.range.end + 1, closing.range.start - 1),
      reason: null,
    };
  }
  const recognized = new Set(
    file.facts
      .filter((f) => f.kind === 'command-use' && (f.name === 'begin' || f.name === 'end'))
      .map((f) => f.range.start)
  );
  for (const token of file.tokens) {
    if (token.kind === 'open' || token.kind === 'close') {
      const key = JSON.stringify(contextAt(token.range.start)),
        group = groups.get(key) ?? [];
      if (token.kind === 'open') group.push(token.range.start);
      else group.pop();
      groups.set(key, group);
      continue;
    }
    if (token.kind === 'verbatim' && token.value.startsWith('\\begin')) {
      const index = add(token.range.start, true);
      const opening = result[index]!.opening;
      if (opening) {
        const spelling = `\\end{${opening.name}}`;
        const start = token.range.end + 1 - spelling.length;
        if (
          start > opening.range.end &&
          file.source.slice(start, token.range.end + 1) === spelling
        ) {
          const closing = readDelimiter(file, start, snapshot);
          if (closing) pair(index, closing);
        }
      }
      continue;
    }
    if (token.kind !== 'command' || !recognized.has(token.range.start)) continue;
    const closer = token.value === '\\end';
    const index = add(token.range.start, false, closer);
    const current = result[index]!;
    const contextKey = JSON.stringify(current.context);
    const key = JSON.stringify([current.context, groups.get(contextKey) ?? []]);
    const stack = stacks.get(key) ?? [];
    stacks.set(key, stack);
    if (!closer) {
      stack.push(index);
      continue;
    }
    const open = stack.pop();
    if (open === undefined || !current.closing || result[open]!.name !== current.name) {
      // Any crossing pair poisons the currently open nesting, not just one closer.
      stack.length = 0;
      continue;
    }
    pair(open, current.closing);
    result.pop();
  }
  return result
    .sort((a, b) => a.range.start - b.range.start)
    .map((e, i) => ({ ...e, id: `${file.path}:e${i}` }));
}
const cache = new WeakMap<ProjectSnapshot, readonly SourceEnvironment[]>();
export function sourceEnvironments(snapshot: ProjectSnapshot): readonly SourceEnvironment[] {
  let result = cache.get(snapshot);
  if (!result) {
    result = freeze(snapshot.files.flatMap((file) => scanEnvironments(snapshot, file)));
    cache.set(snapshot, result);
  }
  return result;
}

/**
 * Inspect literal environment syntax independently of condition resolution.
 * @param snapshot - Original source authority; transported derived data is rebuilt.
 * @param scope - All files by default, or an explicit nonempty file scope.
 * @returns Frozen path/offset ordered matches and located candidates with coverage.
 * @throws {@link PrepTexError} for malformed scope or absent files.
 */
export function inspectProjectEnvironments(
  snapshot: ProjectSnapshot,
  scope?: SourceScope
): EnvironmentInventory {
  const source = validateSnapshot(snapshot);
  const normalized = normalizeScope(scope);
  if (
    normalized.kind === 'files' &&
    normalized.paths.some((p) => !source.files.some((f) => f.path === p))
  )
    invalid('Environment scope contains an absent file.');
  const files = source.files.filter(
    (f) => normalized.kind !== 'files' || normalized.paths.includes(f.path)
  );
  const paths = new Set(files.map((f) => f.path));
  const environments = sourceEnvironments(source).filter((e) => paths.has(e.path));
  return freeze({
    kind: 'environments',
    snapshotId: source.id,
    resultId: identity('environments', [source.id, normalized, 1]),
    environments,
    coverage: coverage([
      ...files.flatMap((f) => f.coverage.issues),
      ...environments
        .filter((e) => e.status === 'candidate')
        .map((e) => issue('malformed-syntax', e.reason!, { path: e.path, range: e.range })),
    ]),
  });
}

/**
 * Resolve a source-environment selection without trusting copied delimiter data.
 * @param snapshot - Exact owning snapshot.
 * @param selection - Public inventory identity and file revision.
 * @returns Canonical frozen environment, which may be a non-editable candidate.
 * @throws {@link ProjectOperationError} with StaleResult for an obsolete or unknown selection.
 */
export function getSelectedEnvironment(
  snapshot: ProjectSnapshot,
  selection: EnvironmentSelection
): SourceEnvironment {
  const source = validateSnapshot(snapshot);
  const s = record(selection, 'environment selection');
  fields(s, ['kind', 'snapshotId', 'path', 'version', 'environmentId'], 'environment selection');
  const found = sourceEnvironments(source).find(
    (e) => e.id === s['environmentId'] && e.path === s['path'] && e.version === s['version']
  );
  if (s['kind'] !== 'source-environment' || s['snapshotId'] !== source.id || !found)
    reject('stale-result', 'Unknown or stale source environment selection.');
  return found;
}

export function hasEnvironmentArguments(
  file: ScannedFile,
  opening: EnvironmentDelimiter,
  snapshot: ProjectSnapshot
): boolean {
  const pos = skipTrivia(file.source, opening.range.end + 1, snapshot.scanOptions);
  return file.source[pos] === '[' || file.source[pos] === '{';
}
