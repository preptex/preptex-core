import assert from 'node:assert/strict';
import {
  createProjectSnapshot,
  inspectProjectEnvironments,
  resolveProjectView,
  walkConfiguredNodes,
  createProjectSourceIndex,
  sourceOffsetAt,
  lookupProjectSource,
  selectProjectNode,
  planTransformation,
  applyProjectEdits,
  runProjectPipeline,
} from '@preptex/core';

// Source-wide suppression needs no entry or condition values.
const original = createProjectSnapshot([
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\iflong\newif\ifshort
\longtrue\shortfalse
\iflong\begin{itemize}\item Long\end{itemize}\else\begin{C}Hidden\end{C}\fi
\ifshort Short\fi
% ordinary comment
\begin{comment}Unparsed { \ifunknown\end{comment}`,
  },
]);
assert.equal(inspectProjectEnvironments(original).environments.length, 3);
const prepass = planTransformation(original, {
  operation: 'remove-environments',
  options: { target: 'source', names: ['C'] },
});
const snapshot = applyProjectEdits(original, prepass.editPlan);
const configuration = { entryPath: 'main.tex', conditions: { mode: 'source' } };
const view = resolveProjectView(snapshot, configuration);
assert.equal(view.status, 'ready');
const list = walkConfiguredNodes(view.root).find(
  (n) => n.kind === 'environment' && n.name === 'itemize'
);
assert.ok(list);
const selection = selectProjectNode(view, list.occurrenceKey);
const nodeEdits = [
  { kind: 'rename-environment', selection, name: 'enumerate' },
  { kind: 'wrap-node', selection, name: 'center' },
];
const exportOptions = {
  conditions: 'materialize',
  inputs: 'inline',
  suppressComments: true,
  suppressCommentEnvironments: true,
  nodeEdits,
};
const result = planTransformation(view, { operation: 'export-project', options: exportOptions });
assert.equal(
  result.artifacts[0].source.trim(),
  String.raw`\begin{center}\begin{enumerate}\item Long\end{enumerate}\end{center}`
);
assert.deepEqual(
  runProjectPipeline(
    snapshot.files.map(({ path, source, version }) => ({ path, source, version })),
    { configuration, exportOptions }
  ).transformation,
  result
);
const index = createProjectSourceIndex(view),
  offset = sourceOffsetAt(index, 'main.tex', 3);
assert.ok(lookupProjectSource(index, { path: 'main.tex', start: offset, kinds: ['token'] }).length);
assert.equal(original.files[0].version, 1);
console.log(
  'Node selection, rename/wrap, source prepass, source booleans, comments and pipeline verified.'
);
console.log(result.artifacts[0].source);
