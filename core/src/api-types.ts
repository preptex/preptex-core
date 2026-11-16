/**
 * A normalized, forward-slash path inside a virtual PrepTeX project.
 *
 * Public operations reject absolute paths and paths that escape the project root.
 */
export type ProjectFilePath = string;

/** An opening delimiter recognized for a LaTeX math node. */
export type MathDelimiter = '$' | '$$' | '\\(' | '\\[';

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

/** One versioned source file supplied to {@link createProjectSnapshot}. */
export interface SourceFile {
  /** Stable virtual path used by entry selection and `\input` resolution. */
  readonly path: ProjectFilePath;
  /** LaTeX source text. */
  readonly source: string;
  /** Caller-owned finite number used to resolve incremental update conflicts. */
  readonly version: number;
}
