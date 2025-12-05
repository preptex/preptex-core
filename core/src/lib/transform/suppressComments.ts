import type { Transformer } from './transform.js';
import { NodeType } from '../parse/types.js';

// Boolean-only transformer: return false to skip Comment nodes; true to process others
export function suppressComments(): Transformer {
  return (node) => (node as any).type !== NodeType.Comment;
}
