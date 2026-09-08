import {
  checkOperationCapability,
  createProjectSnapshot,
  inspectProject,
  resolveProjectView,
  walkConfiguredNodes,
} from '@preptex/core';

// Run from the repository root after npm run build: node examples/project-model.mjs
const snapshot = createProjectSnapshot([
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\ifdraft
\input{setup}
\ifdraft\begin{itemize}\else\begin{enumerate}\fi
\item Shared content.\label{shared}
\ifdraft\end{itemize}\else\end{enumerate}\fi`,
  },
  { path: 'setup.tex', version: 1, source: String.raw`\drafttrue` },
]);
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
console.log(
  JSON.stringify(
    {
      coreVersion: snapshot.coreVersion,
      inventory: inventory.facts.map((f) => ({ kind: f.kind, path: f.path, range: f.range })),
      source: summarize(sourceView),
      forcedFalse: summarize(forcedView),
      referenceAnalysis: checkOperationCapability(sourceView, { operation: 'references' }),
    },
    null,
    2
  )
);
