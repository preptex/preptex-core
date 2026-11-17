import type {
  ProjectSnapshot,
  ScannedFile,
  ProjectView,
  ProjectEdit,
} from '../../project-types.js';
import { boundaryDelimiter, lastToken } from './emission.js';
import { lineStarts, rangeAt } from './shared.js';
import { eligibleToken, validateOccurrenceEdits } from './safety.js';
import { matchVerbatimTokens } from './tokenize.js';
export function safeComment(
  _source: ProjectSnapshot,
  file: ScannedFile,
  start: number,
  end: number
): boolean {
  return (
    !file.coverage.issues.some(
      (i) => i.location && i.location.range.start <= end && i.location.range.end >= start
    ) &&
    file.tokens.some(
      (t) =>
        t.kind === 'comment' &&
        t.range.end === end &&
        (t.range.start === start || (t.range.start < start && file.source[start] === '%'))
    )
  );
}

export function commentEdit(
  source: ProjectSnapshot,
  file: ScannedFile,
  start: number,
  end: number
): ProjectEdit {
  if (/[\r\n]$/.test(file.source.slice(start, end + 1)))
    while (/[ \t]/.test(file.source[end + 1] ?? '')) end++;
  return {
    kind: 'replace',
    path: file.path,
    range: rangeAt(lineStarts(file.source), start, end),
    expected: file.source.slice(start, end + 1),
    replacement: '',
  };
}

export function commentEdits(
  source: ProjectSnapshot,
  files: readonly ScannedFile[],
  view?: ProjectView
): ProjectEdit[] {
  const candidates: ProjectEdit[] = [];
  const seen = new Set<string>();
  if (view) {
    for (const selected of view.selectedTokens) {
      if (!eligibleToken(selected) || selected.token.kind !== 'comment') continue;
      const file = source.files.find((f) => f.path === selected.origin.path)!;
      const { start, end } = selected.origin.range;
      const key = `${file.path}:${start}:${end}`;
      if (!seen.has(key) && safeComment(source, file, start, end)) {
        candidates.push(commentEdit(source, file, start, end));
        seen.add(key);
      }
    }
  } else {
    const verbatimEnvs = source.scanOptions.verbatimEnvironments;
    for (const file of files) {
      const protectedRanges: { start: number; end: number }[] = [];
      for (let i = 0; i < file.tokens.length; i++) {
        const tok = file.tokens[i]!;
        if (tok.kind === 'command' && (tok.name === 'verb' || tok.name === 'begin')) {
          const verb = matchVerbatimTokens(file.tokens, i, verbatimEnvs);
          if (verb) {
            protectedRanges.push({ start: verb.startOffset, end: verb.endOffset });
            i = verb.endIndex;
          }
        }
      }
      for (const tok of file.tokens) {
        if (tok.kind !== 'comment') continue;
        const { start, end } = tok.range;
        if (protectedRanges.some((r) => start <= r.end && end >= r.start)) continue;
        const key = `${file.path}:${start}:${end}`;
        if (!seen.has(key) && safeComment(source, file, start, end)) {
          candidates.push(commentEdit(source, file, start, end));
          seen.add(key);
        }
      }
    }
  }
  candidates.sort((a, b) =>
    a.path < b.path
      ? -1
      : a.path > b.path
        ? 1
        : (a.kind === 'replace' ? a.range.start : a.offset) -
          (b.kind === 'replace' ? b.range.start : b.offset)
  );
  // Determine delimiters against all adjacent removals, not against text that is
  // itself about to disappear. This keeps preview and atomic application equal.
  for (const file of files) {
    let prefix = '';
    let pos = 0;
    const indices = candidates.flatMap((e, i) => (e.path === file.path ? [i] : []));
    for (let j = 0; j < indices.length; j++) {
      const index = indices[j]!;
      const edit = candidates[index]!;
      if (edit.kind !== 'replace') continue;
      prefix += file.source.slice(pos, edit.range.start);
      let next = edit.range.end + 1;
      for (let k = j + 1; k < indices.length; k++) {
        const following = candidates[indices[k]!]!;
        if (following.kind !== 'replace' || following.range.start !== next) break;
        next = following.range.end + 1;
      }
      const replacement = boundaryDelimiter(
        lastToken(prefix, source.scanOptions),
        file.source.slice(next)
      );
      candidates[index] = { ...edit, replacement };
      prefix += replacement;
      pos = edit.range.end + 1;
    }
  }
  if (view) validateOccurrenceEdits(view, candidates);
  return candidates;
}
