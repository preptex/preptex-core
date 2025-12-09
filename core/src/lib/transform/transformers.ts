import type { Transformer } from './transform.js';
import { NodeType, ConditionBranchType, AstNode, CommandNode } from '../parse/types.js';

export function suppressComments(node: AstNode): boolean {
  return (node as any).type !== NodeType.Comment;
}

/**
 * Skip-only condition filtering: for names in keepConditions, traverse IF branch and skip ELSE;
 * otherwise traverse ELSE branch and skip IF. Nodes are not deleted.
 */
export function filterConditions(
  keepConditions: Iterable<string> | undefined,
  declaredConditions: Iterable<string>
): Transformer {
  const keep = new Set(keepConditions ?? []);
  const toggleCommands = new Set<string>();

  for (const name of declaredConditions) {
    toggleCommands.add(`${name}true`);
    toggleCommands.add(`${name}false`);
  }

  return (node) => {
    if (node.type === NodeType.Command && toggleCommands.has((node as CommandNode).name)) {
      return false;
    }

    if (node.type === NodeType.ConditionDeclaration) return false;
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
