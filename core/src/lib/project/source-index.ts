import type { ProjectSnapshot, ProjectView, ConfiguredNode } from '../../project-types.js';
import type {
  ProjectSourceIndex,
  SourceInterval,
  SourceLookupFile,
  SourceLookupHit,
  SourceLookupQuery,
} from '../../node-types.js';
import { validateSnapshot } from './snapshot.js';
import { validateView } from './view.js';
import { sourceEnvironments } from './environments.js';
import { array, fields, freeze, identity, invalid, lineStarts, record } from './shared.js';
import { normalizeProjectFilePath } from '../validation.js';

const indexes = new WeakMap<ProjectSnapshot | ProjectView, ProjectSourceIndex>();
const known = new WeakSet<ProjectSourceIndex>();
function tree(hits: SourceLookupHit[], start = 0, end = hits.length): SourceInterval | null {
  if (start === end) return null;
  const middle = (start + end) >>> 1,
    hit = hits[middle]!;
  const left = tree(hits, start, middle),
    right = tree(hits, middle + 1, end);
  return {
    hit,
    left,
    right,
    maxEnd: Math.max(hit.location.range.end, left?.maxEnd ?? -1, right?.maxEnd ?? -1),
  };
}
/**
 * Build a clone-safe original-source interval index once per immutable model.
 * @param model - Source snapshot or configured view; incomplete views have no node hits.
 * @returns Frozen per-file line/interval indexes. Canonical repeat calls reuse object identity.
 * @throws {@link PrepTexError} on malformed source/view transports.
 * @remarks Construction costs O(n log n) for n indexed spans. Queries prune nonoverlapping subtrees;
 * nodes with several origins are indexed separately and repeated inclusions remain distinct.
 */
export function createProjectSourceIndex(model: ProjectSnapshot | ProjectView): ProjectSourceIndex {
  const input = record(model, 'index model');
  const canonical = input['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const old = indexes.get(canonical);
  if (old) return old;
  const source = canonical.kind === 'snapshot' ? canonical : canonical.snapshot;
  const byPath = new Map(source.files.map((f) => [f.path, [] as SourceLookupHit[]]));
  for (const file of source.files)
    file.tokens.forEach((token, tokenIndex) =>
      byPath
        .get(file.path)!
        .push({ kind: 'token', tokenIndex, location: { path: file.path, range: token.range } })
    );
  for (const e of sourceEnvironments(source))
    byPath.get(e.path)!.push({
      kind: 'environment',
      location: { path: e.path, range: e.range },
      selection: {
        kind: 'source-environment',
        snapshotId: source.id,
        path: e.path,
        version: e.version,
        environmentId: e.id,
      },
    });
  if (canonical.kind === 'view' && canonical.root) {
    const pending: { node: ConfiguredNode; depth: number }[] = [{ node: canonical.root, depth: 0 }];
    let order = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      for (const location of node.location.spans)
        byPath.get(location.path)!.push({
          kind: 'node',
          location,
          depth,
          order,
          selection: {
            kind: 'node',
            snapshotId: source.id,
            viewId: canonical.id,
            nodeKey: node.occurrenceKey,
          },
        });
      order++;
      if (node.kind !== 'token')
        for (let i = node.children.length - 1; i >= 0; i--)
          pending.push({ node: node.children[i]!, depth: depth + 1 });
    }
  }
  const viewId = canonical.kind === 'view' ? canonical.id : null;
  const result: ProjectSourceIndex = freeze({
    kind: 'source-index',
    model: canonical,
    snapshotId: source.id,
    viewId,
    id: identity('source-index', [source.id, viewId, 1]),
    files: source.files.map((file) => ({
      path: file.path,
      version: file.version,
      length: file.source.length,
      lineStarts: lineStarts(file.source),
      intervals: tree(
        byPath
          .get(file.path)!
          .sort(
            (a, b) =>
              a.location.range.start - b.location.range.start ||
              a.location.range.end - b.location.range.end
          )
      ),
    })),
  });
  indexes.set(canonical, result);
  known.add(result);
  return result;
}
function checked(value: ProjectSourceIndex): ProjectSourceIndex {
  if (known.has(value)) return value;
  const input = record(value, 'source index');
  fields(input, ['kind', 'model', 'snapshotId', 'viewId', 'id', 'files'], 'source index');
  const authority = record(input['model'], 'index authority');
  const model =
    authority['kind'] === 'snapshot'
      ? validateSnapshot(input['model'])
      : validateView(input['model']);
  const result = createProjectSourceIndex(model);
  if (
    input['kind'] !== 'source-index' ||
    input['id'] !== result.id ||
    input['snapshotId'] !== result.snapshotId ||
    input['viewId'] !== result.viewId
  )
    invalid('Stale source index identity.');
  return result;
}
function findFile(index: ProjectSourceIndex, path: string): SourceLookupFile {
  const normalized = normalizeProjectFilePath(path, 'lookup path');
  let low = 0,
    high = index.files.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index.files[mid]!.path < normalized) low = mid + 1;
    else high = mid;
  }
  const file = index.files[low];
  if (!file || file.path !== normalized) invalid('Lookup path is absent.');
  return file;
}
/**
 * Find tokens, environment occurrences and nodes intersecting original source.
 * @param index - Owning immutable index; mutable transported indexes are rebuilt on each call.
 * @param query - Inclusive UTF-16 point/range and optional category/inclusion filters.
 * @returns Frozen hits, nodes innermost first then encounter order; other hits follow by start/end/kind.
 * A multi-span node contributes each intersecting span. EOF point queries return no hits.
 * @throws {@link PrepTexError} for invalid bounds, paths, filters or index identity.
 */
export function lookupProjectSource(
  index: ProjectSourceIndex,
  query: SourceLookupQuery
): readonly SourceLookupHit[] {
  const current = checked(index),
    q = record(query, 'lookup query');
  fields(q, ['path', 'start', 'end', 'kinds', 'occurrenceId'], 'lookup query');
  const file = findFile(current, query.path),
    start = q['start'],
    end = q['end'] ?? start;
  if (
    typeof start !== 'number' ||
    !Number.isSafeInteger(start) ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end > file.length ||
    (end === file.length && end !== start)
  )
    invalid('Invalid inclusive source lookup bounds.');
  const kinds =
    q['kinds'] === undefined ? ['node', 'environment', 'token'] : array(q['kinds'], 'lookup kinds');
  if (kinds.some((k) => typeof k !== 'string' || !['node', 'environment', 'token'].includes(k)))
    invalid('Invalid lookup kind.');
  if (q['occurrenceId'] !== undefined && typeof q['occurrenceId'] !== 'string')
    invalid('Invalid inclusion filter.');
  const result: SourceLookupHit[] = [];
  const from = start,
    until = end;
  function visit(node: SourceInterval | null): void {
    if (!node || node.maxEnd < from) return;
    visit(node.left);
    const hit = node.hit;
    if (hit.location.range.start > until) return;
    if (
      hit.location.range.end >= from &&
      kinds.includes(hit.kind) &&
      (q['occurrenceId'] === undefined ||
        (hit.kind === 'node' && hit.location.occurrenceId === q['occurrenceId']))
    )
      result.push(hit);
    visit(node.right);
  }
  if (start < file.length) visit(file.intervals);
  return freeze(
    result.sort((a, b) =>
      a.kind === 'node' && b.kind === 'node'
        ? b.depth - a.depth || a.order - b.order || a.location.range.start - b.location.range.start
        : a.kind === 'node'
          ? -1
          : b.kind === 'node'
            ? 1
            : a.location.range.start - b.location.range.start ||
              a.location.range.end - b.location.range.end ||
              (a.kind < b.kind ? -1 : 1)
    )
  );
}
/**
 * Convert an original source line and UTF-16 column to a source offset.
 * @param index - Owning source index.
 * @param path - Original virtual file path.
 * @param line - One-based line number, including an empty final line after a newline.
 * @param column - Zero-based raw UTF-16 column; default zero. Includes original newline units.
 * @returns Original offset; the last line permits EOF. No source normalization is performed.
 * @throws {@link PrepTexError} for absent files or out-of-range coordinates.
 */
export function sourceOffsetAt(
  index: ProjectSourceIndex,
  path: string,
  line: number,
  column = 0
): number {
  const file = findFile(checked(index), path);
  if (
    !Number.isSafeInteger(line) ||
    line < 1 ||
    line > file.lineStarts.length ||
    !Number.isSafeInteger(column) ||
    column < 0
  )
    invalid('Invalid source line/column.');
  const start = file.lineStarts[line - 1]!,
    end = file.lineStarts[line] ?? file.length + 1;
  if (start + column >= end) invalid('Source column crosses its original line.');
  return start + column;
}
