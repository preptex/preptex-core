import {
  NodeType,
  isContainerNode,
  type AstNode,
  type AstRoot,
  type NewLineNode,
  type ProjectFilePath,
} from '../../api-types.js';
import { PrepTexError, PrepTexErrorCode } from '../../errors.js';
import { normalizeVirtualPath, virtualDirname, withTexExtension } from '../virtual-path.js';

interface RenderOptions {
  readonly flatten?: boolean;
  readonly sourcePath?: ProjectFilePath;
}

export interface TransformContext {
  current_prefix?: string;
  current_suffix?: string;
  current_value?: string;
  skip_node: boolean;
}

export type Transformer = (node: AstNode, context: Readonly<TransformContext>) => TransformContext;

interface ResolvedInput {
  readonly path: ProjectFilePath;
  readonly root: AstRoot;
}

function createInputResolver(
  files: Readonly<Record<ProjectFilePath, AstRoot>>
): (requested: string, includingPath: string) => ResolvedInput | undefined {
  const entries = Object.entries(files);

  const findUnique = (candidate: string, ignoreCase: boolean): ResolvedInput | undefined => {
    const normalizedCandidate = normalizeVirtualPath(candidate);
    const matches = entries.filter(([path]) => {
      const normalizedPath = normalizeVirtualPath(path);
      return ignoreCase
        ? normalizedPath.toLowerCase() === normalizedCandidate.toLowerCase()
        : normalizedPath === normalizedCandidate;
    });
    if (matches.length !== 1) return undefined;
    const [path, root] = matches[0]!;
    return { path, root };
  };

  return (requested, includingPath) => {
    if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(requested) || requested.includes('\0')) {
      return undefined;
    }
    const portableRequest = requested.replace(/\\/g, '/');
    const hasParentTraversal = portableRequest.split('/').includes('..');
    const requestedPath = hasParentTraversal ? '' : normalizeVirtualPath(portableRequest);
    const parent = virtualDirname(includingPath);
    const relativePath = normalizeVirtualPath(
      parent.length > 0 ? `${parent}/${portableRequest}` : portableRequest
    );
    const candidates = Array.from(
      new Set(
        [
          relativePath,
          relativePath.length > 0 ? withTexExtension(relativePath) : '',
          requestedPath,
          requestedPath.length > 0 ? withTexExtension(requestedPath) : '',
        ].filter((candidate) => candidate.length > 0)
      )
    );

    for (const candidate of candidates) {
      const exact = findUnique(candidate, false);
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      const caseInsensitive = findUnique(candidate, true);
      if (caseInsensitive) return caseInsensitive;
    }

    if (hasParentTraversal) return undefined;
    const requestedBase = requestedPath.split('/').pop();
    if (!requestedBase) return undefined;
    const baseCandidates = new Set([requestedBase, withTexExtension(requestedBase)]);
    const basenameMatches = entries.filter(([path]) => {
      const base = normalizeVirtualPath(path).split('/').pop();
      return base !== undefined && baseCandidates.has(base);
    });
    if (basenameMatches.length !== 1) return undefined;
    const [path, root] = basenameMatches[0]!;
    return { path, root };
  };
}

function leafValue(node: AstNode): string {
  if (isContainerNode(node)) return '';
  return node.value;
}

export function transform(
  node: AstNode,
  transformers: readonly Transformer[],
  files: Readonly<Record<ProjectFilePath, AstRoot>> = {},
  options: RenderOptions = {}
): string {
  const resolveInput = createInputResolver(files);
  type Frame = {
    readonly node: AstNode;
    readonly stage: 'enter' | 'exit';
    readonly sourcePath: ProjectFilePath;
    readonly context?: TransformContext;
  };

  const initialPath = options.sourcePath ?? '<input>';
  const stack: Frame[] = [{ node, stage: 'enter', sourcePath: initialPath }];
  const activeRoots = new Map<AstRoot, ProjectFilePath>();
  let output = '';
  let currentLine = '';

  const appendText = (text: string): void => {
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch !== '\n' && ch !== '\r') continue;

      currentLine += text.slice(start, i);
      let newline = ch;
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        newline = '\r\n';
        i++;
      }
      output += currentLine + newline;
      currentLine = '';
      start = i + 1;
    }
    currentLine += text.slice(start);
  };

  const appendNewLineNode = (newLine: NewLineNode, value: string): void => {
    if (value !== '\n' && value !== '\r' && value !== '\r\n') {
      appendText(value);
      return;
    }

    const lineBecameEmpty =
      !newLine.originalLineIsWhitespaceOnly && currentLine.trim().length === 0;
    if (!lineBecameEmpty) output += currentLine + value;
    currentLine = '';
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    const { node: current, stage, sourcePath } = frame;

    if (!isContainerNode(current)) {
      let context: TransformContext = {
        current_value: leafValue(current),
        skip_node: false,
      };
      for (const transformer of transformers) context = transformer(current, context);
      if (context.skip_node) continue;

      if (options.flatten && current.type === NodeType.Input) {
        const target = resolveInput(current.path, sourcePath);
        if (!target) {
          throw new PrepTexError(
            `Cannot resolve input "${current.path}" from "${sourcePath}".`,
            PrepTexErrorCode.MissingInput
          );
        }
        if (activeRoots.has(target.root)) {
          const firstPath = activeRoots.get(target.root) ?? target.path;
          throw new PrepTexError(
            `Circular input detected: "${firstPath}" is already active when included from "${sourcePath}".`,
            PrepTexErrorCode.CircularInput
          );
        }
        stack.push({ node: target.root, stage: 'enter', sourcePath: target.path });
        continue;
      }

      const value = context.current_value ?? '';
      if (current.type === NodeType.NewLine) appendNewLineNode(current, value);
      else appendText(value);
      continue;
    }

    if (stage === 'enter') {
      let context: TransformContext = frame.context ?? {
        current_prefix: current.prefix,
        current_suffix: current.suffix,
        skip_node: false,
      };
      for (const transformer of transformers) context = transformer(current, context);
      if (context.skip_node) continue;

      if (current.type === NodeType.Root) {
        const firstPath = activeRoots.get(current);
        if (firstPath) {
          throw new PrepTexError(
            `Circular input detected: "${firstPath}" is already active when included from "${sourcePath}".`,
            PrepTexErrorCode.CircularInput
          );
        }
        activeRoots.set(current, sourcePath);
      }

      const prefix = context.current_prefix ?? '';
      if (prefix) appendText(prefix);
      stack.push({ node: current, stage: 'exit', sourcePath, context });
      for (let index = current.children.length - 1; index >= 0; index--) {
        const child = current.children[index];
        if (child) stack.push({ node: child, stage: 'enter', sourcePath });
      }
      continue;
    }

    const suffix = frame.context?.current_suffix ?? current.suffix;
    if (!frame.context?.skip_node && suffix) appendText(suffix);
    if (current.type === NodeType.Root) activeRoots.delete(current);
  }

  return output + currentLine;
}
