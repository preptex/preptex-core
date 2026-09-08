import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import * as core from '@preptex/core';
import ts from 'typescript';

// Fixed corpus: 16 independently versioned files, 120 repeated paragraphs each.
// Warm median budgets (ms), set before C8 reuse changes: scan 1500, view 1000,
// inventory 400, references 400. Budgets describe this corpus, not host deadlines.
const paragraph = String.raw`Text \label{entry}\ref{entry} $x+y$ % retained comment` + '\n';
const files = [
  {
    path: 'main.tex',
    version: 1,
    source: Array.from({ length: 15 }, (_, i) => `\\input{part${i}}`).join('\n'),
  },
];
for (let i = 0; i < 15; i++)
  files.push({ path: `part${i}.tex`, version: 1, source: paragraph.repeat(120) });
const measure = (action) => {
  action();
  const times = Array.from({ length: 3 }, () => {
    const start = performance.now();
    action();
    return performance.now() - start;
  });
  return Math.round(times.sort((a, b) => a - b)[1]);
};
const snapshot = core.createProjectSnapshot(files);
const view = core.resolveProjectView(snapshot, { entryPath: 'main.tex' });
const timings = {
  scan: measure(() => core.createProjectSnapshot(files)),
  view: measure(() => core.resolveProjectView(snapshot, { entryPath: 'main.tex' })),
  inventory: measure(() => core.inspectProject(snapshot)),
  ...(core.runAnalysis
    ? { references: measure(() => core.runAnalysis(view, { operation: 'references' })) }
    : {}),
};
const budgetsMs = { scan: 1500, view: 1000, inventory: 400, references: 400 };
console.log(
  JSON.stringify(
    {
      coreVersion: snapshot.coreVersion,
      node: process.version,
      typescript: ts.version,
      machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
      files: files.length,
      codeUnits: files.reduce((n, f) => n + f.source.length, 0),
      timings,
      budgetsMs,
    },
    null,
    2
  )
);
for (const [operation, elapsed] of Object.entries(timings)) {
  if (elapsed > budgetsMs[operation])
    throw new Error(
      `${operation} exceeded its ${budgetsMs[operation]}ms warm median budget (${elapsed}ms).`
    );
}
