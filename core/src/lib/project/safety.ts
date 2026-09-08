import type { ProjectEdit, ProjectView, SelectedToken } from '../../project-types.js';
import { reject } from './fail.js';
import { lineStarts, rangeAt } from './shared.js';

export function eligibleToken(token: SelectedToken): boolean {
  return token.interpretation === 'structure' && token.token.kind !== 'verbatim';
}

export function validateOccurrenceEdits(view: ProjectView, edits: readonly ProjectEdit[]): void {
  for (const edit of edits) {
    const occurrences = view.occurrences.filter((o) => o.path === edit.path);
    if (!occurrences.length)
      reject('edit-conflict', 'A selected edit targets a file with no reached occurrence.');
    for (const occurrence of occurrences) {
      const spans = view.selectedTokens
        .filter((t) => t.origin.occurrenceId === occurrence.id && eligibleToken(t))
        .map((t) => t.origin.range)
        .sort((a, b) => a.start - b.start);
      const start = edit.kind === 'replace' ? edit.range.start : edit.offset;
      const end = edit.kind === 'replace' ? edit.range.end + 1 : edit.offset;
      let covered = start;
      let insertionCovered = false;
      for (const span of spans) {
        if (span.start <= covered && span.end + 1 > covered) covered = span.end + 1;
        if (start > span.start && start <= span.end) insertionCovered = true;
      }
      if (edit.kind === 'insert' ? !insertionCovered : covered < end)
        reject(
          'edit-conflict',
          'The physical edit is inactive, opaque, disjoint, or protected in an inclusion occurrence.',
          [
            {
              snapshotId: view.snapshotId,
              occurrenceId: occurrence.id,
              path: edit.path,
              range:
                edit.kind === 'replace'
                  ? edit.range
                  : rangeAt(
                      lineStarts(
                        view.snapshot.files.find((file) => file.path === edit.path)!.source
                      ),
                      start,
                      start - 1
                    ),
            },
          ]
        );
    }
  }
}
