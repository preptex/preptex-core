/**
 * PrepTeX's environment-neutral public API for parsing and transforming virtual
 * LaTeX projects.
 *
 * @packageDocumentation
 */

export {
  CommentKind,
  ConditionBranchKind,
  DiagnosticCode,
  DiagnosticSeverity,
  NodeType,
  TokenType,
  isContainerNode,
} from './api-types.js';
export type {
  AstNode,
  AstRoot,
  CommandNode,
  CommentNode,
  ConditionBranchNode,
  ConditionDeclarationNode,
  ConditionName,
  ConditionNode,
  ContainerNode,
  ContainerNodeBase,
  ContainerNodeType,
  Diagnostic,
  EnvironmentNode,
  GroupNode,
  InputReferencePath,
  InputNode,
  LineEnding,
  MathDelimiter,
  MathNode,
  NewLineNode,
  NodeBase,
  NodeId,
  ParseResult,
  ParsedFile,
  ParsedProject,
  ProjectFilePath,
  SectionLevel,
  SectionNode,
  SourceFile,
  SourceRange,
  SyntaxDiagnostic,
  TextNode,
  TransformResult,
  TransformedFile,
  WarningDiagnostic,
  WarningDiagnosticCode,
} from './api-types.js';
export { PrepTexError, PrepTexErrorCode, PrepTexSyntaxError } from './errors.js';
export { InputHandlingMode, isInputHandlingMode } from './lib/options.js';
export type {
  ParseOptions,
  ProjectParseOptions,
  SerializeOptions,
  TransformOptions,
} from './lib/options.js';
export {
  mergeProjects,
  parseDocument,
  parseProject,
  serializeDocument,
  transformProject,
} from './lib/core.js';
