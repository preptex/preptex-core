import type { NodeEditAction, NodeTransformationRequest } from '../../node-types.js';
import { array, bounded, fields, invalid, record } from './shared.js';
import { normalizeSelection } from './selection.js';
import { normalizeScope } from './snapshot.js';
import { environmentName } from './environments.js';

export function normalizeNodeActions(value: unknown): readonly NodeEditAction[] {
  const actions = array(value, 'node actions');
  if (actions.length > 10000) invalid('At most 10000 node actions are supported.');
  return actions.map((raw) => {
    const a = record(raw, 'node action'),
      kind = a['kind'];
    fields(
      a,
      kind === 'remove-node' ? ['kind', 'selection'] : ['kind', 'selection', 'name'],
      'node action'
    );
    const selection = normalizeSelection(a['selection']);
    if (kind === 'remove-node') return { kind, selection };
    if (kind === 'rename-environment' || kind === 'wrap-node')
      return { kind, selection, name: environmentName(a['name']) };
    return invalid('Unknown node action.');
  });
}
export function normalizeNodeOperation(
  operation: 'edit-nodes' | 'remove-environments',
  value: unknown
): NodeTransformationRequest {
  const o = record(value, 'node operation options');
  fields(
    o,
    operation === 'edit-nodes'
      ? ['target', 'actions', 'maxOutputCodeUnits']
      : ['target', 'names', 'scope', 'maxOutputCodeUnits'],
    'node operation options'
  );
  const target = o['target'];
  if (
    target !== 'selected' &&
    target !== 'artifact' &&
    (operation !== 'remove-environments' || target !== 'source')
  )
    invalid('Invalid node operation target.');
  const maxOutputCodeUnits = bounded(
    o['maxOutputCodeUnits'],
    10000000,
    100000000,
    'maxOutputCodeUnits'
  );
  if (operation === 'edit-nodes') {
    if (target !== 'selected' && target !== 'artifact')
      invalid('Node selections require a configured view.');
    return {
      operation,
      options: { target, actions: normalizeNodeActions(o['actions']), maxOutputCodeUnits },
    };
  }
  const names = [...new Set(array(o['names'], 'environment names').map(environmentName))].sort();
  if (!names.length || names.length > 1000) invalid('Request 1–1000 environment names.');
  if (target !== 'source' && o['scope'] !== undefined)
    invalid('Source file scopes cannot restrict configured environment operations.');
  return {
    operation,
    options: {
      target,
      names,
      maxOutputCodeUnits,
      ...(target === 'source' ? { scope: normalizeScope(o['scope']) } : {}),
    },
  };
}
