export enum NodeType {
  Root = 'Root',
  Text = 'Text',
  Comment = 'Comment',
  Command = 'Command',
  Environment = 'Environment',
  If = 'If',
  Math = 'Math',
  Group = 'Group',
  Section = 'Section',
  Input = 'Input',
}

export interface NodeBase {
  type: NodeType;
  start: number;
  end: number;
}

// Use NodeType directly for stack context tagging (Math, Env, If, Group)

export interface AstRoot extends NodeBase {
  type: NodeType.Root;
  children: AstNode[];
}

// new / improved node types
export interface TextNode extends NodeBase {
  type: NodeType.Text;
  value: string;
}

export interface CommentNode extends NodeBase {
  type: NodeType.Comment;
  value: string;
}

export interface CommandNode extends NodeBase {
  type: NodeType.Command;
  name: string;
}

export interface EnvironmentNode extends NodeBase {
  type: NodeType.Environment;
  name: string;
  children: AstNode[]; // nested content
  args?: string[];
}

export interface IfNode extends NodeBase {
  type: NodeType.If;
  condition: string; // e.g. the \if name or expression
  thenBranch: AstNode[];
  elseBranch: AstNode[]; // empty if none
}

export interface MathNode extends NodeBase {
  type: NodeType.Math;
  delim: string; // "$", "$$", "\(", "\[", etc
  children: AstNode[]; // parsed nested content inside math
}

export interface GroupNode extends NodeBase {
  type: NodeType.Group;
  children: AstNode[];
}

export interface SectionNode extends NodeBase {
  type: NodeType.Section;
  level: 1 | 2 | 3 | 4 | 5; // 1=\section, 2=\subsection, 3=\subsubsection, 4=\paragraph, 5=\subparagraph
  starred?: boolean; // \section* variant
  children: AstNode[];
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
  | EnvironmentNode
  | IfNode
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
