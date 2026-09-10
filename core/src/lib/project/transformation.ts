import { safeComment, commentEdit } from './comment-edits.js';
import { sourceOperationEdits } from './source-operations.js';
import { environmentActions, projectionChanges } from './node-edits.js';
import { getSelectedNode } from './selection.js';
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
  SourceScope,
  TransformationRequest,
  TransformationResult,
} from '../../project-types.js';
import { PrepTexError, PrepTexErrorCode, ProjectOperationError } from '../../errors.js';
import { updateProjectSnapshot, validateSnapshot } from './snapshot.js';
import { validateView } from './view.js';
import { requireCapability, validateOperation, validateProjectEditPlan } from './operations.js';
import { sourceCopier, dependencies, emit, synthetic, type Segment } from './emission.js';
import { coverage, freeze, identity, invalid, issue, record } from './shared.js';
import { eligibleToken } from './safety.js';
import { reject } from './fail.js';
import { virtualDirname } from '../virtual-path.js';

function selectedFiles(
  source: ProjectSnapshot,
  scope: SourceScope | undefined
): readonly ScannedFile[] {
  return source.files.filter((f) => scope?.kind !== 'files' || scope.paths.includes(f.path));
}

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
 * Plan identity/comment edits or generate a configured export without changing sources.
 * @param model - Source snapshot for source-local work, configured view for selected work/exports.
 * @param request - Operation, independent retention/topology policies, and resource limits.
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
  const source = normalized.kind === 'snapshot' ? normalized : normalized.snapshot;
  const provenance: OperationProvenance = {
    snapshotId: source.id,
    viewId: normalized.kind === 'view' ? normalized.id : null,
    request: operation,
    operationVersion: 1,
  };
  const resultId = identity('transformation', provenance);
  if (
    operation.operation === 'identity' ||
    operation.operation === 'suppress-comments' ||
    ((operation.operation === 'edit-nodes' || operation.operation === 'remove-environments') &&
      operation.options.target !== 'artifact')
  ) {
    const files = selectedFiles(
      source,
      'scope' in operation.options ? operation.options.scope : undefined
    );
    const view = normalized.kind === 'view' ? normalized : undefined;
    const edits = sourceOperationEdits(source, operation, view);
    const plan = freeze({ kind: 'edits' as const, provenance, edits });
    validateProjectEditPlan(source, plan, view);
    let remaining = operation.options.maxOutputCodeUnits ?? 10000000;
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
      coverage: view?.coverage ?? coverage(files.flatMap((f) => f.coverage.issues)),
    });
  }
  if (normalized.kind !== 'view') invalid('Configured exports require a view.');
  if (
    operation.operation !== 'materialize' &&
    operation.operation !== 'export-project' &&
    operation.operation !== 'edit-nodes' &&
    operation.operation !== 'remove-environments'
  )
    invalid('Expected a configured export operation.');
  const options: ExportOptions =
    operation.operation === 'edit-nodes' || operation.operation === 'remove-environments'
      ? {
          conditions: 'materialize',
          inputs: 'inline',
          nodeEdits:
            operation.operation === 'edit-nodes'
              ? operation.options.actions
              : environmentActions(normalized, operation.options.names),
          maxOutputCodeUnits: operation.options.maxOutputCodeUnits ?? 10000000,
        }
      : operation.operation === 'materialize'
        ? { ...operation.options, conditions: 'materialize' }
        : operation.options;
  const exported = exportView(normalized, options, provenance);
  return freeze({ kind: 'transformation', resultId, provenance, editPlan: null, ...exported });
}

function exportView(
  view: ProjectView,
  options: ExportOptions,
  provenance: OperationProvenance
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
    projectionChanges(view, [...nodeActions, ...commentActions])
  );
  const commentNodes = commentActions.map((a) => getSelectedNode(view, a.selection));
  const issues: ProjectIssue[] = [...view.coverage.issues];
  const selectedByOccurrence = new Map<string, SelectedToken[]>();
  for (const token of view.selectedTokens) {
    const bucket = selectedByOccurrence.get(token.origin.occurrenceId) ?? [];
    bucket.push(token);
    selectedByOccurrence.set(token.origin.occurrenceId, bucket);
  }
  const knownScaffolding = new Map<string, { start: number; end: number }[]>();
  const allowed = new Set([
    'newif',
    'global',
    'label',
    'ref',
    'eqref',
    'pageref',
    'begin',
    'end',
    'input',
    'section',
    'subsection',
    'subsubsection',
    'paragraph',
    'subparagraph',
    'item',
    'relax',
    'par',
  ]);
  const booleanCommands = new Set(
    view.reachedFacts.flatMap((e) =>
      e.fact.kind === 'condition-declaration' && e.fact.name
        ? [`if${e.fact.name}`, `${e.fact.name}true`, `${e.fact.name}false`]
        : []
    )
  );
  const canRemove =
    options.conditions === 'materialize' &&
    view.reachedFacts.every(
      (e) =>
        e.fact.kind !== 'definition' &&
        (e.fact.kind !== 'command-use' ||
          allowed.has(e.fact.name) ||
          booleanCommands.has(e.fact.name) ||
          e.fact.name === 'iftrue' ||
          e.fact.name === 'iffalse')
    ) &&
    source.files.every(
      (file) =>
        !file.facts.some(
          (f) =>
            f.context.definitionBodies.length ||
            (f.kind === 'command-use' &&
              f.context.opaqueArguments.length &&
              booleanCommands.has(f.name))
        )
    );
  if (
    options.conditions === 'materialize' &&
    !canRemove &&
    view.reachedFacts.some(
      (e) => e.fact.kind === 'condition-declaration' || e.fact.kind === 'condition-assignment'
    )
  )
    issues.push(
      issue(
        'opaque-region',
        'Boolean scaffolding retained because opaque or external consumers may still require it.',
        null
      )
    );
  if (canRemove)
    for (const reached of view.reachedFacts) {
      if (
        reached.fact.kind !== 'condition-declaration' &&
        reached.fact.kind !== 'condition-assignment' &&
        !(
          reached.fact.kind === 'command-use' &&
          (reached.fact.name === 'global' || booleanCommands.has(reached.fact.name))
        )
      )
        continue;
      const bucket = knownScaffolding.get(reached.origin.occurrenceId) ?? [];
      bucket.push(reached.origin.range);
      knownScaffolding.set(reached.origin.occurrenceId, bucket);
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
    if (options.conditions === 'materialize') {
      const events: { start: number; pieces: Segment[] }[] = [];
      let omittedIndentUntil = -1;
      for (const token of tokens) {
        let keep = !knownScaffolding
          .get(occurrence.id)
          ?.some((r) => r.start <= token.origin.range.start && r.end >= token.origin.range.end);
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
    } else {
      const edits: { start: number; end: number; pieces: Segment[] }[] = [];
      for (const node of commentNodes) {
        if (node.location.kind !== 'single')
          reject(
            'edit-conflict',
            'Preserved output requires a contiguous comment environment.',
            node.origins
          );
        const origin = node.location.primary;
        if (origin.occurrenceId === occurrence.id)
          edits.push({ start: origin.range.start, end: origin.range.end + 1, pieces: [] });
      }
      if (options.suppressComments)
        for (const token of tokens)
          if (
            eligibleToken(token) &&
            token.token.kind === 'comment' &&
            safeComment(source, file, token.origin.range.start, token.origin.range.end)
          ) {
            const edit = commentEdit(
              source,
              file,
              token.origin.range.start,
              token.origin.range.end
            );
            if (edit.kind === 'replace')
              edits.push({ start: edit.range.start, end: edit.range.end + 1, pieces: [] });
          }
      if (options.inputs === 'inline')
        for (const child of ownChildren)
          edits.push({
            start: child.reference!.range.start,
            end: child.reference!.range.end + 1,
            pieces: rendered.get(child.id)!,
          });
      let pos = 0;
      for (const edit of edits.sort((a, b) => a.start - b.start || b.end - a.end)) {
        if (edit.end <= pos) continue;
        if (edit.start < pos) reject('edit-conflict', 'Overlapping preserved output edits.');
        collect(copied(file, pos, edit.start, occurrence.id));
        for (const segment of edit.pieces) collect(segment);
        pos = edit.end;
      }
      collect(copied(file, pos, file.source.length, occurrence.id));
    }
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
          'Inlining would relocate a retained input to a different directory. Preserve input topology or materialize the remaining conditions first.',
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
    if (options.conditions === 'preserve')
      for (const file of source.files)
        if (!unique.has(file.path)) {
          const artifact = emit(
            file.path,
            [copied(file, 0, file.source.length, null)],
            source,
            provenance,
            'preserved-project',
            remaining
          );
          unique.set(file.path, artifact);
          remaining -= artifact.source.length;
        }
    artifacts.push(
      ...[...unique.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    );
  }
  const refs = dependencies(artifacts, source.scanOptions);
  const final = artifacts.map((artifact) =>
    options.inputs === 'inline' && options.conditions === 'materialize' && refs.length === 0
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
