import type {
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
  TransformationRequest,
} from '../../project-types.js';
import { commentEdits } from './comment-edits.js';
import { environmentActions, environmentSourceEdits, nodeSourceEdits } from './node-edits.js';
import { sourceChanges, type TextChange } from './text-edits.js';
import { invalid } from './shared.js';

/** Canonical source edits. Also recomputed when validating an untrusted node edit plan. */
export function sourceOperationEdits(
  source: ProjectSnapshot,
  request: TransformationRequest,
  view?: ProjectView
): ProjectEdit[] {
  if (request.operation === 'identity') return [];
  if (request.operation === 'edit-nodes') {
    if (!view || request.options.target !== 'selected') invalid('Expected selected source edits.');
    return nodeSourceEdits(view, request.options.actions);
  }
  if (request.operation === 'remove-environments') {
    return request.options.target === 'source'
      ? environmentSourceEdits(source, request.options.names, request.options.scope)
      : view
        ? nodeSourceEdits(view, environmentActions(view, request.options.names))
        : invalid('Expected a configured view.');
  }
  if (request.operation !== 'suppress-comments')
    invalid('This operation does not produce source edits.');
  const files = source.files.filter(
    (f) => request.options.scope?.kind !== 'files' || request.options.scope.paths.includes(f.path)
  );
  const comments = commentEdits(source, files, view);
  if (!request.options.suppressCommentEnvironments) return comments;
  const environments = view
    ? nodeSourceEdits(view, environmentActions(view, ['comment']))
    : environmentSourceEdits(source, ['comment'], request.options.scope);
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
