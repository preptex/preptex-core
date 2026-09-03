/**
 * A normalized, forward-slash path inside a virtual PrepTeX project.
 *
 * Public operations reject absolute paths and paths that escape the project root.
 */
export type ProjectFilePath = string;

/**
 * A non-empty path written inside a braced `\input` command.
 *
 * It retains the source spelling and is interpreted relative to the including
 * file only when a project is flattened.
 */
export type InputReferencePath = string;

/** The name of a boolean condition declared with LaTeX's `\newif`. */
export type ConditionName = string;

/** A node identifier that is unique within one parsed file. */
export type NodeId = number;

/** A supported section depth, where `0` represents the `document` environment. */
export type SectionLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** An opening delimiter recognized for a LaTeX math node. */
export type MathDelimiter = '$' | '$$' | '\\(' | '\\[';

/** An exact source line-ending sequence. */
export type LineEnding = '\n' | '\r' | '\r\n';

/** Identifies every node shape in a PrepTeX syntax tree. */
export enum NodeType {
  /** The synthetic root of one parsed source file. */
  Root = 'Root',
  /** Literal source text that was not classified more specifically. */
  Text = 'Text',
  /** A line-feed, carriage-return, or CRLF sequence. */
  NewLine = 'NewLine',
  /** A percent comment or `comment` environment. */
  Comment = 'Comment',
  /** A LaTeX control sequence. */
  Command = 'Command',
  /** A `\begin`/`\end` environment pair. */
  Environment = 'Environment',
  /** A complete `\if...\fi` conditional. */
  Condition = 'Condition',
  /** The selected or alternative branch of a conditional. */
  ConditionBranch = 'ConditionBranch',
  /** A `\newif` declaration. */
  ConditionDeclaration = 'ConditionDeclaration',
  /** A delimited inline or display math region. */
  Math = 'Math',
  /** A brace-delimited group. */
  Group = 'Group',
  /** A section command or the `document` environment. */
  Section = 'Section',
  /** An `\input` command. */
  Input = 'Input',
}

/** Identifies a conditional branch. */
export enum ConditionBranchKind {
  /** The branch between `\if...` and `\else` or `\fi`. */
  If = 'If',
  /** The optional branch between `\else` and `\fi`. */
  Else = 'Else',
}

/** Identifies the syntax used to write a comment. */
export enum CommentKind {
  /** A percent comment that continues through its line ending. */
  Line = 'line',
  /** A `comment` environment. */
  Environment = 'environment',
}

/** Identifies token categories that can be enabled during parsing. */
export enum TokenType {
  /** `\begin` and `\end` tokens. */
  Environment = 'Environment',
  /** `\if...`, `\else`, and `\fi` tokens. */
  Condition = 'Condition',
  /** `\newif` tokens. */
  ConditionDeclaration = 'ConditionDeclaration',
  /** Supported section-command tokens. */
  Section = 'Section',
  /** General control-sequence tokens. */
  Command = 'Command',
  /** `\input` tokens. */
  Input = 'Input',
  /** Opening and closing brace tokens. */
  Brace = 'Brace',
  /** Percent-comment and `comment`-environment tokens. */
  Comment = 'Comment',
  /** Line-ending tokens. */
  NewLine = 'NewLine',
  /** Dollar and control-sequence math delimiters. */
  MathDelim = 'MathDelim',
  /** Text not classified as another enabled token type. */
  Text = 'Text',
}

/** The severity assigned to a parse diagnostic. */
export enum DiagnosticSeverity {
  /** The source could not be parsed safely. */
  Error = 'error',
  /** Parsing succeeded after a documented fallback or reclassification. */
  Warning = 'warning',
}

/** Stable machine-readable categories for PrepTeX diagnostics. */
export enum DiagnosticCode {
  /** The source contains malformed or unbalanced supported syntax. */
  SyntaxError = 'syntax-error',
  /** A section command was treated as a plain command to preserve nesting. */
  SectionReclassified = 'section-reclassified',
  /** Tokenization was narrowed because two supported constructs intersect. */
  TokenizationAdjusted = 'tokenization-adjusted',
  /** Supported grouping constructs close in an intersecting order. */
  IntersectingConstructs = 'intersecting-constructs',
  /** A closing construct has no corresponding opener. */
  UnmatchedClosing = 'unmatched-closing',
}

/**
 * An inclusive source range in the original JavaScript string.
 *
 * Offsets count UTF-16 code units and `line` is one-based. For an empty document,
 * the root range is `start = 0`, `end = -1`, and `line = 1`.
 */
export interface SourceRange {
  /** Zero-based offset of the first included UTF-16 code unit. */
  readonly start: number;
  /** Zero-based offset of the last included UTF-16 code unit. */
  readonly end: number;
  /** One-based line containing `start`. */
  readonly line: number;
}

/** Shared fields present on every syntax-tree node. */
export interface NodeBase<TType extends NodeType> extends SourceRange {
  /** Discriminant used to narrow the {@link AstNode} union. */
  readonly type: TType;
  /** Identifier unique within the containing parsed file, starting at zero. */
  readonly id: NodeId;
}

/** The node types that contain child nodes. */
export type ContainerNodeType =
  | NodeType.Root
  | NodeType.Environment
  | NodeType.Condition
  | NodeType.ConditionBranch
  | NodeType.Math
  | NodeType.Group
  | NodeType.Section;

/** Shared fields present on nodes that contain other nodes. */
export interface ContainerNodeBase<TType extends ContainerNodeType> extends NodeBase<TType> {
  /** Child nodes in source order. */
  readonly children: readonly AstNode[];
  /** Original source text emitted before the children. */
  readonly prefix: string;
  /** Original source text emitted after the children. */
  readonly suffix: string;
}

/** The synthetic root for one parsed source file. */
export interface AstRoot extends ContainerNodeBase<NodeType.Root> {}

/** Literal source text. */
export interface TextNode extends NodeBase<NodeType.Text> {
  /** The exact source text covered by this node. */
  readonly value: string;
}

/** A source line ending. */
export interface NewLineNode extends NodeBase<NodeType.NewLine> {
  /** The exact line-ending sequence: LF, CR, or CRLF. */
  readonly value: LineEnding;
  /** Whether the source line before this ending contained only whitespace. */
  readonly originalLineIsWhitespaceOnly: boolean;
}

/** A percent comment or `comment` environment. */
export interface CommentNode extends NodeBase<NodeType.Comment> {
  /** The comment syntax recognized by the lexer. */
  readonly kind: CommentKind;
  /** The exact source text covered by this comment. */
  readonly value: string;
}

/** A general LaTeX control sequence. */
export interface CommandNode extends NodeBase<NodeType.Command> {
  /** Control-sequence name without the leading backslash or star. */
  readonly name: string;
  /** Exact source spelling, including consumed delimiter whitespace. */
  readonly value: string;
  /** Whether a star immediately followed the control-sequence name. */
  readonly starred: boolean;
}

/** A `\newif` condition declaration. */
export interface ConditionDeclarationNode extends NodeBase<NodeType.ConditionDeclaration> {
  /** Declared condition name without the leading `if`. */
  readonly name: ConditionName;
  /** Exact source spelling of the declaration. */
  readonly value: string;
}

/** A matched LaTeX environment other than `document`. */
export interface EnvironmentNode extends ContainerNodeBase<NodeType.Environment> {
  /** Environment name between the braces. */
  readonly name: string;
}

/** A complete LaTeX conditional. */
export interface ConditionNode extends ContainerNodeBase<NodeType.Condition> {
  /** Condition name without the leading `if`. */
  readonly name: ConditionName;
}

/** One branch of a LaTeX conditional. */
export interface ConditionBranchNode extends ContainerNodeBase<NodeType.ConditionBranch> {
  /** Name of the containing condition. */
  readonly name: ConditionName;
  /** Whether this is the `if` or `else` branch. */
  readonly branch: ConditionBranchKind;
}

/** A delimited LaTeX math region. */
export interface MathNode extends ContainerNodeBase<NodeType.Math> {
  /** Opening math delimiter; the matching closer is represented by `suffix`. */
  readonly delimiter: MathDelimiter;
}

/** A brace-delimited group. */
export interface GroupNode extends ContainerNodeBase<NodeType.Group> {}

/** A supported section command or the `document` environment. */
export interface SectionNode extends ContainerNodeBase<NodeType.Section> {
  /** Section depth; zero is reserved for the `document` environment. */
  readonly level: SectionLevel;
  /** Section title, or `document` for the document environment. */
  readonly name: string;
  /** Whether the section command used its starred form. */
  readonly starred: boolean;
}

/** An `\input` command. */
export interface InputNode extends NodeBase<NodeType.Input> {
  /** Requested virtual-project path exactly as written inside the command. */
  readonly path: InputReferencePath;
  /** Exact source spelling of the command. */
  readonly value: string;
}

/** Any syntax-tree node that owns an ordered child list. */
export type ContainerNode =
  | AstRoot
  | EnvironmentNode
  | ConditionNode
  | ConditionBranchNode
  | MathNode
  | GroupNode
  | SectionNode;

/** The exhaustive discriminated union of public PrepTeX syntax-tree nodes. */
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

/**
 * Tests whether a syntax-tree node owns child nodes.
 *
 * @param node - Node to inspect.
 * @returns `true` when `node` is a {@link ContainerNode}.
 */
export function isContainerNode(node: AstNode): node is ContainerNode {
  switch (node.type) {
    case NodeType.Root:
    case NodeType.Environment:
    case NodeType.Condition:
    case NodeType.ConditionBranch:
    case NodeType.Math:
    case NodeType.Group:
    case NodeType.Section:
      return true;
    default:
      return false;
  }
}

/** One versioned source file supplied to {@link parseProject}. */
export interface SourceFile {
  /** Stable virtual path used by entry selection and `\input` resolution. */
  readonly path: ProjectFilePath;
  /** LaTeX source text. */
  readonly source: string;
  /** Caller-owned finite number used to resolve incremental merge conflicts. */
  readonly version: number;
}

/** A diagnostic code that can be returned after a successful parse. */
export type WarningDiagnosticCode = Exclude<DiagnosticCode, DiagnosticCode.SyntaxError>;

/** A non-fatal parser message with a stable code and exact source location. */
export interface WarningDiagnostic {
  /** Stable machine-readable warning category. */
  readonly code: WarningDiagnosticCode;
  /** Literal severity used to discriminate warning diagnostics. */
  readonly severity: DiagnosticSeverity.Warning;
  /** Human-readable explanation intended for display or logs. */
  readonly message: string;
  /** Virtual source path, or the `sourcePath` supplied to {@link parseDocument}. */
  readonly path: ProjectFilePath;
  /** Inclusive range in the original source. */
  readonly range: SourceRange;
}

/** A fatal parser diagnostic attached to {@link PrepTexSyntaxError}. */
export interface SyntaxDiagnostic {
  /** Literal code used to discriminate fatal syntax diagnostics. */
  readonly code: DiagnosticCode.SyntaxError;
  /** Literal severity used to discriminate fatal syntax diagnostics. */
  readonly severity: DiagnosticSeverity.Error;
  /** Human-readable explanation intended for display or logs. */
  readonly message: string;
  /** Virtual path of the source that could not be parsed. */
  readonly path: ProjectFilePath;
  /** Inclusive range in the original source. */
  readonly range: SourceRange;
}

/** Any structured warning or fatal syntax diagnostic emitted by PrepTeX. */
export type Diagnostic = WarningDiagnostic | SyntaxDiagnostic;

/** The immutable result of parsing one LaTeX source string. */
export interface ParseResult {
  /** Normalized virtual source path associated with this parse. */
  readonly path: ProjectFilePath;
  /** Immutable syntax-tree root. */
  readonly root: AstRoot;
  /** Non-fatal parser warnings in ascending source-offset order. */
  readonly diagnostics: readonly WarningDiagnostic[];
  /** Distinct declared condition names in ascending code-unit order. */
  readonly declaredConditions: readonly ConditionName[];
  /** Distinct paths requested by `\input` commands, in first-encounter order. */
  readonly referencedFiles: readonly InputReferencePath[];
}

/** A parsed project file and the caller-owned version associated with it. */
export interface ParsedFile extends ParseResult {
  /** Version copied from the corresponding {@link SourceFile}. */
  readonly version: number;
}

/** A transport-safe, immutable parsed project. */
export interface ParsedProject {
  /** Parsed files in deterministic path order. */
  readonly files: readonly ParsedFile[];
  /** Distinct condition names in ascending code-unit order. */
  readonly declaredConditions: readonly ConditionName[];
  /** Diagnostics grouped by deterministic file order, then by source offset. */
  readonly diagnostics: readonly WarningDiagnostic[];
}

/** One transformed LaTeX output file. */
export interface TransformedFile {
  /** Virtual output path. */
  readonly path: ProjectFilePath;
  /** Serialized LaTeX source. */
  readonly source: string;
}

/** The immutable output of {@link transformProject}. */
export interface TransformResult {
  /**
   * Generated files.
   *
   * Preserve and flatten modes return only the entry file. Separate mode returns
   * every project file in deterministic path order.
   */
  readonly files: readonly TransformedFile[];
}
