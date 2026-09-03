import type { SyntaxDiagnostic } from './api-types.js';

/** Stable machine-readable categories for exceptions thrown by PrepTeX. */
export enum PrepTexErrorCode {
  /** A runtime value does not satisfy the documented public input type. */
  InvalidArgument = 'invalid-argument',
  /** Supported LaTeX syntax is malformed or unbalanced. */
  SyntaxError = 'syntax-error',
  /** The requested project entry path is absent. */
  MissingEntry = 'missing-entry',
  /** A flattened `\input` target cannot be resolved. */
  MissingInput = 'missing-input',
  /** Flattening would revisit a file that is already active. */
  CircularInput = 'circular-input',
}

/** Base class for expected PrepTeX failures. */
export class PrepTexError extends Error {
  /** Stable category suitable for programmatic error handling. */
  readonly code: PrepTexErrorCode;

  /**
   * Creates an expected PrepTeX failure.
   *
   * @param message - Human-readable failure description.
   * @param code - Stable machine-readable category.
   */
  constructor(message: string, code: PrepTexErrorCode) {
    super(message);
    this.name = 'PrepTexError';
    this.code = code;
  }
}

/** Error thrown when supported LaTeX syntax cannot be parsed safely. */
export class PrepTexSyntaxError extends PrepTexError {
  /** Literal syntax-error category for exhaustive error handling. */
  declare readonly code: PrepTexErrorCode.SyntaxError;
  /** Structured error diagnostic containing the source and location. */
  readonly diagnostic: SyntaxDiagnostic;

  /**
   * Creates a syntax error from a structured diagnostic.
   *
   * @param message - Human-readable parse failure description.
   * @param diagnostic - Structured error location and code.
   */
  constructor(message: string, diagnostic: SyntaxDiagnostic) {
    super(message, PrepTexErrorCode.SyntaxError);
    this.name = 'PrepTexSyntaxError';
    this.diagnostic = diagnostic;
  }
}
