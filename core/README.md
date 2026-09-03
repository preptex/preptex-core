# `@preptex/core`

Environment-neutral TypeScript primitives for parsing and transforming virtual
LaTeX projects. The package exposes a small, documented ESM API with deeply
readonly syntax trees, structured diagnostics, and typed errors.

```sh
npm install --save-exact @preptex/core@0.2.0
```

Version 0.2.0 is currently prepared in this repository and must be published
before a separate application can install that exact registry version.

See the
[integration guide](https://github.com/preptex/preptex-core/blob/main/docs/integration.md)
and
[architecture guide](https://github.com/preptex/preptex-core/blob/main/docs/architecture.md).
The repository also contains the generated Markdown API reference.

## Documentation in this package

This package includes the complete specification files for developers and AI agents:

- `dist/docs/integration.md`: Compact consumer guide, browser Web Worker model, complete frontend example, and error handling.
- `dist/docs/architecture.md`: Architectural invariants, AST structures, condition models, and limitations.
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
