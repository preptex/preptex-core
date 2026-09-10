import type {
  AnalysisLocation,
  ArtifactDependency,
  ArtifactOrigin,
  GeneratedArtifact,
  NormalizedScanOptions,
  OperationProvenance,
  ProjectSnapshot,
  ScannedFile,
} from '../../project-types.js';
import { lex, scanFile, type Lexeme } from './scan.js';
import { lineStarts, rangeAt } from './shared.js';
import { normalizeVirtualPath, virtualDirname, withTexExtension } from '../virtual-path.js';
import { reject } from './fail.js';

export interface Segment {
  text: string;
  origin: AnalysisLocation | null;
  reason: string;
}
export function sourceCopier(snapshot: ProjectSnapshot) {
  const lines = new Map<string, readonly number[]>();
  return (file: ScannedFile, start: number, end: number, occurrenceId: string | null): Segment => {
    let starts = lines.get(file.path);
    if (!starts) {
      starts = lineStarts(file.source);
      lines.set(file.path, starts);
    }
    return {
      text: file.source.slice(start, end),
      origin: {
        snapshotId: snapshot.id,
        path: file.path,
        range: rangeAt(starts, start, end - 1),
        occurrenceId,
      },
      reason: '',
    };
  };
}
export function synthetic(text: string, reason: string): Segment {
  return { text, origin: null, reason };
}
export function lastToken(text: string, options: NormalizedScanOptions): Lexeme | null {
  let last: Lexeme | null = null;
  for (let pos = 0; pos < text.length; ) {
    last = lex(text, pos, options);
    pos = last.end;
  }
  return last;
}
export function boundaryDelimiter(previous: Lexeme | null, next: string): string {
  if (!previous || !next) return '';
  if (previous.kind === 'command' && /^[A-Za-z@]+$/.test(previous.name) && /^[A-Za-z@]/.test(next))
    return ' ';
  if (previous.kind === 'comment' && !/[\r\n]$/.test(previous.value) && !/^[\r\n]/.test(next))
    return '\n';
  if (previous.kind === 'math' && previous.value.endsWith('$') && next.startsWith('$')) return '{}';
  if (previous.kind === 'command' && previous.value === '\\')
    reject(
      'edit-conflict',
      'Cannot preserve a dangling control-sequence boundary during emission.'
    );
  return '';
}

export function emit(
  path: string,
  segments: readonly Segment[],
  snapshot: ProjectSnapshot,
  provenance: OperationProvenance,
  topology: GeneratedArtifact['topology'],
  limit: number
): GeneratedArtifact {
  const text: string[] = [];
  const mappings: ArtifactOrigin[] = [];
  let length = 0;
  let line = 1;
  let previousCR = false;
  let previous: Segment | undefined;
  let tail: Lexeme | null = null;
  function append(segment: Segment): void {
    if (!segment.text) return;
    if (length + segment.text.length > limit)
      reject('output-limit', 'The total configured output size limit was exceeded.');
    const outputRange = { start: length, end: length + segment.text.length - 1, line };
    for (const c of segment.text) {
      if (c === '\r') line++;
      else if (c === '\n' && !previousCR) line++;
      previousCR = c === '\r';
    }
    text.push(segment.text);
    length += segment.text.length;
    mappings.push(
      segment.origin
        ? { kind: 'source', outputRange, origins: [segment.origin] }
        : { kind: 'synthetic', outputRange, reason: segment.reason }
    );
  }
  for (const segment of segments) {
    if (!segment.text) continue;
    const adjacent =
      previous?.origin &&
      segment.origin &&
      previous.origin.path === segment.origin.path &&
      previous.origin.occurrenceId === segment.origin.occurrenceId &&
      previous.origin.range.end + 1 === segment.origin.range.start;
    if (!adjacent)
      append(
        synthetic(
          boundaryDelimiter(tail, segment.text),
          'Preserve original lexical token boundaries.'
        )
      );
    append(segment);
    tail = lastToken(segment.text, snapshot.scanOptions);
    previous = segment;
  }
  const source = text.join('');
  const scanned = scanFile({ path, source, version: 0 }, snapshot.scanOptions);
  const remainingInputs = [
    ...new Set(
      scanned.facts.flatMap((f) =>
        f.kind === 'input' && f.target.kind === 'literal' ? [f.target.value] : []
      )
    ),
  ];
  return { path, source, origins: mappings, provenance, topology, remainingInputs };
}

export function dependencies(
  artifacts: readonly GeneratedArtifact[],
  options: NormalizedScanOptions
): readonly ArtifactDependency[] {
  const paths = new Set(artifacts.map((f) => f.path));
  return artifacts.flatMap((artifact) =>
    scanFile(
      { path: artifact.path, source: artifact.source, version: 0 },
      options
    ).facts.flatMap<ArtifactDependency>((fact) => {
      if (fact.kind !== 'input') return [];
      if (fact.target.kind === 'unresolved')
        return [
          {
            fromPath: artifact.path,
            reference: null,
            targetPath: null,
            status: 'dynamic' as const,
            range: fact.range,
          },
        ];
      const reference = fact.target.value;
      const joined =
        /^(?:[\\/]|[A-Za-z]:)/.test(reference) || reference.includes('\0')
          ? ''
          : normalizeVirtualPath(`${virtualDirname(artifact.path)}/${reference}`);
      const matches = joined
        ? [...new Set([joined, withTexExtension(joined)])].filter((path) => paths.has(path))
        : [];
      return [
        {
          fromPath: artifact.path,
          reference,
          targetPath: matches.length === 1 ? matches[0]! : null,
          status: !joined
            ? ('invalid-path' as const)
            : matches.length > 1
              ? ('ambiguous' as const)
              : matches.length
                ? ('present' as const)
                : ('missing' as const),
          range: fact.range,
        },
      ];
    })
  );
}
