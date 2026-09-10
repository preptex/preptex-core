import type {
  CapabilityReason,
  OperationCapability,
  OperationDescriptor,
  OperationRequest,
  ProjectEditPlan,
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
} from '../../project-types.js';
import { normalizeProjectFilePath } from '../validation.js';
import { normalizeConfiguration } from './configuration.js';
import { normalizeInventory, normalizeScope, validateSnapshot } from './snapshot.js';
import {
  array,
  fields,
  freeze,
  identity,
  invalid,
  lineStarts,
  rangeAt,
  record,
  string,
  bounded,
} from './shared.js';
import { validateView } from './view.js';
import { reject } from './fail.js';
import { validateOccurrenceEdits } from './safety.js';
import { normalizeNodeActions, normalizeNodeOperation } from './node-options.js';
import { sourceOperationEdits } from './source-operations.js';
import { environmentActions, projectionChanges } from './node-edits.js';
import { ProjectOperationError } from '../../errors.js';

/** Frozen operation requirements shared by capability checks and execution. */
export const projectOperations: readonly OperationDescriptor[] = freeze([
  {
    id: 'edit-nodes',
    version: 1,
    implemented: true,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'transformation',
  },
  {
    id: 'remove-environments',
    version: 1,
    implemented: true,
    representation: 'either',
    scopes: ['all-files', 'files', 'configured'],
    coverage: 'recognized',
    resultKind: 'transformation',
  },
  {
    id: 'source-inventory',
    version: 1,
    implemented: true,
    representation: 'snapshot',
    scopes: ['all-files', 'files'],
    coverage: 'recognized',
    resultKind: 'inventory',
  },
  {
    id: 'resolve-view',
    version: 1,
    implemented: true,
    representation: 'snapshot',
    scopes: ['configured'],
    coverage: 'recognized',
    resultKind: 'view',
  },
  {
    id: 'references',
    version: 1,
    implemented: true,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'findings',
  },
  {
    id: 'unused-commands',
    version: 1,
    implemented: true,
    representation: 'either',
    scopes: ['all-files', 'files', 'configured'],
    coverage: 'ready-view',
    resultKind: 'findings',
  },
  {
    id: 'suppress-comments',
    version: 1,
    implemented: true,
    representation: 'either',
    scopes: ['all-files', 'files', 'configured'],
    coverage: 'recognized',
    resultKind: 'edits',
  },
  {
    id: 'materialize',
    version: 1,
    implemented: true,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'artifacts',
  },
  {
    id: 'identity',
    version: 1,
    implemented: true,
    representation: 'either',
    scopes: ['all-files', 'files', 'configured'],
    coverage: 'recognized',
    resultKind: 'edits',
  },
  {
    id: 'export-project',
    version: 1,
    implemented: true,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'artifacts',
  },
]);

export function validateOperation(value: unknown): OperationRequest {
  const request = record(value, 'operation request');
  fields(request, ['operation', 'options'], 'operation request');
  const operation = request['operation'];
  if (operation === 'edit-nodes' || operation === 'remove-environments')
    return normalizeNodeOperation(operation, request['options']);
  if (operation === 'source-inventory')
    return { operation, options: normalizeInventory(request['options']) };
  if (operation === 'resolve-view') {
    const options = request['options'];
    return { operation, options: normalizeConfiguration(options) };
  }
  const options = record(
    request['options'] === undefined ? {} : request['options'],
    'operation options'
  );
  if (operation === 'references' || operation === 'unused-commands') {
    fields(options, ['allowIncomplete', 'scope'], 'analysis options');
    if (options['allowIncomplete'] !== undefined && typeof options['allowIncomplete'] !== 'boolean')
      invalid('allowIncomplete must be a boolean.');
    return {
      operation,
      options: {
        allowIncomplete: options['allowIncomplete'] === true,
        ...(options['scope'] === undefined ? {} : { scope: normalizeScope(options['scope']) }),
      },
    };
  }
  if (operation === 'suppress-comments' || operation === 'identity') {
    fields(
      options,
      ['target', 'scope', 'maxOutputCodeUnits', 'suppressCommentEnvironments'],
      'source edit options'
    );
    if (
      options['suppressCommentEnvironments'] !== undefined &&
      typeof options['suppressCommentEnvironments'] !== 'boolean'
    )
      invalid('suppressCommentEnvironments must be a boolean.');
    if (operation === 'identity' && options['suppressCommentEnvironments'])
      invalid('Identity cannot suppress comment environments.');
    const commentOptions =
      options['suppressCommentEnvironments'] === undefined
        ? {}
        : { suppressCommentEnvironments: options['suppressCommentEnvironments'] === true };
    const target = options['target'];
    if (target !== 'source' && target !== 'selected')
      invalid('Invalid comment transformation target.');
    if (target === 'selected' && options['scope'] !== undefined)
      invalid('Selected-path transformations cannot take a source file scope.');
    const maxOutputCodeUnits = bounded(
      options['maxOutputCodeUnits'],
      10000000,
      100000000,
      'maxOutputCodeUnits'
    );
    return {
      operation,
      options:
        target === 'source'
          ? {
              target,
              scope: normalizeScope(options['scope']),
              maxOutputCodeUnits,
              ...commentOptions,
            }
          : { target, maxOutputCodeUnits, ...commentOptions },
    };
  }
  if (operation === 'materialize' || operation === 'export-project') {
    fields(
      options,
      operation === 'materialize'
        ? [
            'inputs',
            'suppressComments',
            'suppressCommentEnvironments',
            'nodeEdits',
            'maxOutputCodeUnits',
          ]
        : [
            'inputs',
            'conditions',
            'suppressComments',
            'suppressCommentEnvironments',
            'nodeEdits',
            'maxOutputCodeUnits',
          ],
      'export options'
    );
    const inputs = options['inputs'];
    if (inputs !== 'preserve' && inputs !== 'inline') invalid('Invalid artifact input topology.');
    if (
      options['suppressComments'] !== undefined &&
      typeof options['suppressComments'] !== 'boolean'
    )
      invalid('suppressComments must be a boolean.');
    const common = {
      ...(options['nodeEdits'] === undefined
        ? {}
        : { nodeEdits: normalizeNodeActions(options['nodeEdits']) }),
      ...(options['suppressCommentEnvironments'] === undefined
        ? {}
        : { suppressCommentEnvironments: options['suppressCommentEnvironments'] === true }),
      inputs,
      suppressComments: options['suppressComments'] === true,
      maxOutputCodeUnits: bounded(
        options['maxOutputCodeUnits'],
        10000000,
        100000000,
        'maxOutputCodeUnits'
      ),
    } as const;
    if (
      options['suppressCommentEnvironments'] !== undefined &&
      typeof options['suppressCommentEnvironments'] !== 'boolean'
    )
      invalid('suppressCommentEnvironments must be a boolean.');
    if (operation === 'materialize') return { operation, options: common };
    const conditions = options['conditions'];
    if (conditions !== 'preserve' && conditions !== 'materialize')
      invalid('Invalid conditional output policy.');
    return { operation, options: { ...common, conditions } };
  }
  return invalid('Unknown operation.');
}

/**
 * Check operation/model compatibility without generating artifacts or modifying sources.
 * @param model - Source snapshot or configured view.
 * @param request - Typed operation with its semantic options.
 * @returns Frozen eligibility and machine-readable reasons, including later-stage unavailability.
 * @throws {@link PrepTexError} with InvalidArgument for malformed requests or stale snapshots.
 */
export function checkOperationCapability(
  model: ProjectSnapshot | ProjectView,
  request: OperationRequest
): OperationCapability {
  const operation = validateOperation(request);
  const descriptor = projectOperations.find((d) => d.id === operation.operation)!;
  const data = record(model, 'operation model');
  if (data['kind'] !== 'snapshot' && data['kind'] !== 'view') invalid('Invalid operation model.');
  const snapshot = model.kind === 'snapshot' ? validateSnapshot(model) : null;
  if (model.kind === 'view') model = validateView(model);
  if (model.kind === 'view' && !['ready', 'incomplete', 'blocked'].includes(model.status))
    invalid('Invalid view status.');
  if (
    model.kind === 'view' &&
    model.id !== identity('view', [model.snapshotId, normalizeConfiguration(model.configuration)])
  )
    invalid('Stale or inconsistent view identity.');
  const reasons: CapabilityReason[] = [];
  if (!descriptor.implemented)
    reasons.push({
      code: 'not-implemented',
      message: `${descriptor.id} is reserved for a later implementation phase.`,
    });
  const representation =
    operation.operation === 'suppress-comments' ||
    operation.operation === 'identity' ||
    operation.operation === 'remove-environments'
      ? operation.options.target === 'source'
        ? 'snapshot'
        : 'view'
      : descriptor.representation;
  if (representation !== 'either' && representation !== model.kind)
    reasons.push({ code: 'wrong-model', message: `This operation requires a ${representation}.` });
  if (
    model.kind === 'view' &&
    model.status !== 'ready' &&
    !(
      (operation.operation === 'references' || operation.operation === 'unused-commands') &&
      operation.options?.allowIncomplete
    ) &&
    (descriptor.coverage === 'ready-view' ||
      operation.operation === 'suppress-comments' ||
      operation.operation === 'remove-environments' ||
      operation.operation === 'identity')
  )
    reasons.push({ code: 'view-not-ready', message: 'A complete configured view is required.' });
  if (snapshot && operation.operation === 'source-inventory') {
    const scope = operation.options?.scope;
    if (
      scope?.kind === 'files' &&
      scope.paths.some((p) => !snapshot.files.some((f) => f.path === p))
    )
      reasons.push({
        code: 'missing-file',
        message: 'The requested source scope contains an absent file.',
      });
  }
  if (
    model.kind === 'view' &&
    (operation.operation === 'references' || operation.operation === 'unused-commands') &&
    operation.options?.scope !== undefined
  )
    reasons.push({
      code: 'wrong-model',
      message: 'A configured analysis uses its complete occurrence scope, not a source-file scope.',
    });
  const scope =
    operation.operation === 'unused-commands' ||
    operation.operation === 'suppress-comments' ||
    operation.operation === 'remove-environments' ||
    operation.operation === 'identity'
      ? operation.options?.scope
      : undefined;
  if (
    snapshot &&
    scope?.kind === 'files' &&
    scope.paths.some((p) => !snapshot.files.some((f) => f.path === p))
  )
    reasons.push({ code: 'missing-file', message: 'An operation scope requests an absent file.' });
  if (!reasons.length) {
    try {
      if (operation.operation === 'edit-nodes' || operation.operation === 'remove-environments') {
        if (operation.options.target === 'artifact' && model.kind === 'view')
          projectionChanges(
            model,
            operation.operation === 'edit-nodes'
              ? operation.options.actions
              : environmentActions(model, operation.options.names)
          );
        else
          sourceOperationEdits(
            model.kind === 'snapshot' ? model : model.snapshot,
            operation,
            model.kind === 'view' ? model : undefined
          );
      }
      if (
        (operation.operation === 'materialize' || operation.operation === 'export-project') &&
        model.kind === 'view'
      ) {
        if (operation.options.nodeEdits?.length) {
          if (
            operation.options.inputs !== 'inline' ||
            (operation.operation === 'export-project' &&
              operation.options.conditions !== 'materialize')
          )
            reject(
              'unavailable',
              'Node artifact edits require materialized conditions and inline inputs.'
            );
          projectionChanges(model, operation.options.nodeEdits);
        }
      }
      if (
        operation.operation === 'suppress-comments' &&
        operation.options.suppressCommentEnvironments
      )
        sourceOperationEdits(
          model.kind === 'snapshot' ? model : model.snapshot,
          operation,
          model.kind === 'view' ? model : undefined
        );
    } catch (error: unknown) {
      if (!(error instanceof ProjectOperationError)) throw error;
      reasons.push({ code: 'edit-unavailable', message: error.message, failure: error.failure });
    }
  }
  return reasons.length
    ? freeze({ eligible: false, reasons })
    : freeze({ eligible: true, reasons: [] });
}

/**
 * Validate an edit proposal without applying it.
 * @param snapshot - Exact source precondition.
 * @param plan - Ordered edits with exact expected substrings and source/operation identity.
 * @param view - Required for a view-dependent proposal; must match its snapshot and view IDs.
 * @returns Nothing on success. All validation completes before a caller can apply any edit.
 * @throws {@link PrepTexError} with InvalidArgument for stale identity, malformed operations, ranges, overlaps, or surrogate-pair splits.
 * @throws {@link ProjectOperationError} for incompatible occurrence edits, invalid identity edits, or output limits.
 */
export function validateProjectEditPlan(
  snapshot: ProjectSnapshot,
  plan: ProjectEditPlan,
  view?: ProjectView
): void {
  const source = validateSnapshot(snapshot);
  const input = record(plan, 'edit plan');
  fields(input, ['kind', 'provenance', 'edits'], 'edit plan');
  if (input['kind'] !== 'edits') invalid('Expected an edit plan.');
  const provenance = record(input['provenance'], 'edit provenance');
  fields(provenance, ['snapshotId', 'viewId', 'request', 'operationVersion'], 'edit provenance');
  if (provenance['snapshotId'] !== source.id || provenance['operationVersion'] !== 1)
    invalid('Stale edit snapshot or unsupported operation version.');
  const request = validateOperation(provenance['request']);
  if (
    request.operation !== 'suppress-comments' &&
    request.operation !== 'identity' &&
    request.operation !== 'edit-nodes' &&
    request.operation !== 'remove-environments'
  )
    invalid('This operation does not produce source edits.');
  if (request.options.target === 'artifact')
    invalid('Artifact operations do not produce source edits.');
  const scope = 'scope' in request.options ? request.options.scope : undefined;
  const viewId = provenance['viewId'];
  if (view) view = validateView(view);
  if (request.options.target === 'selected') {
    if (
      typeof viewId !== 'string' ||
      !view ||
      view.id !== viewId ||
      view.snapshotId !== source.id ||
      view.status !== 'ready'
    )
      invalid('Stale or missing configured view precondition.');
    if (view.id !== identity('view', [source.id, normalizeConfiguration(view.configuration)]))
      invalid('Inconsistent configured view identity.');
  } else if (viewId !== null) invalid('Source-local edits must not depend on a view.');
  let previousPath = '';
  let previousEnd = -1;
  let previousInsertion = false;
  for (const raw of array(input['edits'], 'edits')) {
    const edit = record(raw, 'edit');
    const path = normalizeProjectFilePath(edit['path'], 'edit path');
    if (path !== edit['path']) invalid('Edit paths must already be normalized.');
    const file = source.files.find((f) => f.path === path);
    if (!file) invalid('An edit targets an absent file.');
    if (scope?.kind === 'files' && !scope.paths.includes(path))
      reject('invalid-edit', 'An edit targets a file outside its declared source scope.');
    let start: number;
    let end: number;
    if (edit['kind'] === 'insert') {
      fields(edit, ['kind', 'path', 'offset', 'text'], 'insert');
      string(edit['text'], 'insert text');
      if (typeof edit['offset'] !== 'number' || !Number.isSafeInteger(edit['offset']))
        invalid('Insertion offset must be an integer.');
      start = end = edit['offset'];
    } else if (edit['kind'] === 'replace') {
      fields(edit, ['kind', 'path', 'range', 'expected', 'replacement'], 'replace');
      const range = record(edit['range'], 'edit range');
      fields(range, ['start', 'end', 'line'], 'edit range');
      if (
        typeof range['start'] !== 'number' ||
        !Number.isSafeInteger(range['start']) ||
        typeof range['end'] !== 'number' ||
        !Number.isSafeInteger(range['end'])
      )
        invalid('Replacement bounds must be integers.');
      start = range['start'];
      end = range['end'] + 1;
      if (end <= start) invalid('Replacement ranges must include at least one code unit.');
      if (range['line'] !== rangeAt(lineStarts(file.source), start, end - 1).line)
        invalid('Edit line does not match its original offset.');
      const expected = string(edit['expected'], 'expected source');
      string(edit['replacement'], 'replacement');
      if (file.source.slice(start, end) !== expected)
        invalid('Edit expected contents do not match source.');
    } else invalid('Unknown edit kind.');
    if (start < 0 || end > file.source.length) invalid('Edit is outside the original source.');
    const splitsPair = (pos: number) =>
      pos > 0 &&
      pos < file.source.length &&
      /[\uD800-\uDBFF]/.test(file.source[pos - 1]!) &&
      /[\uDC00-\uDFFF]/.test(file.source[pos]!);
    if (splitsPair(start) || splitsPair(end))
      invalid('An edit boundary splits a UTF-16 surrogate pair.');
    if (
      path < previousPath ||
      (path === previousPath &&
        (start < previousEnd || (start === previousEnd && previousInsertion)))
    )
      invalid('Edits must be ordered and nonoverlapping; equal-offset insertions are ambiguous.');
    previousPath = path;
    previousEnd = end;
    previousInsertion = edit['kind'] === 'insert';
  }
  if (request.operation === 'identity' && plan.edits.length)
    reject('invalid-edit', 'Identity transformations cannot modify source.');
  let outputSize = source.files
    .filter((file) => scope?.kind !== 'files' || scope.paths.includes(file.path))
    .reduce((total, file) => total + file.source.length, 0);
  for (const edit of plan.edits)
    outputSize +=
      edit.kind === 'insert' ? edit.text.length : edit.replacement.length - edit.expected.length;
  if (outputSize > (request.options.maxOutputCodeUnits ?? 10000000))
    reject('output-limit', 'The planned source output exceeds its configured size limit.');
  if (
    request.operation === 'edit-nodes' ||
    request.operation === 'remove-environments' ||
    (request.operation === 'suppress-comments' && request.options.suppressCommentEnvironments)
  ) {
    const expected = sourceOperationEdits(source, request, view);
    const signature = (edits: readonly ProjectEdit[]) =>
      JSON.stringify(
        edits.map((e) =>
          e.kind === 'insert'
            ? [e.kind, e.path, e.offset, e.text]
            : [e.kind, e.path, e.range.start, e.range.end, e.range.line, e.expected, e.replacement]
        )
      );
    if (signature(expected) !== signature(plan.edits))
      reject(
        'invalid-edit',
        'Node/environment edits must match their complete canonical proposal.'
      );
  } else if (request.options.target === 'selected' && view)
    validateOccurrenceEdits(view, plan.edits);
}

export function requireCapability(
  model: ProjectSnapshot | ProjectView,
  request: OperationRequest
): void {
  const result = checkOperationCapability(model, request);
  if (!result.eligible) {
    const failure = result.reasons.find((r) => r.failure)?.failure;
    if (failure) throw new ProjectOperationError(failure);
    reject('unavailable', result.reasons.map((r) => r.message).join(' '));
  }
}
