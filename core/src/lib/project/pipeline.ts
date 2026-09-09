import type { SourceFile } from '../../api-types.js';
import type { ProjectPipelineOptions, ProjectPipelineResult } from '../../project-types.js';
import { createProjectSnapshot } from './snapshot.js';
import { resolveProjectView } from './view.js';
import { runAnalysis } from './analysis.js';
import { planTransformation } from './transformation.js';
import { validateOperation, requireCapability } from './operations.js';
import { array, fields, freeze, invalid, record } from './shared.js';

/**
 * Compose snapshot creation, configured interpretation, ordered analyses and export.
 * @param files - Caller-owned source strings and finite revisions; never modified.
 * @param options - Separate scan, interpretation, analysis and export settings.
 * @returns Frozen source/view/result data equivalent to the individual public calls.
 * @throws {@link PrepTexError} with InvalidArgument for malformed or mixed legacy/new options.
 * @throws {@link ProjectOperationError} when the view is not exportable, or an analysis/export fails.
 * @remarks This synchronous convenience function has no I/O or persistent workflow state.
 * Use independent operations when an incomplete view or analysis should be retained without export.
 */
export function runProjectPipeline(
  files: readonly SourceFile[],
  options: ProjectPipelineOptions
): ProjectPipelineResult {
  const input = record(options, 'pipeline options');
  fields(input, ['scanOptions', 'configuration', 'analyses', 'exportOptions'], 'pipeline options');
  const requests = array(
    input['analyses'] === undefined ? [] : input['analyses'],
    'pipeline analyses'
  ).map((raw) => {
    const request = validateOperation(raw);
    if (request.operation !== 'references' && request.operation !== 'unused-commands')
      invalid('Pipeline analyses must be analysis requests.');
    return request;
  });
  const request = validateOperation({
    operation: 'export-project',
    options: input['exportOptions'],
  });
  if (request.operation !== 'export-project') invalid('Expected configured export options.');
  const snapshot = createProjectSnapshot(files, options.scanOptions);
  const view = resolveProjectView(snapshot, options.configuration);
  requireCapability(view, request);
  for (const analysis of requests) requireCapability(view, analysis);
  const analyses = requests.map((analysis) => runAnalysis(view, analysis));
  const transformation = planTransformation(view, request);
  return freeze({ kind: 'pipeline', snapshot, view, analyses, transformation });
}
