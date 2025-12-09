import {
  INNER_NODE_TYPES,
  InnerNode,
  NodeType,
  type AstNode,
  type AstRoot,
  type InputNode,
} from '../parse/types.js';

export interface TransformOptions {
  flatten?: boolean;
}

export type Transformer = (node: AstNode) => boolean;

export function transform(
  node: AstNode,
  transformers: Transformer[],
  files: Record<string, AstRoot> = {},
  options: TransformOptions = {}
): string {
  type Frame = { node: AstNode; stage: 'enter' | 'exit' };
  const stack: Frame[] = [{ node, stage: 'enter' }];
  let output = '';

  while (stack.length > 0) {
    const { node: cur, stage } = stack.pop()!;

    let skip = false;
    for (const t of transformers) {
      if (!cur) break;
      if (t(cur) === false) {
        skip = true;
        break;
      }
    }
    if (skip) continue;

    if (!INNER_NODE_TYPES.has(cur.type)) {
      // Leaf node
      if (options.flatten && cur.type === NodeType.Input) {
        const inputNode = cur as InputNode;
        const file = inputNode.path;
        const fileTable = files ?? {};
        const target = file ? fileTable[file] : undefined;
        if (file) {
          if (!target) {
            // When flattening is requested and the referenced file is missing,
            // fail fast so callers can catch configuration/IO issues.
            throw new Error(`Missing input file: ${file}`);
          }
          // Push target root to process its content inline
          stack.push({ node: target, stage: 'enter' });
          continue;
        }
      }
      const value = ((cur as any).value as string) ?? '';
      if (value) output += value;
      continue;
    }

    // Inner node: manage prefix/children/suffix order via enter/exit stages
    if (stage === 'enter') {
      output += (cur as InnerNode).prefix;
      // Schedule suffix after children
      stack.push({ node: cur, stage: 'exit' });
      const children = (cur as InnerNode).children;
      // Push children in reverse so they are processed left-to-right
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ node: children[i], stage: 'enter' });
      }
    } else {
      output += (cur as InnerNode).suffix;
    }
  }

  return output;
}
