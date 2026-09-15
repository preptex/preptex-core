import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createProjectSnapshot,
  resolveProjectView,
  createProjectSourceIndex,
  lookupProjectSource,
} from '@preptex/core';

// Fixed bounded corpus: one large file, included twice; fresh-index build excludes scan/view cost.
const paragraph = String.raw`\begin{C}α😀 {nested} \end{C}` + '\r\n';
const files = [
  { path: 'main.tex', version: 1, source: String.raw`\input{body}\input{body}` },
  { path: 'body.tex', version: 1, source: paragraph.repeat(2000) },
];
const samples = [];
for (let run = 0; run < 4; run++) {
  const view = resolveProjectView(createProjectSnapshot(files), { entryPath: 'main.tex' });
  assert.equal(view.status, 'ready');
  const start = performance.now(),
    index = createProjectSourceIndex(view),
    built = performance.now();
  let matches = 0;
  for (let i = 0; i < 10000; i++)
    matches += lookupProjectSource(index, {
      path: 'body.tex',
      start: (i % 2000) * paragraph.length + 11,
      kinds: ['node'],
    }).length;
  const queried = performance.now();
  assert.ok(matches >= 20000);
  if (run) samples.push({ buildMs: built - start, queriesMs: queried - built });
}
const median = (key) => Math.round(samples.map((s) => s[key]).sort((a, b) => a - b)[1]);
const measured = { buildMs: median('buildMs'), queriesMs: median('queriesMs') };
console.log(
  JSON.stringify(
    {
      node: process.version,
      codeUnits: files.reduce((n, f) => n + f.source.length, 0),
      queries: 10000,
      measured,
      budgetsMs: { buildMs: 2000, queriesMs: 1000 },
    },
    null,
    2
  )
);
assert.ok(measured.buildMs < 2000, 'Index build exceeds the fixed corpus budget.');
assert.ok(measured.queriesMs < 1000, 'Lookup queries exceed the fixed corpus budget.');
