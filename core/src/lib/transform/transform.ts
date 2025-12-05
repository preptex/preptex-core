import { INNER_NODE_TYPES, InnerNode, type AstNode, type AstRoot } from '../parse/types.js';

// boolean-only: transformer(node) => true to process, false to skip (produce empty output).

export interface TransformCtx {
  text: string[];
  pushText: (s: string) => void;
}

export type Transformer = (node: AstNode) => boolean;

export function walk(node: AstNode, transformers: Transformer[], ctx: TransformCtx): string {
  for (const t of transformers) {
    if (!node) break;
    const process = t(node);
    if (process === false) return '';
  }

  if (!INNER_NODE_TYPES.has(node.type)) {
    return (node as any).value as string;
  }

  let output = (node as InnerNode).prefix;

  for (const c of (node as InnerNode).children) {
    output += walk(c, transformers, ctx);
  }

  output += (node as InnerNode).suffix;
  return output;
}

export function transform(root: AstRoot, transformers: Transformer[]) {
  const ctx: TransformCtx = {
    text: [],
    pushText: (s: string) => {
      if (s) ctx.text.push(s);
    },
  };

  const text = walk(root, transformers, ctx);
  return {
    root,
    text,
  };
}
