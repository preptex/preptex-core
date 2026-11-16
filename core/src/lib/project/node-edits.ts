import type { ConfiguredNode, ProjectEdit, ProjectView } from '../../project-types.js';
import type { NodeEditAction } from '../../node-types.js';
import { getSelectedNode, nodeMap, selectProjectNode } from './selection.js';
import { reject } from './fail.js';
import { normalizeChanges, sourceChanges, type TextChange } from './text-edits.js';

interface Action {
  action: NodeEditAction;
  node: ConfiguredNode;
  order: number;
}
function contains(a: ConfiguredNode, b: ConfiguredNode): boolean {
  return (
    a.projectedRange.start <= b.projectedRange.start && a.projectedRange.end >= b.projectedRange.end
  );
}
const protectedKeysCache = new WeakMap<ProjectView, ReadonlySet<string>>();
function protectedTokenKeys(view: ProjectView): ReadonlySet<string> {
  let cached = protectedKeysCache.get(view);
  if (cached) return cached;
  const keys = new Set<string>();
  const pending: ConfiguredNode[] = view.root ? [view.root] : [];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.kind === 'command' || node.kind === 'section') {
      const firstArgStart = node.arguments[0]?.childStart ?? node.children.length;
      if (node.children[0]) keys.add(node.children[0].occurrenceKey);
      if (node.starred) {
        const headerLimit =
          node.kind === 'command'
            ? node.children.length
            : (node.arguments[node.arguments.length - 1]?.childEnd ?? 0) + 1;
        for (let i = 1; i < Math.min(firstArgStart, headerLimit); i++) {
          const child = node.children[i];
          if (child?.kind === 'token' && child.token.value === '*') {
            keys.add(child.occurrenceKey);
            break;
          }
        }
      }
      for (const arg of node.arguments) {
        if (arg.childStart === arg.childEnd) {
          const direct = node.children[arg.childStart];
          if (direct?.kind === 'token') keys.add(direct.occurrenceKey);
        } else {
          const open = node.children[arg.childStart];
          const close = node.children[arg.childEnd];
          if (open) keys.add(open.occurrenceKey);
          if (close) keys.add(close.occurrenceKey);
        }
      }
    }
    if (node.kind !== 'token') {
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
    }
  }
  cached = keys;
  protectedKeysCache.set(view, cached);
  return cached;
}

export function plannedActions(view: ProjectView, actions: readonly NodeEditAction[]): Action[] {
  const unique = new Map<string, Action>();
  const all: Action[] = [];
  const protectedTokens = protectedTokenKeys(view);
  actions.forEach((action, order) => {
    const node = getSelectedNode(view, action.selection);
    if (node.kind === 'root') reject('unavailable', 'The synthetic root cannot be edited.');
    if (node.kind === 'token') {
      const token = view.selectedTokens.find(
        (t) =>
          t.projectedRange.start <= node.projectedRange.start &&
          t.projectedRange.end >= node.projectedRange.end
      );
      if (
        !token ||
        token.interpretation === 'opaque' ||
        protectedTokens.has(node.occurrenceKey) ||
        ['command', 'open', 'close', 'math'].includes(node.token.kind)
      )
        reject(
          'unavailable',
          'Select a complete construct, not a protected argument or structural delimiter token.',
          node.origins
        );
    }
    if (
      action.kind === 'rename-environment' &&
      (node.kind !== 'environment' ||
        !node.syntax.opening ||
        !node.syntax.closing ||
        node.syntax.hasArguments)
    )
      reject(
        'unavailable',
        'Renaming requires two literal argument-free environment delimiters.',
        node.origins
      );
    const key = `${action.kind}:${node.occurrenceKey}`;
    const old = unique.get(key);
    if (old && action.kind !== 'wrap-node') {
      if (
        old.action.kind === 'rename-environment' &&
        action.kind === 'rename-environment' &&
        old.action.name !== action.name
      )
        reject('edit-conflict', 'One environment has incompatible renames.', node.origins);
      return;
    }
    const value = { action, node, order };
    unique.set(key, value);
    all.push(value);
  });
  const removed = all.filter((a) => a.action.kind === 'remove-node');
  for (const a of all)
    if (a.action.kind !== 'remove-node' && removed.some((r) => contains(r.node, a.node)))
      reject(
        'edit-conflict',
        'A removed subtree also contains a rename or wrapper.',
        a.node.origins
      );
  const result = all.filter(
    (a) =>
      a.action.kind !== 'remove-node' ||
      !removed.some(
        (r) =>
          r !== a &&
          contains(r.node, a.node) &&
          (r.node.projectedRange.start !== a.node.projectedRange.start ||
            r.node.projectedRange.end !== a.node.projectedRange.end ||
            r.order < a.order)
      )
  );
  const wrappers = result.filter((a) => a.action.kind === 'wrap-node');
  if (wrappers.length) {
    const pending: { node: ConfiguredNode; depth: number }[] = view.root
      ? [{ node: view.root, depth: 0 }]
      : [];
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (
        depth + wrappers.filter((w) => contains(w.node, node)).length >
        view.configuration.limits.maxNesting
      )
        reject(
          'output-limit',
          'Wrappers exceed the configured structural nesting limit.',
          node.origins
        );
      if (node.kind !== 'token')
        for (const child of node.children)
          pending.push({ node: child, depth: depth + (child.kind === 'token' ? 0 : 1) });
    }
  }
  return result;
}
function wrapperOrder(a: Action, b: Action, close: boolean): number {
  return close
    ? b.node.projectedRange.start - a.node.projectedRange.start || b.order - a.order
    : a.node.projectedRange.start - b.node.projectedRange.start ||
        b.node.projectedRange.end - a.node.projectedRange.end ||
        a.order - b.order;
}
export function projectionChanges(
  view: ProjectView,
  actions: readonly NodeEditAction[]
): TextChange[] {
  const planned = plannedActions(view, actions),
    result: TextChange[] = [];
  const boundary = (occurrenceId: string, offset: number) => {
    const token = view.selectedTokens.find(
      (t) =>
        t.origin.occurrenceId === occurrenceId &&
        t.origin.range.start <= offset &&
        t.origin.range.end >= offset
    );
    if (!token) reject('edit-conflict', 'No selected mapping exists for a delimiter name.');
    return token.projectedRange.start + offset - token.origin.range.start;
  };
  for (const { action, node } of planned) {
    if (action.kind === 'remove-node')
      result.push({ start: node.projectedRange.start, end: node.projectedRange.end + 1, text: '' });
    if (action.kind === 'rename-environment' && node.kind === 'environment')
      for (const d of [node.syntax.opening!, node.syntax.closing!])
        result.push({
          start: boundary(d.origin.occurrenceId, d.nameRange.start),
          end: boundary(d.origin.occurrenceId, d.nameRange.end) + 1,
          text: action.name,
        });
  }
  // At shared boundaries, close the preceding subtree before opening the next.
  for (const close of [true, false])
    for (const { action, node } of planned
      .filter((a) => a.action.kind === 'wrap-node')
      .sort((a, b) => wrapperOrder(a, b, close)))
      if (action.kind === 'wrap-node')
        result.push({
          start: close ? node.projectedRange.end + 1 : node.projectedRange.start,
          end: close ? node.projectedRange.end + 1 : node.projectedRange.start,
          text: `\\${close ? 'end' : 'begin'}{${action.name}}`,
        });
  return normalizeChanges(result);
}

export function nodeSourceEdits(
  view: ProjectView,
  actions: readonly NodeEditAction[]
): ProjectEdit[] {
  const planned = plannedActions(view, actions);
  const byPath = new Map<string, TextChange[]>();
  const push = (path: string, e: TextChange) => {
    const b = byPath.get(path) ?? [];
    b.push(e);
    byPath.set(path, b);
  };
  interface PhysicalAction {
    action: Action;
    path: string;
    start: number;
    end: number;
    occurrenceId: string;
    text: string;
  }
  const groups = new Map<string, PhysicalAction[]>();
  function add(a: PhysicalAction): void {
    const key = JSON.stringify([a.action.action.kind, a.path, a.start, a.end]);
    const group = groups.get(key) ?? [];
    group.push(a);
    groups.set(key, group);
  }
  for (const a of planned) {
    if (a.action.kind !== 'rename-environment' && a.node.location.kind !== 'single')
      reject(
        'edit-conflict',
        'A source removal/wrapper requires one contiguous original extent; use materialized inline artifacts.',
        a.node.origins
      );
    if (a.action.kind === 'rename-environment' && a.node.kind === 'environment')
      for (const d of [a.node.syntax.opening!, a.node.syntax.closing!])
        add({
          action: a,
          path: d.path,
          start: d.nameRange.start,
          end: d.nameRange.end + 1,
          occurrenceId: d.origin.occurrenceId,
          text: a.action.name,
        });
    else {
      const o = a.node.location.primary!;
      add({
        action: a,
        path: o.path,
        start: o.range.start,
        end: o.range.end + 1,
        occurrenceId: o.occurrenceId,
        text: a.action.kind === 'wrap-node' ? a.action.name : '',
      });
    }
  }
  const wrappers: PhysicalAction[] = [];
  for (const group of groups.values()) {
    const first = group[0]!,
      representative = group.filter((a) => a.occurrenceId === first.occurrenceId);
    const sequence = JSON.stringify(representative.map((a) => a.text));
    // Compare complete ordered wrapper sequences, not just membership of each name.
    for (const occurrence of view.occurrences)
      if (
        occurrence.path === first.path &&
        JSON.stringify(group.filter((a) => a.occurrenceId === occurrence.id).map((a) => a.text)) !==
          sequence
      )
        reject(
          'edit-conflict',
          'Every physical inclusion must permit the same complete ordered edit.',
          first.action.node.origins
        );
    if (first.action.action.kind === 'wrap-node') wrappers.push(...representative);
    else push(first.path, { start: first.start, end: first.end, text: first.text });
  }
  for (const close of [true, false])
    for (const a of [...wrappers].sort((a, b) =>
      close
        ? b.start - a.start || a.end - b.end || b.action.order - a.action.order
        : a.start - b.start || b.end - a.end || a.action.order - b.action.order
    )) {
      const at = close ? a.end : a.start;
      push(a.path, { start: at, end: at, text: `\\${close ? 'end' : 'begin'}{${a.text}}` });
    }
  return sourceChanges(view.snapshot, byPath);
}

export function environmentActions(view: ProjectView, names: readonly string[]): NodeEditAction[] {
  return [...nodeMap(view).values()]
    .filter((node) => node.kind === 'environment' && names.includes(node.name))
    .map((node) => ({
      kind: 'remove-node',
      selection: selectProjectNode(view, node.occurrenceKey),
    }));
}
