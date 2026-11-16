/**
 * PrepTeX's environment-neutral public API for parsing and transforming virtual
 * LaTeX projects.
 *
 * @packageDocumentation
 */

export type { MathDelimiter, ProjectFilePath, SourceFile, SourceRange } from './api-types.js';
export { PrepTexError, PrepTexErrorCode, ProjectOperationError } from './errors.js';

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
  ConditionRealizationRequest,
  ConditionRealizationResult,
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
  SourceTokenKind,
  SyntaxFact,
  SyntaxFactBase,
  ViewConfiguration,
  ViewId,
  ViewLimits,
} from './project-types.js';
export { tokenizeFile } from './lib/project/tokenize.js';
export {
  createProjectSnapshot,
  updateProjectSnapshot,
  inspectProject,
} from './lib/project/snapshot.js';
export { realizeProjectConditions } from './lib/project/conditions.js';
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
