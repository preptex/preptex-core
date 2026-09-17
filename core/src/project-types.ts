import type { SourceFile, SourceRange, MathDelimiter } from './api-types.js';
import type {
  NodeLocation,
  ConfiguredEnvironmentSyntax,
  NodeTransformationRequest,
  NodeEditAction,
} from './node-types.js';

/** Opaque deterministic content identity; compare exactly, never parse or persist as authorization. */
export type SnapshotId = string;
/** Identity of one snapshot and normalized semantic configuration. */
export type ViewId = string;
/** Inclusion identity unique within a view, including repeated visits to one file. */
export type OccurrenceId = string;
/** Supported source/interpretation grammar, not a promise of TeX equivalence. */
export type InterpretationProfile = 'direct-latex-v1';

/** Optional scanner settings. No setting changes the original source strings. */
export interface ScanOptions {
  /** Additional literal verbatim environment names; default is an empty list. */
  readonly verbatimEnvironments?: readonly string[];

  /** Maximum nested definition/argument inventory depth, 1–256; default 64. */
  readonly maxNesting?: number;
}
/** Canonical options stored in each snapshot and included in its identity. */
export interface NormalizedScanOptions {
  /** Sorted unique names, including verbatim, verbatim*, and comment. */
  readonly verbatimEnvironments: readonly string[];

  /** Maximum inventory recursion depth. */
  readonly maxNesting: number;
}
/** A location in an original source string; ranges are inclusive UTF-16. */
export interface SourceLocation {
  /** Normalized project-relative source path. */
  readonly path: string;

  /** Original source range, never a projected offset. */
  readonly range: SourceRange;
}
/** A location of one selected source occurrence. */
export interface SourceOrigin extends SourceLocation {
  /** Exact source snapshot identity. */
  readonly snapshotId: SnapshotId;

  /** Inclusion occurrence containing this span. */
  readonly occurrenceId: OccurrenceId;
}
/** Stable source/view failure and coverage categories. */
export type ProjectIssueCode =
  | 'malformed-syntax'
  | 'opaque-region'
  | 'scan-limit'
  | 'unknown-condition'
  | 'unsupported-condition'
  | 'unsupported-effect'
  | 'unsupported-assignment'
  | 'binding-redefined'
  | 'dynamic-input'
  | 'file-only-input'
  | 'missing-entry'
  | 'missing-input'
  | 'ambiguous-input'
  | 'invalid-input-path'
  | 'input-cycle'
  | 'cross-file-conditional'
  | 'interpretation-limit'
  | 'structural-error';
/** A located issue with an inclusion chain when produced by interpretation. */
export interface ProjectIssue {
  /** Stable category for control flow. */
  readonly code: ProjectIssueCode;

  /** Error blocks required syntax; warning denotes unsupported or uncertain behavior. */
  readonly severity: 'error' | 'warning';

  /** Human-readable explanation. */
  readonly message: string;

  /** Original location, or null for an absent entry/empty project. */
  readonly location: SourceLocation | null;

  /** Entry-to-current inclusion IDs, empty for source-only issues. */
  readonly inputChain: readonly OccurrenceId[];
}
/** Completeness is always relative to the documented recognized grammar. */
export interface Coverage {
  /** Complete recognized coverage, or explicitly limited observations. */
  readonly status: 'complete' | 'partial';

  /** Grammar under which observations were made. */
  readonly profile: InterpretationProfile;

  /** Assumptions that apply even to a complete result. */
  readonly assumptions: readonly string[];

  /** Located limitations, in deterministic encounter order. */
  readonly issues: readonly ProjectIssue[];
}
/** A lossless lexical segment. Concatenating values reproduces the source exactly. */
export interface SourceToken {
  /** Lexical category; commands in protected text are not separate tokens. */
  readonly kind: 'text' | 'space' | 'command' | 'comment' | 'verbatim' | 'open' | 'close' | 'math';

  /** Exact source substring. */
  readonly value: string;

  /** Inclusive original range. */
  readonly range: SourceRange;
}
/** Syntactic branch membership does not establish execution. */
export interface BranchContext {
  /** Range of the source conditional opener in the same file. */
  readonly test: SourceRange;

  /** Syntactic arm containing the fact. */
  readonly arm: 'then' | 'else';
}
/** Context shared by every source inventory fact. */
export interface FactContext {
  /** Enclosing source branches, outermost first. */
  readonly branches: readonly BranchContext[];

  /** Enclosing definition bodies, outermost first. */
  readonly definitionBodies: readonly SourceRange[];

  /** Stored/opaque command arguments, outermost first; these are not executed. */
  readonly opaqueArguments: readonly SourceRange[];
}
/** Common fields for facts; IDs are unique within the source file only. */
export interface SyntaxFactBase extends SourceLocation {
  /** Deterministic file-local fact identifier. */
  readonly id: string;

  /** Syntactic context; never evidence that a fact was reached. */
  readonly context: FactContext;

  /** Whether this construct is recognized or retained as an unresolved candidate. */
  readonly recognition: 'recognized' | 'candidate';
}
/** A literal or unresolved key/path. */
export type LiteralArgument =
  | {
      /** Literal discriminant. */
      readonly kind: 'literal';
      /** Exact interior string. */
      readonly value: string;
      /** Argument interior range; empty uses end=start-1. */
      readonly range: SourceRange;
    }
  | {
      /** Unresolved discriminant. */
      readonly kind: 'unresolved';
      /** Original argument spelling, without guessing expansion. */
      readonly source: string;
      /** Interior range, or null when missing. */
      readonly range: SourceRange | null;
    };
/** Exhaustive inventory facts; definition targets are excluded from command uses. */
export type SyntaxFact = SyntaxFactBase &
  (
    | {
        /** Definition variant. */
        readonly kind: 'definition';
        /** Defined control sequence without backslash, null if unrecognized. */
        readonly name: string | null;
        /** Source declaration command. */
        readonly form: string;
        /** Starred LaTeX form. */
        readonly starred: boolean;
        /** Parameters/optional defaults in source order. */
        readonly arguments: readonly SourceRange[];
        /** Body interior, null for unsupported forms. */
        readonly body: SourceRange | null;
      }
    | {
        /** Direct control-sequence occurrence. */
        readonly kind: 'command-use';
        /** Command name without backslash. */
        readonly name: string;
      }
    | {
        /** Label declaration. */
        readonly kind: 'label';
        /** Literal or unresolved label key. */
        readonly key: LiteralArgument;
      }
    | {
        /** Reference occurrence. */
        readonly kind: 'reference';
        /** Supported reference command. */
        readonly command: 'ref' | 'pageref' | 'eqref';
        /** Literal or unresolved target key. */
        readonly key: LiteralArgument;
      }
    | {
        /** Boolean declaration. */
        readonly kind: 'condition-declaration';
        /** Declared name without if, null for malformed declaration. */
        readonly name: string | null;
      }
    | {
        /** Conditional test. */
        readonly kind: 'condition-test';
        /** Full control sequence name without backslash. */
        readonly command: string;
        /** Recognition evidence independent of execution. */
        readonly testKind: 'literal' | 'primitive' | 'named-candidate';
      }
    | {
        /** Conditional separator/closer. */
        readonly kind: 'condition-delimiter';
        /** Delimiter command. */
        readonly delimiter: 'else' | 'fi';
      }
    | {
        /** Possible generated setter, requiring a live binding for execution. */
        readonly kind: 'condition-assignment';
        /** Possible boolean name. */
        readonly name: string;
        /** Assigned value if binding is recognized. */
        readonly value: boolean;
      }
    | {
        /** Input occurrence. */
        readonly kind: 'input';
        /** Literal or unresolved virtual path. */
        readonly target: LiteralArgument;
      }
    | {
        /** Unsupported syntax region. */
        readonly kind: 'opaque';
        /** Source command responsible for limited recognition. */
        readonly command: string;
      }
  );
/** One independently scanned source file; even malformed source remains available. */
export interface ScannedFile extends SourceFile {
  /** Lossless ordered lexical partition, empty for empty source. */
  readonly tokens: readonly SourceToken[];

  /** Located facts in source order, then deterministic fact-kind order. */
  readonly facts: readonly SyntaxFact[];

  /** Recognized syntax coverage and localized diagnostics. */
  readonly coverage: Coverage;
}
/** Immutable source authority. No entry or configuration is needed to create it. */
export interface ProjectSnapshot {
  /** Representation discriminant. */
  readonly kind: 'snapshot';

  /** Identity derived from contents, paths, revisions, options, core and schema versions. */
  readonly id: SnapshotId;

  /** Core implementation version. */
  readonly coreVersion: string;

  /** Source-model schema version. */
  readonly schemaVersion: 1;

  /** Normalized scanner options. */
  readonly scanOptions: NormalizedScanOptions;

  /** Files in ascending UTF-16 path order. */
  readonly files: readonly ScannedFile[];
}
/** Atomic source change; conflicting or older revisions are rejected. */
export type ProjectSourceChange =
  | {
      /** Upsert discriminant. */
      readonly kind: 'upsert';
      /** Caller-owned replacement source. */
      readonly file: SourceFile;
    }
  | {
      /** Removal discriminant. */
      readonly kind: 'remove';
      /** Existing normalized or normalizable path. */
      readonly path: string;
    };
/** Named values, case-sensitive; names exclude the if prefix and primitives. */
export type BooleanValues = Readonly<Record<string, boolean>>;
/** Source tracking, permanent manual forcing, and initial seeds have distinct semantics. */
export type ConditionPolicy =
  | {
      /** Follow reached declarations and setters. */
      readonly mode: 'source';
      /** Seed values before entry; declarations reset them to false. */
      readonly initialValues?: BooleanValues;
    }
  | {
      /** Force only named values supplied here; omitted names are unknown. */
      readonly mode: 'manual';
      /** Permanent per-test named values. */
      readonly values: BooleanValues;
    }
  | {
      /** Track source and force specified names at each test. */
      readonly mode: 'source-with-overrides';
      /** Permanent per-test overrides. */
      readonly overrides: BooleanValues;
      /** Initial source state, reset by declarations. */
      readonly initialValues?: BooleanValues;
    };
/** Bounds on synchronous interpretation; hosts still own deadlines and scheduling. */
export interface ViewLimits {
  /** Maximum active input depth, including entry, default 64; maximum 256. */
  readonly maxInputDepth?: number;

  /** Total inclusions including entry, default 10000. */
  readonly maxOccurrences?: number;

  /** Conditional, scope, and structural nesting bound, default 256; maximum 512. */
  readonly maxNesting?: number;

  /** Selected UTF-16 code units, default 10000000. This is not a wall-clock bound. */
  readonly maxSelectedCodeUnits?: number;
}
/** Independent semantic configuration; output naming and visual filters are excluded. */
export interface ViewConfiguration {
  /** Entry virtual path. */
  readonly entryPath: string;

  /** Follow active literal inputs or stop at a file-only input; default project. */
  readonly traversal?: 'project' | 'file-only';

  /** Boolean policy; default source with no seeds. */
  readonly conditions?: ConditionPolicy;

  /** Supported grammar; default direct-latex-v1. */
  readonly profile?: InterpretationProfile;

  /** Optional resource bounds. */
  readonly limits?: ViewLimits;
}
/** Fully specified canonical view settings. */
export interface NormalizedViewConfiguration {
  /** Normalized entry. */
  readonly entryPath: string;

  /** Semantic input traversal. */
  readonly traversal: 'project' | 'file-only';

  /** Explicit normalized policy with sorted maps. */
  readonly conditions: ConditionPolicy;

  /** Interpretation grammar. */
  readonly profile: InterpretationProfile;

  /** All limits are present. */
  readonly limits: Required<ViewLimits>;
}
/** A repeated visit to a source file has its own inclusion identity. */
export interface InputOccurrence {
  /** View-local inclusion ID. */
  readonly id: OccurrenceId;

  /** Included source path. */
  readonly path: string;

  /** Parent inclusion, null for entry. */
  readonly parentId: OccurrenceId | null;

  /** Original input reference, null for entry. */
  readonly reference: SourceOrigin | null;
}
/** One evaluated or skipped test. Unknown is distinct from false and not-reached. */
export interface ConditionDecision {
  /** Original test occurrence. */
  readonly origin: SourceOrigin;

  /** Full control sequence name. */
  readonly command: string;

  /** Reached result or explicit skipped marker. */
  readonly outcome: 'true' | 'false' | 'unknown' | 'not-reached';

  /** Source state at this point; null means unknown or not reached. */
  readonly trackedValue: boolean | null;

  /** Effective value after policy; null means unknown or not reached. */
  readonly effectiveValue: boolean | null;
}
/** A recognized reached event, in execution order; source-only body facts are absent. */
export interface ReachedFact {
  /** Original immutable syntax fact. */
  readonly fact: SyntaxFact;

  /** This visit's source origin. */
  readonly origin: SourceOrigin;
}
/** A selected lexical token with distinct projected and original coordinates. */
export interface SelectedToken {
  /** Opaque stored syntax is a leaf; structural delimiters there never execute. */
  readonly interpretation: 'structure' | 'opaque';

  /** Lexical source token, keeping its original offsets. */
  readonly token: SourceToken;

  /** Original inclusion origin. */
  readonly origin: SourceOrigin;

  /** Inclusive offsets in the virtual token tape; not an emitted LaTeX string. */
  readonly projectedRange: SourceRange;
}
/** Common fields on configured structural nodes; these are not legacy AstNodes. */
export interface ConfiguredNodeBase {
  /** Original line/start/end extents with file revisions; no envelope across omitted gaps. */
  readonly location: NodeLocation;
  /** Exact configured view identity. */
  readonly viewId: ViewId;

  /** Deterministic node key unique within the view. */
  readonly occurrenceKey: string;

  /** Ordered contributing original spans; excludes all omitted gaps. */
  readonly origins: readonly SourceOrigin[];

  /** Inclusive range in the virtual selected token tape; empty root ends at -1. */
  readonly projectedRange: SourceRange;
}
/** Configured containers, with a complete ordered child list only in ready views. */
export type ConfiguredContainerNode = ConfiguredNodeBase &
  (
    | {
        /** Root variant. */
        readonly kind: 'root';
        /** Ordered children. */
        readonly children: readonly ConfiguredNode[];
      }
    | {
        /** Environment variant, including document. */
        readonly kind: 'environment';
        /** Exact located delimiters and whether argument adaptation would be required. */
        readonly syntax: ConfiguredEnvironmentSyntax;
        /** Literal name. */
        readonly name: string;
        /** Ordered children. */
        readonly children: readonly ConfiguredNode[];
      }
    | {
        /** Group variant. */
        readonly kind: 'group';
        /** Ordered children. */
        readonly children: readonly ConfiguredNode[];
      }
    | {
        /** Math variant. */
        readonly kind: 'math';
        /** Opening delimiter. */
        readonly delimiter: MathDelimiter;
        /** Ordered children. */
        readonly children: readonly ConfiguredNode[];
      }
    | {
        /** Section variant. */
        readonly kind: 'section';
        /** Heading title. */
        readonly name: string;
        /** Section depth 1–5. */
        readonly level: 1 | 2 | 3 | 4 | 5;
        /** Starred spelling. */
        readonly starred: boolean;
        /** Ordered children, including heading tokens. */
        readonly children: readonly ConfiguredNode[];
      }
  );
/** Exhaustive configured structure. Leaf tokens are never re-lexed across source joins. */
export type ConfiguredNode =
  | ConfiguredContainerNode
  | (ConfiguredNodeBase & {
      /** Leaf variant. */
      readonly kind: 'token';

      /** Exact selected lexical token. */
      readonly token: SourceToken;
    });
/** Fields shared by ready, incomplete, and blocked configured results. */
export interface ProjectViewBase {
  /** Original immutable source authority; transported views can be reconstructed from it. */
  readonly snapshot: ProjectSnapshot;
  /** Representation discriminant. */
  readonly kind: 'view';

  /** Identity includes snapshot and every semantic setting. */
  readonly id: ViewId;

  /** Source snapshot identity. */
  readonly snapshotId: SnapshotId;

  /** Canonical semantic settings. */
  readonly configuration: NormalizedViewConfiguration;

  /** Inclusion occurrences in encounter order. */
  readonly occurrences: readonly InputOccurrence[];

  /** Decisions up to the first unresolved/invalid required effect. */
  readonly decisions: readonly ConditionDecision[];

  /** Reached facts only, in execution order. */
  readonly reachedFacts: readonly ReachedFact[];

  /** Selected token tape, partial on failure; not a generated artifact. */
  readonly selectedTokens: readonly SelectedToken[];

  /** Supported grammar, assumptions, and limitations. */
  readonly coverage: Coverage;
}
/** A complete structural view or explicit failure with no invented partial AST. */
export type ProjectView = ProjectViewBase &
  (
    | {
        /** Ready discriminant. */
        readonly status: 'ready';
        /** Complete configured root. */
        readonly root: ConfiguredContainerNode & {
          /** Root-only discriminant. */
          readonly kind: 'root';
        };
      }
    | {
        /** Failure discriminant. */
        readonly status: 'incomplete' | 'blocked';
        /** No complete AST exists. */
        readonly root: null;
        /** First reason interpretation/structure could not complete. */
        readonly reason: ProjectIssue;
      }
  );
/** Explicit set of independent source files. No execution state is shared between files. */
export type SourceScope =
  | {
      /** Every supplied file. */
      readonly kind: 'all-files';
    }
  | {
      /** One or more explicitly requested source files. */
      readonly kind: 'files';
      /** Unique file paths; results use canonical path order. */
      readonly paths: readonly string[];
    };
/** Source inventory request; no entry, conditions, or output destination. */
export interface InventoryRequest {
  /** Source set; default all files. */
  readonly scope?: SourceScope;

  /** Fact categories; omitted means all; empty means none. */
  readonly kinds?: readonly SyntaxFact['kind'][];
}
/** Located source inventory with exact operation/source provenance. */
export interface InventoryResult {
  /** Result discriminant. */
  readonly kind: 'inventory';

  /** Exact snapshot. */
  readonly snapshotId: SnapshotId;

  /** Deterministic source/options/operation identity. */
  readonly resultId: string;

  /** Descriptor ID. */
  readonly operationId: 'source-inventory';

  /** Operation implementation version. */
  readonly operationVersion: 1;

  /** Facts sorted by file, offset, and category. */
  readonly facts: readonly SyntaxFact[];

  /** Coverage of the requested files. */
  readonly coverage: Coverage;
}
/** Public requests for independent inventory, interpretation, analysis, and transformation. */
export type OperationRequest =
  | NodeTransformationRequest
  | {
      /** Inventory operation. */
      readonly operation: 'source-inventory';
      /** Source options. */
      readonly options?: InventoryRequest;
    }
  | {
      /** Configured view operation. */
      readonly operation: 'resolve-view';
      /** Interpretation settings. */
      readonly options: ViewConfiguration;
    }
  | {
      /** Independent analysis; unused-command analysis also accepts source snapshots. */
      readonly operation: 'references' | 'unused-commands';
      /** Partial view observations require explicit opt-in; source scope is for source models only. */
      readonly options?: AnalysisOptions;
    }
  | {
      /** Exact source edit preview. */
      readonly operation: 'suppress-comments' | 'identity';
      /** Explicit source or selected-path target. */
      readonly options: {
        /** Inspect all requested source or only the configured selected path. */
        readonly target: 'source' | 'selected';
        /** Also remove recognized comment environments; default false. Verbatim remains protected. */
        readonly suppressCommentEnvironments?: boolean;
        /** Source-only scope; forbidden with a selected-path target. */
        readonly scope?: SourceScope;
        /** Maximum total preview size in UTF-16 code units; default 10,000,000, maximum 100,000,000. */
        readonly maxOutputCodeUnits?: number;
      };
    }
  | {
      /** Configured conditional materialization. */
      readonly operation: 'materialize';
      /** Output topology independent of traversal. */
      readonly options: {
        /** Selected-node actions; nonempty actions require inline output. */
        readonly nodeEdits?: readonly NodeEditAction[];
        /** Remove selected complete comment environments; default false. */
        readonly suppressCommentEnvironments?: boolean;
        /** Preserve input commands or expand active inclusion occurrences. */
        readonly inputs: 'preserve' | 'inline';
        /** Suppress eligible comments during export; default false. */
        readonly suppressComments?: boolean;
        /** Maximum total output UTF-16 units; default 10000000. */
        readonly maxOutputCodeUnits?: number;
      };
    }
  | {
      /** Export with explicit conditional retention and input arrangement. */
      readonly operation: 'export-project';
      /** Export semantics independent of the configured traversal. */
      readonly options: ExportOptions;
    };

/** Options shared by independently runnable analyses. */
export interface AnalysisOptions {
  /** Accept observations up to the view's failure boundary; default false. */
  readonly allowIncomplete?: boolean;
  /** Snapshot-only source scope; default all-files. */
  readonly scope?: SourceScope;
}

/** Output policies for a configured project. No filename rewriting is performed. */
export interface ExportOptions {
  /** Selected-node actions before final export; nonempty actions require materialize/inline output. */
  readonly nodeEdits?: readonly NodeEditAction[];
  /** Remove selected complete comment environments independently of percent suppression; default false. */
  readonly suppressCommentEnvironments?: boolean;
  /** Keep wrappers/inactive slices exactly, or export only resolved source. */
  readonly conditions: 'preserve' | 'materialize';
  /** Preserve input commands and relative files, or expand active occurrences. */
  readonly inputs: 'preserve' | 'inline';
  /** Remove eligible active comments; default false. */
  readonly suppressComments?: boolean;
  /** Total UTF-16 output limit across artifacts, default 10000000; maximum 100000000. */
  readonly maxOutputCodeUnits?: number;
}

/** Location for a source-only fact or configured occurrence. */
export interface AnalysisLocation extends SourceLocation {
  /** Exact source identity. */
  readonly snapshotId: SnapshotId;
  /** Inclusion ID, or null for independent source inspection. */
  readonly occurrenceId: OccurrenceId | null;
}

/** Reusable configured fact index in execution order. */
export interface ConfiguredIndex {
  /** Exact source identity. */
  readonly snapshotId: SnapshotId;
  /** Exact view identity. */
  readonly viewId: ViewId;
  /** Deterministic index identity including its implementation version. */
  readonly resultId: string;
  /** Reached labels, references, definitions, and command uses. */
  readonly entries: readonly ReachedFact[];
  /** Coverage includes the view's stop boundary and possible macro-generated syntax. */
  readonly coverage: Coverage;
}

/** One reference resolution observation; missing means no recognized target in covered source. */
export interface ReferenceResolution {
  /** Original reference occurrence. */
  readonly reference: SourceOrigin;
  /** Literal key, null for a generated/unresolved argument. */
  readonly key: string | null;
  /** Distinguishes matched, ambiguous, missing, and insufficient coverage. */
  readonly status: 'matched' | 'duplicate' | 'missing' | 'unresolved' | 'unknown-coverage';
  /** All recognized target occurrences in execution order. */
  readonly targets: readonly SourceOrigin[];
  /** Whether the sole matched target occurs later; null if not uniquely matched. */
  readonly forward: boolean | null;
}

/** Conservative per-definition command evidence; never permission to delete a definition. */
export interface CommandUsage {
  /** Defined name without the backslash. */
  readonly name: string;
  /** Source or configured definition occurrence. */
  readonly definition: AnalysisLocation;
  /** Direct document uses; ambiguous source bindings can appear in several candidates. */
  readonly directUses: readonly AnalysisLocation[];
  /** Uses inside other stored definitions/defaults. */
  readonly bodyReferences: readonly AnalysisLocation[];
  /** Self references are listed separately and are not root uses. */
  readonly selfReferences: readonly AnalysisLocation[];
  /** Qualified classification within the requested coverage. */
  readonly classification:
    | 'directly-used'
    | 'body-referenced'
    | 'self-recursive-only'
    | 'no-recognized-use'
    | 'ambiguous-binding';
}
/** Machine-readable operation requirements; descriptors contain no executable callbacks. */
export interface OperationDescriptor {
  /** Stable operation name. */
  readonly id: OperationRequest['operation'];

  /** Contract version. */
  readonly version: 1;

  /** Whether execution is shipped in this release. */
  readonly implemented: boolean;

  /** Required model, allowing a source or selected-path comment operation. */
  readonly representation: 'snapshot' | 'view' | 'either';

  /** Valid source/execution scopes. */
  readonly scopes: readonly ('all-files' | 'files' | 'configured')[];

  /** Required completeness. */
  readonly coverage: 'recognized' | 'ready-view';

  /** Output category. */
  readonly resultKind: 'inventory' | 'view' | 'findings' | 'edits' | 'artifacts' | 'transformation';
}
/** Structured operation ineligibility. */
export interface CapabilityReason {
  /** Stable reason. */
  readonly code:
    'not-implemented' | 'wrong-model' | 'view-not-ready' | 'missing-file' | 'edit-unavailable';

  /** Located edit failure when code is edit-unavailable; absent for model requirements. */
  readonly failure?: OperationFailure;

  /** Display explanation. */
  readonly message: string;
}
/** Eligibility result; execution enforces these same requirements. */
export type OperationCapability =
  | {
      /** Eligible. */
      readonly eligible: true;
      /** No reasons. */
      readonly reasons: readonly [];
    }
  | {
      /** Ineligible. */
      readonly eligible: false;
      /** Ordered reasons. */
      readonly reasons: readonly CapabilityReason[];
    };
/** A located analysis finding with explicit coverage qualifications. */
export interface AnalysisFinding {
  /** Stable finding code. */
  readonly code:
    | 'missing-reference'
    | 'duplicate-label'
    | 'forward-reference'
    | 'unresolved-key'
    | 'no-recognized-use';

  /** Forward references and unused candidates are information, not TeX errors. */
  readonly severity: 'information' | 'warning';

  /** Qualified explanation within the supported grammar. */
  readonly message: string;

  /** Primary occurrence. */
  readonly primary: AnalysisLocation;

  /** Related occurrences, in execution order. */
  readonly related: readonly AnalysisLocation[];
}
/** Exact dependencies shared by findings/edit/artifact results. */
export interface OperationProvenance {
  /** Exact source identity. */
  readonly snapshotId: SnapshotId;

  /** Exact configured identity, null for source-local work. */
  readonly viewId: ViewId | null;

  /** Typed operation and all of its semantic options. */
  readonly request: OperationRequest;

  /** Operation contract version. */
  readonly operationVersion: 1;
}

/** Analysis output with qualified findings and exact operation dependencies. */
export interface AnalysisResult {
  /** Exact source/view/operation/options result key. */
  readonly resultId: string;
  /** Analysis-result discriminant. */
  readonly kind: 'findings';
  /** Exact source, view, operation version, and options. */
  readonly provenance: OperationProvenance;
  /** Findings in reference encounter order or definition source/encounter order for command evidence. */
  readonly findings: readonly AnalysisFinding[];
  /** Explicit recognized coverage; an empty partial list does not establish absence. */
  readonly coverage: Coverage;
  /** Reference observations, empty for unused-command analysis. */
  readonly references: readonly ReferenceResolution[];
  /** Command evidence, empty for reference analysis. */
  readonly commands: readonly CommandUsage[];
}
/** Proposed source edit. Ordered by path and offset; touching replacements are allowed, overlaps are not. */
export type ProjectEdit =
  | {
      /** Replace/delete inclusive range; deletion uses empty replacement. */
      readonly kind: 'replace';
      /** Source path. */
      readonly path: string;
      /** Nonempty inclusive range. */
      readonly range: SourceRange;
      /** Exact old substring precondition. */
      readonly expected: string;
      /** Replacement source. */
      readonly replacement: string;
    }
  | {
      /** Insert between code units, including empty input/EOF. */
      readonly kind: 'insert';
      /** Source path. */
      readonly path: string;
      /** Offset from zero through source.length; never splits a surrogate pair. */
      readonly offset: number;
      /** Inserted source. */
      readonly text: string;
    };
/** Immutable proposal, not applied source. Equal-offset insertions and insertion/replacement overlap are rejected. */
export interface ProjectEditPlan {
  /** Edit result discriminant. */
  readonly kind: 'edits';

  /** Exact preconditions. */
  readonly provenance: OperationProvenance;

  /** Edits in ascending path/offset order; boundaries may not split a UTF-16 surrogate pair. */
  readonly edits: readonly ProjectEdit[];
}
/** Output mapping for a generated artifact; synthetic text has no original offset. */
export type ArtifactOrigin =
  | {
      /** Copied/rewritten source mapping. */
      readonly kind: 'source';
      /** Inclusive output range. */
      readonly outputRange: SourceRange;
      /** Contributing original ranges. */
      readonly origins: readonly AnalysisLocation[];
    }
  | {
      /** Inserted lexical delimiter or generated text. */
      readonly kind: 'synthetic';
      /** Inclusive output range. */
      readonly outputRange: SourceRange;
      /** Why this text exists. */
      readonly reason: string;
    };
/** Generated artifact, separate from source inputs. */
export interface GeneratedArtifact {
  /** Artifact virtual path in an independent namespace. */
  readonly path: string;

  /** Generated source string. */
  readonly source: string;

  /** Exact operation preconditions. */
  readonly provenance: OperationProvenance;

  /** Mappings ordered by output offset. They may overlap when identical output retains several inclusion origins. */
  readonly origins: readonly ArtifactOrigin[];

  /** Preserved literal dependencies; empty alone does not certify TeX portability. */
  readonly remainingInputs: readonly string[];

  /** Explicit export completeness claim. */
  readonly topology:
    | 'preserved-project'
    | 'active-inputs-expanded'
    | 'self-contained-profile'
    | 'independent-sources';
}

/** A retained input relationship in emitted source. */
export interface ArtifactDependency {
  /** Artifact containing the reference. */
  readonly fromPath: string;
  /** Exact literal spelling, or null for dynamic source. */
  readonly reference: string | null;
  /** Resolved artifact path, null when unresolved/missing/ambiguous. */
  readonly targetPath: string | null;
  /** Whether the output artifact set satisfies this literal relationship. */
  readonly status: 'present' | 'missing' | 'ambiguous' | 'dynamic' | 'invalid-path';
  /** Inclusive location in the emitted artifact, not an original offset. */
  readonly range: SourceRange;
}

/** Successful transformation preview/export, with sources unchanged. */
export interface TransformationResult {
  /** Result discriminant. */
  readonly kind: 'transformation';
  /** Exact operation/source/configuration result identity. */
  readonly resultId: string;
  /** Exact operation dependencies. */
  readonly provenance: OperationProvenance;
  /** Editable proposal for identity/comment operations; null for configured exports. */
  readonly editPlan: ProjectEditPlan | null;
  /** Preview/export files, in deterministic path order. */
  readonly artifacts: readonly GeneratedArtifact[];
  /** Entry artifact, null for independent source previews. */
  readonly entryPath: string | null;
  /** Remaining input relationships with emitted locations. */
  readonly dependencies: readonly ArtifactDependency[];
  /** Explicit source/view coverage and limited simplification. */
  readonly coverage: Coverage;
}

/** Executable analysis subset of the public operation union. */
export type AnalysisRequest = Extract<
  OperationRequest,
  {
    /** Select the executable analysis discriminants. */
    readonly operation: 'references' | 'unused-commands';
  }
>;
/** Executable transformation subset of the public operation union. */
export type TransformationRequest = Exclude<
  OperationRequest,
  | AnalysisRequest
  | {
      /** Exclude prerequisite-building operations from transformations. */
      readonly operation: 'source-inventory' | 'resolve-view';
    }
>;

/** Settings for a synchronous configured analysis/export pipeline. */
export interface ProjectPipelineOptions {
  /** Optional source scanning settings; omission uses scanner defaults. */
  readonly scanOptions?: ScanOptions;
  /** Required configuration with an entryPath; other fields use ViewConfiguration defaults. */
  readonly configuration: ViewConfiguration;
  /** Configured analyses in requested order; omission means none. Source file scopes are forbidden here. */
  readonly analyses?: readonly AnalysisRequest[];
  /** Required conditional retention and input topology; optional comment/output settings use ExportOptions defaults. */
  readonly exportOptions: ExportOptions;
}

/** Results from composing public operations; source and artifacts remain separate. */
export interface ProjectPipelineResult {
  /** Pipeline result discriminant. */
  readonly kind: 'pipeline';
  /** Frozen source authority created from the supplied files. */
  readonly snapshot: ProjectSnapshot;
  /** Configured view sharing this snapshot; non-exportable views throw before results are returned. */
  readonly view: ProjectView;
  /** Independent analysis results in request order; empty when none were requested. */
  readonly analyses: readonly AnalysisResult[];
  /** Generated export preview with exact mappings and dependency metadata. */
  readonly transformation: TransformationResult;
}

/** Located structured rejection of an analysis, edit, or export operation. */
export interface OperationFailure {
  /** Stable category, independent of explanatory prose. */
  readonly code: 'unavailable' | 'stale-result' | 'invalid-edit' | 'edit-conflict' | 'output-limit';
  /** Human-readable explanation. */
  readonly message: string;
  /** Relevant original locations; empty when no source range applies. */
  readonly locations: readonly AnalysisLocation[];
}

/** Narrow a configured node to the exhaustive container union. */
export function isConfiguredContainerNode(node: ConfiguredNode): node is ConfiguredContainerNode {
  return node.kind !== 'token';
}

/** Return nodes in depth-first source/execution order; the returned array is frozen. */
export function walkConfiguredNodes(root: ConfiguredNode): readonly ConfiguredNode[] {
  const result: ConfiguredNode[] = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    result.push(node);
    if (isConfiguredContainerNode(node)) {
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
    }
  }
  return Object.freeze(result);
}
