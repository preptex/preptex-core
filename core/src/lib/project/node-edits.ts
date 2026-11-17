import type {
  ConfiguredNode,
  ProjectEdit,
  ProjectSnapshot,
  ProjectView,
  SourceScope,
} from '../../project-types.js';
import type { NodeEditAction } from '../../node-types.js';
import { getSelectedNode, nodeMap, selectProjectNode } from './selection.js';
import { sectionLevel } from './commands.js';
import { inspectProjectEnvironments } from './environments.js';
import { reject } from './fail.js';
import { testKind } from './shared.js';
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
    if (node.kind === 'command' || node.kind === 'section' || node.kind === 'environment') {
      const firstArgStart = node.arguments[0]?.childStart ?? node.children.length;
      if (node.kind !== 'environment' && node.children[0]) {
        keys.add(node.children[0].occurrenceKey);
      }
      if (node.kind !== 'environment' && node.starred) {
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
        const argNode = node.children[arg.childStart];
        if (argNode?.kind === 'argument') {
          keys.add(argNode.occurrenceKey);
          if (argNode.delimiter === 'bare') {
            const direct = argNode.children[0];
            if (direct?.kind === 'token') keys.add(direct.occurrenceKey);
          } else {
            const open = argNode.children[0];
            const close = argNode.children[argNode.children.length - 1];
            if (open) keys.add(open.occurrenceKey);
            if (close) keys.add(close.occurrenceKey);
          }
        } else if (arg.childStart === arg.childEnd) {
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
    if (node.kind === 'root' || node.kind === 'argument') {
      if (node.kind === 'root') reject('unavailable', 'The synthetic root cannot be edited.');
      reject(
        'unavailable',
        'Select a complete construct, not a protected argument or structural delimiter token.',
        node.origins
      );
    }
    if (action.kind !== 'rename-command' && protectedTokens.has(node.occurrenceKey)) {
      reject(
        'unavailable',
        'Select a complete construct, not a protected argument or structural delimiter token.',
        node.origins
      );
    }
    if (node.kind === 'token') {
      const token = view.selectedTokens.find(
        (t) =>
          t.projectedRange.start <= node.projectedRange.start &&
          t.projectedRange.end >= node.projectedRange.end
      );
      const isRenameableCommandToken =
        action.kind === 'rename-command' &&
        token &&
        token.interpretation === 'structure' &&
        node.token.kind === 'command' &&
        !protectedTokens.has(node.occurrenceKey) &&
        !['begin', 'end', 'input', 'newif', 'else', 'fi', 'verb', 'global'].includes(
          node.token.name
        ) &&
        sectionLevel(node.token.name) === undefined &&
        testKind(node.token.name) === null;
      if (
        !isRenameableCommandToken &&
        (!token ||
          token.interpretation === 'opaque' ||
          protectedTokens.has(node.occurrenceKey) ||
          ['command', 'open', 'close', 'math'].includes(node.token.kind))
      )
        reject(
          'unavailable',
          'Select a complete construct, not a protected argument or structural delimiter token.',
          node.origins
        );
    }
    if (
      action.kind === 'rename-environment' &&
      (node.kind !== 'environment' || !node.syntax.opening || !node.syntax.closing)
    )
      reject('unavailable', 'Renaming requires two literal environment delimiters.', node.origins);
    if (
      action.kind === 'rename-command' &&
      !(node.kind === 'command' || (node.kind === 'token' && node.token.kind === 'command'))
    ) {
      reject(
        'unavailable',
        'Command renaming requires selecting a command node or command token.',
        node.origins
      );
    }
    if (action.kind === 'rename-section' && node.kind !== 'section') {
      reject('unavailable', 'Section renaming requires selecting a section node.', node.origins);
    }
    if (action.kind === 'unwrap-node') {
      if (node.kind === 'environment') {
        if (!node.syntax.opening || !node.syntax.closing) {
          reject(
            'unavailable',
            'Unwrapping an environment requires two literal delimiters.',
            node.origins
          );
        }
      } else if (node.kind === 'command') {
        const argNode =
          node.arguments.length === 1 ? node.children[node.arguments[0]!.childStart] : undefined;
        if (
          node.starred ||
          node.arguments.length !== 1 ||
          node.arguments[0]!.kind !== 'mandatory' ||
          node.arguments[0]!.opaque ||
          argNode?.kind !== 'argument'
        ) {
          reject(
            'unavailable',
            'Only single mandatory non-opaque argument commands can be unwrapped.',
            node.origins
          );
        }
      } else if (node.kind !== 'group') {
        reject(
          'unavailable',
          'Only environments, brace groups, or single-argument commands can be unwrapped.',
          node.origins
        );
      }
    }
    const key = `${action.kind}:${node.occurrenceKey}`;
    const old = unique.get(key);
    if (old && action.kind !== 'wrap-node') {
      if (
        (old.action.kind === 'rename-environment' &&
          action.kind === 'rename-environment' &&
          old.action.name !== action.name) ||
        (old.action.kind === 'rename-command' &&
          action.kind === 'rename-command' &&
          old.action.name !== action.name) ||
        (old.action.kind === 'rename-section' &&
          action.kind === 'rename-section' &&
          (old.action.sectionCommand !== action.sectionCommand ||
            old.action.starred !== action.starred))
      )
        reject('edit-conflict', 'One node has incompatible renames.', node.origins);
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
    if (action.kind === 'rename-command') {
      const cmdTok = node.kind === 'token' ? node : node.children[0]!;
      result.push({
        start: cmdTok.projectedRange.start,
        end: cmdTok.projectedRange.end + 1,
        text: `\\${action.name}`,
      });
    }
    if (action.kind === 'rename-section' && node.kind === 'section') {
      const cmdTok = node.children[0]!;
      const starTok = node.starred
        ? node.children.find((c) => c.kind === 'token' && c.token.value === '*')
        : undefined;
      const targetStar = action.starred ?? node.starred;
      if (node.starred && !targetStar && starTok) {
        result.push({
          start: cmdTok.projectedRange.start,
          end: starTok.projectedRange.end + 1,
          text: `\\${action.sectionCommand}`,
        });
      } else {
        result.push({
          start: cmdTok.projectedRange.start,
          end: cmdTok.projectedRange.end + 1,
          text: `\\${action.sectionCommand}${targetStar && !node.starred ? '*' : ''}`,
        });
      }
    }
    if (action.kind === 'unwrap-node') {
      if (node.kind === 'group') {
        result.push({
          start: node.projectedRange.start,
          end: node.projectedRange.start + 1,
          text: '',
        });
        result.push({
          start: node.projectedRange.end,
          end: node.projectedRange.end + 1,
          text: '',
        });
      } else if (node.kind === 'environment') {
        const op = node.syntax.opening!;
        const cl = node.syntax.closing!;
        const lastArg = node.arguments[node.arguments.length - 1];
        const openStart = boundary(op.origin.occurrenceId, op.range.start);
        const openEnd = lastArg
          ? lastArg.projectedRange.end + 1
          : boundary(op.origin.occurrenceId, op.range.end) + 1;
        result.push({ start: openStart, end: openEnd, text: '' });
        result.push({
          start: boundary(cl.origin.occurrenceId, cl.range.start),
          end: boundary(cl.origin.occurrenceId, cl.range.end) + 1,
          text: '',
        });
      } else if (node.kind === 'command') {
        const argNode = node.children[node.arguments[0]!.childStart]!;
        if (argNode.kind === 'argument') {
          if (argNode.delimiter === 'braced') {
            const openBrace = argNode.children[0]!;
            const closeBrace = argNode.children[argNode.children.length - 1]!;
            result.push({
              start: node.projectedRange.start,
              end: openBrace.projectedRange.end + 1,
              text: '',
            });
            result.push({
              start: closeBrace.projectedRange.start,
              end: closeBrace.projectedRange.end + 1,
              text: '',
            });
          } else {
            result.push({
              start: node.projectedRange.start,
              end: argNode.projectedRange.start,
              text: '',
            });
          }
        }
      }
    }
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
    if (
      a.action.kind !== 'rename-environment' &&
      a.action.kind !== 'rename-command' &&
      a.action.kind !== 'rename-section' &&
      a.action.kind !== 'unwrap-node' &&
      a.node.location.kind !== 'single'
    )
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
    else if (a.action.kind === 'rename-command') {
      const cmdTok = a.node.kind === 'token' ? a.node : a.node.children[0]!;
      if (cmdTok.location.kind !== 'single') {
        reject(
          'edit-conflict',
          'Command token must have a single original extent.',
          cmdTok.origins
        );
      }
      const o = cmdTok.location.primary!;
      add({
        action: a,
        path: o.path,
        start: o.range.start,
        end: o.range.end + 1,
        occurrenceId: o.occurrenceId,
        text: `\\${a.action.name}`,
      });
    } else if (a.action.kind === 'rename-section' && a.node.kind === 'section') {
      const cmdTok = a.node.children[0]!;
      const starTok = a.node.starred
        ? a.node.children.find((c) => c.kind === 'token' && c.token.value === '*')
        : undefined;
      const targetStar = a.action.starred ?? a.node.starred;
      if (cmdTok.location.kind !== 'single') {
        reject(
          'edit-conflict',
          'Section command must have a single original extent.',
          cmdTok.origins
        );
      }
      const cmdO = cmdTok.location.primary!;
      if (a.node.starred && !targetStar && starTok) {
        if (starTok.location.kind !== 'single' || starTok.location.primary!.path !== cmdO.path) {
          reject(
            'edit-conflict',
            'Section star must share the same file as the section command.',
            starTok.origins
          );
        }
        add({
          action: a,
          path: cmdO.path,
          start: cmdO.range.start,
          end: starTok.location.primary!.range.end + 1,
          occurrenceId: cmdO.occurrenceId,
          text: `\\${a.action.sectionCommand}`,
        });
      } else {
        add({
          action: a,
          path: cmdO.path,
          start: cmdO.range.start,
          end: cmdO.range.end + 1,
          occurrenceId: cmdO.occurrenceId,
          text: `\\${a.action.sectionCommand}${targetStar && !a.node.starred ? '*' : ''}`,
        });
      }
    } else if (a.action.kind === 'unwrap-node') {
      if (a.node.kind === 'group') {
        if (a.node.location.kind !== 'single') {
          reject(
            'edit-conflict',
            'Source unwrapping of a brace group requires one contiguous original extent.',
            a.node.origins
          );
        }
        const o = a.node.location.primary!;
        add({
          action: a,
          path: o.path,
          start: o.range.start,
          end: o.range.start + 1,
          occurrenceId: o.occurrenceId,
          text: '',
        });
        add({
          action: a,
          path: o.path,
          start: o.range.end,
          end: o.range.end + 1,
          occurrenceId: o.occurrenceId,
          text: '',
        });
      } else if (a.node.kind === 'environment') {
        const op = a.node.syntax.opening!;
        const cl = a.node.syntax.closing!;
        const lastArg = a.node.arguments[a.node.arguments.length - 1];
        const openEnd = lastArg
          ? lastArg.location.kind === 'single' && lastArg.location.primary!.path === op.path
            ? lastArg.location.primary!.range.end + 1
            : reject(
                'edit-conflict',
                'Environment arguments must share the opener file for source unwrapping.',
                lastArg.location.spans
              )
          : op.range.end + 1;
        add({
          action: a,
          path: op.path,
          start: op.range.start,
          end: openEnd,
          occurrenceId: op.origin.occurrenceId,
          text: '',
        });
        add({
          action: a,
          path: cl.path,
          start: cl.range.start,
          end: cl.range.end + 1,
          occurrenceId: cl.origin.occurrenceId,
          text: '',
        });
      } else if (a.node.kind === 'command') {
        const argNode = a.node.children[a.node.arguments[0]!.childStart]!;
        const cmdTok = a.node.children[0]!;
        if (cmdTok.location.kind !== 'single' || argNode.kind !== 'argument') {
          reject(
            'edit-conflict',
            'Unwrapping command requires contiguous delimiters.',
            a.node.origins
          );
        }
        const cmdO = cmdTok.location.primary!;
        if (argNode.delimiter === 'braced') {
          const openBrace = argNode.children[0]!;
          const closeBrace = argNode.children[argNode.children.length - 1]!;
          if (
            openBrace.location.kind !== 'single' ||
            closeBrace.location.kind !== 'single' ||
            openBrace.location.primary!.path !== cmdO.path
          ) {
            reject(
              'edit-conflict',
              'Command and opening brace must share the same file.',
              a.node.origins
            );
          }
          add({
            action: a,
            path: cmdO.path,
            start: cmdO.range.start,
            end: openBrace.location.primary!.range.end + 1,
            occurrenceId: cmdO.occurrenceId,
            text: '',
          });
          add({
            action: a,
            path: closeBrace.location.primary!.path,
            start: closeBrace.location.primary!.range.start,
            end: closeBrace.location.primary!.range.end + 1,
            occurrenceId: closeBrace.location.primary!.occurrenceId,
            text: '',
          });
        } else {
          if (argNode.location.kind !== 'single' || argNode.location.primary!.path !== cmdO.path) {
            reject(
              'edit-conflict',
              'Bare command argument must share the command file.',
              a.node.origins
            );
          }
          add({
            action: a,
            path: cmdO.path,
            start: cmdO.range.start,
            end: argNode.location.primary!.range.start,
            occurrenceId: cmdO.occurrenceId,
            text: '',
          });
        }
      }
    } else {
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

export function snapshotEnvironmentRemovalEdits(
  snapshot: ProjectSnapshot,
  names: readonly string[],
  scope: SourceScope = { kind: 'all-files' }
): ProjectEdit[] {
  const inventory = inspectProjectEnvironments(snapshot, scope);
  const matches = inventory.environments.filter(
    (env) =>
      env.name !== null &&
      names.includes(env.name) &&
      env.context.definitionBodies.length === 0 &&
      env.context.opaqueArguments.length === 0
  );
  for (const env of matches) {
    if (env.status !== 'matched' || (env.protected && env.name !== 'comment')) {
      reject(
        'unavailable',
        `Environment ${env.name ?? ''} is unmatched or inside a protected region.`,
        [{ snapshotId: snapshot.id, occurrenceId: null, path: env.path, range: env.range }]
      );
    }
  }
  const byPath = new Map<string, TextChange[]>();
  const sorted = [...matches].sort(
    (a, b) => a.range.start - b.range.start || b.range.end - a.range.end
  );
  for (const env of sorted) {
    const bucket = byPath.get(env.path) ?? [];
    const start = env.range.start;
    const end = env.range.end + 1;
    if (bucket.some((existing) => existing.start <= start && existing.end >= end)) {
      continue;
    }
    bucket.push({ start, end, text: '' });
    byPath.set(env.path, bucket);
  }
  return sourceChanges(snapshot, byPath);
}
