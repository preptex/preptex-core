import type { Transformer, TransformContext } from './transform.js';
import {
  NodeType,
  ConditionBranchType,
  AstNode,
  CommandNode,
  ConditionBranchNode,
} from '../parse/types.js';

export function suppressComments(node: AstNode, ctx: TransformContext): TransformContext {
  if (node.type === NodeType.Comment) {
    return { ...ctx, current_value: ' ' };
  }
  return ctx;
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

  return (node, ctx) => {
    if (node.type === NodeType.Command && toggleCommands.has((node as CommandNode).name)) {
      return { ...ctx, skip_node: true };
    }
    if (node.type === NodeType.ConditionDeclaration) {
      return { ...ctx, skip_node: true };
    }
    if (node.type !== NodeType.ConditionBranch && node.type !== NodeType.Condition) {
      return ctx;
    }

    if (node.type === NodeType.Condition) {
      // Replace closing \fi suffix with a space
      return { ...ctx, current_suffix: '' };
    }

    const cNode = node as ConditionBranchNode;
    const keepIf = keep.has(cNode.name);
    if (keepIf && cNode.branch === ConditionBranchType.Else) return { ...ctx, skip_node: true };
    if (!keepIf && cNode.branch === ConditionBranchType.If) return { ...ctx, skip_node: true };
    // Replace \if* or \else prefix with a space for the kept branch
    return { ...ctx, current_prefix: '' };
  };
}
