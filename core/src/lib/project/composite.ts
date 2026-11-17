import type {
  CompositeStepRequest,
  CompositeTransformationRequest,
  GeneratedArtifact,
  OperationProvenance,
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
  TransformationResult,
  ViewConfiguration,
} from '../../project-types.js';
import { normalizeConfiguration } from './configuration.js';
import { dependencies, emit, sourceCopier, type Segment } from './emission.js';
import { reject } from './fail.js';
import {
  array,
  bounded,
  coverage,
  fields,
  freeze,
  identity,
  invalid,
  lineStarts,
  rangeAt,
  record,
} from './shared.js';
import { validateSnapshot } from './snapshot.js';
import { applyProjectEdits, planTransformation } from './transformation.js';
import { resolveProjectView, validateView } from './view.js';
import { validateOperation } from './operations.js';

type FileChunk =
  | {
      readonly kind: 'original';
      readonly origStart: number;
      readonly origEnd: number; // exclusive
    }
  | {
      readonly kind: 'modified';
      readonly origStart: number;
      readonly origEnd: number; // exclusive
      readonly text: string;
    };

function applyEditsToChunks(
  chunks: readonly FileChunk[],
  edits: readonly ProjectEdit[]
): FileChunk[] {
  let current = [...chunks];

  // Process edits from end to start in current coordinates so earlier offsets remain valid
  const sortedDesc = [...edits].sort((a, b) => {
    const aStart = a.kind === 'replace' ? a.range.start : a.offset;
    const bStart = b.kind === 'replace' ? b.range.start : b.offset;
    return bStart - aStart;
  });

  for (const edit of sortedDesc) {
    const editStart = edit.kind === 'replace' ? edit.range.start : edit.offset;
    const editEnd = edit.kind === 'replace' ? edit.range.end + 1 : edit.offset;
    const newText = edit.kind === 'replace' ? edit.replacement : edit.text;

    const next: FileChunk[] = [];
    let pos = 0;
    let firstTouchedOrigStart: number | null = null;
    let lastTouchedOrigEnd = 0;
    let prefixText = '';
    let suffixText = '';
    let inserted = false;

    for (const chunk of current) {
      const chunkLen =
        chunk.kind === 'original' ? chunk.origEnd - chunk.origStart : chunk.text.length;
      const chunkStart = pos;
      const chunkEnd = pos + chunkLen;
      pos = chunkEnd;

      // Insertion at exact boundary between chunks
      if (editStart === editEnd) {
        if (editStart === chunkStart && !inserted) {
          if (chunk.kind === 'modified') {
            firstTouchedOrigStart = chunk.origStart;
            lastTouchedOrigEnd = chunk.origEnd;
            prefixText = '';
            suffixText = chunk.text;
            inserted = true;
            continue;
          }
          next.push({
            kind: 'modified',
            origStart: chunk.origStart,
            origEnd: chunk.origStart,
            text: newText,
          });
          next.push(chunk);
          inserted = true;
          continue;
        }
        if (editStart > chunkStart && editStart < chunkEnd) {
          if (chunk.kind === 'original') {
            const splitOrig = chunk.origStart + (editStart - chunkStart);
            next.push({ kind: 'original', origStart: chunk.origStart, origEnd: splitOrig });
            next.push({
              kind: 'modified',
              origStart: splitOrig,
              origEnd: splitOrig,
              text: newText,
            });
            next.push({ kind: 'original', origStart: splitOrig, origEnd: chunk.origEnd });
          } else {
            const rel = editStart - chunkStart;
            next.push({
              kind: 'modified',
              origStart: chunk.origStart,
              origEnd: chunk.origEnd,
              text: chunk.text.slice(0, rel) + newText + chunk.text.slice(rel),
            });
          }
          inserted = true;
          continue;
        }
        next.push(chunk);
        continue;
      }

      // Replacement: chunk completely before edit
      if (chunkEnd <= editStart) {
        next.push(chunk);
        continue;
      }

      // Replacement: chunk completely after edit
      if (chunkStart >= editEnd) {
        if (!inserted && firstTouchedOrigStart !== null) {
          next.push({
            kind: 'modified',
            origStart: firstTouchedOrigStart,
            origEnd: lastTouchedOrigEnd,
            text: prefixText + newText + suffixText,
          });
          inserted = true;
        }
        next.push(chunk);
        continue;
      }

      // Replacement overlaps this chunk
      if (chunk.kind === 'original') {
        if (chunkStart < editStart) {
          const splitStart = chunk.origStart + (editStart - chunkStart);
          next.push({ kind: 'original', origStart: chunk.origStart, origEnd: splitStart });
          if (firstTouchedOrigStart === null) firstTouchedOrigStart = splitStart;
        } else if (firstTouchedOrigStart === null) {
          firstTouchedOrigStart = chunk.origStart;
        }

        if (chunkEnd > editEnd) {
          const splitEnd = chunk.origStart + (editEnd - chunkStart);
          lastTouchedOrigEnd = splitEnd;
          next.push({
            kind: 'modified',
            origStart: firstTouchedOrigStart,
            origEnd: lastTouchedOrigEnd,
            text: prefixText + newText + suffixText,
          });
          inserted = true;
          next.push({ kind: 'original', origStart: splitEnd, origEnd: chunk.origEnd });
        } else {
          lastTouchedOrigEnd = chunk.origEnd;
        }
      } else {
        if (firstTouchedOrigStart === null) {
          firstTouchedOrigStart = chunk.origStart;
          if (chunkStart < editStart) {
            prefixText = chunk.text.slice(0, editStart - chunkStart);
          }
        }
        lastTouchedOrigEnd = chunk.origEnd;
        if (chunkEnd > editEnd) {
          suffixText = chunk.text.slice(editEnd - chunkStart);
          next.push({
            kind: 'modified',
            origStart: firstTouchedOrigStart,
            origEnd: lastTouchedOrigEnd,
            text: prefixText + newText + suffixText,
          });
          inserted = true;
        }
      }
    }

    if (!inserted) {
      if (editStart === editEnd && firstTouchedOrigStart === null) {
        const lastOrig = current[current.length - 1]?.origEnd ?? 0;
        next.push({ kind: 'modified', origStart: lastOrig, origEnd: lastOrig, text: newText });
      } else if (firstTouchedOrigStart !== null) {
        next.push({
          kind: 'modified',
          origStart: firstTouchedOrigStart,
          origEnd: lastTouchedOrigEnd,
          text: prefixText + newText + suffixText,
        });
      }
    }

    // Merge adjacent or overlapping modified chunks so emitted ProjectEdits remain disjoint
    const merged: FileChunk[] = [];
    for (const chunk of next) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.kind === 'modified' &&
        chunk.kind === 'modified' &&
        prev.origEnd >= chunk.origStart
      ) {
        merged[merged.length - 1] = {
          kind: 'modified',
          origStart: prev.origStart,
          origEnd: Math.max(prev.origEnd, chunk.origEnd),
          text: prev.text + chunk.text,
        };
      } else if (chunk.kind === 'original' && chunk.origStart >= chunk.origEnd) {
        continue;
      } else {
        merged.push(chunk);
      }
    }
    current = merged;
  }

  return current;
}

function chunksToProjectEdits(
  path: string,
  source: string,
  chunks: readonly FileChunk[]
): ProjectEdit[] {
  const starts = lineStarts(source);
  const edits: ProjectEdit[] = [];
  for (const chunk of chunks) {
    if (chunk.kind !== 'modified') continue;
    if (chunk.origStart === chunk.origEnd) {
      if (chunk.text.length > 0) {
        edits.push({
          kind: 'insert',
          path,
          offset: chunk.origStart,
          text: chunk.text,
        });
      }
    } else {
      const expected = source.slice(chunk.origStart, chunk.origEnd);
      if (expected !== chunk.text) {
        edits.push({
          kind: 'replace',
          path,
          range: rangeAt(starts, chunk.origStart, chunk.origEnd - 1),
          expected,
          replacement: chunk.text,
        });
      }
    }
  }
  return edits;
}

export function normalizeCompositeOptions(
  value: unknown
): CompositeTransformationRequest['options'] {
  const o = record(value, 'composite transformation options');
  fields(o, ['configuration', 'steps', 'maxOutputCodeUnits'], 'composite transformation options');
  const rawSteps = array(o['steps'], 'composite steps');
  if (rawSteps.length === 0 || rawSteps.length > 100) {
    invalid('Composite transformation requires 1–100 steps.');
  }
  const steps: CompositeStepRequest[] = rawSteps.map((raw) => {
    const req = validateOperation(raw);
    if (
      req.operation !== 'realize-conditions' &&
      req.operation !== 'edit-nodes' &&
      req.operation !== 'remove-environments' &&
      req.operation !== 'refactor-symbols' &&
      req.operation !== 'suppress-comments' &&
      req.operation !== 'export-project'
    ) {
      invalid(`Unsupported composite transformation step: ${req.operation}.`);
    }
    return req;
  });
  const configuration =
    o['configuration'] !== undefined ? normalizeConfiguration(o['configuration']) : undefined;
  return {
    ...(configuration ? { configuration } : {}),
    steps,
    maxOutputCodeUnits: bounded(o['maxOutputCodeUnits'], 10000000, 100000000, 'maxOutputCodeUnits'),
  };
}

export function runCompositeTransformation(
  model: ProjectSnapshot | ProjectView,
  options: CompositeTransformationRequest['options'],
  provenanceOverride?: OperationProvenance
): TransformationResult {
  const normalizedOptions = normalizeCompositeOptions(options);
  const rawModel = record(model, 'composite transformation model');
  const initialModel =
    rawModel['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const initialSnapshot = initialModel.kind === 'snapshot' ? initialModel : initialModel.snapshot;
  const initialView = initialModel.kind === 'view' ? initialModel : null;

  const baseConfiguration: ViewConfiguration | null =
    normalizedOptions.configuration ?? (initialView ? initialView.configuration : null);

  const provenance: OperationProvenance = provenanceOverride ?? {
    snapshotId: initialSnapshot.id,
    viewId: initialView ? initialView.id : null,
    request: {
      operation: 'compose-transformations',
      options: normalizedOptions,
    },
    operationVersion: 1,
  };
  const resultId = identity('transformation', provenance);

  const chunksByPath = new Map<string, FileChunk[]>();
  for (const file of initialSnapshot.files) {
    chunksByPath.set(
      file.path,
      file.source.length > 0
        ? [{ kind: 'original', origStart: 0, origEnd: file.source.length }]
        : []
    );
  }

  let currentSnapshot = initialSnapshot;
  let currentView: ProjectView | null = initialView;
  let lastResult: TransformationResult | null = null;
  let artifactOnlyReached = false;

  for (let idx = 0; idx < normalizedOptions.steps.length; idx++) {
    if (artifactOnlyReached) {
      reject(
        'unavailable',
        'An artifact-only step (export-project or target: artifact) can only appear as the final step of a composite pipeline.'
      );
    }
    const step = normalizedOptions.steps[idx]!;
    const isSnapshotStep =
      step.operation === 'realize-conditions' ||
      (step.operation === 'refactor-symbols' &&
        (step.options.target === 'source' ||
          (!currentView &&
            !baseConfiguration &&
            step.options.target !== 'selected' &&
            step.options.target !== 'artifact'))) ||
      (step.operation === 'suppress-comments' && step.options?.target === 'source') ||
      (step.operation === 'remove-environments' && step.options.target === 'source') ||
      (step.operation === 'export-project' &&
        !currentView &&
        (!baseConfiguration || baseConfiguration.conditions?.mode === 'ignore'));

    if (isSnapshotStep) {
      const stepRes = planTransformation(currentSnapshot, step);
      lastResult = stepRes;
      if (stepRes.editPlan) {
        for (const file of currentSnapshot.files) {
          const fileEdits = stepRes.editPlan.edits.filter((e) => e.path === file.path);
          if (fileEdits.length > 0) {
            chunksByPath.set(
              file.path,
              applyEditsToChunks(chunksByPath.get(file.path)!, fileEdits)
            );
          }
        }
        currentSnapshot = applyProjectEdits(currentSnapshot, stepRes.editPlan);
        currentView = null;
      } else {
        artifactOnlyReached = true;
      }
      continue;
    }

    if (!currentView) {
      if (!baseConfiguration) {
        reject(
          'unavailable',
          `Composite step ${step.operation} requires a ViewConfiguration or initial ProjectView.`
        );
      }
      const conditionsRealizedEarlier =
        idx > 0 &&
        normalizedOptions.steps.slice(0, idx).some((s) => s.operation === 'realize-conditions');
      const stepConfig: ViewConfiguration =
        conditionsRealizedEarlier && baseConfiguration.conditions?.mode !== 'none'
          ? { ...baseConfiguration, conditions: { mode: 'none' } }
          : baseConfiguration;
      currentView = resolveProjectView(currentSnapshot, stepConfig);
    }

    if (currentView.status !== 'ready') {
      reject(
        'unavailable',
        currentView.reason.message || 'Intermediate configured view is not ready.'
      );
    }

    const stepRes = planTransformation(currentView, step);
    lastResult = stepRes;
    if (stepRes.editPlan) {
      for (const file of currentSnapshot.files) {
        const fileEdits = stepRes.editPlan.edits.filter((e) => e.path === file.path);
        if (fileEdits.length > 0) {
          chunksByPath.set(file.path, applyEditsToChunks(chunksByPath.get(file.path)!, fileEdits));
        }
      }
      currentSnapshot = applyProjectEdits(currentSnapshot, stepRes.editPlan, currentView);
      currentView = null;
    } else {
      artifactOnlyReached = true;
    }
  }

  if (artifactOnlyReached && lastResult) {
    return freeze({
      kind: 'transformation',
      resultId,
      provenance,
      editPlan: null,
      artifacts: lastResult.artifacts,
      entryPath: lastResult.entryPath,
      dependencies: lastResult.dependencies,
      coverage: lastResult.coverage,
    });
  }

  const composedEdits: ProjectEdit[] = [];
  for (const file of initialSnapshot.files) {
    const fileEdits = chunksToProjectEdits(file.path, file.source, chunksByPath.get(file.path)!);
    composedEdits.push(...fileEdits);
  }
  const plan = freeze({ kind: 'edits' as const, provenance, edits: composedEdits });

  const copy = sourceCopier(initialSnapshot);
  let remaining = normalizedOptions.maxOutputCodeUnits ?? 10000000;
  const artifacts: GeneratedArtifact[] = initialSnapshot.files.map((file) => {
    const fileEdits = composedEdits.filter((e) => e.path === file.path);
    const segments: Segment[] = [];
    let pos = 0;
    for (const edit of fileEdits) {
      const start = edit.kind === 'replace' ? edit.range.start : edit.offset;
      if (start > pos) segments.push(copy(file, pos, start, null));
      const text = edit.kind === 'replace' ? edit.replacement : edit.text;
      if (text) segments.push({ text, origin: null, reason: 'Composite transformation edit.' });
      pos = edit.kind === 'replace' ? edit.range.end + 1 : edit.offset;
    }
    if (pos < file.source.length) segments.push(copy(file, pos, file.source.length, null));
    const art = emit(
      file.path,
      segments,
      initialSnapshot,
      provenance,
      'independent-sources',
      remaining
    );
    remaining -= art.source.length;
    return art;
  });

  return freeze({
    kind: 'transformation',
    resultId,
    provenance,
    editPlan: plan,
    artifacts,
    entryPath: null,
    dependencies: dependencies(artifacts, initialSnapshot.scanOptions),
    coverage: lastResult?.coverage ?? coverage([]),
  });
}

/**
 * Execute and compose an ordered sequence of transformations (`realize-conditions`,
 * `refactor-symbols`, `edit-nodes`, `remove-environments`, `suppress-comments`, `export-project`)
 * into a unified {@link ProjectEditPlan} against the starting snapshot (or final exported artifacts).
 *
 * @param model - Starting snapshot or configured view.
 * @param options - Configuration and ordered transformation steps.
 * @returns Frozen {@link TransformationResult} with unified `editPlan` (when all steps are in-place) and final `artifacts`.
 * @throws {@link PrepTexError} with `InvalidArgument` for invalid options or step sequences.
 * @throws {@link ProjectOperationError} when an intermediate view or step fails.
 */
export function planCompositeTransformation(
  model: ProjectSnapshot | ProjectView,
  options: CompositeTransformationRequest['options']
): TransformationResult {
  return runCompositeTransformation(model, options);
}
