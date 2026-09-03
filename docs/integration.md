# PrepTeX integration guide

This guide describes how to consume `@preptex/core` in applications, frontend
websites, Node.js services, and worker threads. Treat the published package and
its generated TypeScript declarations (`dist/index.d.ts`) as the integration
boundary:

```sh
npm install --save-exact @preptex/core@0.2.1
```

Do not use a `file:` dependency in a released consumer. Pin the exact version
while PrepTeX is in `0.x` to guarantee reproducible, deterministic execution.

## Scope

PrepTeX Core is an in-memory, environment-neutral structural parser and
transformer for a practical subset of LaTeX. It recognizes text, comments,
commands, groups, environments, conditions, math, section commands, and `\input`
references. It can suppress comments, evaluate boolean conditions, and
preserve, flatten, or separate virtual files.

PrepTeX Core does **not**:

- Expand arbitrary TeX macros or evaluate TeX engine primitives.
- Access the host filesystem, network, databases, or environment variables.
- Execute external TeX compilers (e.g. `pdflatex`, `xelatex`, `lualatex`, `latexmk`).
- Compile documents to PDF or render output visually.
- Sandbox untrusted LaTeX compilation.

The consuming application or backend owns file retrieval, user authentication,
quotas, scheduling, storage, and compilation sandboxing.

## Public entry points

| Entry point           | Primary use                                                                             |
| :-------------------- | :-------------------------------------------------------------------------------------- |
| `parseDocument`       | Parse a single LaTeX source string into an AST with warnings and declarations.          |
| `parseProject`        | Parse an array of virtual `SourceFile` records into a sorted `ParsedProject`.           |
| `mergeProjects`       | Create a new project snapshot by merging incremental changes into an existing snapshot. |
| `serializeDocument`   | Serialize an AST root back into LaTeX source without project `\input` resolution.       |
| `transformProject`    | Transform and serialize an entire project using a specified `InputHandlingMode`.        |
| `isContainerNode`     | Type guard to narrow an `AstNode` to a `ContainerNode` with children.                   |
| `isInputHandlingMode` | Type guard to validate untrusted strings against `InputHandlingMode`.                   |

Catch `PrepTexSyntaxError` and `PrepTexError`, and use exported enums (`NodeType`,
`InputHandlingMode`, `DiagnosticCode`, `DiagnosticSeverity`, `PrepTexErrorCode`)
rather than hardcoded strings.

## Normal data flow

1. The consumer prepares virtual files as `readonly SourceFile[]`. Each file has a
   project-relative forward-slash `path`, its `source` string, and a
   caller-owned finite `version` number.
2. Call `parseProject(files, parseOptions)` to parse every file into a deeply
   frozen `ParsedProject`. Inspect warnings in `project.diagnostics`.
3. For incremental edits, parse only changed files with the identical
   `ProjectParseOptions`, then call `mergeProjects(currentSnapshot, updateSnapshot)`.
   An update replaces an equal path when its `version` is greater than or equal to
   the base version.
4. Call `transformProject(entryPath, project, transformOptions)` to produce one or
   more serialized `TransformedFile` outputs.
5. Use `parseDocument(source)` and `serializeDocument(result.root)` for isolated
   single-file editor buffers where `\input` resolution is unneeded.

```text
SourceFile[]
    │
    ▼
parseProject(files, options)
    │
    ├─► inspect diagnostics & traverse AstNode
    │
    ├─► optional: mergeProjects(base, updates)
    │
    ▼
transformProject(entryPath, project, options)
    │
    ▼
TransformedFile[]
    │
    ├─► Browser: Preview / Download
    └─► Server: Storage / Sandboxed TeX compilation
```

## Data invariants, mutability, and identity

- **Deep Immutability**: All returned AST nodes, child arrays, diagnostics, and
  file lists are frozen at runtime (`Object.freeze`) and typed as `readonly`. Treat
  trees as immutable snapshots.
- **Structured Cloning**: `ParsedProject` contains only plain, acyclic JavaScript
  data safe for `structuredClone`, Web Workers, and IPC. Note that structured
  cloning does not preserve `Object.freeze`, so receiving threads must treat the
  cloned data as readonly.
- **Node Identity**: A node's `id` is unique only within its containing parsed file.
  Use `(file.path, node.id)` as a composite UI key. Object identity is preserved
  across `mergeProjects` for unchanged canonical files, but IDs do not survive
  reparsing.
- **Snapshot Merging**: `mergeProjects` has no deletion primitive; deleting a file
  requires creating a fresh project snapshot from the updated file set.

## Locations and diagnostics

- `SourceRange.start` and `SourceRange.end` are inclusive, zero-based UTF-16 code
  unit offsets into the original source string (`source.slice(start, end + 1)`).
- `SourceRange.line` is one-based and indicates the line containing `start`. The
  synthetic root of an empty document uses `start: 0`, `end: -1`, and `line: 1`.
- Successful parses return non-fatal `WarningDiagnostic` entries with stable
  `DiagnosticCode` values.
- Malformed syntax throws `PrepTexSyntaxError`, carrying a `diagnostic` with
  severity `DiagnosticSeverity.Error`.
- Transformed output does not maintain source maps; offsets from the input tree
  cannot be applied to transformed text.

## Transformation semantics

- **Comment Suppression** (`suppressComments: true`): Removes recognized percent
  comments and `comment` environments, cleanly stripping lines that become empty.
- **Condition Evaluation** (`enabledConditions`):
  - When omitted: Condition wrappers (`\if...`, `\else`, `\fi`) and syntax are preserved.
  - When supplied: Listed condition names keep their `if` branch; unlisted names keep
    their `else` branch. Condition wrappers, `\newif` declarations, and boolean
    toggles (`\Xtrue`, `\Xfalse`) are stripped from the output.
- **Input Handling** (`inputHandling`):
  - `InputHandlingMode.Preserve` (default): Emits only the entry file with literal `\input` commands.
  - `InputHandlingMode.Flatten`: Emits a single merged file with reachable `\input` targets recursively inlined.
  - `InputHandlingMode.Separate`: Emits every parsed file transformed independently.
  - Relative inputs resolve from the including file; missing, ambiguous, or circular references throw typed errors.

## Error handling

Programmatic error handling should branch on `PrepTexError.code`:

| Error Code                         | Meaning                                                                   |
| :--------------------------------- | :------------------------------------------------------------------------ |
| `PrepTexErrorCode.InvalidArgument` | A parameter violated runtime type validation.                             |
| `PrepTexErrorCode.SyntaxError`     | Supported LaTeX syntax is malformed or unbalanced (`PrepTexSyntaxError`). |
| `PrepTexErrorCode.MissingEntry`    | The specified entry path was not found in the parsed project.             |
| `PrepTexErrorCode.MissingInput`    | A flattened `\input` target could not be resolved.                        |
| `PrepTexErrorCode.CircularInput`   | A circular include loop was detected during flattening.                   |

---

## Frontend & browser integration

The package targets ES2020 and is native ESM without Node.js or DOM dependencies.

- **Web Workers**: Parsing and transformation are synchronous and CPU-bound. In
  browser applications, run `parseProject` and `transformProject` inside a Web
  Worker to keep the main UI thread responsive.
- **Bundler Configuration**: Modern bundlers (Vite, Webpack 5, Rollup, esbuild)
  resolve `@preptex/core` directly without polyfills.

### Complete frontend example

A framework-neutral module that reparses editor buffers and returns a preview or
error suitable for UI rendering:

```ts
import {
  DiagnosticSeverity,
  InputHandlingMode,
  PrepTexError,
  PrepTexSyntaxError,
  parseProject,
  transformProject,
  type ConditionName,
  type SourceFile,
} from '@preptex/core';

export interface Preview {
  readonly latex: string;
  readonly warnings: readonly string[];
  readonly error: string | null;
}

export function buildPreview(
  mainSource: string,
  chapterSource: string,
  enabledConditions: readonly ConditionName[],
  version: number
): Preview {
  const files: readonly SourceFile[] = [
    { path: 'main.tex', source: mainSource, version },
    { path: 'chapters/intro.tex', source: chapterSource, version },
  ];

  try {
    const project = parseProject(files);
    const warnings = project.diagnostics
      .filter(({ severity }) => severity === DiagnosticSeverity.Warning)
      .map(({ path, range, message }) => `${path}:${range.line}: ${message}`);

    const result = transformProject('main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
      enabledConditions,
      suppressComments: true,
    });

    const output = result.files[0];
    if (!output) throw new Error('PrepTeX produced no entry file.');
    return { latex: output.source, warnings, error: null };
  } catch (error: unknown) {
    if (error instanceof PrepTexSyntaxError) {
      const { path, range, message } = error.diagnostic;
      return { latex: '', warnings: [], error: `${path}:${range.line}: ${message}` };
    }
    if (error instanceof PrepTexError) {
      return { latex: '', warnings: [], error: `${error.code}: ${error.message}` };
    }
    throw error;
  }
}
```

---

## Backend & server integration

When consuming `@preptex/core` in Node.js, Express, Next.js API routes, or
background job workers, enforce server-side security boundaries:

### 1. Concurrency and event-loop protection

Never invoke `parseProject` or `transformProject` on the main event loop thread.
Offload requests to `worker_threads` (e.g. Piscina) or job queues (e.g. BullMQ).
Core operations are stateless, share no global state, and run safely in parallel.

### 2. Filesystem security & path traversal

`ProjectFilePath` values inside `@preptex/core` are virtual identifiers, **not**
OS filesystem paths. When reading from or writing to disk:

1. Canonicalize the authorized workspace root.
2. Resolve symlinks using `fs.realpath`.
3. Verify that the physical target path is strictly contained within the authorized directory:

   ```ts
   import { realpath } from 'node:fs/promises';
   import path from 'node:path';
   import type { ProjectFilePath } from '@preptex/core';

   function assertVirtualPath(value: string): asserts value is ProjectFilePath {
     const segments = value.split('/');
     if (
       value.length === 0 ||
       value.includes('\0') ||
       value.includes('\\') ||
       path.posix.isAbsolute(value) ||
       /^[A-Za-z]:/.test(value) ||
       segments.some((segment) => segment === '' || segment === '.' || segment === '..')
     ) {
       throw new Error('Access denied: invalid virtual project path.');
     }
   }

   function assertContained(root: string, target: string): void {
     const relative = path.relative(root, target);
     if (
       relative === '' ||
       relative === '..' ||
       relative.startsWith(`..${path.sep}`) ||
       path.isAbsolute(relative)
     ) {
       throw new Error('Access denied: path escapes the authorized root.');
     }
   }

   export async function resolveExistingProjectPath(
     authorizedRoot: string,
     untrustedPath: string
   ): Promise<string> {
     assertVirtualPath(untrustedPath);
     const canonicalRoot = await realpath(authorizedRoot);
     const lexicalTarget = path.resolve(canonicalRoot, ...untrustedPath.split('/'));
     const canonicalTarget = await realpath(lexicalTarget);
     assertContained(canonicalRoot, canonicalTarget);
     return canonicalTarget;
   }
   ```

This helper is deliberately for existing paths. For a new output, validate its
virtual path, resolve and check its existing physical parent, then create or
replace the file through a storage primitive that does not follow an
attacker-controlled symlink. Recheck containment immediately before the atomic
write; a lexical `startsWith` check is not sufficient.

### 3. Downstream TeX sandboxing

PrepTeX safely manipulates text in memory without executing code. However, if the
backend forwards transformed LaTeX to a compiler (`pdflatex`, `latexmk`):

- Run compilation inside an isolated container, microVM, or sandbox (e.g. Bubblewrap).
- Explicitly pass `-no-shell-escape` (or `-cnf-line=shell_escape=f`).
- Restrict network access, execution time, and memory via cgroups.

### 4. Quotas and DoS defenses

Enforce limits before calling `@preptex/core` to prevent memory and CPU exhaustion:

- Maximum files per project (e.g. 500 files).
- Maximum per-file size (e.g. 2 MB) and total project size (e.g. 20 MB).
- Hard CPU timeout per worker job (e.g. 5 seconds).
- Maximum output size (e.g. 50 MB) to guard against recursive `\input` expansion bombs.

### 5. Protocol DTOs and error serialization

Convert `@preptex/core` errors and diagnostics into clean API DTOs without leaking
internal server stack traces:

| Error / Result                     | HTTP Status         | Response DTO                                                                 |
| :--------------------------------- | :------------------ | :--------------------------------------------------------------------------- |
| `PrepTexSyntaxError`               | `422 Unprocessable` | `{ error: 'syntax_error', message, diagnostic: { path, line, start, end } }` |
| `PrepTexErrorCode.InvalidArgument` | `400 Bad Request`   | `{ error: 'invalid_argument', message }`                                     |
| `PrepTexErrorCode.MissingEntry`    | `404 Not Found`     | `{ error: 'missing_entry', message }`                                        |
| `PrepTexErrorCode.MissingInput`    | `422 Unprocessable` | `{ error: 'missing_input', message }`                                        |
| `PrepTexErrorCode.CircularInput`   | `422 Unprocessable` | `{ error: 'circular_input', message }`                                       |

### Complete backend worker-module example

Put this handler in a `worker_threads` or Piscina worker module, not in the HTTP
request handler. The parent must reject oversized jobs before dispatch, enforce
a hard deadline by terminating the worker, and limit output before persistence.
The injected logger keeps unexpected details in server logs while the returned
DTO exposes only a correlation ID and generic message:

```ts
import {
  InputHandlingMode,
  PrepTexError,
  PrepTexErrorCode,
  PrepTexSyntaxError,
  parseProject,
  transformProject,
  type ConditionName,
  type ProjectFilePath,
  type SourceFile,
  type SyntaxDiagnostic,
  type TransformedFile,
  type WarningDiagnostic,
} from '@preptex/core';

export interface BackendJobRequest {
  readonly entryPath: ProjectFilePath;
  readonly files: readonly SourceFile[];
  readonly enabledConditions?: readonly ConditionName[];
  readonly suppressComments?: boolean;
}

export interface BackendJobContext {
  readonly correlationId: string;
  readonly logUnexpectedError: (error: unknown, correlationId: string) => void;
}

export interface BackendJobSuccess {
  readonly ok: true;
  readonly files: readonly TransformedFile[];
  readonly warnings: readonly WarningDiagnostic[];
}

export interface BackendSyntaxFailure {
  readonly kind: 'syntax';
  readonly code: PrepTexErrorCode.SyntaxError;
  readonly message: string;
  readonly correlationId: string;
  readonly diagnostic: SyntaxDiagnostic;
}

export interface BackendExpectedFailure {
  readonly kind: 'expected';
  readonly code: Exclude<PrepTexErrorCode, PrepTexErrorCode.SyntaxError>;
  readonly message: string;
  readonly correlationId: string;
}

export interface BackendInternalFailure {
  readonly kind: 'internal';
  readonly code: 'internal-error';
  readonly message: string;
  readonly correlationId: string;
}

export interface BackendJobFailure {
  readonly ok: false;
  readonly error: BackendSyntaxFailure | BackendExpectedFailure | BackendInternalFailure;
}

export type BackendJobResult = BackendJobSuccess | BackendJobFailure;

export function executeBackendTransform(
  job: BackendJobRequest,
  context: BackendJobContext
): BackendJobResult {
  try {
    const project = parseProject(job.files);
    const result = transformProject(job.entryPath, project, {
      inputHandling: InputHandlingMode.Flatten,
      enabledConditions: job.enabledConditions,
      suppressComments: job.suppressComments ?? true,
    });

    return { ok: true, files: result.files, warnings: project.diagnostics };
  } catch (err: unknown) {
    if (err instanceof PrepTexSyntaxError) {
      return {
        ok: false,
        error: {
          kind: 'syntax',
          code: err.code,
          message: err.message,
          correlationId: context.correlationId,
          diagnostic: err.diagnostic,
        },
      };
    }
    if (err instanceof PrepTexError && err.code !== PrepTexErrorCode.SyntaxError) {
      return {
        ok: false,
        error: {
          kind: 'expected',
          code: err.code,
          message: err.message,
          correlationId: context.correlationId,
        },
      };
    }
    context.logUnexpectedError(err, context.correlationId);
    return {
      ok: false,
      error: {
        kind: 'internal',
        code: 'internal-error',
        message: 'PrepTeX processing failed.',
        correlationId: context.correlationId,
      },
    };
  }
}
```

---

## Public type stability

The root exports from `@preptex/core` and `dist/index.d.ts` form the compatibility
boundary. Patch releases in the `0.2.x` line will remain source-compatible.
Breaking changes to public contracts require a minor version bump during `0.x`
and a major version bump after `1.0.0`. Internal symbols, private classes, and
serialized AST JSON formatting are not compatibility promises.
