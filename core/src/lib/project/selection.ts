import type { ConfiguredNode, ProjectView } from '../../project-types.js';
import type { NodeSelection } from '../../node-types.js';
import { validateView } from './view.js';
import { fields, freeze, record, string } from './shared.js';
import { reject } from './fail.js';

const nodes = new WeakMap<ProjectView, ReadonlyMap<string, ConfiguredNode>>();
export function nodeMap(view: ProjectView): ReadonlyMap<string, ConfiguredNode> {
  let result = nodes.get(view);
  if (!result) {
    const map = new Map<string, ConfiguredNode>();
    const pending: ConfiguredNode[] = view.root ? [view.root] : [];
    while (pending.length) {
      const node = pending.pop()!;
      map.set(node.occurrenceKey, node);
      if (node.kind !== 'token')
        for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
    }
    result = map;
    nodes.set(view, result);
  }
  return result;
}
export function normalizeSelection(value: unknown): NodeSelection {
  const s = record(value, 'node selection');
  fields(s, ['kind', 'snapshotId', 'viewId', 'nodeKey'], 'node selection');
  if (s['kind'] !== 'node') reject('stale-result', 'Expected a configured node selection.');
  return {
    kind: 'node',
    snapshotId: string(s['snapshotId'], 'snapshotId'),
    viewId: string(s['viewId'], 'viewId'),
    nodeKey: string(s['nodeKey'], 'nodeKey'),
  };
}
/**
 * Select a canonical configured node without copying mutable parser state.
 * @param view - Owning configured view.
 * @param nodeKey - Node occurrence key obtained by traversal or indexed lookup.
 * @returns A deeply frozen model-bound reference. Root references are inspectable but not editable.
 * @throws {@link ProjectOperationError} with StaleResult if no such node exists.
 */
export function selectProjectNode(view: ProjectView, nodeKey: string): NodeSelection {
  const current = validateView(view);
  if (!nodeMap(current).has(nodeKey)) reject('stale-result', 'Unknown configured node key.');
  return freeze({ kind: 'node', snapshotId: current.snapshotId, viewId: current.id, nodeKey });
}
/**
 * Resolve a selection against canonical immutable structure.
 * @param view - Exact owning view; transported structure is reconstructed.
 * @param selection - Snapshot/view/node identity, never a caller-constructed AST.
 * @returns The original frozen node with line/start/end spans and delimiter metadata.
 * @throws {@link ProjectOperationError} with StaleResult for stale/unknown selections.
 */
export function getSelectedNode(view: ProjectView, selection: NodeSelection): ConfiguredNode {
  const current = validateView(view),
    s = normalizeSelection(selection);
  if (s.snapshotId !== current.snapshotId || s.viewId !== current.id)
    reject('stale-result', 'The node selection belongs to another source or view.');
  const node = nodeMap(current).get(s.nodeKey);
  if (!node) reject('stale-result', 'The selected node no longer exists.');
  return node;
}
