import type {
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
  ScannedFile,
  SourceScope,
  TransformationRequest,
} from '../../project-types.js';
import { commentEdits } from './comment-edits.js';
import { realizeProjectConditions } from './conditions.js';
import { reject } from './fail.js';
import {
  buildExpandInputsSourceEdits,
  collectReachableFiles,
  resolveEntryPath,
} from './input-edits.js';
import {
  environmentActions,
  nodeSourceEdits,
  snapshotEnvironmentRemovalEdits,
} from './node-edits.js';
import { runCompositeTransformation } from './composite.js';
import { symbolRefactorSourceEdits } from './refactor.js';
import { sourceChanges, type TextChange } from './text-edits.js';
import { invalid } from './shared.js';

function scopedFilesForSourceOp(
  source: ProjectSnapshot,
  options?: { readonly entryPath?: string; readonly traversal?: 'project' | 'file-only' }
): readonly ScannedFile[] {
  if (options?.entryPath === undefined && options?.traversal === undefined) {
    return source.files;
  }
  const entry = resolveEntryPath(source, options.entryPath);
  return collectReachableFiles(source, entry, options.traversal ?? 'project');
}

function scopeFromFiles(
  source: ProjectSnapshot,
  options?: { readonly entryPath?: string; readonly traversal?: 'project' | 'file-only' }
): SourceScope | undefined {
  if (options?.entryPath === undefined && options?.traversal === undefined) {
    return undefined;
  }
  return {
    kind: 'files',
    paths: scopedFilesForSourceOp(source, options).map((f) => f.path),
  };
}

/** Canonical source edits. Also recomputed when validating an untrusted node edit plan. */
export function sourceOperationEdits(
  source: ProjectSnapshot,
  request: TransformationRequest,
  view?: ProjectView
): ProjectEdit[] {
  if (request.operation === 'realize-conditions') {
    const realized = realizeProjectConditions(source, request.options);
    if (realized.status !== 'ready' || !realized.editPlan) {
      reject(
        'unavailable',
        realized.coverage.issues.map((i) => i.message).join(' ') ||
          'Condition realization could not complete.'
      );
    }
    return [...realized.editPlan.edits];
  }
  if (request.operation === 'expand-inputs') {
    if (request.options.target === 'artifact') invalid('Expected source edits.');
    return buildExpandInputsSourceEdits(
      source,
      request,
      request.options.target === 'source' ? undefined : view
    );
  }
  if (request.operation === 'edit-nodes') {
    if (!view || request.options.target !== 'selected') invalid('Expected selected source edits.');
    return nodeSourceEdits(view, request.options.actions);
  }
  if (request.operation === 'remove-environments') {
    if (request.options.target === 'source') {
      const scope = scopeFromFiles(source, request.options);
      return snapshotEnvironmentRemovalEdits(source, request.options.names, scope);
    }
    if (!view || request.options.target !== 'selected') invalid('Expected selected source edits.');
    return nodeSourceEdits(view, environmentActions(view, request.options.names));
  }
  if (request.operation === 'refactor-symbols') {
    if (request.options.target === 'artifact') invalid('Expected source edits.');
    const scope =
      request.options.target === 'source' || !view
        ? scopeFromFiles(source, request.options)
        : undefined;
    return symbolRefactorSourceEdits(
      request.options.target === 'source' ? source : (view ?? source),
      request.options.actions,
      scope
    );
  }
  if (request.operation === 'compose-transformations') {
    const res = runCompositeTransformation(view ?? source, request.options);
    if (!res.editPlan) invalid('Composite transformation did not produce source edits.');
    return [...res.editPlan.edits];
  }
  if (request.operation !== 'suppress-comments')
    invalid('This operation does not produce source edits.');
  const isSourceTarget = request.options?.target === 'source';
  if (!isSourceTarget && !view) invalid('Expected a configured view.');
  const targetFiles = isSourceTarget
    ? scopedFilesForSourceOp(source, request.options)
    : source.files;
  const comments = commentEdits(source, targetFiles, isSourceTarget ? undefined : view);
  if (!request.options?.suppressCommentEnvironments) return comments;
  const environments = isSourceTarget
    ? snapshotEnvironmentRemovalEdits(source, ['comment'], scopeFromFiles(source, request.options))
    : nodeSourceEdits(view!, environmentActions(view!, ['comment']));
  const byPath = new Map<string, TextChange[]>();
  // Recompute lexical joins over the combined removals, including adjacent comments.
  for (const edit of [...comments, ...environments]) {
    if (edit.kind !== 'replace') invalid('Expected a complete comment removal.');
    const bucket = byPath.get(edit.path) ?? [];
    bucket.push({ start: edit.range.start, end: edit.range.end + 1, text: '' });
    byPath.set(edit.path, bucket);
  }
  for (const [path, edits] of byPath) {
    const sorted = edits.sort((a, b) => a.start - b.start || b.end - a.end),
      merged: TextChange[] = [];
    for (const edit of sorted) {
      const last = merged[merged.length - 1];
      if (last && edit.start <= last.end) last.end = Math.max(last.end, edit.end);
      else merged.push({ ...edit });
    }
    byPath.set(path, merged);
  }
  return sourceChanges(source, byPath);
}
