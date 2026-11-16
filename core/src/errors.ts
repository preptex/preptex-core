import type { OperationFailure } from './project-types.js';

/** Stable machine-readable categories for exceptions thrown by PrepTeX. */
export enum PrepTexErrorCode {
  /** A runtime value does not satisfy the documented public input type. */
  InvalidArgument = 'invalid-argument',
  /** The requested operation cannot run against this representation or coverage. */
  OperationUnavailable = 'operation-unavailable',
  /** Source or configured identity no longer matches the proposal. */
  StaleResult = 'stale-result',
  /** Source edit ranges or preconditions are invalid. */
  InvalidEdit = 'invalid-edit',
  /** Occurrence-specific edits cannot be represented by one physical file. */
  EditConflict = 'edit-conflict',
  /** Emission exceeded the caller's configured output bound. */
  OutputLimit = 'output-limit',
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

/** Expected analysis/edit/export rejection with transport-safe located reasons. */
export class ProjectOperationError extends PrepTexError {
  /** Structured failure; serialize this instead of stack traces. */
  readonly failure: OperationFailure;
  /**
   * Create a located operation failure.
   * @param failure - Stable code, message, and original locations.
   */
  constructor(failure: OperationFailure) {
    const codes = {
      unavailable: PrepTexErrorCode.OperationUnavailable,
      'stale-result': PrepTexErrorCode.StaleResult,
      'invalid-edit': PrepTexErrorCode.InvalidEdit,
      'edit-conflict': PrepTexErrorCode.EditConflict,
      'output-limit': PrepTexErrorCode.OutputLimit,
    };
    super(failure.message, codes[failure.code]);
    this.name = 'ProjectOperationError';
    this.failure = Object.freeze({
      ...failure,
      locations: Object.freeze(
        failure.locations.map((location) =>
          Object.freeze({ ...location, range: Object.freeze({ ...location.range }) })
        )
      ),
    });
  }
}
