import type { SourceRange } from './api-types.js';
import type {
  Coverage,
  FactContext,
  SourceLocation,
  SourceOrigin,
  SourceScope,
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
      /** Rename both environment delimiters, retaining the body. */ readonly kind: 'rename-environment';
      /** Selected environment. */ readonly selection: NodeSelection;
      /** Literal argument-free environment name. */ readonly name: string;
    }
  | {
      /** Retain the node inside a new environment. */ readonly kind: 'wrap-node';
      /** Selected construct. */ readonly selection: NodeSelection;
      /** Literal argument-free wrapper name. */ readonly name: string;
    };
/** Additional transformations using source environments or configured nodes. */
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
      /** Remove matching literal environments. */ readonly operation: 'remove-environments';
      /** Explicit physical or selected scope. */ readonly options: {
        /** All source branches or configured selected occurrences. */ readonly target:
          'source' | 'selected' | 'artifact';
        /** Case-sensitive literal names; nonempty, sorted during normalization. */ readonly names: readonly string[];
        /** Source-only scope, defaults to all files; forbidden for selected/artifact targets. */ readonly scope?: SourceScope;
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
