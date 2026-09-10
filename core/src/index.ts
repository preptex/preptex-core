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
export {
  PrepTexError,
  PrepTexErrorCode,
  PrepTexSyntaxError,
  ProjectOperationError,
} from './errors.js';
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

export { isConfiguredContainerNode, walkConfiguredNodes } from './project-types.js';
export type {
  AnalysisFinding,
  AnalysisResult,
  ArtifactOrigin,
  BooleanValues,
  BranchContext,
  CapabilityReason,
  ConditionDecision,
  ConditionPolicy,
  ConfiguredContainerNode,
  ConfiguredNode,
  ConfiguredNodeBase,
  Coverage,
  FactContext,
  GeneratedArtifact,
  InputOccurrence,
  InterpretationProfile,
  InventoryRequest,
  InventoryResult,
  LiteralArgument,
  NormalizedScanOptions,
  NormalizedViewConfiguration,
  OccurrenceId,
  OperationCapability,
  OperationDescriptor,
  OperationProvenance,
  OperationRequest,
  ProjectEdit,
  ProjectEditPlan,
  ProjectIssue,
  ProjectIssueCode,
  ProjectSnapshot,
  ProjectSourceChange,
  ProjectView,
  ProjectViewBase,
  ReachedFact,
  ScanOptions,
  ScannedFile,
  SelectedToken,
  SnapshotId,
  SourceLocation,
  SourceOrigin,
  SourceScope,
  SourceToken,
  SyntaxFact,
  SyntaxFactBase,
  ViewConfiguration,
  ViewId,
  ViewLimits,
} from './project-types.js';
export {
  createProjectSnapshot,
  updateProjectSnapshot,
  inspectProject,
} from './lib/project/snapshot.js';
export { resolveProjectView } from './lib/project/view.js';
export { indexProjectView, runAnalysis } from './lib/project/analysis.js';
export { applyProjectEdits, planTransformation } from './lib/project/transformation.js';
export { runProjectPipeline } from './lib/project/pipeline.js';
export type { ProjectPipelineOptions, ProjectPipelineResult } from './project-types.js';
export type {
  AnalysisLocation,
  AnalysisOptions,
  AnalysisRequest,
  ArtifactDependency,
  CommandUsage,
  ConfiguredIndex,
  ExportOptions,
  OperationFailure,
  ReferenceResolution,
  TransformationRequest,
  TransformationResult,
} from './project-types.js';
export {
  projectOperations,
  checkOperationCapability,
  validateProjectEditPlan,
} from './lib/project/operations.js';

export type {
  VersionedSourceOrigin,
  NodeLocation,
  EnvironmentDelimiter,
  ConfiguredEnvironmentDelimiter,
  ConfiguredEnvironmentSyntax,
  SourceEnvironment,
  EnvironmentInventory,
  NodeSelection,
  EnvironmentSelection,
  NodeEditAction,
  NodeTransformationRequest,
  SourceLookupHit,
  SourceInterval,
  SourceLookupFile,
  ProjectSourceIndex,
  SourceLookupQuery,
} from './node-types.js';
export { inspectProjectEnvironments, getSelectedEnvironment } from './lib/project/environments.js';
export { selectProjectNode, getSelectedNode } from './lib/project/selection.js';
export {
  createProjectSourceIndex,
  lookupProjectSource,
  sourceOffsetAt,
} from './lib/project/source-index.js';
