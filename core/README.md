# `@preptex/core`

Environment-neutral TypeScript primitives for parsing and transforming virtual
LaTeX projects. The package exposes a small, documented ESM API with deeply
readonly syntax trees, structured diagnostics, and typed errors.

```sh
npm install --save-exact @preptex/core@0.2.1
```

This source tree prepares **0.3.0 (unreleased)**. It implements source
snapshots, inventories, configured views, independent analyses, checked edits
and exports, plus `runProjectPipeline`, alongside the retained legacy API. The install command above
describes the existing consumer baseline; use 0.3.0 only after a verified registry
release. See the bundled migration guide and website handoff for the remaining
registry gate and reproducible package verification.

See the
[integration guide](https://github.com/preptex/preptex-core/blob/main/docs/integration.md)
and
[architecture guide](https://github.com/preptex/preptex-core/blob/main/docs/architecture.md).
The repository also contains the generated Markdown API reference.

## Documentation in this package

This package includes the complete specification files for developers and AI agents:

- `dist/docs/integration.md`: Compact consumer guide, browser Web Worker model, complete frontend example, and error handling.
- `dist/docs/architecture.md`: Architectural invariants, AST structures, condition models, and limitations.
- `dist/docs/project-model.md`: Public contracts, support matrix and examples.
- `dist/docs/migration-0.3.md`: Legacy mappings, condition semantics and pipeline composition.
- `dist/docs/website-handoff.md`: Acceptance evidence, TypeScript 4.9 consumer verification and release gate.
- `dist/docs/api/README.md`: Complete TypeDoc Markdown API reference.
- `dist/index.d.ts`: Authoritative TypeScript declarations.

## Minimal example

```ts
import { parseDocument, serializeDocument } from '@preptex/core';

const parsed = parseDocument('Hello, \\textbf{world}!');
const latex = serializeDocument(parsed.root);
```

## Runtime support

The package targets ES2020, is ESM-only, and does not depend on Node.js or DOM
APIs. It can run in modern browsers, Web Workers, and backend JavaScript
runtimes that support ES modules.

## License

MIT
