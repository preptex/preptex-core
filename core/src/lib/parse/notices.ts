import type { WarningDiagnosticCode } from '../../api-types.js';

export interface ParseNotice {
  readonly code: WarningDiagnosticCode;
  readonly message: string;
  readonly start: number;
  readonly end: number;
  readonly line: number;
}
