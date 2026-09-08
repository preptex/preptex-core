import { ProjectOperationError } from '../../errors.js';
import type { AnalysisLocation, OperationFailure } from '../../project-types.js';
export function reject(
  code: OperationFailure['code'],
  message: string,
  locations: readonly AnalysisLocation[] = []
): never {
  throw new ProjectOperationError({ code, message, locations });
}
