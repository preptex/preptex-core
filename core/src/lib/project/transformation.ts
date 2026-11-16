import { safeComment, commentEdit } from './comment-edits.js';
import { realizeProjectConditions } from './conditions.js';
import { sourceOperationEdits } from './source-operations.js';
import { environmentActions, projectionChanges } from './node-edits.js';
import { runCompositeTransformation } from './composite.js';
import { symbolRefactorProjectionChanges } from './refactor.js';
import { projectedEditor } from './projected-edits.js';
import type {
  ExportOptions,
  GeneratedArtifact,
  OperationProvenance,
  ProjectEdit,
  ProjectEditPlan,
  ProjectIssue,
  ProjectSnapshot,
  ProjectView,
  ScannedFile,
  SelectedToken,
  TransformationRequest,
  TransformationResult,
} from '../../project-types.js';
import { PrepTexError, PrepTexErrorCode, ProjectOperationError } from '../../errors.js';
import { updateProjectSnapshot, validateSnapshot } from './snapshot.js';
import { validateView } from './view.js';
import { requireCapability, validateOperation, validateProjectEditPlan } from './operations.js';
import { sourceCopier, dependencies, emit, synthetic, type Segment } from './emission.js';
import { coverage, freeze, identity, invalid, record } from './shared.js';
import { eligibleToken } from './safety.js';
import { reject } from './fail.js';
import { virtualDirname } from '../virtual-path.js';

function editedSegments(
  source: ProjectSnapshot,
  file: ScannedFile,
  edits: readonly ProjectEdit[],
  occurrenceId: string | null
): Segment[] {
  const copied = sourceCopier(source);
  const result: Segment[] = [];
  let pos = 0;
  for (const edit of edits.filter((e) => e.path === file.path)) {
    const start = edit.kind === 'replace' ? edit.range.start : edit.offset;
    result.push(copied(file, pos, start, occurrenceId));
    const text = edit.kind === 'replace' ? edit.replacement : edit.text;
    result.push(synthetic(text, 'Explicit source edit.'));
    pos = edit.kind === 'replace' ? edit.range.end + 1 : edit.offset;
  }
  result.push(copied(file, pos, file.source.length, occurrenceId));
  return result;
}

/**
 * Atomically apply a checked edit proposal and return a new source snapshot.
 * @param snapshot - Exact original source authority; never changed in place.
 * @param plan - Ordered original ranges, expected contents, and operation preconditions.
 * @param view - Required for selected-path edits; every inclusion must permit each edit.
 * @returns A frozen new snapshot. Changed file revisions advance by one; non-advancing/overflowing revisions fail.
 * @throws {@link ProjectOperationError} for stale results, invalid edits, or occurrence conflicts; nothing is applied on failure.
 */
export function applyProjectEdits(
  snapshot: ProjectSnapshot,
  plan: ProjectEditPlan,
  view?: ProjectView
): ProjectSnapshot {
  const source = validateSnapshot(snapshot);
  const input = record(plan, 'edit plan');
  const provenance = record(input['provenance'], 'edit provenance');
  if (
    provenance['snapshotId'] !== source.id ||
    (provenance['viewId'] !== null && provenance['viewId'] !== view?.id)
  )
    reject(
      'stale-result',
      'The edit plan belongs to a different source snapshot or configured view.'
    );
  try {
    validateProjectEditPlan(source, plan, view);
  } catch (error: unknown) {
    if (error instanceof ProjectOperationError) throw error;
    if (error instanceof PrepTexError && error.code === PrepTexErrorCode.InvalidArgument)
      reject('invalid-edit', error.message);
    throw error;
  }
  const changes = source.files.flatMap((file) => {
    const edits = plan.edits.filter((edit) => edit.path === file.path);
    if (!edits.length) return [];
    const text = editedSegments(source, file, edits, null)
      .map((s) => s.text)
      .join('');
    if (text === file.source) return [];
    const version = file.version + 1;
    if (!Number.isFinite(version) || version <= file.version)
      reject('invalid-edit', 'A changed file revision cannot be advanced by one.');
    return [{ kind: 'upsert' as const, file: { path: file.path, source: text, version } }];
  });
  return updateProjectSnapshot(source, changes);
}

/**
 * Plan condition realization, comment/node source edits, or a configured export without changing sources.
 * @param model - Source snapshot for condition realization, configured view for structural edits/exports.
 * @param request - Operation, retention/topology policies, and resource limits.
 * @returns Frozen edits, exact preview artifacts and mappings, dependency metadata and coverage.
 * @throws {@link ProjectOperationError} for unavailable models, incompatible shared-file contexts or output limits.
 * @throws {@link PrepTexError} with InvalidArgument for malformed options or stale transports.
 */
export function planTransformation(
  model: ProjectSnapshot | ProjectView,
  request: TransformationRequest
): TransformationResult {
  const input = record(model, 'transformation model');
  const normalized = input['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const operation = validateOperation(request);
  if (
    operation.operation === 'references' ||
    operation.operation === 'unused-commands' ||
    operation.operation === 'source-inventory' ||
    operation.operation === 'resolve-view'
  )
    invalid('Expected a transformation operation.');
  requireCapability(normalized, operation);
  if (operation.operation === 'compose-transformations') {
    return runCompositeTransformation(normalized, operation.options);
  }
  if (operation.operation === 'realize-conditions') {
    if (normalized.kind !== 'snapshot') invalid('Condition realization requires a snapshot.');
    const realized = realizeProjectConditions(normalized, operation.options);
    if (realized.status !== 'ready') {
      reject(
        'unavailable',
        realized.reason?.message ?? 'Condition realization could not complete.',
        realized.reason?.location
          ? [
              {
                snapshotId: normalized.id,
                occurrenceId:
                  realized.reason.inputChain[realized.reason.inputChain.length - 1] ?? null,
                path: realized.reason.location.path,
                range: realized.reason.location.range,
              },
            ]
          : []
      );
    }
    const resultId = identity('transformation', realized.provenance);
    return freeze({
      kind: 'transformation',
      resultId,
      provenance: realized.provenance,
      editPlan: realized.editPlan,
      artifacts: realized.artifacts,
      entryPath:
        realized.provenance.request.operation === 'realize-conditions' &&
        realized.provenance.request.options.inputs === 'inline'
          ? (realized.artifacts[0]?.path ?? null)
          : null,
      dependencies: realized.dependencies,
      coverage: realized.coverage,
    });
  }
  const source = normalized.kind === 'snapshot' ? normalized : normalized.snapshot;
  const provenance: OperationProvenance = {
    snapshotId: source.id,
    viewId: normalized.kind === 'view' ? normalized.id : null,
    request: operation,
    operationVersion: 1,
  };
  const resultId = identity('transformation', provenance);
  if (
    operation.operation === 'suppress-comments' ||
    ((operation.operation === 'edit-nodes' || operation.operation === 'remove-environments') &&
      operation.options.target !== 'artifact') ||
    (operation.operation === 'refactor-symbols' && operation.options.target !== 'artifact')
  ) {
    if (normalized.kind !== 'view' && operation.operation !== 'refactor-symbols') {
      invalid('Structural source edits require a configured view.');
    }
    const viewForEdits = normalized.kind === 'view' ? normalized : undefined;
    const files = source.files;
    const edits = sourceOperationEdits(source, operation, viewForEdits);
    const plan = freeze({ kind: 'edits' as const, provenance, edits });
    validateProjectEditPlan(source, plan, viewForEdits);
    let remaining = operation.options?.maxOutputCodeUnits ?? 10000000;
    const artifacts = files.map((file) => {
      const artifact = emit(
        file.path,
        editedSegments(source, file, edits, null),
        source,
        provenance,
        'independent-sources',
        remaining
      );
      remaining -= artifact.source.length;
      return artifact;
    });
    return freeze({
      kind: 'transformation',
      resultId,
      provenance,
      editPlan: plan,
      artifacts,
      entryPath: null,
      dependencies: dependencies(artifacts, source.scanOptions),
      coverage: normalized.kind === 'view' ? normalized.coverage : coverage([]),
    });
  }
  if (normalized.kind !== 'view') invalid('Configured exports require a view.');
  if (
    operation.operation !== 'export-project' &&
    operation.operation !== 'edit-nodes' &&
    operation.operation !== 'remove-environments' &&
    operation.operation !== 'refactor-symbols'
  )
    invalid('Expected a configured export operation.');
  const options: ExportOptions =
    operation.operation === 'edit-nodes' || operation.operation === 'remove-environments'
      ? {
          inputs: 'inline',
          nodeEdits:
            operation.operation === 'edit-nodes'
              ? operation.options.actions
              : environmentActions(normalized, operation.options.names),
          maxOutputCodeUnits: operation.options.maxOutputCodeUnits ?? 10000000,
        }
      : operation.operation === 'refactor-symbols'
        ? {
            inputs: 'inline',
            maxOutputCodeUnits: operation.options.maxOutputCodeUnits ?? 10000000,
          }
        : operation.options;
  const extraChanges =
    operation.operation === 'refactor-symbols'
      ? symbolRefactorProjectionChanges(normalized, operation.options.actions)
      : [];
  const exported = exportView(normalized, options, provenance, extraChanges);
  return freeze({ kind: 'transformation', resultId, provenance, editPlan: null, ...exported });
}

function exportView(
  view: ProjectView,
  options: ExportOptions,
  provenance: OperationProvenance,
  extraProjectionChanges: readonly import('./text-edits.js').TextChange[] = []
): {
  artifacts: readonly GeneratedArtifact[];
  entryPath: string;
  dependencies: TransformationResult['dependencies'];
  coverage: TransformationResult['coverage'];
} {
  const source = view.snapshot;
  const copied = sourceCopier(source);
  const commentActions = options.suppressCommentEnvironments
    ? environmentActions(view, ['comment'])
    : [];
  const nodeActions = options.nodeEdits ?? [];
  // Explicit actions share one conflict check with export-time environment suppression.
  const project = projectedEditor(
    view,
    extraProjectionChanges.length > 0
      ? extraProjectionChanges
      : projectionChanges(view, [...nodeActions, ...commentActions])
  );
  const issues: ProjectIssue[] = [...view.coverage.issues];
  const selectedByOccurrence = new Map<string, SelectedToken[]>();
  for (const token of view.selectedTokens) {
    const bucket = selectedByOccurrence.get(token.origin.occurrenceId) ?? [];
    bucket.push(token);
    selectedByOccurrence.set(token.origin.occurrenceId, bucket);
  }
  const children = new Map<string, (typeof view.occurrences)[number][]>();
  for (const occurrence of view.occurrences)
    if (occurrence.parentId !== null) {
      const bucket = children.get(occurrence.parentId) ?? [];
      bucket.push(occurrence);
      children.set(occurrence.parentId, bucket);
    }
  const fileByPath = new Map(source.files.map((f) => [f.path, f]));
  const rendered = new Map<string, Segment[]>();
  for (let index = view.occurrences.length - 1; index >= 0; index--) {
    const occurrence = view.occurrences[index]!;
    const file = fileByPath.get(occurrence.path)!;
    const tokens = selectedByOccurrence.get(occurrence.id) ?? [];
    const ownChildren = children.get(occurrence.id) ?? [];
    const pieces: Segment[] = [];
    let projectedSize = 0;
    const collect = (segment: Segment): void => {
      if (!segment.text) return;
      projectedSize += segment.text.length;
      if (projectedSize > (options.maxOutputCodeUnits ?? 10000000))
        reject('output-limit', 'An expanded occurrence exceeds the configured output size limit.');
      pieces.push(segment);
    };
    const events: { start: number; pieces: Segment[] }[] = [];
    let omittedIndentUntil = -1;
    for (const token of tokens) {
      let keep = true;
      if (
        options.suppressComments &&
        eligibleToken(token) &&
        token.token.kind === 'comment' &&
        safeComment(source, file, token.origin.range.start, token.origin.range.end)
      ) {
        const edit = commentEdit(source, file, token.origin.range.start, token.origin.range.end);
        if (edit.kind === 'replace') omittedIndentUntil = edit.range.end + 1;
        keep = false;
      }
      const start = Math.max(token.origin.range.start, omittedIndentUntil);
      events.push({ start: token.origin.range.start, pieces: project(token, file, keep, start) });
    }
    for (const child of ownChildren)
      events.push({
        start: child.reference!.range.start,
        pieces:
          options.inputs === 'inline'
            ? rendered.get(child.id)!
            : [
                copied(
                  file,
                  child.reference!.range.start,
                  child.reference!.range.end + 1,
                  occurrence.id
                ),
              ],
      });
    for (const event of events.sort((a, b) => a.start - b.start))
      for (const segment of event.pieces) collect(segment);
    rendered.set(occurrence.id, pieces);
  }
  const artifacts: GeneratedArtifact[] = [];
  let remaining = options.maxOutputCodeUnits ?? 10000000;
  if (options.inputs === 'inline') {
    const root = view.occurrences[0]!;
    for (const segment of rendered.get(root.id)!) {
      const origin = segment.origin;
      if (!origin || virtualDirname(origin.path) === virtualDirname(root.path)) continue;
      const file = fileByPath.get(origin.path)!;
      if (
        file.facts.some(
          (f) =>
            f.kind === 'input' &&
            f.range.start >= origin.range.start &&
            f.range.start <= origin.range.end
        )
      )
        reject(
          'edit-conflict',
          'Inlining would relocate a retained input to a different directory.',
          [origin]
        );
    }
    const artifact = emit(
      root.path,
      rendered.get(root.id)!,
      source,
      provenance,
      'active-inputs-expanded',
      remaining
    );
    artifacts.push(artifact);
  } else {
    const unique = new Map<string, GeneratedArtifact>();
    for (const occurrence of view.occurrences) {
      const old = unique.get(occurrence.path);
      const artifact = emit(
        occurrence.path,
        rendered.get(occurrence.id)!,
        source,
        provenance,
        'preserved-project',
        remaining + (old?.source.length ?? 0)
      );
      if (old && old.source !== artifact.source)
        reject(
          'edit-conflict',
          'Repeated input occurrences require incompatible shared-file output.',
          [occurrence.reference!]
        );
      if (!old) {
        unique.set(occurrence.path, artifact);
        remaining -= artifact.source.length;
      } else {
        // Identical physical output can have several exact occurrence origins.
        // Keep those mappings in output order, including overlapping alternatives.
        unique.set(occurrence.path, {
          ...old,
          origins: [...old.origins, ...artifact.origins].sort(
            (a, b) => a.outputRange.start - b.outputRange.start
          ),
        });
      }
    }
    artifacts.push(
      ...[...unique.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    );
  }
  const refs = dependencies(artifacts, source.scanOptions);
  const final = artifacts.map((artifact) =>
    options.inputs === 'inline' && refs.length === 0
      ? { ...artifact, topology: 'self-contained-profile' as const }
      : artifact
  );
  return {
    artifacts: final,
    entryPath: view.configuration.entryPath,
    dependencies: refs,
    coverage: coverage(issues),
  };
}
