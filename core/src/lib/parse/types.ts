export enum NodeType {
  Root = 'Root',
  Text = 'Text',
  Comment = 'Comment',
  Command = 'Command',
  Environment = 'Environment',
  Condition = 'Condition',
  ConditionBranch = 'ConditionBranch',
  ConditionDeclaration = 'ConditionDeclaration',
  Math = 'Math',
  Group = 'Group',
  Section = 'Section',
  Input = 'Input',
}

export const INNER_NODE_TYPES: Set<NodeType> = new Set([
  NodeType.Root,
  NodeType.Environment,
  NodeType.Condition,
  NodeType.ConditionBranch,
  NodeType.Math,
  NodeType.Group,
  NodeType.Section,
]);

export enum ConditionBranchType {
  If = 'If',
  Else = 'Else',
}

export interface NodeBase {
  type: NodeType;
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

export interface CommentNode extends NodeBase {
  type: NodeType.Comment;
  name: string;
  value: string;
}

export interface CommandNode extends NodeBase {
  type: NodeType.Command;
  name: string;
  // textual representation of the command itself
  prefix?: string;
  suffix?: string;
}

export interface ConditionDeclarationNode extends NodeBase {
  type: NodeType.ConditionDeclaration;
  name: string;
  value: string;
}

export interface EnvironmentNode extends InnerNode {
  type: NodeType.Environment;
  name: string;
  args?: string[];
}

export interface ConditionNode extends InnerNode {
  type: NodeType.Condition;
  name: string; // condition name, e.g. the \ifX name
  // children contains one or two ConditionBranch nodes
}

export interface ConditionBranchNode extends InnerNode {
  type: NodeType.ConditionBranch;
  name: string; // condition name for convenience
  branch: ConditionBranchType;
}

export enum ConditionBranchKind {
  If = 'If',
  Else = 'Else',
}

export interface MathNode extends InnerNode {
  type: NodeType.Math;
  delim: string; // "$", "$$", "\(", "\[", etc
  // children: parsed nested content inside math
}

export interface GroupNode extends InnerNode {
  type: NodeType.Group;
}

export interface SectionNode extends InnerNode {
  type: NodeType.Section;
  level: 1 | 2 | 3 | 4 | 5; // 1=\section, 2=\subsection, 3=\subsubsection, 4=\paragraph, 5=\subparagraph
  starred?: boolean; // \section* variant
}

export interface InputNode extends NodeBase {
  type: NodeType.Input;
  path: string; // filename argument
  resolved?: string; // resolved path when inlining
  content?: AstRoot; // filled when flattened
}

// Discriminated union for all AST nodes
export type AstNode =
  | TextNode
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

export const isSection = (n: NodeBase): n is SectionNode =>
  (n as SectionNode).type === NodeType.Section;
