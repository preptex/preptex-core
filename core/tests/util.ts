import { Lexer, type Token } from '../src/lib/lexer/tokens';
import { AstNode, INNER_NODE_TYPES, InnerNode } from '../src/lib/parse/types';

export function appendTextToToken(input: string, token: Token): any {
  return {
    ...token,
    text: input.slice(token.start, token.end + 1),
  };
}
// Collect all tokens with full data as produced by the lexer
export function collectTokens(lex: Lexer): Token[] {
  const out: Token[] = [];
  let t: Token | null;
  while ((t = lex.next())) out.push(t);
  return out;
}

export function collectNodesDFS(root: InnerNode): AstNode[] {
  const out: AstNode[] = [];
  const stack: AstNode[] = [root as AstNode];
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    if (INNER_NODE_TYPES.has(node.type)) {
      const children = (node as InnerNode).children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
  return out;
}
