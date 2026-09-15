import type { ProjectView, ScannedFile, SelectedToken } from '../../project-types.js';
import type { TextChange } from './text-edits.js';
import { sourceCopier, synthetic, type Segment } from './emission.js';

/** Render changes against the original selected tape, before export filters run. */
export function projectedEditor(view: ProjectView, changes: readonly TextChange[]) {
  const copy = sourceCopier(view.snapshot);
  const last = view.selectedTokens[view.selectedTokens.length - 1];
  return (token: SelectedToken, file: ScannedFile, keep: boolean, keepStart: number): Segment[] => {
    const start = token.projectedRange.start,
      end = token.projectedRange.end + 1;
    const result: Segment[] = [];
    const original = (from: number, to: number) => {
      const at = Math.max(token.origin.range.start + from - start, keepStart);
      const until = token.origin.range.start + to - start;
      if (keep && at < until) result.push(copy(file, at, until, token.origin.occurrenceId));
    };
    let low = 0,
      high = changes.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (changes[mid]!.end < start) low = mid + 1;
      else high = mid;
    }
    let pos = start;
    for (let i = low; i < changes.length; i++) {
      const change = changes[i]!;
      if (change.start > end || (change.start === end && token !== last)) break;
      if (change.end <= start && change.start !== start) continue;
      original(pos, Math.min(change.start, end));
      if (change.start >= start)
        result.push(synthetic(change.text, 'Selected-node transformation.'));
      pos = Math.max(pos, Math.min(change.end, end));
    }
    original(pos, end);
    return result;
  };
}
