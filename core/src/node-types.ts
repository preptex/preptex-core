import type { SourceRange } from './api-types.js';
import type {
  Coverage,
  FactContext,
  SourceLocation,
  SourceOrigin,
  ProjectSnapshot,
  ProjectView,
} from './project-types.js';

/** Original selected span with its caller-owned file revision. */
export interface VersionedSourceOrigin extends SourceOrigin {
  /** Finite revision of the original file in the owning snapshot. */
  readonly version: number;
}
/** Original locations, never an envelope across omitted source. */
export type NodeLocation =
  | {
      /** No contributing source, for an empty root. */ readonly kind: 'none';
      /** No primary jump. */ readonly primary: null;
      /** Empty origins. */ readonly spans: readonly [];
    }
  | {
      /** One contiguous original extent. */ readonly kind: 'single';
      /** The sole span. */ readonly primary: VersionedSourceOrigin;
      /** Exactly one span. */ readonly spans: readonly [VersionedSourceOrigin];
    }
  | {
      /** Ordered disjoint or multi-file extents. */ readonly kind: 'multiple';
      /** First contributing span, for navigation only. */ readonly primary: VersionedSourceOrigin;
      /** Every contributing extent in encounter order. */ readonly spans: readonly VersionedSourceOrigin[];
    };

/** A complete literal begin/end command in original source. */
export interface EnvironmentDelimiter extends SourceLocation {
  /** Name inside braces, without expansion. */ readonly name: string;
  /** Inclusive original range of the name alone. */ readonly nameRange: SourceRange;
}
/** Located delimiter in one configured inclusion. */
export interface ConfiguredEnvironmentDelimiter extends EnvironmentDelimiter {
  /** Exact selected origin and file revision. */ readonly origin: VersionedSourceOrigin;
}
/** Exact delimiters when each is one literal physical command. */
export interface ConfiguredEnvironmentSyntax {
  /** Contiguous original body including empty bodies (end=start-1); null for disjoint/multi-file syntax. */ readonly body: VersionedSourceOrigin | null;
  /** Opener or null for a delimiter assembled from disjoint source. */ readonly opening: ConfiguredEnvironmentDelimiter | null;
  /** Closer or null for a delimiter assembled from disjoint source. */ readonly closing: ConfiguredEnvironmentDelimiter | null;
  /** An optional/braced argument immediately follows the opener; renaming cannot adapt it. */ readonly hasArguments: boolean;
}
/** Located source environment; candidates never authorize a whole-region edit. */
export interface SourceEnvironment {
  /** Snapshot-local identifier; do not persist across edits. */ readonly id: string;
  /** Exact original source identity. */ readonly snapshotId: string;
  /** Original file path. */ readonly path: string;
  /** Caller-owned original revision. */ readonly version: number;
  /** Literal name, or null for a dynamic/malformed delimiter. */ readonly name: string | null;
  /** Complete matched region or unresolved delimiter. */ readonly status: 'matched' | 'candidate';
  /** Whole extent when matched; otherwise the known delimiter range only. */ readonly range: SourceRange;
  /** Located opener, null for an unmatched closing delimiter. */ readonly opening: EnvironmentDelimiter | null;
  /** Located closer, null for an unmatched opening delimiter. */ readonly closing: EnvironmentDelimiter | null;
  /** Inclusive body range; empty bodies have end=start-1; null for candidates. */ readonly body: SourceRange | null;
  /** Source-only context, not evidence of execution. */ readonly context: FactContext;
  /** Protected region grammar rather than nested environment matching. */ readonly protected: boolean;
  /** Null when matched; explanation of incomplete recognition otherwise. */ readonly reason:
    string | null;
}
/** Frozen source environment inventory; no entry or configured view required. */
export interface EnvironmentInventory {
  /** Result discriminant. */ readonly kind: 'environments';
  /** Exact source authority. */ readonly snapshotId: string;
  /** Canonical request/content identity. */ readonly resultId: string;
  /** Path/offset ordered matched regions and candidates. */ readonly environments: readonly SourceEnvironment[];
  /** Recognition limitations; candidates do not erase healthy results. */ readonly coverage: Coverage;
}
/** Reference to one configured structural node, including its inclusion context. */
export interface NodeSelection {
  /** Selection discriminant. */ readonly kind: 'node';
  /** Owning original source identity. */ readonly snapshotId: string;
  /** Owning configured interpretation identity. */ readonly viewId: string;
  /** Unique node occurrence key within that view. */ readonly nodeKey: string;
}
/** Reference to one recognized physical source environment. */
export interface EnvironmentSelection {
  /** Selection discriminant. */ readonly kind: 'source-environment';
  /** Owning source identity. */ readonly snapshotId: string;
  /** Original path. */ readonly path: string;
  /** Original revision. */ readonly version: number;
  /** Inventory occurrence ID within the snapshot. */ readonly environmentId: string;
}
/** Tree-selected change; all references belong to the same original view. */
export type NodeEditAction =
  | {
      /** Remove the complete subtree. */ readonly kind: 'remove-node';
      /** Selected construct. */ readonly selection: NodeSelection;
    }
  | {
      /** Rename both environment delimiters, retaining the body and any arguments. */ readonly kind: 'rename-environment';
      /** Selected environment. */ readonly selection: NodeSelection;
      /** Literal environment name. */ readonly name: string;
    }
  | {
      /** Rename a selected command node (`\old` -> `\new`), preserving `*` and all arguments. */ readonly kind: 'rename-command';
      /** Selected command node or standalone command token. */ readonly selection: NodeSelection;
      /** Command name without leading `\`. */ readonly name: string;
    }
  | {
      /** Change a selected section node's heading level and/or starred form. */ readonly kind: 'rename-section';
      /** Selected section node. */ readonly selection: NodeSelection;
      /** Target sectioning command. */ readonly sectionCommand:
        'section' | 'subsection' | 'subsubsection' | 'paragraph' | 'subparagraph';
      /** Optional target starred flag; omits keeping existing starred spelling. */ readonly starred?: boolean;
    }
  | {
      /** Unwrap an environment, group, or single-argument formatting command, keeping its inner body. */ readonly kind: 'unwrap-node';
      /** Selected container construct. */ readonly selection: NodeSelection;
    }
  | {
      /** Retain the node inside a new environment. */ readonly kind: 'wrap-node';
      /** Selected construct. */ readonly selection: NodeSelection;
      /** Literal argument-free wrapper name. */ readonly name: string;
    };

/** Bulk catalog-based refactoring or metadata edit action. */
export type SymbolRefactorAction =
  | {
      /** Rename all occurrences of a command and optionally its definitions (`\newcommand`, `\def`, etc.). */
      readonly kind: 'rename-command-globally';
      /** Existing command name without leading `\`. */
      readonly oldName: string;
      /** Replacement command name without leading `\`. */
      readonly newName: string;
      /** Also update matching `\newcommand`/`\def` definition names; default true. */
      readonly includeDefinitions?: boolean;
    }
  | {
      /** Modify a `\newcommand` / `\renewcommand` / `\providecommand` definition in-place. */
      readonly kind: 'edit-command-definition';
      /** Exact definition fact location (`path` and `range`). */
      readonly definitionLocation: SourceLocation;
      /** Optional new command name without leading `\`. */
      readonly newName?: string;
      /** Optional updated total parameter count (0–9). */
      readonly numArgs?: number;
      /** Optional updated default value for `#1` (`null` removes `[default]`; `string` sets `[default]`). */
      readonly defaultArg?: string | null;
      /** Optional updated replacement body interior (without outer `{}`). */
      readonly newBody?: string;
    }
  | {
      /** Rename all `\begin{oldName}` / `\end{oldName}` occurrences and `\newenvironment`/`\newtheorem` definitions. */
      readonly kind: 'rename-environment-globally';
      /** Existing literal environment name. */
      readonly oldName: string;
      /** Replacement literal environment name. */
      readonly newName: string;
      /** Also update matching environment definition names; default true. */
      readonly includeDefinitions?: boolean;
    }
  | {
      /** Rename a boolean condition across `\newif\if<old>`, `\if<old>`, `\<old>true`, and `\<old>false`. */
      readonly kind: 'rename-condition-globally';
      /** Existing boolean flag name without `if` prefix. */
      readonly oldName: string;
      /** Replacement boolean flag name without `if` prefix. */
      readonly newName: string;
    }
  | {
      /** Rename a label key across all `\label{oldKey}` declarations and `\ref`/`\eqref`/`\pageref`/`\autoref`/`\cref`/`\Cref` uses. */
      readonly kind: 'rename-label-globally';
      /** Existing label key. */
      readonly oldKey: string;
      /** Replacement label key. */
      readonly newKey: string;
    }
  | {
      /** Rename a citation key across `\bibitem{oldKey}` definitions and `\cite`/`\citep`/`\citet` occurrences. */
      readonly kind: 'rename-citation-globally';
      /** Existing citation key. */
      readonly oldKey: string;
      /** Replacement citation key. */
      readonly newKey: string;
    }
  | {
      /** Edit a document metadata field (`title`, `author`, `date`, or `abstract`) in-place. */
      readonly kind: 'edit-metadata';
      /** Target metadata field. */
      readonly field: 'title' | 'author' | 'date' | 'abstract';
      /** Replacement LaTeX interior content. */
      readonly newValue: string;
      /** Optional updated `[short]` title/author argument (`null` removes `[short]`). */
      readonly shortValue?: string | null;
    };

/** Request for bulk symbol, definition, or metadata refactoring. */
export interface SymbolRefactorRequest {
  /** Operation discriminant. */
  readonly operation: 'refactor-symbols';
  /** Refactoring scope, ordered actions, and output limit. */
  readonly options: {
    /** Edit target: `'selected'` or `'artifact'` for views, `'source'` for snapshots. */
    readonly target?: 'selected' | 'source' | 'artifact';
    /** Ordered refactoring actions to apply atomically. */
    readonly actions: readonly SymbolRefactorAction[];
    /** Total UTF-16 output limit, default 10000000; maximum 100000000. */
    readonly maxOutputCodeUnits?: number;
  };
}
/** Additional transformations using configured nodes over a realized ProjectView. */
export type NodeTransformationRequest =
  | {
      /** Batch of configured node actions. */ readonly operation: 'edit-nodes';
      /** Source edits or fully materialized/inlined artifacts. */ readonly options: {
        /** Source previews preserve every unmapped slice; artifact mode specializes occurrences. */ readonly target:
          'selected' | 'artifact';
        /** Ordered actions; at most 10000. */ readonly actions: readonly NodeEditAction[];
        /** Total output UTF-16 bound, default 10000000. */ readonly maxOutputCodeUnits?: number;
      };
    }
  | {
      /** Remove matching literal environments from the realized view. */ readonly operation: 'remove-environments';
      /** Explicit selected or artifact scope. */ readonly options: {
        /** Configured selected occurrences or artifact export. */ readonly target:
          'selected' | 'artifact';
        /** Case-sensitive literal names; nonempty, sorted during normalization. */ readonly names: readonly string[];
        /** Total output UTF-16 bound, default 10000000. */ readonly maxOutputCodeUnits?: number;
      };
    };

/** One immutable hit returned by original-source lookup. */
export type SourceLookupHit =
  | {
      /** Source lexical token. */ readonly kind: 'token';
      /** Original token index in its file. */ readonly tokenIndex: number;
      /** Original extent. */ readonly location: SourceLocation;
    }
  | {
      /** Located source environment. */ readonly kind: 'environment';
      /** Safe identity for subsequent inspection. */ readonly selection: EnvironmentSelection;
      /** Known original extent. */ readonly location: SourceLocation;
    }
  | {
      /** Configured node occurrence. */ readonly kind: 'node';
      /** View-bound selection. */ readonly selection: NodeSelection;
      /** Exact matching original span with revision and inclusion. */ readonly location: VersionedSourceOrigin;
      /** Structural depth, root is zero. */ readonly depth: number;
      /** Stable configured encounter order. */ readonly order: number;
    };
/** Plain-data augmented interval tree node; not an executable parser class. */
export interface SourceInterval {
  /** Indexed hit. */ readonly hit: SourceLookupHit;
  /** Largest inclusive end in this subtree. */ readonly maxEnd: number;
  /** Earlier intervals or null. */ readonly left: SourceInterval | null;
  /** Later intervals or null. */ readonly right: SourceInterval | null;
}
/** Per-file immutable source-search data. */
export interface SourceLookupFile {
  /** Original virtual path. */ readonly path: string;
  /** Original revision. */ readonly version: number;
  /** Original UTF-16 length; also the EOF insertion offset. */ readonly length: number;
  /** Zero-based line starts; CRLF occupies two source units and one line boundary. */ readonly lineStarts: readonly number[];
  /** Balanced interval tree, null for no entries. */ readonly intervals: SourceInterval | null;
}
/** Clone-safe lookup index; reuse only with its exact snapshot/view. */
export interface ProjectSourceIndex {
  /** Immutable source/view authority used to reconstruct transported indexes. */ readonly model:
    ProjectSnapshot | ProjectView;
  /** Index discriminant. */ readonly kind: 'source-index';
  /** Original snapshot identity. */ readonly snapshotId: string;
  /** Configured identity, null for independent source lookup. */ readonly viewId: string | null;
  /** Versioned deterministic index identity. */ readonly id: string;
  /** Path-sorted indexes. */ readonly files: readonly SourceLookupFile[];
}
/** Point or inclusive-overlap query in original source coordinates. */
export interface SourceLookupQuery {
  /** Original file path. */ readonly path: string;
  /** Zero-based original UTF-16 point/start; EOF returns no point hit. */ readonly start: number;
  /** Inclusive end; omission performs a point lookup. */ readonly end?: number;
  /** Categories to return; omission returns all, empty returns none. */ readonly kinds?: readonly SourceLookupHit['kind'][];
  /** Optional inclusion filter for configured node hits. */ readonly occurrenceId?: string;
}
