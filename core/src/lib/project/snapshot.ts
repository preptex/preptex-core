import type { SourceFile } from '../../api-types.js';
import type {
  InventoryRequest,
  InventoryResult,
  NormalizedScanOptions,
  ProjectSnapshot,
  ProjectSourceChange,
  ScanOptions,
  SourceScope,
  SyntaxFact,
} from '../../project-types.js';
import { normalizeProjectFilePath } from '../validation.js';
import {
  array,
  bounded,
  CORE_VERSION,
  coverage,
  fields,
  freeze,
  identity,
  invalid,
  record,
  string,
} from './shared.js';
import { scanFile } from './scan.js';
import { knownSnapshot, rememberSnapshot } from './canonical.js';

export function normalizeScanOptions(value: unknown = {}): NormalizedScanOptions {
  const opts = record(value, 'scanOptions');
  fields(opts, ['verbatimEnvironments', 'maxNesting'], 'scanOptions');
  const names =
    opts['verbatimEnvironments'] === undefined
      ? []
      : array(opts['verbatimEnvironments'], 'verbatimEnvironments').map((v) => {
          const name = string(v, 'verbatim environment name');
          if (!/^[A-Za-z]+\*?$/.test(name))
            invalid('Verbatim environment names must contain letters and an optional final star.');
          return name;
        });
  return {
    verbatimEnvironments: [...new Set(['verbatim', 'verbatim*', 'comment', ...names])].sort(),
    maxNesting: bounded(opts['maxNesting'], 64, 256, 'maxNesting'),
  };
}

function sourceFile(value: unknown): SourceFile {
  const file = record(value, 'source file');
  fields(file, ['path', 'source', 'version'], 'source file');
  const path = normalizeProjectFilePath(file['path'], 'source file path');
  const source = string(file['source'], 'source');
  const version = file['version'];
  if (typeof version !== 'number' || !Number.isFinite(version))
    invalid('File version must be finite.');
  return { path, source, version };
}

/**
 * Scan every supplied source independently without requiring structural validity.
 * @param files - Caller-owned source files, never mutated; duplicate normalized paths are rejected.
 * @param scanOptions - Recognized protected regions and inventory nesting bounds.
 * @returns A deterministic, deeply frozen, transport-safe snapshot in path order.
 * @throws {@link PrepTexError} with InvalidArgument for invalid inputs. Source errors are localized coverage issues.
 */
export function createProjectSnapshot(
  files: readonly SourceFile[],
  scanOptions: ScanOptions = {}
): ProjectSnapshot {
  const options = normalizeScanOptions(scanOptions);
  const sources = array(files, 'files')
    .map(sourceFile)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (let i = 1; i < sources.length; i++)
    if (sources[i]!.path === sources[i - 1]!.path) invalid('Duplicate normalized source path.');
  const id = identity('snapshot', [CORE_VERSION, 1, options, sources]);
  return rememberSnapshot(
    freeze({
      kind: 'snapshot',
      id,
      coreVersion: CORE_VERSION,
      schemaVersion: 1,
      scanOptions: options,
      files: sources.map((file) => scanFile(file, options)),
    })
  );
}

// Rebuild derived fields at the public transport boundary; never trust transported facts.
export function validateSnapshot(value: unknown): ProjectSnapshot {
  if (knownSnapshot(value)) return value;
  const snapshot = record(value, 'snapshot');
  fields(
    snapshot,
    ['kind', 'id', 'coreVersion', 'schemaVersion', 'scanOptions', 'files'],
    'snapshot'
  );
  if (
    snapshot['kind'] !== 'snapshot' ||
    snapshot['coreVersion'] !== CORE_VERSION ||
    snapshot['schemaVersion'] !== 1
  )
    invalid('Unsupported snapshot representation/version.');
  const options = normalizeScanOptions(snapshot['scanOptions']);
  const files = array(snapshot['files'], 'snapshot.files').map((value) => {
    const file = record(value, 'scanned file');
    fields(file, ['path', 'source', 'version', 'tokens', 'facts', 'coverage'], 'scanned file');
    return sourceFile({ path: file['path'], source: file['source'], version: file['version'] });
  });
  const rebuilt = createProjectSnapshot(files, options);
  if (snapshot['id'] !== rebuilt.id) invalid('Stale or inconsistent snapshot identity.');
  return rebuilt;
}

/**
 * Apply source additions/replacements/removals atomically, reusing unchanged scans.
 * Equal revision with different contents, older revisions, duplicate changes, and absent removals fail.
 * @param snapshot - Exact source snapshot; mutable transported copies are validated and rebuilt.
 * @param changes - Caller-owned changes; ordering does not affect the resulting identity.
 * @param scanOptions - Optional replacement scan settings; omission retains the current settings.
 * @returns A deeply frozen snapshot; identical inputs retain snapshot identity. Unchanged contents/settings retain token and fact arrays, including revision-only updates. No caller source is modified.
 * @throws {@link PrepTexError} with InvalidArgument on an invalid/conflicting change or stale snapshot.
 */
export function updateProjectSnapshot(
  snapshot: ProjectSnapshot,
  changes: readonly ProjectSourceChange[],
  scanOptions?: ScanOptions
): ProjectSnapshot {
  const base = validateSnapshot(snapshot);
  const files = new Map(
    base.files.map((f) => [f.path, { path: f.path, source: f.source, version: f.version }])
  );
  const changed = new Set<string>();
  for (const raw of array(changes, 'changes')) {
    const change = record(raw, 'change');
    let path: string;
    if (change['kind'] === 'upsert') {
      fields(change, ['kind', 'file'], 'upsert');
      const file = sourceFile(change['file']);
      path = file.path;
      const old = files.get(path);
      if (
        old &&
        (file.version < old.version || (file.version === old.version && file.source !== old.source))
      )
        invalid('Source updates require a newer revision when contents change.');
      files.set(path, file);
    } else if (change['kind'] === 'remove') {
      fields(change, ['kind', 'path'], 'remove');
      path = normalizeProjectFilePath(change['path'], 'removed path');
      if (!files.delete(path)) invalid('Cannot remove an absent source file.');
    } else invalid('Unknown source change kind.');
    if (changed.has(path)) invalid('Only one change per normalized file path is allowed.');
    changed.add(path);
  }
  const options = normalizeScanOptions(scanOptions === undefined ? base.scanOptions : scanOptions);
  const sameOptions = JSON.stringify(options) === JSON.stringify(base.scanOptions);
  const ordered = [...files.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  const previous = new Map(base.files.map((f) => [f.path, f]));
  const scanned = ordered.map((file) => {
    const old = previous.get(file.path);
    if (sameOptions && old && old.source === file.source)
      return old.version === file.version ? old : freeze({ ...old, version: file.version });
    return freeze(scanFile(file, options));
  });
  const id = identity('snapshot', [CORE_VERSION, 1, options, ordered]);
  if (id === base.id) return base;
  return rememberSnapshot(
    freeze({
      kind: 'snapshot',
      id,
      coreVersion: CORE_VERSION,
      schemaVersion: 1,
      scanOptions: options,
      files: scanned,
    })
  );
}

export function normalizeScope(value: unknown = { kind: 'all-files' }): SourceScope {
  const scope = record(value, 'scope');
  if (scope['kind'] === 'all-files') {
    fields(scope, ['kind'], 'scope');
    return { kind: 'all-files' };
  }
  if (scope['kind'] !== 'files') invalid('Invalid source scope.');
  fields(scope, ['kind', 'paths'], 'scope');
  const paths = array(scope['paths'], 'scope.paths')
    .map((v) => normalizeProjectFilePath(v, 'scope path'))
    .sort();
  if (!paths.length || new Set(paths).size !== paths.length)
    invalid('File scope requires unique paths and at least one file.');
  return { kind: 'files', paths };
}

export const FACT_KINDS: readonly SyntaxFact['kind'][] = [
  'definition',
  'command-use',
  'label',
  'reference',
  'condition-declaration',
  'condition-test',
  'condition-delimiter',
  'condition-assignment',
  'input',
  'opaque',
];

export function normalizeInventory(value: unknown = {}): Required<InventoryRequest> {
  const request = record(value, 'inventory options');
  fields(request, ['scope', 'kinds'], 'inventory options');
  const kinds =
    request['kinds'] === undefined
      ? [...FACT_KINDS]
      : array(request['kinds'], 'kinds').map((v) => {
          const match = FACT_KINDS.find((k) => k === v);
          if (!match) invalid('Invalid inventory fact kind.');
          return match;
        });
  return { scope: normalizeScope(request['scope']), kinds: [...new Set(kinds)].sort() };
}

/**
 * Obtain located recognized syntax without interpreting, serializing, or generating output.
 * @param snapshot - Source authority; returned facts are validated source-derived data.
 * @param request - Optional explicit file scope and fact kinds; empty kinds returns no facts.
 * @returns Frozen inventory, exact result identity, and coverage for only the requested files.
 * @throws {@link PrepTexError} with InvalidArgument for stale snapshots, missing requested files, or malformed options.
 */
export function inspectProject(
  snapshot: ProjectSnapshot,
  request: InventoryRequest = {}
): InventoryResult {
  const source = validateSnapshot(snapshot);
  const options = normalizeInventory(request);
  const scope = options.scope;
  if (scope.kind === 'files' && scope.paths.some((p) => !source.files.some((f) => f.path === p)))
    invalid('Inventory requests an absent source file.');
  const files = source.files.filter(
    (file) => scope.kind === 'all-files' || scope.paths.includes(file.path)
  );
  return freeze({
    kind: 'inventory',
    snapshotId: source.id,
    resultId: identity('inventory', [source.id, 1, options]),
    operationId: 'source-inventory',
    operationVersion: 1,
    facts: files.flatMap((file) => file.facts.filter((f) => options.kinds.includes(f.kind))),
    coverage: coverage(files.flatMap((f) => f.coverage.issues)),
  });
}
