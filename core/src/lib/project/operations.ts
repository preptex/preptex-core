import type {
  CapabilityReason,
  OperationCapability,
  OperationDescriptor,
  OperationRequest,
  ProjectEditPlan,
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
} from './shared.js';

/** Frozen operation requirements. C6 analyses and C7 transformations remain explicitly unavailable. */
export const projectOperations: readonly OperationDescriptor[] = freeze([
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
    implemented: false,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'findings',
  },
  {
    id: 'unused-commands',
    version: 1,
    implemented: false,
    representation: 'view',
    scopes: ['configured'],
    coverage: 'ready-view',
    resultKind: 'findings',
  },
  {
    id: 'suppress-comments',
    version: 1,
    implemented: false,
    representation: 'either',
    scopes: ['all-files', 'files', 'configured'],
    coverage: 'recognized',
    resultKind: 'edits',
  },
  {
    id: 'materialize',
    version: 1,
    implemented: false,
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
    fields(options, [], 'analysis options');
    return { operation };
  }
  if (operation === 'suppress-comments') {
    fields(options, ['target', 'scope'], 'comment options');
    const target = options['target'];
    if (target !== 'source' && target !== 'selected')
      invalid('Invalid comment transformation target.');
    if (target === 'selected' && options['scope'] !== undefined)
      invalid('Selected-path transformations cannot take a source file scope.');
    return {
      operation,
      options:
        target === 'source' ? { target, scope: normalizeScope(options['scope']) } : { target },
    };
  }
  if (operation === 'materialize') {
    fields(options, ['inputs'], 'materialization options');
    const inputs = options['inputs'];
    if (inputs !== 'preserve' && inputs !== 'inline') invalid('Invalid artifact input topology.');
    return { operation, options: { inputs } };
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
    operation.operation === 'suppress-comments'
      ? operation.options.target === 'source'
        ? 'snapshot'
        : 'view'
      : descriptor.representation;
  if (representation !== model.kind)
    reasons.push({ code: 'wrong-model', message: `This operation requires a ${representation}.` });
  if (
    model.kind === 'view' &&
    model.status !== 'ready' &&
    (descriptor.coverage === 'ready-view' || operation.operation === 'suppress-comments')
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
  return reasons.length
    ? freeze({ eligible: false, reasons })
    : freeze({ eligible: true, reasons: [] });
}

/**
 * Validate a future edit proposal without applying it. C7 supplies planning and application.
 * @param snapshot - Exact source precondition.
 * @param plan - Ordered edits with exact expected substrings and source/operation identity.
 * @param view - Required for a view-dependent proposal; must match its snapshot and view IDs.
 * @returns Nothing on success. All validation completes before a caller can apply any edit.
 * @throws {@link PrepTexError} with InvalidArgument for stale identity, malformed operations, ranges, overlaps, or surrogate-pair splits.
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
  if (request.operation !== 'suppress-comments')
    invalid('This operation does not produce source edits.');
  const viewId = provenance['viewId'];
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
}
