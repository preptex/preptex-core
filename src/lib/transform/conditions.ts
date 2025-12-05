import type { Transformer } from './transform';
import { NodeType, ConditionBranchType } from '../parse/types';

/**
 * Skip-only condition filtering: for names in keepIfNames, traverse IF branch and skip ELSE;
 * otherwise traverse ELSE branch and skip IF. Nodes are not deleted.
 */
export function filterConditions(keepIfNames: Set<string> | string[]): Transformer {
  const keep = Array.isArray(keepIfNames) ? new Set(keepIfNames) : keepIfNames;
  return (node) => {
    if (node.type !== NodeType.ConditionBranch && node.type !== NodeType.Condition) return true;
    node.prefix = '';
    node.suffix = '';

    if ((node as any).type !== NodeType.ConditionBranch) return true;
    const br = node as any;
    const keepIf = keep.has(br.name);
    if (keepIf && br.branch === ConditionBranchType.Else) return false; // skip ELSE
    if (!keepIf && br.branch === ConditionBranchType.If) return false; // skip IF
    return true; // process desired branch
  };
}
