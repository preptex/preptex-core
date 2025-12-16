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

export interface TransformContext {
  current_prefix?: string;
  current_suffix?: string;
  current_value?: string;
  skip_node: boolean;
}
export type Transformer = (
  node: Readonly<AstNode>,
  context: Readonly<TransformContext>
) => TransformContext;

export function transform(
  node: AstNode,
  transformers: Transformer[],
  files: Record<string, AstRoot> = {},
  options: TransformOptions = {}
): string {
  const resolveInputRoot = (requested: string): AstRoot | undefined => {
    const table = files ?? {};
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

    const raw = requested;
    const req = normalize(raw);

    const direct = table[raw] ?? table[req];
    if (direct) return direct;

    const withTex = req.toLowerCase().endsWith('.tex') ? undefined : `${req}.tex`;
    if (withTex && table[withTex]) return table[withTex];

    const lastSeg = req.includes('/') ? (req.split('/').pop() ?? req) : req;
    if (lastSeg && table[lastSeg]) return table[lastSeg];
    if (lastSeg && !lastSeg.toLowerCase().endsWith('.tex')) {
      const lastWithTex = `${lastSeg}.tex`;
      if (table[lastWithTex]) return table[lastWithTex];
    }

    const reqLower = req.toLowerCase();
    for (const key of Object.keys(table)) {
      if (normalize(key).toLowerCase() === reqLower) return table[key];
    }
    return undefined;
  };

  type Frame = { node: AstNode; stage: 'enter' | 'exit'; ctx?: TransformContext };
  const stack: Frame[] = [{ node, stage: 'enter' }];
  let output = '';

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const { node: cur, stage } = frame;

    if (!INNER_NODE_TYPES.has(cur.type)) {
      // Leaf node
      let ctx: TransformContext = {
        current_value: ((cur as any).value as string) ?? '',
        skip_node: false,
      };
      for (const t of transformers) ctx = t(cur, ctx);
      if (ctx.skip_node) continue;
      if (options.flatten && cur.type === NodeType.Input) {
        const inputNode = cur as InputNode;
        const file = inputNode.path;
        const target = file ? resolveInputRoot(file) : undefined;
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

      output += ctx.current_value!;
      continue;
    }

    // Inner node: manage prefix/children/suffix order via enter/exit stages
    if (stage === 'enter') {
      let ctx: TransformContext = frame.ctx ?? {
        current_prefix: (cur as InnerNode).prefix,
        current_suffix: (cur as InnerNode).suffix,
        skip_node: false,
      };
      for (const t of transformers) ctx = t(cur, ctx);
      if (ctx.skip_node) continue;

      const prefix = ctx.current_prefix!;
      if (prefix) output += prefix;
      // Schedule suffix after children, carrying ctx forward
      stack.push({ node: cur, stage: 'exit', ctx });
      const children = (cur as InnerNode).children;
      // Push children in reverse so they are processed left-to-right
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ node: children[i], stage: 'enter' });
      }
    } else {
      const ctx = frame.ctx ?? {
        current_prefix: (cur as InnerNode).prefix,
        current_suffix: (cur as InnerNode).suffix,
        skip_node: false,
      };
      if (!ctx.skip_node) {
        const suffix = ctx.current_suffix!;
        if (suffix) output += suffix;
      }
    }
  }

  return output;
}
