import {
  CommentKind,
  ConditionBranchKind,
  NodeType,
  type MathDelimiter,
  type LineEnding,
  type SectionLevel,
} from '../../api-types.js';

export { CommentKind, ConditionBranchKind, NodeType } from '../../api-types.js';

export const INNER_NODE_TYPES: Set<NodeType> = new Set([
  NodeType.Root,
  NodeType.Environment,
  NodeType.Condition,
  NodeType.ConditionBranch,
  NodeType.Math,
  NodeType.Group,
  NodeType.Section,
]);

export interface NodeBase {
  type: NodeType;
  // Globally unique id within a parsed AST (assigned pre-order)
  id: number;
  start: number;
  end: number;
  line: number;
}

// Inner nodes are nodes that can have children
export interface InnerNode extends NodeBase {
  children: AstNode[];
  // textual wrappers around the node when rendering
  prefix: string;
  suffix: string;
}

// Use NodeType directly for stack context tagging (Math, Env, Condition, Group)

export interface AstRoot extends InnerNode {
  type: NodeType.Root;
}

// new / improved node types
export interface TextNode extends NodeBase {
  type: NodeType.Text;
  value: string;
}

export interface NewLineNode extends NodeBase {
  type: NodeType.NewLine;
  value: LineEnding;
  originalLineIsWhitespaceOnly: boolean;
}

export interface CommentNode extends NodeBase {
  type: NodeType.Comment;
  kind: CommentKind;
  value: string;
}

export interface CommandNode extends NodeBase {
  type: NodeType.Command;
  name: string;
  value: string;
  starred: boolean;
}

export interface ConditionDeclarationNode extends NodeBase {
  type: NodeType.ConditionDeclaration;
  name: string;
  value: string;
}

export interface EnvironmentNode extends InnerNode {
  type: NodeType.Environment;
  name: string;
}

export interface ConditionNode extends InnerNode {
  type: NodeType.Condition;
  name: string; // condition name, e.g. the \ifX name
  // children contains one or two ConditionBranch nodes
}

export interface ConditionBranchNode extends InnerNode {
  type: NodeType.ConditionBranch;
  name: string; // condition name for convenience
  branch: ConditionBranchKind;
}

export interface MathNode extends InnerNode {
  type: NodeType.Math;
  delimiter: MathDelimiter;
  // children: parsed nested content inside math
}

export interface GroupNode extends InnerNode {
  type: NodeType.Group;
}

export interface SectionNode extends InnerNode {
  type: NodeType.Section;
  level: SectionLevel;
  name: string;
  starred: boolean;
}

export interface InputNode extends NodeBase {
  type: NodeType.Input;
  path: string; // filename argument
  value: string;
}

// Discriminated union for all AST nodes
export type AstNode =
  | TextNode
  | NewLineNode
  | CommentNode
  | CommandNode
  | ConditionDeclarationNode
  | EnvironmentNode
  | ConditionNode
  | ConditionBranchNode
  | MathNode
  | GroupNode
  | SectionNode
  | InputNode
  | AstRoot;

// convenience type guard examples
export const isEnvironment = (n: NodeBase): n is EnvironmentNode =>
  (n as EnvironmentNode).type === NodeType.Environment;

export const isText = (n: NodeBase): n is TextNode => (n as TextNode).type === NodeType.Text;

export const isNewLine = (n: NodeBase): n is NewLineNode =>
  (n as NewLineNode).type === NodeType.NewLine;

export const isSection = (n: NodeBase): n is SectionNode =>
  (n as SectionNode).type === NodeType.Section;
