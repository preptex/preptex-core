import type { Transformer, TransformerContext } from './transform.js';
import {
  NodeType,
  ConditionBranchType,
  AstNode,
  CommandNode,
  ConditionBranchNode,
} from '../parse/types.js';

export function suppressComments(node: AstNode): TransformerContext {
  const process = node.type !== NodeType.Comment;
  return { selfRender: process, selfProcess: process };
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
      return { selfRender: false, selfProcess: false };
    }
    if (node.type === NodeType.ConditionDeclaration) {
      return { selfRender: false, selfProcess: false };
    }
    if (node.type !== NodeType.ConditionBranch && node.type !== NodeType.Condition) {
      return { selfRender: true, selfProcess: true };
    }

    const selfRender = false;
    let selfProcess = true;

    const cNode = node as ConditionBranchNode;
    const keepIf = keep.has(cNode.name);
    if (keepIf && cNode.branch === ConditionBranchType.Else) selfProcess = false; // skip ELSE
    if (!keepIf && cNode.branch === ConditionBranchType.If) selfProcess = false; // skip IF
    return { selfRender, selfProcess };
  };
}
