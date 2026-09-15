import type { ProjectEdit, ProjectSnapshot } from '../../project-types.js';
import { boundaryDelimiter, lastToken } from './emission.js';
import { lineStarts, rangeAt } from './shared.js';
import { reject } from './fail.js';

export interface TextChange {
  start: number;
  end: number;
  text: string;
}
/** Combine planned boundary inserts without relaxing the public overlap rules. */
export function normalizeChanges(changes: readonly TextChange[]): TextChange[] {
  const replacements = changes
    .filter((e) => e.end > e.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  for (let i = 1; i < replacements.length; i++)
    if (replacements[i]!.start < replacements[i - 1]!.end)
      reject('edit-conflict', 'Overlapping planned replacements.');
  const inserts = new Map<number, string>();
  for (const e of changes.filter((e) => e.start === e.end))
    inserts.set(e.start, (inserts.get(e.start) ?? '') + e.text);
  const result = replacements.map((e) => {
    for (const at of inserts.keys())
      if (at > e.start && at < e.end)
        reject('edit-conflict', 'A wrapper falls inside a replaced range.');
    const text = (inserts.get(e.start) ?? '') + e.text;
    inserts.delete(e.start);
    return { ...e, text };
  });
  result.push(...[...inserts].map(([start, text]) => ({ start, end: start, text })));
  return result.sort((a, b) => a.start - b.start);
}
export function sourceChanges(
  snapshot: ProjectSnapshot,
  byPath: ReadonlyMap<string, readonly TextChange[]>
): ProjectEdit[] {
  const result: ProjectEdit[] = [];
  for (const file of snapshot.files) {
    const edits = normalizeChanges(byPath.get(file.path) ?? []),
      lines = lineStarts(file.source);
    let prefix = '',
      pos = 0;
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]!;
      prefix += file.source.slice(pos, edit.start);
      let next = '';
      let tail = edit.end;
      for (let j = i + 1; j < edits.length; j++) {
        const e = edits[j]!;
        if (e.start > tail) {
          next = file.source.slice(tail, e.start);
          break;
        }
        if (e.text) {
          next = e.text;
          break;
        }
        tail = e.end;
      }
      if (!next) next = file.source.slice(tail);
      const left = edit.text
        ? boundaryDelimiter(lastToken(prefix, snapshot.scanOptions), edit.text)
        : '';
      const text = left + edit.text;
      const replacement =
        text + boundaryDelimiter(lastToken(prefix + text, snapshot.scanOptions), next);
      result.push(
        edit.end === edit.start
          ? { kind: 'insert', path: file.path, offset: edit.start, text: replacement }
          : {
              kind: 'replace',
              path: file.path,
              range: rangeAt(lines, edit.start, edit.end - 1),
              expected: file.source.slice(edit.start, edit.end),
              replacement,
            }
      );
      prefix += replacement;
      pos = edit.end;
    }
  }
  return result;
}
