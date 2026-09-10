import type { MathDelimiter, SourceRange } from '../../api-types.js';
import type {
  ConfiguredContainerNode,
  ConfiguredNode,
  ProjectIssue,
  SelectedToken,
  SourceOrigin,
  ViewId,
  ProjectSnapshot,
} from '../../project-types.js';
import type { NodeLocation, ConfiguredEnvironmentDelimiter } from '../../node-types.js';
import { readDelimiter, hasEnvironmentArguments, fileLines } from './environments.js';
import { issue, rangeAt } from './shared.js';
import { sectionLevel } from './scan.js';

interface Container {
  kind: ConfiguredContainerNode['kind'];
  key: string;
  start: number;
  children: ConfiguredNode[];
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
  starred: boolean;
  delimiter: MathDelimiter;
  openingEnd: number;
  closingStart: number;
}

export function parseConfiguredStructure(
  tokens: readonly SelectedToken[],
  viewId: ViewId,
  maxNesting: number,
  snapshot: ProjectSnapshot
):
  | { kind: 'success'; root: ConfiguredContainerNode & { kind: 'root' } }
  | { kind: 'error'; issue: ProjectIssue } {
  let nextKey = 0;
  function container(kind: Container['kind'], start: number): Container {
    return {
      kind,
      key: `n${nextKey++}`,
      start,
      children: [],
      name: '',
      level: 1,
      starred: false,
      delimiter: '$',
      openingEnd: -1,
      closingStart: -1,
    };
  }
  const root = container('root', 0);
  const stack: Container[] = [root];
  let error: ProjectIssue | undefined;
  const files = new Map(snapshot.files.map((f) => [f.path, f]));
  function fail(message: string, index: number): void {
    const at = tokens[index]?.origin ?? tokens[tokens.length - 1]?.origin;
    error = {
      ...issue(
        'structural-error',
        message,
        at ? { path: at.path, range: at.range } : null,
        'error'
      ),
      inputChain: at ? [at.occurrenceId] : [],
    };
  }
  function base(start: number, end: number, key: string) {
    const origins: SourceOrigin[] = [];
    for (let i = start; i <= end; i++) {
      const origin = tokens[i]!.origin;
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
      } else origins.push(origin);
    }
    const first = tokens[start]?.projectedRange;
    const last = tokens[end]?.projectedRange;
    const projectedRange: SourceRange = {
      start: first?.start ?? 0,
      end: last?.end ?? -1,
      line: first?.line ?? 1,
    };
    const spans = origins.map((origin) => ({
      ...origin,
      version: files.get(origin.path)!.version,
    }));
    const location: NodeLocation =
      spans.length === 0
        ? { kind: 'none', primary: null, spans: [] }
        : spans.length === 1
          ? { kind: 'single', primary: spans[0]!, spans: [spans[0]!] }
          : { kind: 'multiple', primary: spans[0]!, spans };
    return { viewId, occurrenceKey: key, origins, projectedRange, location };
  }
  function delimiter(start: number, end: number): ConfiguredEnvironmentDelimiter | null {
    const first = tokens[start]?.origin,
      last = tokens[end]?.origin;
    if (!first || !last || first.path !== last.path || first.occurrenceId !== last.occurrenceId)
      return null;
    const file = files.get(first.path)!;
    const value = readDelimiter(file, first.range.start, snapshot);
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
  function build(frame: Container, end: number): ConfiguredContainerNode {
    const shared = { ...base(frame.start, end, frame.key), children: frame.children };
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
      case 'section':
        return {
          ...shared,
          kind: 'section',
          name: frame.name,
          level: frame.level,
          starred: frame.starred,
        };
    }
  }
  function close(end: number): void {
    const node = build(stack.pop()!, end);
    stack[stack.length - 1]!.children.push(node);
  }
  function leaf(index: number): void {
    stack[stack.length - 1]!.children.push({
      ...base(index, index, `n${nextKey++}`),
      kind: 'token',
      token: tokens[index]!.token,
    });
  }
  function heading(index: number): { name: string; end: number; starred: boolean } | null {
    let pos = index + 1;
    let starred = false;
    let optionalDepth = 0;
    let optionalBraces = 0;
    while (pos < tokens.length && tokens[pos]!.token.kind !== 'open') {
      const value = tokens[pos]!.token.value;
      if (value.startsWith('*')) starred = true;
      if (tokens[pos]!.token.kind === 'text')
        for (const char of value) {
          if (char === '[') optionalDepth++;
          if (char === ']') optionalDepth--;
        }
      pos++;
      // Optional short headings may themselves contain brace groups.
      while (optionalDepth > 0 && pos < tokens.length) {
        const t = tokens[pos]!.token;
        if (t.kind === 'open') optionalBraces++;
        if (t.kind === 'close') optionalBraces--;
        if (!optionalBraces && t.kind === 'text')
          for (const char of t.value) {
            if (char === '[') optionalDepth++;
            if (char === ']') optionalDepth--;
          }
        pos++;
      }
    }
    if (pos === tokens.length) return null;
    let name = '';
    let depth = 1;
    for (pos++; pos < tokens.length; pos++) {
      const token = tokens[pos]!.token;
      if (token.kind === 'open') depth++;
      if (token.kind === 'close') depth--;
      if (!depth) return { name, end: pos, starred };
      name += token.value;
    }
    return null;
  }
  for (let i = 0; i < tokens.length && !error; i++) {
    const selected = tokens[i]!;
    const token = selected.token;
    if (selected.interpretation === 'opaque') {
      leaf(i);
      continue;
    }
    const command = token.kind === 'command' ? token.value.slice(1) : '';
    const section = sectionLevel(command);
    if (section !== undefined) {
      const title = heading(i);
      if (!title) {
        fail('Malformed selected section heading.', i);
        break;
      }
      while (
        stack[stack.length - 1]!.kind === 'section' &&
        stack[stack.length - 1]!.level >= section
      )
        close(i - 1);
      const frame = container('section', i);
      frame.name = title.name;
      frame.starred = title.starred;
      frame.level = section;
      stack.push(frame);
      for (let j = i; j <= title.end; j++) leaf(j);
      i = title.end;
    } else if (command === 'begin' || command === 'end') {
      const env = heading(i);
      if (!env) {
        fail('Malformed selected environment delimiter.', i);
        break;
      }
      if (command === 'begin') {
        const frame = container('environment', i);
        frame.name = env.name;
        frame.openingEnd = env.end;
        stack.push(frame);
      } else {
        while (stack[stack.length - 1]!.kind === 'section') close(i - 1);
        const current = stack[stack.length - 1]!;
        if (current.kind !== 'environment' || current.name !== env.name) {
          fail('Mismatched selected environment.', i);
          break;
        }
        current.closingStart = i;
        close(env.end);
      }
      i = env.end;
    } else if (token.kind === 'open') stack.push(container('group', i));
    else if (token.kind === 'close') {
      while (stack[stack.length - 1]!.kind === 'section') close(i - 1);
      if (stack[stack.length - 1]!.kind !== 'group') {
        fail('Unmatched selected closing brace.', i);
        break;
      }
      close(i);
    } else if (token.kind === 'math') {
      const current = stack[stack.length - 1]!;
      const closer =
        current.delimiter === '\\('
          ? '\\)'
          : current.delimiter === '\\['
            ? '\\]'
            : current.delimiter;
      if (current.kind === 'math' && token.value === closer) close(i);
      else if (current.kind === 'math' || token.value === '\\)' || token.value === '\\]') {
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
        stack.push(frame);
      }
    } else leaf(i);
    if (stack.length > maxNesting + 1) {
      fail('Configured structural nesting limit reached.', i);
      break;
    }
  }
  while (!error && stack[stack.length - 1]!.kind === 'section') close(tokens.length - 1);
  if (!error && stack.length > 1)
    fail(`Unclosed selected ${stack[stack.length - 1]!.kind}.`, stack[stack.length - 1]!.start);
  if (error) return { kind: 'error', issue: error };
  return {
    kind: 'success',
    root: { ...base(0, tokens.length - 1, root.key), kind: 'root', children: root.children },
  };
}
