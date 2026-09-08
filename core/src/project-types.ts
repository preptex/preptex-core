import type { SourceFile, SourceRange, MathDelimiter } from './api-types.js';

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
/** Public operation requests; later-stage requests are explicitly unavailable in C1–C5. */
export type OperationRequest =
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
      /** Planned C6 analysis. */
      readonly operation: 'references' | 'unused-commands';
      /** No options in the initial analysis contract. */
      readonly options?: Readonly<Record<string, never>>;
    }
  | {
      /** Planned C7 edit preview. */
      readonly operation: 'suppress-comments';
      /** Explicit source or selected-path target. */
      readonly options: {
        /** Inspect all requested source or only the configured selected path. */
        readonly target: 'source' | 'selected';
        /** Source-only scope; forbidden with a selected-path target. */
        readonly scope?: SourceScope;
      };
    }
  | {
      /** Planned C7 export. */
      readonly operation: 'materialize';
      /** Output topology independent of traversal. */
      readonly options: {
        /** Preserve input commands or expand active inclusion occurrences. */
        readonly inputs: 'preserve' | 'inline';
      };
    };
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
  readonly resultKind: 'inventory' | 'view' | 'findings' | 'edits' | 'artifacts';
}
/** Structured operation ineligibility. */
export interface CapabilityReason {
  /** Stable reason. */
  readonly code: 'not-implemented' | 'wrong-model' | 'view-not-ready' | 'missing-file';

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
/** A future analysis finding contract; C6 implements the analyses. */
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
  readonly primary: SourceOrigin;

  /** Related occurrences, in execution order. */
  readonly related: readonly SourceOrigin[];
}
/** Exact dependencies shared by future findings/edit/artifact results. */
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

/** Future C6 analysis output with qualified findings and exact operation dependencies. */
export interface AnalysisResult {
  /** Analysis-result discriminant. */
  readonly kind: 'findings';
  /** Exact source, view, operation version, and options. */
  readonly provenance: OperationProvenance;
  /** Findings in execution order, then stable code order at one location. */
  readonly findings: readonly AnalysisFinding[];
  /** Explicit recognized coverage; an empty partial list does not establish absence. */
  readonly coverage: Coverage;
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
/** Output mapping for a later generated artifact; synthetic text has no original offset. */
export type ArtifactOrigin =
  | {
      /** Copied/rewritten source mapping. */
      readonly kind: 'source';
      /** Inclusive output range. */
      readonly outputRange: SourceRange;
      /** Contributing original ranges. */
      readonly origins: readonly SourceOrigin[];
    }
  | {
      /** Inserted lexical delimiter or generated text. */
      readonly kind: 'synthetic';
      /** Inclusive output range. */
      readonly outputRange: SourceRange;
      /** Why this text exists. */
      readonly reason: string;
    };
/** Future C7 artifact contract, separate from source inputs. */
export interface GeneratedArtifact {
  /** Artifact virtual path in an independent namespace. */
  readonly path: string;

  /** Generated source string. */
  readonly source: string;

  /** Exact operation preconditions. */
  readonly provenance: OperationProvenance;

  /** Ordered output mappings. */
  readonly origins: readonly ArtifactOrigin[];

  /** Preserved literal dependencies; empty alone does not certify TeX portability. */
  readonly remainingInputs: readonly string[];

  /** Explicit export completeness claim. */
  readonly topology: 'preserved-project' | 'active-inputs-expanded' | 'self-contained-profile';
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
