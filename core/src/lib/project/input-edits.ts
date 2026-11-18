import type {
  GeneratedArtifact,
  OperationProvenance,
  ProjectEdit,
  ProjectIssue,
  ProjectSnapshot,
  ProjectView,
  ScannedFile,
  SourceOrigin,
} from '../../project-types.js';
import { normalizeProjectFilePath } from '../validation.js';
import { resolveVirtualInputPath, virtualDirname } from '../virtual-path.js';
import { evaluateConditionStream, type OccurrenceTrace } from './conditions.js';
import { normalizeViewLimits } from './configuration.js';
import {
  boundaryDelimiter,
  dependencies,
  emit,
  lastToken,
  sourceCopier,
  synthetic,
  type Segment,
} from './emission.js';
import { reject } from './fail.js';
import { unwrapQuotedInputLiteral } from './scan.js';
import { coverage, freeze, issue, lineStarts, rangeAt } from './shared.js';
import { sourceChanges, type TextChange } from './text-edits.js';
import { readInputArgumentTokens } from './tokenize.js';

export function resolveEntryPath(snapshot: ProjectSnapshot, entryPath?: string): string {
  if (entryPath !== undefined) return entryPath;
  if (snapshot.files.some((f) => f.path === 'main.tex')) return 'main.tex';
  if (snapshot.files.length === 1) return snapshot.files[0]!.path;
  return 'main.tex';
}

/**
 * Collect files reachable from `entryPath` when `traversal === 'project'`,
 * or just `[entryPath]` when `traversal === 'file-only'`.
 */
export function collectReachableFiles(
  snapshot: ProjectSnapshot,
  entryPath: string,
  traversal: 'project' | 'file-only'
): readonly ScannedFile[] {
  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const entry = byPath.get(entryPath);
  if (!entry) {
    reject('unavailable', `Entry ${entryPath} is absent.`);
  }
  if (traversal === 'file-only') {
    return [entry];
  }
  const visited = new Set<string>([entry.path]);
  const queue: ScannedFile[] = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const fact of current.facts) {
      if (fact.kind !== 'input' || fact.target.kind !== 'literal') continue;
      if (fact.context.definitionBodies.length > 0 || fact.context.opaqueArguments.length > 0) {
        continue;
      }
      const resolved = resolveVirtualInputPath(
        fact.target.value,
        current.path,
        entry.path,
        (candidate) => byPath.has(candidate)
      );
      if (resolved.status !== 'present') continue;
      const targetPath = resolved.matches[0]!;
      if (!visited.has(targetPath)) {
        visited.add(targetPath);
        queue.push(byPath.get(targetPath)!);
      }
    }
  }
  return snapshot.files.filter((f) => visited.has(f.path));
}

function relativeVirtualPath(fromDir: string, targetPath: string): string {
  if (!fromDir) return targetPath;
  const fromParts = fromDir.split('/').filter(Boolean);
  const targetParts = targetPath.split('/').filter(Boolean);
  let common = 0;
  while (
    common < fromParts.length &&
    common < targetParts.length &&
    fromParts[common] === targetParts[common]
  ) {
    common++;
  }
  const up = Array.from({ length: fromParts.length - common }, () => '..');
  const down = targetParts.slice(common);
  return [...up, ...down].join('/');
}

function relocateChildInputs(
  childFile: ScannedFile,
  targetDir: string,
  entryPath: string,
  snapshot: ProjectSnapshot
): string {
  const childDir = virtualDirname(childFile.path);
  if (childDir === targetDir) return childFile.source;

  const filePaths = new Set(snapshot.files.map((f) => f.path));
  const changes: TextChange[] = [];
  for (const fact of childFile.facts) {
    if (fact.kind !== 'input' || fact.target.kind !== 'literal') continue;
    if (fact.context.definitionBodies.length > 0 || fact.context.opaqueArguments.length > 0) {
      continue;
    }
    const resolved = resolveVirtualInputPath(
      fact.target.value,
      childFile.path,
      entryPath,
      (candidate) => filePaths.has(candidate)
    );
    if (resolved.status !== 'present') continue;
    const resolvedPath = resolved.matches[0]!;
    const resolvedFromTarget = resolveVirtualInputPath(
      fact.target.value,
      targetDir ? `${targetDir}/__entry__.tex` : '__entry__.tex',
      entryPath,
      (candidate) => filePaths.has(candidate)
    );
    if (resolvedFromTarget.status === 'present' && resolvedFromTarget.matches[0] === resolvedPath) {
      continue;
    }
    const relocated = relativeVirtualPath(targetDir, resolvedPath);
    const keepWithoutTex =
      !fact.target.value.toLowerCase().endsWith('.tex') && relocated.toLowerCase().endsWith('.tex');
    const replacement = keepWithoutTex ? relocated.slice(0, -4) : relocated;
    if (fact.target.range) {
      changes.push({
        start: fact.target.range.start,
        end: fact.target.range.end + 1,
        text: replacement,
      });
    }
  }
  if (changes.length === 0) return childFile.source;
  changes.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const ch of changes) {
    if (ch.start < pos) continue;
    out += childFile.source.slice(pos, ch.start) + ch.text;
    pos = ch.end;
  }
  out += childFile.source.slice(pos);
  return out;
}

export interface ExpandInputsPlanResult {
  readonly edits: readonly ProjectEdit[];
  readonly artifacts: readonly GeneratedArtifact[];
  readonly entryPath: string;
  readonly dependencies: ReturnType<typeof dependencies>;
  readonly warnings: readonly ProjectIssue[];
}

export function planExpandInputs(
  model: ProjectSnapshot | ProjectView,
  options: {
    readonly mode: 'single' | 'recursive';
    readonly target: 'selected' | 'source' | 'artifact';
    readonly entryPath?: string;
    readonly maxOutputCodeUnits: number;
  },
  provenance: OperationProvenance
): ExpandInputsPlanResult {
  const snapshot = model.kind === 'snapshot' ? model : model.snapshot;
  const entryPath = normalizeProjectFilePath(
    options.entryPath ??
      (model.kind === 'view' ? model.configuration.entryPath : resolveEntryPath(snapshot)),
    'entryPath'
  );
  const entryFile = snapshot.files.find((f) => f.path === entryPath);
  if (!entryFile) {
    reject('unavailable', `Entry ${entryPath} is absent.`);
  }

  const conditions =
    model.kind === 'view' && options.target !== 'source'
      ? model.configuration.conditions
      : ({ mode: 'ignore' } as const);
  const limits =
    model.kind === 'view' ? model.configuration.limits : normalizeViewLimits(undefined);

  const filesByPath = new Map(snapshot.files.map((f) => [f.path, f]));

  if (options.mode === 'single') {
    // Evaluate entry file only to discover active \input locations under active conditions.
    const evalEntry = evaluateConditionStream(snapshot, {
      entryFiles: [entryFile],
      traversal: 'file-only',
      stopOnFileOnlyInput: false,
      inlineInputs: false,
      stripDeclarationsAndSetters: false,
      conditions,
      limits,
    });
    if (evalEntry.failure) {
      reject(
        'unavailable',
        evalEntry.failure.reason.message,
        evalEntry.failure.reason.location
          ? [
              {
                snapshotId: snapshot.id,
                occurrenceId: null,
                path: evalEntry.failure.reason.location.path,
                range: evalEntry.failure.reason.location.range,
              },
            ]
          : []
      );
    }

    const rootTrace = evalEntry.traces[0]!;
    const tokens = rootTrace.tokens;
    const starts = rootTrace.starts;
    const warnings: ProjectIssue[] = [...evalEntry.warnings];
    const replacements: { start: number; end: number; targetFile: ScannedFile }[] = [];

    for (let i = 0; i < tokens.length; i++) {
      if (!rootTrace.activeTokens.has(i)) continue;
      const tok = tokens[i]!;
      if (tok.kind !== 'command' || tok.name !== 'input') continue;
      const arg = readInputArgumentTokens(tokens, i + 1);
      const target = unwrapQuotedInputLiteral(arg, starts);
      const at: SourceOrigin = {
        snapshotId: snapshot.id,
        occurrenceId: rootTrace.occurrence.id,
        path: entryFile.path,
        range: tok.range,
      };
      if (target.kind !== 'literal') {
        reject('unavailable', 'Only literal braced input paths can be expanded.', [at]);
      }
      const resolved = resolveVirtualInputPath(
        target.value,
        entryFile.path,
        entryFile.path,
        (candidate) => filesByPath.has(candidate)
      );
      if (resolved.status === 'invalid-path') {
        reject('unavailable', 'Input must remain inside the virtual project root.', [at]);
      }
      if (resolved.status === 'ambiguous') {
        reject('unavailable', `Input ${target.value} matches more than one source file.`, [at]);
      }
      if (resolved.status === 'missing') {
        warnings.push({
          ...issue(
            'missing-input',
            `Required input ${target.value} is absent.`,
            { path: at.path, range: at.range },
            'warning'
          ),
          inputChain: [rootTrace.occurrence.id],
        });
        continue;
      }
      const included = filesByPath.get(resolved.matches[0]!)!;
      if (included.path === entryFile.path) {
        reject('unavailable', `Active input recursion through ${included.path}.`, [at]);
      }
      replacements.push({
        start: tok.range.start,
        end: arg!.end,
        targetFile: included,
      });
      i = arg!.closeIndex;
    }

    const entryDir = virtualDirname(entryFile.path);
    const copy = sourceCopier(snapshot);
    const segments: Segment[] = [];
    const changes: TextChange[] = [];
    let cursor = 0;
    let builtPrefix = '';

    for (const rep of replacements) {
      if (rep.start > cursor) {
        const seg = copy(entryFile, cursor, rep.start, rootTrace.occurrence.id);
        segments.push(seg);
        builtPrefix += seg.text;
      }
      const childText = relocateChildInputs(rep.targetFile, entryDir, entryFile.path, snapshot);
      const lead = boundaryDelimiter(lastToken(builtPrefix, snapshot.scanOptions), childText);
      const trail = boundaryDelimiter(
        lastToken(lead + childText, snapshot.scanOptions),
        entryFile.source.slice(rep.end)
      );
      const replacementText = `${lead}${childText}${trail}`;
      changes.push({ start: rep.start, end: rep.end, text: replacementText });

      if (lead) {
        segments.push(synthetic(lead, 'Preserve original lexical token boundaries.'));
      }
      if (childText === rep.targetFile.source && childText.length > 0) {
        segments.push(copy(rep.targetFile, 0, childText.length, null));
      } else if (childText.length > 0) {
        segments.push(synthetic(childText, 'Expanded input with relocated relative paths.'));
      }
      if (trail) {
        segments.push(synthetic(trail, 'Preserve original lexical token boundaries.'));
      }

      builtPrefix += replacementText;
      cursor = rep.end;
    }
    if (cursor < entryFile.source.length) {
      segments.push(copy(entryFile, cursor, entryFile.source.length, rootTrace.occurrence.id));
    }

    const byPath = new Map<string, TextChange[]>();
    if (changes.length > 0) byPath.set(entryFile.path, changes);
    const edits = sourceChanges(snapshot, byPath);
    const artifact = emit(
      entryFile.path,
      segments,
      snapshot,
      provenance,
      'active-inputs-expanded',
      options.maxOutputCodeUnits
    );
    const artifacts = freeze([
      artifact.remainingInputs.length === 0
        ? { ...artifact, topology: 'self-contained-profile' as const }
        : artifact,
    ]);
    return {
      edits,
      artifacts,
      entryPath: entryFile.path,
      dependencies: dependencies(artifacts, snapshot.scanOptions),
      warnings,
    };
  }

  // mode === 'recursive'
  const evaluation = evaluateConditionStream(snapshot, {
    entryFiles: [entryFile],
    traversal: 'project',
    stopOnFileOnlyInput: false,
    inlineInputs: true,
    stripDeclarationsAndSetters: false,
    conditions,
    limits,
  });
  if (evaluation.failure) {
    reject(
      'unavailable',
      evaluation.failure.reason.message,
      evaluation.failure.reason.location
        ? [
            {
              snapshotId: snapshot.id,
              occurrenceId:
                evaluation.failure.reason.inputChain[
                  evaluation.failure.reason.inputChain.length - 1
                ] ?? null,
              path: evaluation.failure.reason.location.path,
              range: evaluation.failure.reason.location.range,
            },
          ]
        : []
    );
  }

  const copy = sourceCopier(snapshot);
  const expandTrace = (trace: OccurrenceTrace): Segment[] => {
    const segs: Segment[] = [];
    const expansions = [...trace.activeInputExpansions.entries()].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [cmdIndex, exp] of expansions) {
      const cmdTok = trace.tokens[cmdIndex]!;
      if (cmdTok.range.start > cursor) {
        segs.push(copy(trace.file, cursor, cmdTok.range.start, trace.occurrence.id));
      }
      segs.push(...expandTrace(evaluation.traces[exp.childTraceIndex]!));
      cursor = exp.endOffset;
    }
    if (cursor < trace.file.source.length) {
      segs.push(copy(trace.file, cursor, trace.file.source.length, trace.occurrence.id));
    }
    return segs;
  };

  const rootTrace = evaluation.traces[evaluation.rootTraceIndices[0]!]!;
  const rootExpansions = [...rootTrace.activeInputExpansions.entries()].sort((a, b) => a[0] - b[0]);

  // Build in-place edits on entryFile for each top-level active \input expansion
  const changes: TextChange[] = [];
  let builtPrefix = '';
  let cursor = 0;
  for (const [cmdIndex, exp] of rootExpansions) {
    const cmdTok = rootTrace.tokens[cmdIndex]!;
    if (cmdTok.range.start > cursor) {
      builtPrefix += entryFile.source.slice(cursor, cmdTok.range.start);
    }
    const childArtifact = emit(
      entryFile.path,
      expandTrace(evaluation.traces[exp.childTraceIndex]!),
      snapshot,
      provenance,
      'active-inputs-expanded',
      options.maxOutputCodeUnits
    );
    const lead = boundaryDelimiter(
      lastToken(builtPrefix, snapshot.scanOptions),
      childArtifact.source
    );
    const trail = boundaryDelimiter(
      lastToken(lead + childArtifact.source, snapshot.scanOptions),
      entryFile.source.slice(exp.endOffset)
    );
    const replacementText = `${lead}${childArtifact.source}${trail}`;
    changes.push({ start: cmdTok.range.start, end: exp.endOffset, text: replacementText });
    builtPrefix += replacementText;
    cursor = exp.endOffset;
  }

  const byPath = new Map<string, TextChange[]>();
  if (changes.length > 0) byPath.set(entryFile.path, changes);
  const edits = sourceChanges(snapshot, byPath);

  const rootArtifact = emit(
    entryFile.path,
    expandTrace(rootTrace),
    snapshot,
    provenance,
    'active-inputs-expanded',
    options.maxOutputCodeUnits
  );
  const finalArtifact =
    rootArtifact.remainingInputs.length === 0
      ? { ...rootArtifact, topology: 'self-contained-profile' as const }
      : rootArtifact;
  const artifacts = freeze([finalArtifact]);

  return {
    edits,
    artifacts,
    entryPath: entryFile.path,
    dependencies: dependencies(artifacts, snapshot.scanOptions),
    warnings: evaluation.warnings,
  };
}

export function buildExpandInputsSourceEdits(
  snapshot: ProjectSnapshot,
  request: {
    readonly operation: 'expand-inputs';
    readonly options: {
      readonly mode: 'single' | 'recursive';
      readonly target?: 'selected' | 'source' | 'artifact';
      readonly entryPath?: string;
      readonly maxOutputCodeUnits?: number;
    };
  },
  view?: ProjectView
): ProjectEdit[] {
  const model = view ?? snapshot;
  const target = request.options.target ?? 'selected';
  const entryPath = request.options.entryPath;
  const provenance: OperationProvenance = {
    snapshotId: snapshot.id,
    viewId: view ? view.id : null,
    request,
    operationVersion: 1,
  };
  return [
    ...planExpandInputs(
      model,
      {
        mode: request.options.mode,
        target,
        ...(entryPath !== undefined ? { entryPath } : {}),
        maxOutputCodeUnits: request.options.maxOutputCodeUnits ?? 10000000,
      },
      provenance
    ).edits,
  ];
}

export function normalizeTextBounds(
  source: string,
  start: number,
  end: number
): { start: number; end: number; line: number } {
  return rangeAt(lineStarts(source), start, end);
}
