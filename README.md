# PrepTeX

PrepTeX is a source-preserving tokenizer, condition realizer, structural parser, and transformer for virtual LaTeX projects. This repository contains the environment-neutral TypeScript core (`@preptex/core`) and a thin Node.js CLI (`@preptex/cli`). Frontends, Web Workers, and backends consume `@preptex/core` through its public package boundary.

## Install the core

```sh
npm install --save-exact @preptex/core@0.3.0
```

```ts
import {
  createProjectSnapshot,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  type SourceFile,
} from '@preptex/core';

const files: readonly SourceFile[] = [
  {
    path: 'main.tex',
    source: '\\newif\\ifdraft\\drafttrue\n\\ifdraft Hello \\input{chapter}\\fi',
    version: 1,
  },
  { path: 'chapter.tex', source: 'from PrepTeX!', version: 1 },
];

const snapshot = createProjectSnapshot(files);

// Standalone condition realization (Pipeline B — no AST required)
const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  traversal: 'project',
  conditions: { mode: 'source' },
  inputs: 'inline',
});
console.log(realized.artifacts[0]?.source);

// Full structural view & export (Pipeline A — condition-free AST)
const view = resolveProjectView(snapshot, { entryPath: 'main.tex' });
const exported = planTransformation(view, {
  operation: 'export-project',
  options: { inputs: 'inline', suppressComments: true },
});
console.log(exported.artifacts[0]?.source);
```

The core is ESM-only, targets ES2020, and has no Node.js or DOM dependency. Its public data is deeply readonly, runtime-frozen, and suitable for structured cloning. PrepTeX is not a TeX engine and does not access host files, expand arbitrary macros, compile documents, or sandbox LaTeX.

## Repository

| Path                      | Role                                                         |
| ------------------------- | ------------------------------------------------------------ |
| `core/`                   | Published `@preptex/core` library and runtime/type tests     |
| `cli/`                    | Node.js filesystem adapter and `preptex` executable          |
| `docs/integration.md`     | Consumer guide, frontend/backend workflows, and examples     |
| `docs/architecture.md`    | Pipelines, invariants, components, and limitations           |
| `docs/project-model.md`   | Public operations, condition policies, analyses, and exports |
| `docs/node-operations.md` | Source lookup, node selection, and structural edits          |
| `docs/api/`               | TypeDoc Markdown generated from the public TSDoc             |
| `AGENTS.md`               | Core repository development and architectural guidance       |

## Development

Use Node.js 20 or newer for repository development.

```sh
npm ci
npm run check
npm run build
npm run docs
npm run pack:check
npm run consumer:check
```

`npm run check` performs workspace type checking, runtime tests, declaration contract tests, TSDoc validation, and formatting checks. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the public API change checklist.

## Documentation

- [Integration guide](./docs/integration.md)
- [Project model contract](./docs/project-model.md)
- [Node operations](./docs/node-operations.md)
- [0.3.0 migration](./docs/migration-0.3.md)
- [Website handoff and release verification](./docs/website-handoff.md)
- [Architecture](./docs/architecture.md)
- [Generated API reference](./docs/api/README.md)
- [Changelog](./CHANGELOG.md)

## License

MIT
