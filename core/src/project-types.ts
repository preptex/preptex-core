import type { SourceFile, SourceRange, MathDelimiter } from './api-types.js';
import type {
  EnvironmentSelection,
  NodeLocation,
  NodeSelection,
  ConfiguredEnvironmentSyntax,
  NodeTransformationRequest,
  NodeEditAction,
  SymbolRefactorRequest,
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
  | 'unrealized-condition'
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
/** Lexical category of an unconditional source token. */
export type SourceTokenKind = 'comment' | 'space' | 'command' | 'open' | 'close' | 'math' | 'text';
/** A lossless lexical segment. Concatenating values reproduces the source exactly. */
export interface SourceToken {
  /** Zero-based index in the owning file's token stream. */
  readonly index: number;

  /** Lexical category; tokenizes raw source unconditionally without macro/verbatim state. */
  readonly kind: SourceTokenKind;

  /** Exact source substring. */
  readonly value: string;

  /** Command name without leading `\`, or `""` when `kind !== 'command'`. */
  readonly name: string;

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
        /** Inclusive range of the defined control sequence name without leading `\`, null if unrecognized. */
        readonly nameRange: SourceRange | null;
        /** Source declaration command. */
        readonly form: string;
        /** Starred LaTeX form. */
        readonly starred: boolean;
        /** Parameters/optional defaults in source order. */
        readonly arguments: readonly SourceRange[];
        /** Parsed parameter count (0–9). */
        readonly numArgs: number;
        /** Optional default value text for `#1`, or null. */
        readonly defaultArg: string | null;
        /** Body interior, null for unsupported forms. */
        readonly body: SourceRange | null;
      }
    | {
        /** Environment definition variant (`\newenvironment`, `\renewenvironment`, `\newtheorem`). */
        readonly kind: 'environment-definition';
        /** Defined environment name, null if unrecognized. */
        readonly name: string | null;
        /** Inclusive range of the environment name inside `{...}`, null if unrecognized. */
        readonly nameRange: SourceRange | null;
        /** Source declaration command. */
        readonly form: string;
        /** Starred LaTeX form. */
        readonly starred: boolean;
        /** Optional `[numArgs]`, `[default]`, or theorem counter brackets. */
        readonly arguments: readonly SourceRange[];
        /** Parsed parameter count (0–9). */
        readonly numArgs: number;
        /** Optional default value text for `#1`, or null. */
        readonly defaultArg: string | null;
        /** Begin-definition body (or theorem caption) interior range, null if missing. */
        readonly beginBody: SourceRange | null;
        /** End-definition body interior range, null for `\newtheorem` or missing body. */
        readonly endBody: SourceRange | null;
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
        readonly command: 'ref' | 'pageref' | 'eqref' | 'autoref' | 'cref' | 'Cref';
        /** Primary literal or unresolved target key. */
        readonly key: LiteralArgument;
        /** Individual keys parsed from comma-separated references (e.g. `\cref{a,b}`). */
        readonly keys: readonly LiteralArgument[];
      }
    | {
        /** Bibliography entry declaration (`\bibitem`). */
        readonly kind: 'bibitem';
        /** Optional `[label]` bracket range when present. */
        readonly optionalLabel: SourceRange | null;
        /** Literal or unresolved citation key. */
        readonly key: LiteralArgument;
      }
    | {
        /** Citation occurrence (`\cite`, `\citep`, `\citet`, etc.). */
        readonly kind: 'citation';
        /** Citation command name without backslash. */
        readonly command: string;
        /** Starred LaTeX form. */
        readonly starred: boolean;
        /** Individual citation keys parsed from comma-separated lists. */
        readonly keys: readonly LiteralArgument[];
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
/** Source tracking, permanent manual forcing, initial seeds, and condition-free assertions have distinct semantics. */
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
    }
  | {
      /** Assert no conditionals exist in the reached source; any conditional syntax stops with unrealized-condition. */
      readonly mode: 'none';
    }
  | {
      /** Do not evaluate or strip conditionals; visit all branches and treat conditional commands as ordinary commands. */
      readonly mode: 'ignore';
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
/** Request for condition-only source realization without structural AST construction. */
export interface ConditionRealizationRequest {
  /** Entry virtual path; optional when snapshot has a single file, main.tex, or traversal is file-only. */
  readonly entryPath?: string;

  /** Follow active literal inputs across project files, or evaluate files independently; default 'project'. */
  readonly traversal?: 'project' | 'file-only';

  /** Target files when traversal is 'file-only'; defaults to all files, or [entryPath] when entryPath is provided. */
  readonly scope?: SourceScope;

  /** Boolean condition evaluation policy; default { mode: 'source' }. */
  readonly conditions?: ConditionPolicy;

  /** Preserve active \input{...} commands across separate realized files, or inline active inputs into the entry artifact; default 'preserve'. */
  readonly inputs?: 'preserve' | 'inline';

  /** Strip \newif\ifX and reached [\global]\Xtrue/\Xfalse assignments along with \if.../\else/\fi; default true. */
  readonly stripDeclarationsAndSetters?: boolean;

  /** Optional interpretation resource bounds. */
  readonly limits?: ViewLimits;

  /** Maximum total output size in UTF-16 code units; default 10,000,000, maximum 100,000,000. */
  readonly maxOutputCodeUnits?: number;
}
/** Condition-realized source output with edit plans, artifacts, and condition decisions. */
export interface ConditionRealizationResult {
  /** Result discriminant. */
  readonly kind: 'condition-realization';

  /** Exact source snapshot identity. */
  readonly snapshotId: SnapshotId;

  /** Deterministic result identity. */
  readonly resultId: string;

  /** Complete condition realization, or incomplete/blocked when a condition or input could not be resolved. */
  readonly status: 'ready' | 'incomplete' | 'blocked';

  /** First blocking or incomplete issue, or null when status is 'ready'. */
  readonly reason: ProjectIssue | null;

  /** Exact operation provenance. */
  readonly provenance: OperationProvenance;

  /** Inclusion occurrences visited during condition traversal. */
  readonly occurrences: readonly InputOccurrence[];

  /** Condition decisions in encounter order. */
  readonly decisions: readonly ConditionDecision[];

  /** Per-file source edit plan when inputs === 'preserve' and status === 'ready'; otherwise null. */
  readonly editPlan: ProjectEditPlan | null;

  /** Realized LaTeX artifacts in deterministic path order when status === 'ready'; empty on failure. */
  readonly artifacts: readonly GeneratedArtifact[];

  /** Remaining input relationships in emitted artifacts. */
  readonly dependencies: readonly ArtifactDependency[];

  /** Coverage and encountered issues. */
  readonly coverage: Coverage;
}
/** Parameter specification for a recognized or custom LaTeX command signature. */
export interface CustomCommandParameterSpec {
  /** Whether the argument is `[optional]` or mandatory. */
  readonly kind: 'optional' | 'mandatory';
  /** Whether mandatory argument requires `{...}` braces or accepts a single TeX token. */
  readonly form: 'braced' | 'tex-arg';
  /** Whether the interior is non-executed opaque content rather than parsed structural AST. */
  readonly opaque: boolean;
}

/** User-supplied command signature for parsing undefined or overridden commands. */
export interface CustomCommandSignature {
  /** Command name without leading `\`. */
  readonly name: string;
  /** Number of mandatory `{...}` / TeX arguments (0–9). */
  readonly mandatoryArgs: number;
  /** Number of leading optional `[...]` arguments (0–9, default 0). */
  readonly optionalArgs?: number;
  /** Optional explicit parameter sequence overriding `mandatoryArgs`/`optionalArgs`. */
  readonly params?: readonly CustomCommandParameterSpec[];
  /** Whether a starred form (`\cmd*`) is recognized; default true. */
  readonly allowStar?: boolean;
  /** Whether arguments are opaque keys rather than parsed LaTeX text; default false. */
  readonly opaque?: boolean;
}

/** How `\input{...}` commands are handled during view interpretation. */
export type ViewInputMode = 'command' | 'recursive' | 'inline';

/** Independent semantic configuration; output naming and visual filters are excluded. */
export interface ViewConfiguration {
  /** Entry virtual path. */
  readonly entryPath: string;

  /** Follow active literal inputs or stop at a file-only input; default project. */
  readonly traversal?: 'project' | 'file-only';

  /** How `\input{...}` commands are handled: as ordinary commands (`'command'`), followed recursively (`'recursive'`), or spliced directly (`'inline'`). */
  readonly inputs?: ViewInputMode;

  /** Boolean policy; default source with no seeds. */
  readonly conditions?: ConditionPolicy;

  /** Supported grammar; default direct-latex-v1. */
  readonly profile?: InterpretationProfile;

  /** Optional resource bounds. */
  readonly limits?: ViewLimits;

  /** Automatically infer command signatures from reached `\newcommand`/`\renewcommand`/`\providecommand`/`\def` declarations; default true. */
  readonly inferDefinedCommands?: boolean;

  /** User-supplied command signatures for undefined or overridden commands, sorted deterministically. */
  readonly customCommands?: readonly CustomCommandSignature[];
}
/** Fully specified canonical view settings. */
export interface NormalizedViewConfiguration {
  /** Normalized entry. */
  readonly entryPath: string;

  /** Semantic input traversal. */
  readonly traversal: 'project' | 'file-only';

  /** Normalized input handling mode when specified. */
  readonly inputs?: ViewInputMode;

  /** Explicit normalized policy with sorted maps. */
  readonly conditions: ConditionPolicy;

  /** Interpretation grammar. */
  readonly profile: InterpretationProfile;

  /** All limits are present. */
  readonly limits: Required<ViewLimits>;

  /** Whether reached command definitions infer argument signatures. */
  readonly inferDefinedCommands: boolean;

  /** Canonical sorted custom command signatures. */
  readonly customCommands: readonly CustomCommandSignature[];
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
  /** Opaque stored syntax or active verbatim region is a leaf; structural delimiters there never execute. */
  readonly interpretation: 'structure' | 'opaque' | 'verbatim';

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
/**
 * One present optional or mandatory argument attached to a configured command or section heading.
 * Original positions use {@link NodeLocation} so conditional and input gaps are never bridged.
 */
export interface ConfiguredCommandArgument {
  /** Argument role in the command signature. */
  readonly kind: 'optional' | 'mandatory';
  /** Zero-based parameter slot index in the command signature. */
  readonly slot: number;
  /** Whether the interior tokens are non-executed opaque leaves rather than parsed AST nodes. */
  readonly opaque: boolean;
  /** Original extent including enclosing `[...]` or `{...}` delimiters when present. */
  readonly location: NodeLocation;
  /** Original extent of the interior content alone (`kind: 'none'` for empty delimiters). */
  readonly innerLocation: NodeLocation;
  /** Inclusive range in the virtual selected token tape including delimiters. */
  readonly projectedRange: SourceRange;
  /** Inclusive range of the interior content in the virtual tape (`end = start - 1` when empty). */
  readonly innerProjectedRange: SourceRange;
  /** Inclusive index in `children` of this argument's first node. */
  readonly childStart: number;
  /** Inclusive index in `children` of this argument's last node. */
  readonly childEnd: number;
}
/** Source delimiter syntax enclosing a configured argument node. */
export type ConfiguredArgumentDelimiter = 'braced' | 'bracket' | 'bare';

/** Explicit argument container attached as a child of a command, section, or environment node. */
export type ConfiguredArgumentNode = ConfiguredNodeBase & {
  /** Argument container variant. */
  readonly kind: 'argument';
  /** Argument role in the parent signature. */
  readonly argKind: 'optional' | 'mandatory';
  /** Zero-based parameter slot index in the parent signature. */
  readonly slot: number;
  /** Whether interior tokens are non-executed opaque leaves. */
  readonly opaque: boolean;
  /** Enclosing delimiter syntax in source. */
  readonly delimiter: ConfiguredArgumentDelimiter;
  /** Original extent of the interior content alone (`kind: 'none'` for empty delimiters). */
  readonly innerLocation: NodeLocation;
  /** Inclusive range of the interior content in the virtual token tape. */
  readonly innerProjectedRange: SourceRange;
  /** Ordered children: opening delimiter (if delimited), interior nodes, closing delimiter (if delimited). */
  readonly children: readonly ConfiguredNode[];
};

/** Configured containers, with a complete ordered child list only in ready views. */
export type ConfiguredContainerNode =
  | ConfiguredArgumentNode
  | (ConfiguredNodeBase &
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
            /** Parsed optional/mandatory arguments immediately following `\begin{name}`. */
            readonly arguments: readonly ConfiguredCommandArgument[];
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
            /** Present heading arguments (`[short]` and mandatory title) in source order. */
            readonly arguments: readonly ConfiguredCommandArgument[];
            /** Ordered children, including heading tokens/nodes followed by body nodes. */
            readonly children: readonly ConfiguredNode[];
          }
        | {
            /** Known-signature command invocation with parsed arguments. */
            readonly kind: 'command';
            /** Command name without leading `\`. */
            readonly name: string;
            /** Starred spelling (`\cmd*`). */
            readonly starred: boolean;
            /** Present optional and mandatory arguments in source order. */
            readonly arguments: readonly ConfiguredCommandArgument[];
            /** Ordered children: command token, optional `*` token, and argument nodes. */
            readonly children: readonly ConfiguredNode[];
          }
      ));
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
/** Request for expanding or flattening `\input{...}` commands into target file contents. */
export interface ExpandInputsRequest {
  /** Operation discriminant. */
  readonly operation: 'expand-inputs';
  /** Expansion mode, target scope, entry path, and output limit. */
  readonly options: {
    /** `'single'` expands direct `\input` commands in the entry file; `'recursive'` flattens transitively. */
    readonly mode: 'single' | 'recursive';
    /** `'selected'` or `'source'` produce editable source edits; `'artifact'` emits exported artifacts; default `'selected'`. */
    readonly target?: 'selected' | 'source' | 'artifact';
    /** Entry virtual path when running on a snapshot or overriding target file; defaults to `'main.tex'` or single file. */
    readonly entryPath?: string;
    /** Total UTF-16 output limit, default 10000000; maximum 100000000. */
    readonly maxOutputCodeUnits?: number;
  };
}

/** Single step permitted inside {@link CompositeTransformationRequest}. */
export type CompositeStepRequest =
  | NodeTransformationRequest
  | SymbolRefactorRequest
  | ExpandInputsRequest
  | {
      /** Condition realization step discriminant. */
      readonly operation: 'realize-conditions';
      /** Condition realization request options. */
      readonly options: ConditionRealizationRequest;
    }
  | {
      /** Comment suppression step discriminant. */
      readonly operation: 'suppress-comments';
      /** Comment suppression options. */
      readonly options?: {
        /** Target scope: `'selected'` (realized view) or `'source'` (source files and all branches). */
        readonly target?: 'selected' | 'source';
        /** Also strip `comment` environments; default false. */
        readonly suppressCommentEnvironments?: boolean;
        /** Optional entry file when scoping `'source'` edits. */
        readonly entryPath?: string;
        /** Optional input traversal scope (`'project'` or `'file-only'`) when scoping `'source'` edits with `entryPath`. */
        readonly traversal?: 'project' | 'file-only';
        /** Total UTF-16 output limit. */
        readonly maxOutputCodeUnits?: number;
      };
    }
  | {
      /** Project export step discriminant (permitted only as the final step). */
      readonly operation: 'export-project';
      /** Export topology and cleanup options. */
      readonly options: ExportOptions;
    };

/** Composable multi-step transformation pipeline request. */
export interface CompositeTransformationRequest {
  /** Operation discriminant. */
  readonly operation: 'compose-transformations';
  /** Pipeline configuration, ordered steps, and output size limit. */
  readonly options: {
    /** View configuration used when resolving intermediate views. */
    readonly configuration?: ViewConfiguration;
    /** Ordered sequence of 1–100 transformation steps. */
    readonly steps: readonly CompositeStepRequest[];
    /** Total UTF-16 output limit, default 10000000; maximum 100000000. */
    readonly maxOutputCodeUnits?: number;
  };
}

/** Public requests for independent inventory, condition realization, interpretation, analysis, and transformation. */
export type OperationRequest =
  | NodeTransformationRequest
  | SymbolRefactorRequest
  | ExpandInputsRequest
  | CompositeTransformationRequest
  | {
      /** Inventory operation. */
      readonly operation: 'source-inventory';
      /** Source options. */
      readonly options?: InventoryRequest;
    }
  | {
      /** Condition-only source realization on a project snapshot. */
      readonly operation: 'realize-conditions';
      /** Condition realization settings. */
      readonly options: ConditionRealizationRequest;
    }
  | {
      /** Configured view operation. */
      readonly operation: 'resolve-view';
      /** Interpretation settings. */
      readonly options: ViewConfiguration;
    }
  | {
      /** Independent structural analysis over a realized ProjectView. */
      readonly operation: 'references' | 'unused-commands';
      /** Partial view observations require explicit opt-in. */
      readonly options?: AnalysisOptions;
    }
  | {
      /** Configured or source-wide comment suppression. */
      readonly operation: 'suppress-comments';
      /** Comment suppression options. */
      readonly options?: {
        /** Inspect the configured selected path (`'selected'`, default) or source files and all branches (`'source'`). */
        readonly target?: 'selected' | 'source';
        /** Also remove recognized comment environments; default false. Verbatim remains protected. */
        readonly suppressCommentEnvironments?: boolean;
        /** Optional entry file when scoping `'source'` edits. */
        readonly entryPath?: string;
        /** Optional input traversal scope (`'project'` or `'file-only'`) when scoping `'source'` edits with `entryPath`. */
        readonly traversal?: 'project' | 'file-only';
        /** Maximum total preview size in UTF-16 code units; default 10,000,000, maximum 100,000,000. */
        readonly maxOutputCodeUnits?: number;
      };
    }
  | {
      /** Export a realized ProjectView or snapshot with explicit input arrangement. */
      readonly operation: 'export-project';
      /** Export semantics independent of the configured traversal. */
      readonly options: ExportOptions;
    };

/** Options shared by independently runnable configured analyses. */
export interface AnalysisOptions {
  /** Accept observations up to the view's failure boundary; default false. */
  readonly allowIncomplete?: boolean;
}

/** Output policies for a configured project. No filename rewriting is performed. */
export interface ExportOptions {
  /** Selected-node actions before final export; nonempty actions require inline output. */
  readonly nodeEdits?: readonly NodeEditAction[];
  /** Remove selected complete comment environments independently of percent suppression; default false. */
  readonly suppressCommentEnvironments?: boolean;
  /** Preserve input commands and relative files, or expand active occurrences. */
  readonly inputs: 'preserve' | 'inline';
  /** Remove eligible active comments; default false. */
  readonly suppressComments?: boolean;
  /** Entry virtual path when exporting directly from a ProjectSnapshot; defaults to 'main.tex' or single file. */
  readonly entryPath?: string;
  /** Input traversal policy when exporting directly from a ProjectSnapshot; default 'project'. */
  readonly traversal?: 'project' | 'file-only';
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

  /** Required model representation. */
  readonly representation: 'snapshot' | 'view';

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

/** Category of a node in a readable {@link CoarseTree} projection. */
export type CoarseNodeKind =
  'root' | 'section' | 'environment' | 'command' | 'argument' | 'math' | 'group' | 'text-block';

/** Options controlling how {@link buildCoarseViewTree} simplifies a {@link ProjectView}. */
export interface CoarseTreeOptions {
  /** Include structural sections (`\section`..`\subparagraph`); default true. */
  readonly includeSections?: boolean;
  /** Include environments (`\begin{...}...\end{...}`); default true. */
  readonly includeEnvironments?: boolean;
  /** Environment names to include; omit to include all environments. */
  readonly environmentFilter?: readonly string[];
  /** Include project-introduced (`\newcommand`/`\def`) and used-undefined commands; default true. */
  readonly includeCustomAndUndefinedCommands?: boolean;
  /** Include `\input` commands and recursive inclusion containers; default true. */
  readonly includeInputs?: boolean;
  /** Include standard built-in inline/formatting commands (`\textbf`, `\emph`, `\cite`, `\ref`); default false. */
  readonly includeBuiltinCommands?: boolean;
  /** Specific command names to always include regardless of built-in status. */
  readonly commandFilter?: readonly string[];
  /** Include command/environment arguments as child nodes; default true. */
  readonly includeArguments?: boolean;
  /** Include inline and display math blocks (`$...$`, `$$...$$`, `\(`, `\[`); default false. */
  readonly includeMath?: boolean;
  /** Include display math (`$$...$$`, `\[...\]`) while hiding inline `$x$`; default false. */
  readonly includeDisplayMath?: boolean;
  /** Include anonymous `{...}` brace groups as container nodes; default false (hoists structural children). */
  readonly includeGroups?: boolean;
  /** Coalesce top-level prose runs into summarized `text-block` nodes; default false. */
  readonly includeTextBlocks?: boolean;
  /** Maximum character length for `previewText` snippets; default 80 (1–1000). */
  readonly maxPreviewLength?: number;
}

/** Normalized coarse-tree options stored on {@link CoarseTree}. */
export interface NormalizedCoarseTreeOptions {
  /** Include structural sections. */
  readonly includeSections: boolean;
  /** Include environments. */
  readonly includeEnvironments: boolean;
  /** Normalized environment name filter, or null when unfiltered. */
  readonly environmentFilter: readonly string[] | null;
  /** Include project-introduced and used-undefined commands. */
  readonly includeCustomAndUndefinedCommands: boolean;
  /** Include `\input` commands and recursive inclusion containers. */
  readonly includeInputs: boolean;
  /** Include standard built-in commands. */
  readonly includeBuiltinCommands: boolean;
  /** Normalized command name filter, or null when unfiltered. */
  readonly commandFilter: readonly string[] | null;
  /** Include command/environment arguments as child nodes. */
  readonly includeArguments: boolean;
  /** Include all math nodes. */
  readonly includeMath: boolean;
  /** Include display math nodes. */
  readonly includeDisplayMath: boolean;
  /** Include anonymous brace groups. */
  readonly includeGroups: boolean;
  /** Coalesce inline prose into `text-block` nodes. */
  readonly includeTextBlocks: boolean;
  /** Maximum snippet character length. */
  readonly maxPreviewLength: number;
}

/** One node in a readable {@link CoarseTree} projection derived from a ready {@link ProjectView}. */
export interface CoarseNode {
  /** Deterministic node key matching `occurrenceKey` or a synthetic block ID. */
  readonly id: string;
  /** Underlying `ConfiguredNode.occurrenceKey`, or null for a coalesced `text-block`. */
  readonly occurrenceKey: string | null;
  /** Ready-to-use `NodeSelection` for single-node edit operations, or null for root/synthetic nodes. */
  readonly selection: NodeSelection | null;
  /** Coarse node category. */
  readonly kind: CoarseNodeKind;
  /** Primary display name (section title, environment name, command name, `[#1]`, `{#1}`, or math delimiter). */
  readonly name: string;
  /** Concise plain-text summary of interior content or short title. */
  readonly previewText: string;
  /** Section depth 1–5 when `kind === 'section'`. */
  readonly sectionLevel?: 1 | 2 | 3 | 4 | 5;
  /** Starred status for sections or commands. */
  readonly starred?: boolean;
  /** Argument metadata when `kind === 'argument'`. */
  readonly argumentInfo?: {
    /** Optional vs. mandatory role. */
    readonly argKind: 'optional' | 'mandatory';
    /** Zero-based parameter slot index. */
    readonly slot: number;
    /** Source delimiter form. */
    readonly delimiter: ConfiguredArgumentDelimiter;
    /** Whether interior tokens are opaque leaves. */
    readonly opaque: boolean;
  };
  /** Whether this node's name can be directly edited (`environment`, `command`, `section`). */
  readonly editableName: boolean;
  /** Exact source location(s) in the owning snapshot. */
  readonly location: NodeLocation;
  /** Inclusive range in the virtual selected token tape. */
  readonly projectedRange: SourceRange;
  /** Filtered coarse structural children. */
  readonly children: readonly CoarseNode[];
}

/** Readable structural projection of a ready {@link ProjectView}. */
export interface CoarseTree {
  /** Result discriminant. */
  readonly kind: 'coarse-tree';
  /** Exact source snapshot identity. */
  readonly snapshotId: SnapshotId;
  /** Exact configured view identity. */
  readonly viewId: ViewId;
  /** Deterministic coarse-tree result identity. */
  readonly resultId: string;
  /** Normalized options used to build this tree. */
  readonly options: NormalizedCoarseTreeOptions;
  /** Coarse root node. */
  readonly root: CoarseNode;
  /** Total number of nodes in the coarse tree. */
  readonly nodeCount: number;
}

/** One command definition site in {@link ProjectCatalog}. */
export interface CommandDefinitionItem {
  /** File-local fact identifier. */
  readonly id: string;
  /** Defined command name without leading `\`. */
  readonly name: string;
  /** Declaration form (`newcommand`, `renewcommand`, `providecommand`, `def`). */
  readonly form: string;
  /** Starred form flag. */
  readonly starred: boolean;
  /** Total parameter count (0–9). */
  readonly numArgs: number;
  /** Default value for optional `#1`, or null. */
  readonly defaultArg: string | null;
  /** Source/configured definition location. */
  readonly location: AnalysisLocation;
  /** Range of command name without leading `\`, or null if unrecognized. */
  readonly nameRange: SourceRange | null;
  /** Argument spec ranges in declaration order. */
  readonly arguments: readonly SourceRange[];
  /** Interior range of definition body, or null. */
  readonly bodyRange: SourceRange | null;
  /** Raw source string of definition body, or null. */
  readonly bodySource: string | null;
}

/** One command usage occurrence in {@link ProjectCatalog}. */
export interface CommandOccurrenceItem {
  /** Occurrence location. */
  readonly location: AnalysisLocation;
  /** Exact range of `\<name>` token. */
  readonly commandTokenRange: SourceRange;
  /** Full invocation range including parsed arguments when available. */
  readonly fullRange: SourceRange;
  /** View-bound selection when inspected against a ready view, else null. */
  readonly selection: NodeSelection | null;
  /** Starred invocation flag. */
  readonly starred: boolean;
  /** Ranges of parsed arguments when available. */
  readonly argumentRanges: readonly SourceRange[];
  /** Whether occurrence lies inside a definition body. */
  readonly inDefinitionBody: boolean;
  /** Whether occurrence lies inside an opaque command argument. */
  readonly inOpaqueArgument: boolean;
}

/** Catalog entry grouping definitions and occurrences for one command name. */
export interface CatalogCommandEntry {
  /** Command name without leading `\`. */
  readonly name: string;
  /** Usage/definition classification. */
  readonly category: 'introduced-used' | 'introduced-unused' | 'used-undefined' | 'used-builtin';
  /** Resolved signature metadata. */
  readonly signature: {
    /** Origin of the active signature. */
    readonly source: 'builtin' | 'inferred-definition' | 'user-override' | 'none';
    /** Number of mandatory arguments. */
    readonly mandatoryArgs: number;
    /** Number of optional arguments. */
    readonly optionalArgs: number;
    /** Whether `*` modifier is accepted. */
    readonly allowStar: boolean;
  };
  /** All definition sites for this command. */
  readonly definitions: readonly CommandDefinitionItem[];
  /** All usage occurrences in encounter order. */
  readonly occurrences: readonly CommandOccurrenceItem[];
  /** Whether global renaming is safely supported. */
  readonly canRenameGlobally: boolean;
}

/** One environment definition site in {@link ProjectCatalog}. */
export interface EnvironmentDefinitionItem {
  /** File-local fact identifier. */
  readonly id: string;
  /** Defined environment name. */
  readonly name: string;
  /** Declaration form (`newenvironment`, `renewenvironment`, `newtheorem`). */
  readonly form: string;
  /** Starred form flag. */
  readonly starred: boolean;
  /** Total parameter count (0–9). */
  readonly numArgs: number;
  /** Default value for optional `#1`, or null. */
  readonly defaultArg: string | null;
  /** Definition location. */
  readonly location: AnalysisLocation;
  /** Range of environment name inside `{...}`, or null. */
  readonly nameRange: SourceRange | null;
  /** Begin-definition body (or theorem caption) range, or null. */
  readonly beginBodyRange: SourceRange | null;
  /** End-definition body range, or null. */
  readonly endBodyRange: SourceRange | null;
}

/** One environment occurrence in {@link ProjectCatalog}. */
export interface EnvironmentOccurrenceItem {
  /** Environment occurrence location. */
  readonly location: AnalysisLocation;
  /** View-bound selection when inspected against a ready view, else null. */
  readonly selection: NodeSelection | null;
  /** Snapshot-level environment selection, or null. */
  readonly environmentSelection: EnvironmentSelection | null;
  /** Opening delimiter name range, or null. */
  readonly openingNameRange: SourceRange | null;
  /** Closing delimiter name range, or null. */
  readonly closingNameRange: SourceRange | null;
  /** Whether arguments follow `\begin{name}`. */
  readonly hasArguments: boolean;
  /** Whether opening and closing delimiters are matched. */
  readonly status: 'matched' | 'candidate';
}

/** Catalog entry grouping definitions and occurrences for one environment name. */
export interface CatalogEnvironmentEntry {
  /** Environment name. */
  readonly name: string;
  /** Usage/definition classification. */
  readonly category: 'introduced-used' | 'introduced-unused' | 'used-undefined' | 'used-standard';
  /** All definition sites for this environment. */
  readonly definitions: readonly EnvironmentDefinitionItem[];
  /** All `\begin{name}...\end{name}` occurrences. */
  readonly occurrences: readonly EnvironmentOccurrenceItem[];
  /** Whether global renaming is safely supported. */
  readonly canRenameGlobally: boolean;
}

/** Catalog entry grouping declaration, test, and setter occurrences for one condition. */
export interface CatalogConditionEntry {
  /** Condition flag name without `if` prefix (or full name for primitives/literals). */
  readonly name: string;
  /** Condition classification. */
  readonly category:
    'introduced-used' | 'introduced-unused' | 'used-undeclared' | 'primitive' | 'literal';
  /** `\newif\if<name>` declarations. */
  readonly declarations: readonly {
    /** Declaration location. */
    readonly location: AnalysisLocation;
    /** Range of `if<name>` target token without leading `\`. */
    readonly targetNameRange: SourceRange;
  }[];
  /** Conditional test occurrences. */
  readonly tests: readonly {
    /** Test location. */
    readonly location: AnalysisLocation;
    /** Range of `\if...` command token. */
    readonly commandRange: SourceRange;
    /** Evaluated outcome in view mode, or null in snapshot mode. */
    readonly outcome: ConditionDecision['outcome'] | null;
  }[];
  /** `[\global]\<name>true` / `\<name>false` setter occurrences. */
  readonly setters: readonly {
    /** Setter location. */
    readonly location: AnalysisLocation;
    /** Range of setter command token. */
    readonly commandRange: SourceRange;
    /** Boolean value assigned by the setter. */
    readonly value: boolean;
  }[];
  /** Whether global renaming is safely supported. */
  readonly canRenameGlobally: boolean;
}

/** Catalog entry grouping `\label` declarations and referencing occurrences for one key. */
export interface CatalogLabelEntry {
  /** Literal label key. */
  readonly key: string;
  /** Declaration/usage classification. */
  readonly category: 'introduced-used' | 'introduced-unused' | 'used-undefined';
  /** `\label{key}` declarations. */
  readonly declarations: readonly {
    /** Declaration location. */
    readonly location: AnalysisLocation;
    /** Exact key interior range. */
    readonly keyRange: SourceRange;
    /** View-bound node selection, or null. */
    readonly selection: NodeSelection | null;
  }[];
  /** Referencing occurrences (`\ref`, `\eqref`, `\pageref`, `\autoref`, `\cref`, `\Cref`). */
  readonly occurrences: readonly {
    /** Reference command name without leading `\`. */
    readonly command: string;
    /** Reference location. */
    readonly location: AnalysisLocation;
    /** Exact key interior range. */
    readonly keyRange: SourceRange;
    /** View-bound node selection, or null. */
    readonly selection: NodeSelection | null;
  }[];
  /** Whether global key renaming is supported. */
  readonly canRenameGlobally: boolean;
}

/** Catalog entry grouping `\bibitem` definitions and `\cite` occurrences for one key. */
export interface CatalogCitationEntry {
  /** Literal citation key. */
  readonly key: string;
  /** Definition/usage classification. */
  readonly category: 'introduced-used' | 'introduced-unused' | 'used-external';
  /** `\bibitem{key}` definitions. */
  readonly definitions: readonly {
    /** Definition location. */
    readonly location: AnalysisLocation;
    /** Exact key interior range. */
    readonly keyRange: SourceRange;
  }[];
  /** Citation command occurrences (`\cite`, `\citep`, `\citet`, etc.). */
  readonly occurrences: readonly {
    /** Citation command name without leading `\`. */
    readonly command: string;
    /** Citation location. */
    readonly location: AnalysisLocation;
    /** Exact key interior range. */
    readonly keyRange: SourceRange;
    /** View-bound node selection, or null. */
    readonly selection: NodeSelection | null;
  }[];
  /** Whether global citation key renaming is supported. */
  readonly canRenameGlobally: boolean;
}

/** Comprehensive inventory of introduced and used project symbols and their occurrences. */
export interface ProjectCatalog {
  /** Result discriminant. */
  readonly kind: 'catalog';
  /** Exact source snapshot identity. */
  readonly snapshotId: SnapshotId;
  /** Exact configured view identity, or null in snapshot mode. */
  readonly viewId: ViewId | null;
  /** Deterministic catalog result identity. */
  readonly resultId: string;
  /** All commands sorted by name. */
  readonly commands: readonly CatalogCommandEntry[];
  /** Subset of commands introduced by `\newcommand` / `\def`. */
  readonly introducedCommands: readonly CatalogCommandEntry[];
  /** Subset of commands with at least one usage occurrence. */
  readonly usedCommands: readonly CatalogCommandEntry[];
  /** Subset of non-builtin commands used without a definition. */
  readonly usedUndefinedCommands: readonly CatalogCommandEntry[];
  /** All environments sorted by name. */
  readonly environments: readonly CatalogEnvironmentEntry[];
  /** Subset of environments introduced by `\newenvironment` / `\newtheorem`. */
  readonly introducedEnvironments: readonly CatalogEnvironmentEntry[];
  /** Subset of environments with at least one usage occurrence. */
  readonly usedEnvironments: readonly CatalogEnvironmentEntry[];
  /** All conditions sorted by name. */
  readonly conditions: readonly CatalogConditionEntry[];
  /** Subset of conditions declared with `\newif`. */
  readonly introducedConditions: readonly CatalogConditionEntry[];
  /** Subset of conditions with at least one test or setter occurrence. */
  readonly usedConditions: readonly CatalogConditionEntry[];
  /** All labels sorted by key. */
  readonly labels: readonly CatalogLabelEntry[];
  /** Subset of labels declared with `\label`. */
  readonly introducedLabels: readonly CatalogLabelEntry[];
  /** Subset of labels referenced by `\ref`/`\eqref`/`\cref`/etc. */
  readonly usedLabels: readonly CatalogLabelEntry[];
  /** Subset of labels referenced without a `\label` declaration. */
  readonly usedUndefinedLabels: readonly CatalogLabelEntry[];
  /** All citation keys sorted by key. */
  readonly citations: readonly CatalogCitationEntry[];
  /** Subset of citation keys introduced with `\bibitem`. */
  readonly introducedCitations: readonly CatalogCitationEntry[];
  /** Subset of citation keys cited in the document. */
  readonly usedCitations: readonly CatalogCitationEntry[];
}

/** Extracted metadata field with normalized display text and exact edit location. */
export interface MetadataField {
  /** Normalized plain-text display string. */
  readonly text: string;
  /** Exact raw LaTeX interior substring. */
  readonly rawSource: string;
  /** Normalized plain text of `[short]` argument, or null. */
  readonly shortText: string | null;
  /** Source location of the full command or environment. */
  readonly location: AnalysisLocation;
  /** Source location of the interior content for editing, or null. */
  readonly contentLocation: AnalysisLocation | null;
  /** View-local `occurrenceKey` when extracted from a ready view, else null. */
  readonly nodeKey: string | null;
}

/** One parsed author entry from `\author{...}`. */
export interface MetadataAuthor {
  /** Normalized author display name. */
  readonly name: string;
  /** Exact raw LaTeX substring of this author segment. */
  readonly rawSource: string;
  /** Extracted `\thanks` / `\affil` / `\institute` / `\email` notes. */
  readonly notes: readonly string[];
  /** Source location of this author segment. */
  readonly location: AnalysisLocation;
}

/** Extracted document metadata and structural statistics across a snapshot or view. */
export interface ProjectMetadata {
  /** Result discriminant. */
  readonly kind: 'metadata';
  /** Exact source snapshot identity. */
  readonly snapshotId: SnapshotId;
  /** Exact configured view identity, or null in snapshot mode. */
  readonly viewId: ViewId | null;
  /** Deterministic metadata result identity. */
  readonly resultId: string;
  /** Document `\title`, or null. */
  readonly title: MetadataField | null;
  /** Parsed authors from `\author{...}`. */
  readonly authors: readonly MetadataAuthor[];
  /** Raw `\author` field for whole-field editing, or null. */
  readonly rawAuthorField: MetadataField | null;
  /** Document `\date`, or null. */
  readonly date: MetadataField | null;
  /** Document `abstract` environment, or null. */
  readonly abstract: MetadataField | null;
  /** `\documentclass` declaration, or null. */
  readonly documentClass: {
    /** Class name. */
    readonly name: string;
    /** Class options list. */
    readonly options: readonly string[];
    /** Declaration location. */
    readonly location: AnalysisLocation;
  } | null;
  /** `\usepackage` and `\RequirePackage` declarations. */
  readonly packages: readonly {
    /** Package names in this declaration. */
    readonly names: readonly string[];
    /** Package options list. */
    readonly options: readonly string[];
    /** Declaration location. */
    readonly location: AnalysisLocation;
  }[];
  /** Bibliography style and resource files. */
  readonly bibliography: {
    /** `\bibliographystyle`, or null. */
    readonly style: string | null;
    /** `\bibliography` / `\addbibresource` targets. */
    readonly resources: readonly string[];
    /** Locations of bibliography commands. */
    readonly locations: readonly AnalysisLocation[];
  };
  /** Parsed keywords from `\keywords{...}`. */
  readonly keywords: readonly string[];
  /** Aggregate document structural statistics. */
  readonly stats: {
    /** Total files in the snapshot. */
    readonly totalFiles: number;
    /** Reached files in the view (or total files in snapshot mode). */
    readonly reachedFiles: number;
    /** Number of sectioning nodes/commands. */
    readonly sectionCount: number;
    /** Number of non-definition environments. */
    readonly environmentCount: number;
    /** Total command usage occurrences. */
    readonly commandUseCount: number;
    /** Number of introduced commands. */
    readonly introducedCommandCount: number;
    /** Number of used undefined commands. */
    readonly undefinedCommandCount: number;
    /** Number of math blocks. */
    readonly mathCount: number;
    /** Number of `figure` / `figure*` environments. */
    readonly figureCount: number;
    /** Number of `table` / `table*` environments. */
    readonly tableCount: number;
    /** Number of cited keys. */
    readonly citationCount: number;
    /** Number of `\label` declarations. */
    readonly labelCount: number;
    /** Number of cross-reference keys. */
    readonly referenceCount: number;
  };
}
