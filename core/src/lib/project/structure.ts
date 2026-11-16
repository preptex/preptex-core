import type { MathDelimiter, SourceRange } from '../../api-types.js';
import type {
  ConfiguredCommandArgument,
  ConfiguredContainerNode,
  ConfiguredNode,
  ProjectIssue,
  ProjectIssueCode,
  ProjectSnapshot,
  SelectedToken,
  SourceOrigin,
  ViewId,
} from '../../project-types.js';
import type { ConfiguredEnvironmentDelimiter, NodeLocation } from '../../node-types.js';
import {
  firstCodePointLength,
  getCommandSignature,
  sectionLevel,
  type CommandSignature,
} from './commands.js';
import {
  environmentName,
  fileLines,
  hasEnvironmentArguments,
  readDelimiter,
} from './environments.js';
import { DEFINITIONS } from './scan.js';
import { issue, rangeAt, testKind } from './shared.js';
import { readDefinitionTokens } from './tokenize.js';

interface ContainerFrame {
  kind: 'root' | 'environment' | 'group' | 'math';
  key: string;
  start: number;
  children: ConfiguredNode[];
  name: string;
  delimiter: MathDelimiter;
  openingEnd: number;
  closingStart: number;
}

interface SectionFrame {
  kind: 'section';
  key: string;
  start: number;
  children: ConfiguredNode[];
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  starred: boolean;
  arguments: ConfiguredCommandArgument[];
  signature: CommandSignature;
  nextSlot: number;
  starChecked: boolean;
  phase: 'header' | 'body';
}

interface CommandFrame {
  kind: 'command';
  key: string;
  start: number;
  children: ConfiguredNode[];
  name: string;
  starred: boolean;
  arguments: ConfiguredCommandArgument[];
  signature: CommandSignature;
  nextSlot: number;
  starChecked: boolean;
}

interface CommandArgFrame {
  kind: 'command-arg';
  delimiter: '{' | '[';
  slot: number;
  opaque: boolean;
  braceDepth: number;
  openTokenIndex: number;
  openLeaf: ConfiguredNode & { kind: 'token' };
  children: ConfiguredNode[];
  parent: CommandFrame | SectionFrame;
}

type StackFrame = ContainerFrame | SectionFrame | CommandFrame | CommandArgFrame;

export function parseConfiguredStructure(
  tokens: readonly SelectedToken[],
  viewId: ViewId,
  maxNesting: number,
  snapshot: ProjectSnapshot
):
  | { kind: 'success'; root: ConfiguredContainerNode & { kind: 'root' } }
  | { kind: 'error'; issue: ProjectIssue } {
  let nextKey = 0;
  function container(kind: ContainerFrame['kind'], start: number): ContainerFrame {
    return {
      kind,
      key: `n${nextKey++}`,
      start,
      children: [],
      name: '',
      delimiter: '$',
      openingEnd: -1,
      closingStart: -1,
    };
  }

  const root = container('root', 0);
  const stack: StackFrame[] = [root];
  let astDepth = 0;
  let error: ProjectIssue | undefined;
  const files = new Map(snapshot.files.map((f) => [f.path, f]));
  const declaredSetters = new Set<string>();
  for (const file of snapshot.files) {
    for (const fact of file.facts) {
      if (fact.kind === 'condition-declaration' && fact.name) {
        declaredSetters.add(`${fact.name}true`);
        declaredSetters.add(`${fact.name}false`);
      }
    }
  }

  function fail(message: string, index: number, code: ProjectIssueCode = 'structural-error'): void {
    const at = tokens[index]?.origin ?? tokens[tokens.length - 1]?.origin;
    error = {
      ...issue(code, message, at ? { path: at.path, range: at.range } : null, 'error'),
      inputChain: at ? [at.occurrenceId] : [],
    };
  }

  function mergeOrigins(nodes: readonly ConfiguredNode[]): SourceOrigin[] {
    const origins: SourceOrigin[] = [];
    for (const node of nodes) {
      for (const origin of node.origins) {
        const previous = origins[origins.length - 1];
        if (
          previous &&
          previous.path === origin.path &&
          previous.occurrenceId === origin.occurrenceId &&
          previous.range.end + 1 === origin.range.start
        ) {
          origins[origins.length - 1] = {
            ...previous,
            range: { ...previous.range, end: origin.range.end },
          };
        } else {
          origins.push(origin);
        }
      }
    }
    return origins;
  }

  function locationFromOrigins(origins: readonly SourceOrigin[]): NodeLocation {
    const spans = origins.map((origin) => ({
      ...origin,
      version: files.get(origin.path)!.version,
    }));
    return spans.length === 0
      ? { kind: 'none', primary: null, spans: [] }
      : spans.length === 1
        ? { kind: 'single', primary: spans[0]!, spans: [spans[0]!] }
        : { kind: 'multiple', primary: spans[0]!, spans };
  }

  function projectedRangeFromNodes(nodes: readonly ConfiguredNode[]): SourceRange {
    if (nodes.length === 0) return { start: 0, end: -1, line: 1 };
    const first = nodes[0]!.projectedRange;
    const last = nodes[nodes.length - 1]!.projectedRange;
    return { start: first.start, end: last.end, line: first.line };
  }

  function baseFromRange(start: number, end: number, key: string) {
    const origins: SourceOrigin[] = [];
    for (let idx = start; idx <= end; idx++) {
      const origin = tokens[idx]!.origin;
      const previous = origins[origins.length - 1];
      if (
        previous &&
        previous.path === origin.path &&
        previous.occurrenceId === origin.occurrenceId &&
        previous.range.end + 1 === origin.range.start
      ) {
        origins[origins.length - 1] = {
          ...previous,
          range: { ...previous.range, end: origin.range.end },
        };
      } else {
        origins.push(origin);
      }
    }
    const first = tokens[start]?.projectedRange;
    const last = tokens[end]?.projectedRange;
    const projectedRange: SourceRange = {
      start: first?.start ?? 0,
      end: last?.end ?? -1,
      line: first?.line ?? 1,
    };
    const location = locationFromOrigins(origins);
    return { viewId, occurrenceKey: key, origins, projectedRange, location };
  }

  function baseFromNodes(nodes: readonly ConfiguredNode[], key: string) {
    const origins = mergeOrigins(nodes);
    const projectedRange = projectedRangeFromNodes(nodes);
    const location = locationFromOrigins(origins);
    return { viewId, occurrenceKey: key, origins, projectedRange, location };
  }

  function makeLeaf(
    index: number,
    charStart = 0,
    charEndExcl = tokens[index]!.token.value.length
  ): ConfiguredNode & { kind: 'token' } {
    const sel = tokens[index]!;
    const key = `n${nextKey++}`;
    if (charStart === 0 && charEndExcl === sel.token.value.length) {
      const origin = sel.origin;
      const span = { ...origin, version: files.get(origin.path)!.version };
      return {
        viewId,
        occurrenceKey: key,
        origins: [origin],
        projectedRange: sel.projectedRange,
        location: { kind: 'single', primary: span, spans: [span] },
        kind: 'token',
        token: sel.token,
      };
    }
    const value = sel.token.value.slice(charStart, charEndExcl);
    const range: SourceRange = {
      start: sel.token.range.start + charStart,
      end: sel.token.range.start + charEndExcl - 1,
      line: sel.token.range.line,
    };
    const originRange: SourceRange = {
      start: sel.origin.range.start + charStart,
      end: sel.origin.range.start + charEndExcl - 1,
      line: sel.origin.range.line,
    };
    const projectedRange: SourceRange = {
      start: sel.projectedRange.start + charStart,
      end: sel.projectedRange.start + charEndExcl - 1,
      line: sel.projectedRange.line,
    };
    const origin: SourceOrigin = { ...sel.origin, range: originRange };
    const span = { ...origin, version: files.get(origin.path)!.version };
    return {
      viewId,
      occurrenceKey: key,
      origins: [origin],
      projectedRange,
      location: { kind: 'single', primary: span, spans: [span] },
      kind: 'token',
      token: {
        index: sel.token.index,
        kind: sel.token.kind,
        value,
        name: sel.token.name,
        range,
      },
    };
  }

  function leaf(index: number, charStart = 0, charEndExcl?: number): void {
    const node = makeLeaf(index, charStart, charEndExcl);
    stack[stack.length - 1]!.children.push(node);
  }

  function delimiter(start: number, end: number): ConfiguredEnvironmentDelimiter | null {
    const first = tokens[start]?.origin,
      last = tokens[end]?.origin;
    if (!first || !last || first.path !== last.path || first.occurrenceId !== last.occurrenceId)
      return null;
    const file = files.get(first.path)!;
    const value =
      readDelimiter(file, first.range.start, snapshot) ??
      readDelimiter(
        file,
        first.range.start,
        snapshot,
        tokens.slice(start, end + 1).map((s) => s.token)
      );
    if (!value || value.range.end !== last.range.end) return null;
    let expected = first.range.start;
    for (let i = start; i <= end; i++) {
      const at = tokens[i]!.origin;
      if (
        at.path !== first.path ||
        at.occurrenceId !== first.occurrenceId ||
        at.range.start !== expected
      )
        return null;
      expected = at.range.end + 1;
    }
    return { ...value, origin: { ...first, range: value.range, version: file.version } };
  }

  function parseEnvironmentDelimiter(
    index: number,
    allowVerbatim = false
  ): { name: string; end: number } | null {
    let pos = index + 1;
    while (
      pos < tokens.length &&
      (tokens[pos]!.token.kind === 'space' || tokens[pos]!.token.kind === 'comment')
    ) {
      if (!allowVerbatim && tokens[pos]!.interpretation === 'verbatim') break;
      pos++;
    }
    if (pos >= tokens.length || tokens[pos]!.token.kind !== 'open') return null;
    if (!allowVerbatim && tokens[pos]!.interpretation === 'verbatim') return null;
    let name = '';
    let depth = 1;
    for (pos++; pos < tokens.length; pos++) {
      const sel = tokens[pos]!;
      if (!allowVerbatim && sel.interpretation === 'verbatim') return null;
      if (sel.token.kind === 'open') depth++;
      else if (sel.token.kind === 'close') {
        depth--;
        if (depth === 0) {
          try {
            environmentName(name);
          } catch {
            return null;
          }
          return { name, end: pos };
        }
      }
      name += sel.token.value;
    }
    return null;
  }

  function build(
    frame: ContainerFrame | SectionFrame | CommandFrame,
    end = -1
  ): ConfiguredContainerNode {
    if (frame.kind === 'section' || frame.kind === 'command') {
      const shared = { ...baseFromNodes(frame.children, frame.key), children: frame.children };
      if (frame.kind === 'section') {
        return {
          ...shared,
          kind: 'section',
          name: frame.name,
          level: frame.level,
          starred: frame.starred,
          arguments: frame.arguments,
        };
      }
      return {
        ...shared,
        kind: 'command',
        name: frame.name,
        starred: frame.starred,
        arguments: frame.arguments,
      };
    }
    const shared = { ...baseFromRange(frame.start, end, frame.key), children: frame.children };
    switch (frame.kind) {
      case 'root':
        return { ...shared, kind: 'root' };
      case 'group':
        return { ...shared, kind: 'group' };
      case 'environment': {
        const opening = delimiter(frame.start, frame.openingEnd);
        const closing = delimiter(frame.closingStart, end);
        const body =
          shared.location.kind === 'single' && opening && closing
            ? {
                ...opening.origin,
                range: rangeAt(
                  fileLines(files.get(opening.path)!),
                  opening.range.end + 1,
                  closing.range.start - 1
                ),
              }
            : null;
        return {
          ...shared,
          kind: 'environment',
          name: frame.name,
          syntax: {
            opening,
            closing,
            body,
            hasArguments: opening
              ? hasEnvironmentArguments(files.get(opening.path)!, opening, snapshot)
              : true,
          },
        };
      }
      case 'math':
        return { ...shared, kind: 'math', delimiter: frame.delimiter };
    }
  }

  function close(end = -1): void {
    const frame = stack.pop()!;
    if (frame.kind === 'command-arg') {
      throw new Error('Internal parser error: unexpected command-arg close.');
    }
    if (frame.kind !== 'root') astDepth--;
    const node = build(frame, end);
    stack[stack.length - 1]!.children.push(node);
  }

  function pushContainerFrame(frame: ContainerFrame | SectionFrame | CommandFrame): boolean {
    stack.push(frame);
    astDepth++;
    if (astDepth > maxNesting) {
      fail('Configured structural nesting limit reached.', frame.start);
      return false;
    }
    return true;
  }

  function skipSelectedTrivia(fromIndex: number): number {
    let p = fromIndex;
    while (
      p < tokens.length &&
      tokens[p]!.interpretation !== 'verbatim' &&
      (tokens[p]!.token.kind === 'space' || tokens[p]!.token.kind === 'comment')
    ) {
      p++;
    }
    return p;
  }

  function recordSingleNodeArgument(
    frame: CommandFrame | SectionFrame,
    slot: number,
    kind: 'optional' | 'mandatory',
    opaque: boolean,
    node: ConfiguredNode & { kind: 'token' }
  ): void {
    const childIndex = frame.children.length;
    frame.children.push(node);
    frame.arguments.push({
      kind,
      slot,
      opaque,
      location: node.location,
      innerLocation: node.location,
      projectedRange: node.projectedRange,
      innerProjectedRange: node.projectedRange,
      childStart: childIndex,
      childEnd: childIndex,
    });
    if (frame.kind === 'section' && kind === 'mandatory') {
      frame.name = node.token.value;
    }
  }

  function finalizeDelimitedArgument(
    argFrame: CommandArgFrame,
    closeLeaf: ConfiguredNode & { kind: 'token' },
    closeTokenIndex: number
  ): void {
    const parent = argFrame.parent;
    const childStart = parent.children.length;
    parent.children.push(argFrame.openLeaf, ...argFrame.children, closeLeaf);
    const childEnd = parent.children.length - 1;
    const allNodes = parent.children.slice(childStart, childEnd + 1);
    const outerOrigins = mergeOrigins(allNodes);
    const outerLocation = locationFromOrigins(outerOrigins);
    const outerProjected = projectedRangeFromNodes(allNodes);
    const innerOrigins = mergeOrigins(argFrame.children);
    const innerLocation = locationFromOrigins(innerOrigins);
    const innerProjected: SourceRange =
      argFrame.children.length > 0
        ? projectedRangeFromNodes(argFrame.children)
        : {
            start: argFrame.openLeaf.projectedRange.end + 1,
            end: argFrame.openLeaf.projectedRange.end,
            line: argFrame.openLeaf.projectedRange.line,
          };
    const kind = argFrame.delimiter === '[' ? 'optional' : 'mandatory';
    parent.arguments.push({
      kind,
      slot: argFrame.slot,
      opaque: argFrame.opaque,
      location: outerLocation,
      innerLocation,
      projectedRange: outerProjected,
      innerProjectedRange: innerProjected,
      childStart,
      childEnd,
    });
    if (parent.kind === 'section' && kind === 'mandatory') {
      const rawParts: string[] = [];
      for (let k = argFrame.openTokenIndex + 1; k < closeTokenIndex; k++) {
        rawParts.push(tokens[k]!.token.value);
      }
      parent.name = rawParts.join('');
    }
    parent.nextSlot++;
  }

  function headerErrorMessage(frame: CommandFrame | SectionFrame): string {
    return frame.kind === 'section'
      ? 'Malformed selected section heading.'
      : 'Malformed selected command arguments.';
  }

  function advanceCommandArgs(
    frame: CommandFrame | SectionFrame,
    startIndex: number,
    startCharOffset: number
  ): { nextIndex: number; nextCharOffset: number } {
    let cursor = startIndex;
    let charOffset = startCharOffset;
    const sig = frame.signature;

    if (!frame.starChecked) {
      frame.starChecked = true;
      if (sig.allowStar && charOffset === 0) {
        const starIdx = skipSelectedTrivia(cursor);
        if (
          starIdx < tokens.length &&
          tokens[starIdx]!.interpretation !== 'verbatim' &&
          tokens[starIdx]!.token.kind === 'text' &&
          tokens[starIdx]!.token.value.startsWith('*')
        ) {
          for (let k = cursor; k < starIdx; k++) frame.children.push(makeLeaf(k));
          frame.starred = true;
          frame.children.push(makeLeaf(starIdx, 0, 1));
          if (tokens[starIdx]!.token.value.length > 1) {
            cursor = starIdx;
            charOffset = 1;
          } else {
            cursor = starIdx + 1;
            charOffset = 0;
          }
        }
      }
    }

    while (frame.nextSlot < sig.params.length) {
      const spec = sig.params[frame.nextSlot]!;
      if (spec.kind === 'optional') {
        const p = charOffset === 0 ? skipSelectedTrivia(cursor) : cursor;
        const tok = p < tokens.length ? tokens[p]! : undefined;
        if (
          !tok ||
          tok.interpretation === 'verbatim' ||
          tok.token.kind !== 'text' ||
          tok.token.value[charOffset] !== '['
        ) {
          frame.nextSlot++;
          continue;
        }
        if (charOffset === 0) {
          for (let k = cursor; k < p; k++) frame.children.push(makeLeaf(k));
        }
        const openLeaf = makeLeaf(p, charOffset, charOffset + 1);
        stack.push({
          kind: 'command-arg',
          delimiter: '[',
          slot: frame.nextSlot,
          opaque: spec.opaque,
          braceDepth: 0,
          openTokenIndex: p,
          openLeaf,
          children: [],
          parent: frame,
        });
        if (charOffset + 1 < tok.token.value.length) {
          return { nextIndex: p, nextCharOffset: charOffset + 1 };
        }
        return { nextIndex: p + 1, nextCharOffset: 0 };
      }

      // Mandatory argument
      if (charOffset > 0) {
        const sel = tokens[cursor]!;
        if (spec.form === 'braced') {
          fail(headerErrorMessage(frame), frame.start);
          return { nextIndex: tokens.length, nextCharOffset: 0 };
        }
        const len = firstCodePointLength(sel.token.value, charOffset);
        recordSingleNodeArgument(
          frame,
          frame.nextSlot,
          'mandatory',
          spec.opaque,
          makeLeaf(cursor, charOffset, charOffset + len)
        );
        frame.nextSlot++;
        if (charOffset + len < sel.token.value.length) {
          charOffset += len;
        } else {
          cursor++;
          charOffset = 0;
        }
        continue;
      }

      const p = skipSelectedTrivia(cursor);
      if (p >= tokens.length) {
        fail(headerErrorMessage(frame), frame.start);
        return { nextIndex: tokens.length, nextCharOffset: 0 };
      }
      const sel = tokens[p]!;
      if (sel.interpretation === 'verbatim') {
        fail(headerErrorMessage(frame), frame.start);
        return { nextIndex: tokens.length, nextCharOffset: 0 };
      }
      if (sel.token.kind === 'open') {
        for (let k = cursor; k < p; k++) frame.children.push(makeLeaf(k));
        const openLeaf = makeLeaf(p);
        stack.push({
          kind: 'command-arg',
          delimiter: '{',
          slot: frame.nextSlot,
          opaque: spec.opaque,
          braceDepth: 1,
          openTokenIndex: p,
          openLeaf,
          children: [],
          parent: frame,
        });
        return { nextIndex: p + 1, nextCharOffset: 0 };
      }
      if (spec.form === 'braced') {
        fail(headerErrorMessage(frame), frame.start);
        return { nextIndex: tokens.length, nextCharOffset: 0 };
      }
      if (sel.token.kind === 'command') {
        const argCmd = sel.token.name || sel.token.value.slice(1);
        if (
          argCmd === 'begin' ||
          argCmd === 'end' ||
          sectionLevel(argCmd) !== undefined ||
          argCmd === 'newif' ||
          argCmd === 'else' ||
          argCmd === 'fi' ||
          testKind(argCmd) !== null ||
          declaredSetters.has(argCmd)
        ) {
          fail(headerErrorMessage(frame), frame.start);
          return { nextIndex: tokens.length, nextCharOffset: 0 };
        }
        for (let k = cursor; k < p; k++) frame.children.push(makeLeaf(k));
        recordSingleNodeArgument(frame, frame.nextSlot, 'mandatory', spec.opaque, makeLeaf(p));
        frame.nextSlot++;
        cursor = p + 1;
        charOffset = 0;
        continue;
      }
      if (sel.token.kind === 'text') {
        for (let k = cursor; k < p; k++) frame.children.push(makeLeaf(k));
        const len = firstCodePointLength(sel.token.value, 0);
        recordSingleNodeArgument(
          frame,
          frame.nextSlot,
          'mandatory',
          spec.opaque,
          makeLeaf(p, 0, len)
        );
        frame.nextSlot++;
        if (len < sel.token.value.length) {
          cursor = p;
          charOffset = len;
        } else {
          cursor = p + 1;
          charOffset = 0;
        }
        continue;
      }

      fail(headerErrorMessage(frame), frame.start);
      return { nextIndex: tokens.length, nextCharOffset: 0 };
    }

    // All signature parameters resolved
    if (frame.kind === 'section') {
      frame.phase = 'body';
    } else {
      close();
    }
    return { nextIndex: cursor, nextCharOffset: charOffset };
  }

  let i = 0;
  let charOffset = 0;
  while (i < tokens.length && !error) {
    const selected = tokens[i]!;
    const token = selected.token;
    const top = stack[stack.length - 1]!;

    // Inside an opaque command argument: never parse math, groups, or commands; track delimiters only.
    if (top.kind === 'command-arg' && top.opaque) {
      if (selected.interpretation === 'verbatim') {
        leaf(i, charOffset);
        i++;
        charOffset = 0;
        continue;
      }
      if (top.delimiter === '{') {
        if (token.kind === 'open') {
          top.braceDepth++;
          leaf(i);
          i++;
          charOffset = 0;
          continue;
        }
        if (token.kind === 'close') {
          top.braceDepth--;
          if (top.braceDepth === 0) {
            const closeLeaf = makeLeaf(i);
            const argFrame = stack.pop() as CommandArgFrame;
            finalizeDelimitedArgument(argFrame, closeLeaf, i);
            const next = advanceCommandArgs(argFrame.parent, i + 1, 0);
            i = next.nextIndex;
            charOffset = next.nextCharOffset;
            continue;
          }
          leaf(i);
          i++;
          charOffset = 0;
          continue;
        }
        leaf(i, charOffset);
        i++;
        charOffset = 0;
        continue;
      } else {
        if (token.kind === 'open') {
          top.braceDepth++;
          leaf(i);
          i++;
          charOffset = 0;
          continue;
        }
        if (token.kind === 'close') {
          if (top.braceDepth === 0) {
            fail(headerErrorMessage(top.parent), top.parent.start);
            break;
          }
          top.braceDepth--;
          leaf(i);
          i++;
          charOffset = 0;
          continue;
        }
        if (top.braceDepth === 0 && token.kind === 'text') {
          const closePos = token.value.indexOf(']', charOffset);
          if (closePos !== -1) {
            if (closePos > charOffset) leaf(i, charOffset, closePos);
            const closeLeaf = makeLeaf(i, closePos, closePos + 1);
            const argFrame = stack.pop() as CommandArgFrame;
            finalizeDelimitedArgument(argFrame, closeLeaf, i);
            const nextIdx = closePos + 1 < token.value.length ? i : i + 1;
            const nextChar = closePos + 1 < token.value.length ? closePos + 1 : 0;
            const next = advanceCommandArgs(argFrame.parent, nextIdx, nextChar);
            i = next.nextIndex;
            charOffset = next.nextCharOffset;
            continue;
          }
        }
        leaf(i, charOffset);
        i++;
        charOffset = 0;
        continue;
      }
    }

    // Inside a non-opaque optional [...] argument at brace depth 0: check for closing ']'.
    if (
      top.kind === 'command-arg' &&
      top.delimiter === '[' &&
      selected.interpretation !== 'verbatim' &&
      token.kind === 'text'
    ) {
      const closePos = token.value.indexOf(']', charOffset);
      if (closePos !== -1) {
        if (closePos > charOffset) leaf(i, charOffset, closePos);
        const closeLeaf = makeLeaf(i, closePos, closePos + 1);
        const argFrame = stack.pop() as CommandArgFrame;
        finalizeDelimitedArgument(argFrame, closeLeaf, i);
        const nextIdx = closePos + 1 < token.value.length ? i : i + 1;
        const nextChar = closePos + 1 < token.value.length ? closePos + 1 : 0;
        const next = advanceCommandArgs(argFrame.parent, nextIdx, nextChar);
        i = next.nextIndex;
        charOffset = next.nextCharOffset;
        continue;
      }
    }

    if (selected.interpretation === 'verbatim') {
      if (token.kind === 'command' && token.name === 'begin') {
        const env = parseEnvironmentDelimiter(i, true);
        if (env && snapshot.scanOptions.verbatimEnvironments.includes(env.name)) {
          let closeStart = -1;
          let closeEnd = -1;
          for (let j = env.end + 1; j < tokens.length; j++) {
            if (tokens[j]!.interpretation !== 'verbatim') break;
            if (tokens[j]!.token.kind === 'command' && tokens[j]!.token.name === 'end') {
              const endEnv = parseEnvironmentDelimiter(j, true);
              if (endEnv && endEnv.name === env.name) {
                closeStart = j;
                closeEnd = endEnv.end;
                break;
              }
            }
          }
          if (closeStart !== -1) {
            const frame = container('environment', i);
            frame.name = env.name;
            frame.openingEnd = env.end;
            frame.closingStart = closeStart;
            if (!pushContainerFrame(frame)) break;
            for (let k = env.end + 1; k < closeStart; k++) {
              leaf(k);
            }
            close(closeEnd);
            i = closeEnd + 1;
            charOffset = 0;
            continue;
          }
        }
      }
      leaf(i, charOffset);
      i++;
      charOffset = 0;
      continue;
    }

    const command = token.kind === 'command' ? token.name || token.value.slice(1) : '';
    if (selected.interpretation === 'opaque' && DEFINITIONS.has(command)) {
      const origin = selected.origin;
      const defFact = files
        .get(origin.path)
        ?.facts.find((f) => f.kind === 'definition' && f.range.start === origin.range.start);
      let bodyEndOffset =
        defFact?.kind === 'definition' && defFact.body ? defFact.body.end + 1 : -1;
      if (bodyEndOffset < 0) {
        const def = readDefinitionTokens(
          tokens.map((t) => t.token),
          i
        );
        if (def.body) bodyEndOffset = def.body.end - 1;
      }
      if (bodyEndOffset >= 0) {
        while (
          i < tokens.length &&
          tokens[i]!.interpretation === 'opaque' &&
          tokens[i]!.origin.path === origin.path &&
          tokens[i]!.origin.occurrenceId === origin.occurrenceId &&
          tokens[i]!.origin.range.start <= bodyEndOffset
        ) {
          leaf(i);
          i++;
        }
        charOffset = 0;
        continue;
      }
    }

    const sig = token.kind === 'command' ? getCommandSignature(command) : undefined;

    if (selected.interpretation === 'opaque' && (!sig || sig.role !== 'command')) {
      leaf(i, charOffset);
      i++;
      charOffset = 0;
      continue;
    }

    if (
      command === 'newif' ||
      command === 'else' ||
      command === 'fi' ||
      testKind(command) !== null ||
      declaredSetters.has(command)
    ) {
      fail(
        `Unrealized conditional command \\${command} encountered in structural parser. Realize conditions before building the AST.`,
        i,
        'unrealized-condition'
      );
      break;
    }

    if (sig?.role === 'section') {
      const level = sig.sectionLevel!;
      while (
        stack[stack.length - 1]!.kind === 'section' &&
        (stack[stack.length - 1] as SectionFrame).level >= level
      ) {
        close();
      }
      const frame: SectionFrame = {
        kind: 'section',
        key: `n${nextKey++}`,
        start: i,
        children: [makeLeaf(i)],
        name: '',
        level,
        starred: false,
        arguments: [],
        signature: sig,
        nextSlot: 0,
        starChecked: false,
        phase: 'header',
      };
      if (!pushContainerFrame(frame)) break;
      const next = advanceCommandArgs(frame, i + 1, 0);
      i = next.nextIndex;
      charOffset = next.nextCharOffset;
      continue;
    }

    if (sig?.role === 'environment-delimiter') {
      const env = parseEnvironmentDelimiter(i);
      if (!env) {
        fail('Malformed selected environment delimiter.', i);
        break;
      }
      if (command === 'begin') {
        const frame = container('environment', i);
        frame.name = env.name;
        frame.openingEnd = env.end;
        if (!pushContainerFrame(frame)) break;
        i = env.end + 1;
        charOffset = 0;
      } else {
        while (
          stack[stack.length - 1]!.kind === 'section' &&
          (stack[stack.length - 1] as SectionFrame).phase === 'body'
        ) {
          close();
        }
        const current = stack[stack.length - 1]!;
        if (current.kind !== 'environment' || current.name !== env.name) {
          fail('Mismatched selected environment.', i);
          break;
        }
        current.closingStart = i;
        close(env.end);
        i = env.end + 1;
        charOffset = 0;
      }
      continue;
    }

    if (sig && (sig.role === 'command' || sig.role === 'input')) {
      const frame: CommandFrame = {
        kind: 'command',
        key: `n${nextKey++}`,
        start: i,
        children: [makeLeaf(i)],
        name: command,
        starred: false,
        arguments: [],
        signature: sig,
        nextSlot: 0,
        starChecked: false,
      };
      if (!pushContainerFrame(frame)) break;
      const next = advanceCommandArgs(frame, i + 1, 0);
      i = next.nextIndex;
      charOffset = next.nextCharOffset;
      continue;
    }

    if (token.kind === 'open') {
      const frame = container('group', i);
      if (!pushContainerFrame(frame)) break;
      i++;
      charOffset = 0;
      continue;
    }

    if (token.kind === 'close') {
      while (
        stack[stack.length - 1]!.kind === 'section' &&
        (stack[stack.length - 1] as SectionFrame).phase === 'body'
      ) {
        close();
      }
      const current = stack[stack.length - 1]!;
      if (current.kind === 'command-arg') {
        if (current.delimiter === '{') {
          const closeLeaf = makeLeaf(i);
          const argFrame = stack.pop() as CommandArgFrame;
          finalizeDelimitedArgument(argFrame, closeLeaf, i);
          const next = advanceCommandArgs(argFrame.parent, i + 1, 0);
          i = next.nextIndex;
          charOffset = next.nextCharOffset;
          continue;
        }
        fail(headerErrorMessage(current.parent), current.parent.start);
        break;
      }
      if (current.kind !== 'group') {
        fail('Unmatched selected closing brace.', i);
        break;
      }
      close(i);
      i++;
      charOffset = 0;
      continue;
    }

    if (token.kind === 'math') {
      const current = stack[stack.length - 1]!;
      const closer =
        current.kind === 'math'
          ? current.delimiter === '\\('
            ? '\\)'
            : current.delimiter === '\\['
              ? '\\]'
              : current.delimiter
          : '';
      if (current.kind === 'math' && token.value === closer) {
        close(i);
      } else if (current.kind === 'math' || token.value === '\\)' || token.value === '\\]') {
        fail('Mismatched selected math delimiter.', i);
        break;
      } else if (
        token.value === '$' ||
        token.value === '$$' ||
        token.value === '\\(' ||
        token.value === '\\['
      ) {
        const frame = container('math', i);
        frame.delimiter = token.value;
        if (!pushContainerFrame(frame)) break;
      } else {
        leaf(i);
      }
      i++;
      charOffset = 0;
      continue;
    }

    leaf(i, charOffset);
    i++;
    charOffset = 0;
  }

  while (!error && stack[stack.length - 1]!.kind === 'section') {
    const sec = stack[stack.length - 1] as SectionFrame;
    if (sec.phase === 'header') {
      fail('Malformed selected section heading.', sec.start);
      break;
    }
    close();
  }
  if (!error && stack.length > 1) {
    const unclosed = stack[stack.length - 1]!;
    if (unclosed.kind === 'command-arg') {
      fail(headerErrorMessage(unclosed.parent), unclosed.parent.start);
    } else if (unclosed.kind === 'command') {
      fail('Malformed selected command arguments.', unclosed.start);
    } else {
      fail(`Unclosed selected ${unclosed.kind}.`, unclosed.start);
    }
  }
  if (error) return { kind: 'error', issue: error };
  return {
    kind: 'success',
    root: {
      ...baseFromRange(0, tokens.length - 1, root.key),
      kind: 'root',
      children: root.children,
    },
  };
}
