import {
  checkOperationCapability,
  createProjectSnapshot,
  inspectProject,
  resolveProjectView,
  walkConfiguredNodes,
  runAnalysis,
  indexProjectView,
  planTransformation,
  applyProjectEdits,
  runProjectPipeline,
} from '@preptex/core';
import assert from 'node:assert/strict';

// Run from the repository root after npm run build: node examples/project-model.mjs
const files = [
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\ifdraft
\ref{shared}% Remove this comment.
\input{setup}
\ifdraft\begin{itemize}\else\begin{enumerate}\fi
\item Shared content.\label{shared}
\ifdraft\end{itemize}\else\end{enumerate}\fi`,
  },
  { path: 'setup.tex', version: 1, source: String.raw`\drafttrue` },
];
const snapshot = createProjectSnapshot(files);
const inventory = inspectProject(snapshot, { kinds: ['condition-declaration', 'input', 'label'] });
const sourceView = resolveProjectView(snapshot, { entryPath: 'main.tex' });
const forcedView = resolveProjectView(snapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'source-with-overrides', overrides: { draft: false } },
});
function summarize(view) {
  if (view.status !== 'ready') throw new Error(JSON.stringify(view.reason));
  return {
    status: view.status,
    decisions: view.decisions.map((d) => ({ outcome: d.outcome, tracked: d.trackedValue })),
    environments: walkConfiguredNodes(view.root)
      .filter((n) => n.kind === 'environment')
      .map((n) => n.name),
    inclusions: view.occurrences.map((o) => ({ id: o.id, path: o.path })),
  };
}
const references = runAnalysis(sourceView, { operation: 'references' });
assert.equal(references.references[0].status, 'matched');
assert.equal(references.references[0].forward, true);
assert.ok(indexProjectView(sourceView).entries.length > 0);
const preview = planTransformation(snapshot, {
  operation: 'suppress-comments',
  options: { target: 'source' },
});
const edited = applyProjectEdits(snapshot, preview.editPlan);
assert.notEqual(edited.id, snapshot.id);
assert.ok(!edited.files[0].source.includes('% Remove'));
const materialized = planTransformation(sourceView, {
  operation: 'materialize',
  options: { inputs: 'inline', suppressComments: true },
});
const reparsed = resolveProjectView(
  createProjectSnapshot(
    materialized.artifacts.map((artifact) => ({
      path: artifact.path,
      source: artifact.source,
      version: 1,
    }))
  ),
  { entryPath: materialized.entryPath }
);
assert.deepEqual(summarize(reparsed).environments, ['itemize']);
assert.equal(materialized.dependencies.length, 0);
const preserved = planTransformation(sourceView, {
  operation: 'export-project',
  options: { inputs: 'preserve', conditions: 'preserve' },
});
assert.ok(preserved.dependencies.every((dependency) => dependency.status === 'present'));
const pipeline = runProjectPipeline(files, {
  configuration: { entryPath: 'main.tex' },
  analyses: [{ operation: 'references' }],
  exportOptions: { inputs: 'preserve', conditions: 'preserve' },
});
assert.deepEqual(pipeline, {
  kind: 'pipeline',
  snapshot,
  view: sourceView,
  analyses: [references],
  transformation: preserved,
});
console.log(
  JSON.stringify(
    {
      coreVersion: snapshot.coreVersion,
      pipelineMatchesIndividualCalls: true,
      inventory: inventory.facts.map((f) => ({ kind: f.kind, path: f.path, range: f.range })),
      source: summarize(sourceView),
      forcedFalse: summarize(forcedView),
      referenceAnalysis: checkOperationCapability(sourceView, { operation: 'references' }),
      findings: references.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
      })),
      editsApplied: preview.editPlan.edits.length,
      export: {
        entryPath: materialized.entryPath,
        topology: materialized.artifacts[0].topology,
        source: materialized.artifacts[0].source,
      },
    },
    null,
    2
  )
);
