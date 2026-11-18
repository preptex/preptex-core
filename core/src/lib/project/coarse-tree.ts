import type {
  CoarseNode,
  CoarseTree,
  CoarseTreeOptions,
  ConfiguredNode,
  NormalizedCoarseTreeOptions,
  ProjectView,
  SourceOrigin,
} from '../../project-types.js';
import type { NodeLocation, VersionedSourceOrigin } from '../../node-types.js';
import { getCommandSignature } from './commands.js';
import { reject } from './fail.js';
import {
  array,
  bounded,
  fields,
  freeze,
  identity,
  invalid,
  record,
  string,
  testKind,
} from './shared.js';
import { validateView } from './view.js';

function normalizeCoarseOptions(options?: CoarseTreeOptions): NormalizedCoarseTreeOptions {
  const raw = options === undefined ? {} : record(options, 'coarseTreeOptions');
  fields(
    raw,
    [
      'includeSections',
      'includeEnvironments',
      'environmentFilter',
      'includeCustomAndUndefinedCommands',
      'includeInputs',
      'includeBuiltinCommands',
      'commandFilter',
      'includeArguments',
      'includeMath',
      'includeDisplayMath',
      'includeGroups',
      'includeTextBlocks',
      'maxPreviewLength',
    ],
    'coarseTreeOptions'
  );
  const bool = (key: string, fallback: boolean): boolean => {
    const val = raw[key];
    if (val === undefined) return fallback;
    if (typeof val !== 'boolean') invalid(`${key} must be a boolean.`);
    return val;
  };
  const filterList = (key: string): readonly string[] | null => {
    const val = raw[key];
    if (val === undefined) return null;
    return [
      ...new Set(array(val, key).map((v) => string(v, `${key} entry`).replace(/^\\+/, ''))),
    ].sort();
  };
  return {
    includeSections: bool('includeSections', true),
    includeEnvironments: bool('includeEnvironments', true),
    environmentFilter: filterList('environmentFilter'),
    includeCustomAndUndefinedCommands: bool('includeCustomAndUndefinedCommands', true),
    includeInputs: bool('includeInputs', true),
    includeBuiltinCommands: bool('includeBuiltinCommands', false),
    commandFilter: filterList('commandFilter'),
    includeArguments: bool('includeArguments', true),
    includeMath: bool('includeMath', false),
    includeDisplayMath: bool('includeDisplayMath', false),
    includeGroups: bool('includeGroups', false),
    includeTextBlocks: bool('includeTextBlocks', false),
    maxPreviewLength: bounded(raw['maxPreviewLength'], 80, 1000, 'maxPreviewLength'),
  };
}

function truncatePreview(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  if (maxLength <= 3) return collapsed.slice(0, maxLength);
  return `${collapsed.slice(0, maxLength - 3)}...`;
}

function collectRawText(nodes: readonly ConfiguredNode[]): string {
  const parts: string[] = [];
  const stack: ConfiguredNode[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i]!);
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.kind === 'token') {
      if (node.token.kind !== 'comment') parts.push(node.token.value);
    } else {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]!);
      }
    }
  }
  return parts.join('');
}

function mergeSpans(
  nodes: readonly ConfiguredNode[],
  versionByPath: ReadonlyMap<string, number>
): NodeLocation {
  const spans: VersionedSourceOrigin[] = [];
  for (const node of nodes) {
    for (const origin of node.origins) {
      const prev = spans[spans.length - 1];
      if (
        prev &&
        prev.path === origin.path &&
        prev.occurrenceId === origin.occurrenceId &&
        prev.range.end + 1 === origin.range.start
      ) {
        spans[spans.length - 1] = {
          ...prev,
          range: { ...prev.range, end: origin.range.end },
        };
      } else {
        spans.push({ ...origin, version: versionByPath.get(origin.path) ?? 1 });
      }
    }
  }
  if (spans.length === 0) return { kind: 'none', primary: null, spans: [] };
  if (spans.length === 1) return { kind: 'single', primary: spans[0]!, spans: [spans[0]!] };
  return { kind: 'multiple', primary: spans[0]!, spans };
}

/**
 * Derive a readable, structural {@link CoarseTree} projection from a ready {@link ProjectView}.
 *
 * Strips lexical token clutter by default while preserving `NodeSelection` and `NodeLocation`
 * provenance on every structural node so selections remain directly editable.
 *
 * @param view - A ready configured view.
 * @param options - Optional coarsening and visibility filters.
 * @returns Deeply frozen {@link CoarseTree}.
 * @throws {@link ProjectOperationError} when `view.status !== 'ready'`.
 * @throws {@link PrepTexError} with `InvalidArgument` for malformed views or options.
 */
export function buildCoarseViewTree(view: ProjectView, options?: CoarseTreeOptions): CoarseTree {
  const current = validateView(view);
  if (current.status !== 'ready') {
    reject('unavailable', 'A complete ready configured view is required to build a coarse tree.');
  }
  const normalized = normalizeCoarseOptions(options);
  const versionByPath = new Map(current.snapshot.files.map((f) => [f.path, f.version]));

  const introducedCommands = new Set<string>();
  const declaredSetters = new Set<string>();
  for (const file of current.snapshot.files) {
    for (const fact of file.facts) {
      if (fact.kind === 'definition' && fact.name) introducedCommands.add(fact.name);
      if (fact.kind === 'condition-declaration' && fact.name) {
        declaredSetters.add(`${fact.name}true`);
        declaredSetters.add(`${fact.name}false`);
      }
    }
  }
  const customCommands = new Set(current.configuration.customCommands.map((c) => c.name));
  const nonStructuralOffsets = new Set<number>();
  for (const sel of current.selectedTokens) {
    if (sel.interpretation === 'opaque' || sel.interpretation === 'verbatim') {
      nonStructuralOffsets.add(sel.projectedRange.start);
    }
  }

  let textBlockCounter = 0;

  const makeSelection = (occurrenceKey: string) => ({
    kind: 'node' as const,
    snapshotId: current.snapshotId,
    viewId: current.id,
    nodeKey: occurrenceKey,
  });

  const isConditionScaffolding = (name: string): boolean =>
    name === 'newif' ||
    name === 'else' ||
    name === 'fi' ||
    testKind(name) !== null ||
    declaredSetters.has(name);

  const shouldIncludeCommand = (name: string, isControlWord: boolean): boolean => {
    if (normalized.commandFilter && normalized.commandFilter.includes(name)) return true;
    if (!isControlWord && !normalized.includeBuiltinCommands) return false;
    if (name === 'input') return normalized.includeInputs;
    if (isConditionScaffolding(name)) {
      return normalized.includeBuiltinCommands;
    }
    if (introducedCommands.has(name) || customCommands.has(name)) {
      return normalized.includeCustomAndUndefinedCommands;
    }
    if (getCommandSignature(name) !== undefined) {
      return normalized.includeBuiltinCommands;
    }
    return normalized.includeCustomAndUndefinedCommands;
  };

  const occurrenceById = new Map(current.occurrences.map((occ) => [occ.id, occ]));
  const groupRecursiveInputs =
    current.configuration.inputs === 'recursive' && normalized.includeInputs;
  let recursiveInputCounter = 0;

  const directChildOccurrence = (occId: string | undefined, parentOccurrenceId: string | null) => {
    if (!occId || !parentOccurrenceId || occId === parentOccurrenceId) return null;
    let cursor = occurrenceById.get(occId);
    while (cursor && cursor.parentId !== null) {
      if (cursor.parentId === parentOccurrenceId) return cursor;
      cursor = occurrenceById.get(cursor.parentId);
    }
    return null;
  };

  const wrapOccurrenceRuns = (
    items: CoarseNode[],
    parentOccurrenceId: string | null
  ): CoarseNode[] => {
    if (!groupRecursiveInputs || !parentOccurrenceId || items.length === 0) return items;
    const grouped: CoarseNode[] = [];
    let activeChild: NonNullable<ReturnType<typeof directChildOccurrence>> | null = null;
    let activeNodes: CoarseNode[] = [];

    const flushChild = () => {
      if (!activeChild) return;
      const ref = activeChild.reference;
      const version = ref ? (versionByPath.get(ref.path) ?? 1) : 1;
      const location: NodeLocation = ref
        ? {
            kind: 'single',
            primary: { ...ref, version },
            spans: [{ ...ref, version }],
          }
        : { kind: 'none', primary: null, spans: [] };
      grouped.push({
        id: `in${recursiveInputCounter++}:${activeChild.id}`,
        occurrenceKey: null,
        selection: null,
        kind: 'command',
        name: 'input',
        previewText: activeChild.path,
        starred: false,
        editableName: false,
        location,
        projectedRange: {
          start: activeNodes[0]!.projectedRange.start,
          end: activeNodes[activeNodes.length - 1]!.projectedRange.end,
          line: activeNodes[0]!.projectedRange.line,
        },
        children: wrapOccurrenceRuns(activeNodes, activeChild.id),
      });
      activeChild = null;
      activeNodes = [];
    };

    for (const item of items) {
      const childOcc = directChildOccurrence(
        item.location.primary?.occurrenceId,
        parentOccurrenceId
      );
      if (childOcc) {
        if (activeChild && activeChild.id !== childOcc.id) {
          flushChild();
        }
        activeChild = childOcc;
        activeNodes.push(item);
      } else {
        flushChild();
        grouped.push(item);
      }
    }
    flushChild();
    return grouped;
  };

  const convertChildren = (
    nodes: readonly ConfiguredNode[],
    parentOccurrenceId: string | null
  ): CoarseNode[] => {
    const out: CoarseNode[] = [];
    let pendingTextNodes: ConfiguredNode[] = [];

    const flushTextBlock = () => {
      if (!normalized.includeTextBlocks || pendingTextNodes.length === 0) {
        pendingTextNodes = [];
        return;
      }
      const raw = collectRawText(pendingTextNodes);
      const preview = truncatePreview(raw, normalized.maxPreviewLength);
      if (preview.length > 0) {
        const first = pendingTextNodes[0]!;
        const last = pendingTextNodes[pendingTextNodes.length - 1]!;
        out.push({
          id: `tb${textBlockCounter++}`,
          occurrenceKey: null,
          selection: null,
          kind: 'text-block',
          name: 'text',
          previewText: preview,
          editableName: false,
          location: mergeSpans(pendingTextNodes, versionByPath),
          projectedRange: {
            start: first.projectedRange.start,
            end: last.projectedRange.end,
            line: first.projectedRange.line,
          },
          children: [],
        });
      }
      pendingTextNodes = [];
    };

    for (const child of nodes) {
      const converted = convertNode(child, parentOccurrenceId);
      if (converted.length === 0) {
        if (
          normalized.includeTextBlocks &&
          child.kind === 'token' &&
          child.token.kind !== 'comment'
        ) {
          pendingTextNodes.push(child);
        }
      } else {
        flushTextBlock();
        out.push(...converted);
      }
    }
    flushTextBlock();
    return wrapOccurrenceRuns(out, parentOccurrenceId);
  };

  const convertNode = (
    node: ConfiguredNode,
    parentOccurrenceId: string | null = current.occurrences[0]?.id ?? null
  ): CoarseNode[] => {
    const nodeOccId = node.location.primary?.occurrenceId ?? parentOccurrenceId;
    switch (node.kind) {
      case 'root':
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: null,
            kind: 'root',
            name: 'Document',
            previewText: '',
            editableName: false,
            location: node.location,
            projectedRange: node.projectedRange,
            children: convertChildren(node.children, current.occurrences[0]?.id ?? null),
          },
        ];

      case 'section': {
        if (!normalized.includeSections) return [];
        const firstArg = node.arguments[0];
        let shortTitle = '';
        if (firstArg?.kind === 'optional') {
          const argNode = node.children[firstArg.childStart];
          if (argNode?.kind === 'argument') {
            const inner =
              argNode.delimiter === 'bare' ? argNode.children : argNode.children.slice(1, -1);
            shortTitle = truncatePreview(collectRawText(inner), normalized.maxPreviewLength);
          }
        }
        const lastHeaderIdx =
          node.arguments.length > 0
            ? node.arguments[node.arguments.length - 1]!.childEnd
            : node.starred
              ? 1
              : 0;
        const bodyNodes = node.children.slice(lastHeaderIdx + 1);
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'section',
            name: node.name,
            previewText: shortTitle,
            sectionLevel: node.level,
            starred: node.starred,
            editableName: true,
            location: node.location,
            projectedRange: node.projectedRange,
            children: convertChildren(bodyNodes, nodeOccId),
          },
        ];
      }

      case 'environment': {
        if (!normalized.includeEnvironments) return [];
        if (normalized.environmentFilter && !normalized.environmentFilter.includes(node.name)) {
          return [];
        }
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'environment',
            name: node.name,
            previewText: '',
            editableName: Boolean(node.syntax.opening && node.syntax.closing),
            location: node.location,
            projectedRange: node.projectedRange,
            children: convertChildren(node.children, nodeOccId),
          },
        ];
      }

      case 'command': {
        const isControlWord = /^[A-Za-z@]+$/.test(node.name);
        if (!shouldIncludeCommand(node.name, isControlWord)) {
          return [];
        }
        const argNodes = normalized.includeArguments
          ? node.children.filter((c) => c.kind === 'argument')
          : [];
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'command',
            name: node.name,
            previewText: '',
            starred: node.starred,
            editableName: true,
            location: node.location,
            projectedRange: node.projectedRange,
            children: convertChildren(argNodes, nodeOccId),
          },
        ];
      }

      case 'argument': {
        if (!normalized.includeArguments) return [];
        const innerNodes = node.delimiter === 'bare' ? node.children : node.children.slice(1, -1);
        const preview = truncatePreview(collectRawText(innerNodes), normalized.maxPreviewLength);
        const label = node.argKind === 'optional' ? `[#${node.slot + 1}]` : `{#${node.slot + 1}}`;
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'argument',
            name: label,
            previewText: preview,
            argumentInfo: {
              argKind: node.argKind,
              slot: node.slot,
              delimiter: node.delimiter,
              opaque: node.opaque,
            },
            editableName: false,
            location: node.location,
            projectedRange: node.projectedRange,
            children: convertChildren(innerNodes, nodeOccId),
          },
        ];
      }

      case 'math': {
        const isDisplay = node.delimiter === '$$' || node.delimiter === '\\[';
        if (!normalized.includeMath && !(normalized.includeDisplayMath && isDisplay)) {
          return [];
        }
        const preview = truncatePreview(collectRawText(node.children), normalized.maxPreviewLength);
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'math',
            name: node.delimiter,
            previewText: preview,
            editableName: false,
            location: node.location,
            projectedRange: node.projectedRange,
            children: [],
          },
        ];
      }

      case 'group': {
        const children = convertChildren(node.children, nodeOccId);
        if (!normalized.includeGroups) return children;
        return [
          {
            id: node.occurrenceKey,
            occurrenceKey: node.occurrenceKey,
            selection: makeSelection(node.occurrenceKey),
            kind: 'group',
            name: '{...}',
            previewText: truncatePreview(
              collectRawText(node.children),
              normalized.maxPreviewLength
            ),
            editableName: false,
            location: node.location,
            projectedRange: node.projectedRange,
            children,
          },
        ];
      }

      case 'token': {
        if (node.token.kind === 'command' && !nonStructuralOffsets.has(node.projectedRange.start)) {
          const cmdName = node.token.name || node.token.value.slice(1);
          const isControlWord = /^[A-Za-z@]+$/.test(cmdName);
          if (shouldIncludeCommand(cmdName, isControlWord)) {
            return [
              {
                id: node.occurrenceKey,
                occurrenceKey: node.occurrenceKey,
                selection: makeSelection(node.occurrenceKey),
                kind: 'command',
                name: cmdName,
                previewText: '',
                starred: false,
                editableName: true,
                location: node.location,
                projectedRange: node.projectedRange,
                children: [],
              },
            ];
          }
        }
        return [];
      }
    }
  };

  const root = convertNode(current.root)[0]!;
  let nodeCount = 0;
  const countStack: CoarseNode[] = [root];
  while (countStack.length > 0) {
    const n = countStack.pop()!;
    nodeCount++;
    for (const child of n.children) countStack.push(child);
  }

  return freeze({
    kind: 'coarse-tree',
    snapshotId: current.snapshotId,
    viewId: current.id,
    resultId: identity('coarse-tree', [current.id, normalized, 1]),
    options: normalized,
    root,
    nodeCount,
  });
}
