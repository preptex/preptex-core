import assert from 'node:assert/strict';
import {
  createProjectSnapshot,
  inspectProjectEnvironments,
  realizeProjectConditions,
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

// Standalone condition realization needs no balanced AST structure.
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
const realized = realizeProjectConditions(original, {
  entryPath: 'main.tex',
  traversal: 'file-only',
  conditions: { mode: 'source' },
});
assert.equal(realized.status, 'ready');
assert.ok(realized.editPlan);
const snapshot = applyProjectEdits(original, realized.editPlan);
const configuration = { entryPath: 'main.tex', conditions: { mode: 'none' } };
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
  offset = sourceOffsetAt(index, 'main.tex', 1);
assert.ok(lookupProjectSource(index, { path: 'main.tex', start: offset, kinds: ['token'] }).length);
assert.equal(original.files[0].version, 1);
console.log(
  'Node selection, rename/wrap, standalone condition realization, comments and pipeline verified.'
);
console.log(result.artifacts[0].source);
