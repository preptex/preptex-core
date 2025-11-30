export interface NodeBase {
  type: string;
  start: number;
  end: number;
}

export interface AstRoot extends NodeBase {
  type: 'Root';
  children: AstNode[];
}

// new / improved node types
export interface TextNode extends NodeBase {
  type: 'Text';
  value: string;
}

export interface CommentNode extends NodeBase {
  type: 'Comment';
  value: string;
}

export interface CommandNode extends NodeBase {
  type: 'Command';
  name: string;
}

export interface EnvironmentNode extends NodeBase {
  type: 'Environment';
  name: string;
  children: AstNode[]; // nested content
  args?: string[];
}

export interface IfNode extends NodeBase {
  type: 'If';
  condition: string; // e.g. the \if name or expression
  thenBranch: AstNode[];
  elseBranch: AstNode[]; // empty if none
}

export interface MathNode extends NodeBase {
  type: 'Math';
  delim: string; // "$", "$$", "\(", "\[", etc
  children: AstNode[]; // parsed nested content inside math
}

export interface GroupNode extends NodeBase {
  type: 'Group';
  children: AstNode[];
}

export interface SectionNode extends NodeBase {
  type: 'Section';
  level: 1 | 2 | 3 | 4 | 5; // 1=\section, 2=\subsection, 3=\subsubsection, 4=\paragraph, 5=\subparagraph
  starred?: boolean; // \section* variant
  shortTitle?: AstNode[]; // optional short title from [Short]
  title: AstNode[]; // allow macros in titles
  children: AstNode[];
}

export interface InputNode extends NodeBase {
  type: 'Input';
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
  (n as EnvironmentNode).type === 'Environment';

export const isText = (n: NodeBase): n is TextNode => (n as TextNode).type === 'Text';

export const isSection = (n: NodeBase): n is SectionNode => (n as SectionNode).type === 'Section';
