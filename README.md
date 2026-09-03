# PrepTeX

PrepTeX is a source-preserving structural parser and transformer for virtual
LaTeX projects. This repository contains the environment-neutral TypeScript core
and a thin Node.js CLI. A frontend and future backends or plugin hosts should
consume the core through its published package, not through repository internals.

## Install the core

Version 0.2.0 was published on 2026-09-03. This checkout prepares the compatible
0.2.1 fixes and bundled documentation. After publishing 0.2.1, pin that real
registry version in each consumer and commit the consumer's lockfile:

```sh
npm install --save-exact @preptex/core@0.2.1
```

```ts
import { InputHandlingMode, parseProject, transformProject, type SourceFile } from '@preptex/core';

const files: readonly SourceFile[] = [
  { path: 'main.tex', source: 'Hello \\input{chapter}', version: 1 },
  { path: 'chapter.tex', source: 'from PrepTeX!', version: 1 },
];

const project = parseProject(files);
const result = transformProject('main.tex', project, {
  inputHandling: InputHandlingMode.Flatten,
});
console.log(result.files[0]?.source);
```

The core is ESM-only, targets ES2020, and has no Node.js or DOM dependency. Its
public data is deeply readonly, runtime-frozen, and suitable for structured
cloning. PrepTeX is not a TeX engine and does not access files, expand macros,
compile documents, or sandbox LaTeX.

## Repository

| Path                   | Role                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `core/`                | Published `@preptex/core` library and runtime/type tests     |
| `cli/`                 | Node.js filesystem adapter and `preptex` executable          |
| `docs/integration.md`  | Compact consumer guide, security boundaries, and examples    |
| `docs/architecture.md` | Components, data flow, extension boundaries, and limitations |
| `docs/api/`            | TypeDoc Markdown generated from the public TSDoc             |
| `AGENTS.md`            | Core repository development and architectural guidance       |

## Development

Use Node.js 20 or newer for repository development.

```sh
npm ci
npm run check
npm run build
npm run docs
npm run pack:check
```

`npm run check` performs workspace type checking, runtime tests, declaration
contract tests, TSDoc validation, and formatting checks. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the public API change checklist.

## Documentation

- [Integration guide](./docs/integration.md)
- [Architecture](./docs/architecture.md)
- [Generated API reference](./docs/api/README.md)
- [Changelog](./CHANGELOG.md)

## License

MIT
