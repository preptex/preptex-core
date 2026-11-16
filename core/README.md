# `@preptex/core`

Environment-neutral TypeScript primitives for tokenizing, realizing conditions, analyzing, and transforming virtual LaTeX projects. The package exposes a deterministic ESM API with deeply readonly models, original-source provenance, and typed errors.

```sh
npm install --save-exact @preptex/core@0.4.0
```

`@preptex/core@0.4.0` separates condition realization from structural AST generation on top of a single stateless whole-file tokenizer:

1. **Stage 0 — Stateless Whole-File Tokenizer (`tokenizeFile`, `createProjectSnapshot`)**: Scans each `.tex` file once into a lossless primitive token stream (`SourceToken[]`) and source fact inventory without requiring balanced braces, environments, or conditions.
2. **Pipeline B — Standalone Condition Realizer (`realizeProjectConditions`)**: Evaluates `\newif`, `\if...`, `\else`, `\fi`, and `[\global]\Xtrue`/`\Xfalse` (optionally across `\input` files) while ignoring non-condition LaTeX syntax, returning both a checked in-place `ProjectEditPlan` and condition-free `GeneratedArtifact[]` files.
3. **Pipeline A — Condition-Free Structural View, Analyses, and Transformations (`resolveProjectView`, `runAnalysis`, `planTransformation`)**: Resolves conditions (or verifies their absence when `conditions: { mode: 'none' }`), builds a condition-free structural AST (`ConfiguredNode`), and runs reference/command-use analyses, node/environment/comment edits, and project exports.

## Documentation in this package

This package bundles complete integration and architectural documentation in `dist/docs/`:

- `dist/docs/integration.md`: Frontend and backend consumer guide, two-pipeline workflows, Web Worker usage, and error handling.
- `dist/docs/architecture.md`: System architecture, the 6 core invariants (`INV-1`–`INV-6`), data flow, and module boundaries.
- `dist/docs/project-model.md`: Public contracts, condition policies, support matrix, analyses, and export options.
- `dist/docs/node-operations.md`: Source interval indexing, node/environment selection, and structural transformations.
- `dist/docs/migration-0.4.md`: Migration guide for the `0.4.0` separated condition and structural pipelines.
- `dist/docs/website-handoff.md`: Frontend handoff guide and reproducible package verification.
- `dist/docs/api/README.md`: Complete TypeDoc Markdown API reference.
- `dist/index.d.ts`: Authoritative TypeScript declarations.

## Minimal example

```ts
import {
  applyProjectEdits,
  createProjectSnapshot,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  type SourceFile,
} from '@preptex/core';

const files: readonly SourceFile[] = [
  {
    path: 'main.tex',
    version: 1,
    source:
      '\\newif\\ifdraft\\drafttrue\n\\ifdraft\\section{Draft}\\else\\section{Final}\\fi\nHello!',
  },
];

const snapshot = createProjectSnapshot(files);

// Pipeline B: Realize conditions independently of AST generation
const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  traversal: 'project',
  conditions: { mode: 'source' },
});
const conditionFreeSnapshot = realized.editPlan
  ? applyProjectEdits(snapshot, realized.editPlan)
  : snapshot;

// Pipeline A: Build condition-free AST and export
const view = resolveProjectView(conditionFreeSnapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'none' },
});
const exported = planTransformation(view, {
  operation: 'export-project',
  options: { inputs: 'inline', suppressComments: true },
});
console.log(exported.artifacts[0]?.source);
```

## Runtime support

The package targets ES2020, is ESM-only, and does not depend on Node.js or DOM APIs. It runs in modern browsers, Web Workers, and backend JavaScript runtimes.

## License

MIT
