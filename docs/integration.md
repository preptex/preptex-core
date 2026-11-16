# PrepTeX integration guide

This guide describes how to consume `@preptex/core@0.4.0` in frontend applications, Web Workers, Node.js services, and CLI tools. Treat the published package and its generated TypeScript declarations (`dist/index.d.ts`) as the authoritative integration boundary:

```sh
npm install --save-exact @preptex/core@0.4.0
```

See also:

- [Project model contract](./project-model.md) for the full operation matrix, condition policies, analyses, and export options.
- [Node operations](./node-operations.md) for source interval indexing, cursor/range lookup, and selected-node transformations.
- [Architecture](./architecture.md) for the 6 core invariants (`INV-1`–`INV-6`) and internal pipeline design.
- [0.4.0 migration](./migration-0.4.md) for migrating from earlier versions to the separated condition and structural pipelines.

---

## Scope

PrepTeX Core is an in-memory, environment-neutral LaTeX tokenizer, condition realizer, structural parser, analyzer, and transformer. It separates **condition realization** from **structural AST generation** over a single stateless whole-file tokenizer:

1. **Stage 0 — Whole-File Stateless Tokenizer & Source Snapshot (`tokenizeFile`, `createProjectSnapshot`)**:
   - Tokenizes each `.tex` file once from index `0` to `source.length` into lossless primitive tokens (`SourceToken[]`: `comment`, `space`, `command`, `open`, `close`, `math`, `text`) and extracts syntax facts (`SyntaxFact[]`) without requiring balanced braces, environments, or conditions.
2. **Pipeline B — Standalone Condition Realizer (`realizeProjectConditions`)**:
   - Evaluates `\newif`, `\if...`, `\else`, `\fi`, and `[\global]\Xtrue`/`\Xfalse` (with `project` or `file-only` traversal) **without building an AST**.
   - Ignores unbalanced `{`, mismatched `\begin`/`\end` environments, math `$`, and custom macros (**INV-3**).
   - Produces both a checked in-place `ProjectEditPlan` (stripping condition directives and inactive branches from source files) and condition-free `GeneratedArtifact[]` files.
3. **Pipeline A — Condition-Free Structural View, Analyses, and Transformations (`resolveProjectView`, `runAnalysis`, `planTransformation`)**:
   - Preprocesses conditions (or asserts that no conditions exist when `conditions: { mode: 'none' }`) and parses the realized token stream into a condition-free structural AST (`ConfiguredNode`: `root | section | environment | group | math | token`).
   - Rejects any unrealized condition command in the structural parser with `status: 'blocked'` and `reason.code === 'unrealized-condition'` (**INV-4**).
   - Runs `references` and `unused-commands` analyses and `suppress-comments`, `remove-environments`, `edit-nodes`, and `export-project` transformations exclusively on the realized `ProjectView` (**INV-6**).

PrepTeX Core does **not**:

- Expand arbitrary TeX macros or evaluate TeX engine primitives.
- Access the host filesystem, network, databases, or environment variables.
- Execute external TeX compilers (`pdflatex`, `xelatex`, `lualatex`, `latexmk`) or sandbox TeX compilation.

---

## Public entry points

| Entry point                                              | Primary use                                                                                                                                                               |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tokenizeFile(source)`                                   | Statelessly scan a single LaTeX string into lossless primitive `SourceToken[]`.                                                                                           |
| `createProjectSnapshot(files, scanOptions?)`             | Create an immutable `ProjectSnapshot` with lossless tokens, syntax facts, and coverage per file.                                                                          |
| `updateProjectSnapshot(snapshot, changes, scanOptions?)` | Atomically upsert or remove files in a snapshot while reusing unchanged file scans.                                                                                       |
| `inspectProject(snapshot, request?)`                     | Query located `SyntaxFact` records (`definition`, `label`, `reference`, `input`, `condition-*`) without an entry file.                                                    |
| `inspectProjectEnvironments(snapshot, scope?)`           | Query literal `\begin`/`\end` environments and ambiguous candidates across source files.                                                                                  |
| `realizeProjectConditions(snapshot, request?)`           | **Pipeline B**: Realize conditions without building an AST; returns `decisions`, in-place `editPlan`, and `artifacts`.                                                    |
| `resolveProjectView(snapshot, configuration)`            | **Pipeline A**: Resolve a configured `ProjectView` (`ready` with condition-free AST `root`, or `incomplete`/`blocked`).                                                   |
| `walkConfiguredNodes(root)`                              | Traverse a `ConfiguredNode` tree in depth-first pre-order.                                                                                                                |
| `isConfiguredContainerNode(node)`                        | Type guard narrowing a `ConfiguredNode` to `ConfiguredContainerNode` (`root`, `section`, `environment`, `group`, `math`).                                                 |
| `indexProjectView(view)`                                 | Index reached syntax facts in encounter order across a configured `ProjectView`.                                                                                          |
| `runAnalysis(view, request)`                             | Run `'references'` or `'unused-commands'` analysis on a configured `ProjectView`.                                                                                         |
| `planTransformation(model, request)`                     | Plan `'realize-conditions'` on a `ProjectSnapshot`, or `'suppress-comments'`, `'remove-environments'`, `'edit-nodes'`, and `'export-project'` on a `ready` `ProjectView`. |
| `validateProjectEditPlan(snapshot, plan, view?)`         | Validate an edit plan's snapshot/view identity, ranges, and occurrence compatibility.                                                                                     |
| `applyProjectEdits(snapshot, plan, view?)`               | Atomically apply a validated `ProjectEditPlan` to a `ProjectSnapshot`, incrementing modified file versions.                                                               |
| `createProjectSourceIndex(model)`                        | Build a balanced interval tree for fast source line/offset/node/token lookups.                                                                                            |
| `sourceOffsetAt(index, path, line, column?)`             | Convert a 1-based line and 0-based UTF-16 column to a 0-based source offset.                                                                                              |
| `lookupProjectSource(index, query)`                      | Query nodes, environments, and tokens intersecting a source offset or range.                                                                                              |
| `selectProjectNode(view, nodeKey)`                       | Create a revision-bound `NodeSelection` for a `ConfiguredNode`.                                                                                                           |
| `getSelectedNode(view, selection)`                       | Resolve and validate a `NodeSelection` against a `ProjectView`.                                                                                                           |
| `getSelectedEnvironment(snapshot, selection)`            | Resolve and validate an `EnvironmentSelection` against a `ProjectSnapshot`.                                                                                               |
| `checkOperationCapability(model, request)`               | Check whether an analysis or transformation can run on the given snapshot or view without throwing.                                                                       |
| `projectOperations`                                      | Readonly catalog of all supported operation descriptors.                                                                                                                  |
| `runProjectPipeline(files, options)`                     | Compose snapshot creation, view resolution, analyses, and project export in a single call.                                                                                |

---

## Frontend two-pipeline workflows

A frontend application can use Pipeline B and Pipeline A either **sequentially** (realizing conditions into the workspace first, then working on a condition-free project) or **in one pass** (letting `resolveProjectView` realize conditions virtually while keeping conditional directives in the raw source files):

```text
                       SourceFile[]
                            │
                            ▼
            createProjectSnapshot(files)
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼ Pipeline B (Condition Realization)    ▼ Pipeline A (Virtual View)
realizeProjectConditions(snapshot, req)   resolveProjectView(snapshot, {
        │                                   entryPath: 'main.tex',
        ├─► realized.artifacts              conditions: { mode: 'source' }
        └─► applyProjectEdits(            })
              snapshot,                         │
              realized.editPlan                 │
            )                                   │
        │                                       │
        ▼                                       │
resolveProjectView(realizedSnapshot, {          │
  entryPath: 'main.tex',                        │
  conditions: { mode: 'none' }                  │
})                                              │
        │                                       │
        └───────────────────┬───────────────────┘
                            │
                            ▼
              Ready ProjectView (Condition-Free AST)
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      runAnalysis   createProjectSourceIndex planTransformation
     ('references',  & selectProjectNode    ('suppress-comments',
    'unused-commands')                      'remove-environments',
                                             'edit-nodes',
                                             'export-project')
```

### Workflow 1: Two-Step Condition Realization $\rightarrow$ Condition-Free AST (`mode: 'none'`)

When the user wants to strip conditions first (even on files with broken environments or unclosed braces) and then inspect or transform the resulting condition-free LaTeX:

1. Call `realizeProjectConditions(snapshot, { entryPath, traversal: 'project', conditions })`.
2. Inspect `realized.status`, `realized.decisions`, `realized.editPlan`, and `realized.artifacts`.
3. Apply `realized.editPlan` with `applyProjectEdits(snapshot, realized.editPlan)` to obtain a condition-free `ProjectSnapshot`.
4. Call `resolveProjectView(conditionFreeSnapshot, { entryPath, conditions: { mode: 'none' } })` to build the structural AST (`view.root`). Because `mode: 'none'` disables condition preprocessing, `resolveProjectView` guarantees that zero unrealized condition commands remain (**INV-4**).

### Workflow 2: Virtual Condition Resolution + Structural View

When the user wants to keep `\if...` blocks in the editor buffers while previewing, analyzing, or exporting a specific condition configuration:

1. Call `resolveProjectView(snapshot, { entryPath, traversal: 'project', conditions })` with `mode: 'source'`, `'source-with-overrides'`, or `'manual'`.
2. Step 1 of `resolveProjectView` runs the shared condition realizer (`evaluateConditionStream`) to produce `view.selectedTokens` with exact `SourceOrigin` provenance back to the original files.
3. Step 2 builds the condition-free `view.root` AST over `view.selectedTokens`.
4. Run `runAnalysis(view, ...)` or `planTransformation(view, ...)`. Checked edits (`suppress-comments`, `remove-environments`, `edit-nodes` with `target: 'selected'`) map back to the original `snapshot` and can be applied with `applyProjectEdits(snapshot, result.editPlan, view)`.

---

## Complete frontend example

```ts
import {
  PrepTexError,
  ProjectOperationError,
  applyProjectEdits,
  createProjectSnapshot,
  inspectProject,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  runAnalysis,
  walkConfiguredNodes,
  type ConditionPolicy,
  type ProjectIssue,
  type SourceFile,
} from '@preptex/core';

export interface FrontendWorkspaceResult {
  readonly ok: boolean;
  readonly realizedLatex: string;
  readonly sectionTitles: readonly string[];
  readonly unresolvedReferences: readonly string[];
  readonly unusedCommands: readonly string[];
  readonly issues: readonly ProjectIssue[];
  readonly error: string | null;
}

export function processWorkspace(
  files: readonly SourceFile[],
  entryPath: string,
  enabledFlags: Readonly<Record<string, boolean>>
): FrontendWorkspaceResult {
  try {
    const snapshot = createProjectSnapshot(files);

    // 1. Inspect source-level declarations without needing a ready AST
    const inventory = inspectProject(snapshot, {
      kinds: ['condition-declaration', 'input', 'label'],
    });
    void inventory;

    const conditions: Exclude<ConditionPolicy, { readonly mode: 'none' }> = {
      mode: 'source-with-overrides',
      overrides: enabledFlags,
    };

    // 2. Pipeline B: Realize conditions independently of AST generation
    const realized = realizeProjectConditions(snapshot, {
      entryPath,
      traversal: 'project',
      conditions,
    });
    if (realized.status !== 'ready' || !realized.editPlan) {
      return {
        ok: false,
        realizedLatex: '',
        sectionTitles: [],
        unresolvedReferences: [],
        unusedCommands: [],
        issues: realized.coverage.issues,
        error: realized.reason?.message ?? 'Condition realization incomplete.',
      };
    }

    // Apply in-place condition edits to produce a condition-free snapshot
    const conditionFreeSnapshot = applyProjectEdits(snapshot, realized.editPlan);

    // 3. Pipeline A: Build condition-free structural view with mode: 'none'
    const view = resolveProjectView(conditionFreeSnapshot, {
      entryPath,
      traversal: 'project',
      conditions: { mode: 'none' },
    });
    if (view.status !== 'ready') {
      return {
        ok: false,
        realizedLatex: '',
        sectionTitles: [],
        unresolvedReferences: [],
        unusedCommands: [],
        issues: view.coverage.issues,
        error: `${view.reason.code}: ${view.reason.message}`,
      };
    }

    const sectionTitles = walkConfiguredNodes(view.root)
      .filter(
        (node): node is Extract<typeof node, { readonly kind: 'section' }> =>
          node.kind === 'section'
      )
      .map((node) => node.name);

    // 4. Run analyses on the realized ProjectView
    const refResult = runAnalysis(view, { operation: 'references' });
    const cmdResult = runAnalysis(view, { operation: 'unused-commands' });

    // 5. Export realized, inlined, comment-stripped output
    const exported = planTransformation(view, {
      operation: 'export-project',
      options: {
        inputs: 'inline',
        suppressComments: true,
        suppressCommentEnvironments: true,
      },
    });

    return {
      ok: true,
      realizedLatex: exported.artifacts[0]?.source ?? '',
      sectionTitles,
      unresolvedReferences: refResult.references
        .filter((ref) => ref.status !== 'matched')
        .map((ref) => ref.key.value ?? ''),
      unusedCommands: cmdResult.commands
        .filter((cmd) => cmd.classification === 'no-recognized-use')
        .map((cmd) => cmd.name),
      issues: view.coverage.issues,
      error: null,
    };
  } catch (error: unknown) {
    if (error instanceof ProjectOperationError) {
      return {
        ok: false,
        realizedLatex: '',
        sectionTitles: [],
        unresolvedReferences: [],
        unusedCommands: [],
        issues: [],
        error: `${error.failure.code}: ${error.failure.message}`,
      };
    }
    if (error instanceof PrepTexError) {
      return {
        ok: false,
        realizedLatex: '',
        sectionTitles: [],
        unresolvedReferences: [],
        unusedCommands: [],
        issues: [],
        error: `${error.code}: ${error.message}`,
      };
    }
    throw error;
  }
}
```

---

## Error handling and diagnostics

### View and Realization Readiness (`status` and `reason.code`)

`resolveProjectView` and `realizeProjectConditions` do not throw on LaTeX content issues; instead they return a structured status (`'ready' | 'incomplete' | 'blocked'`) and a `reason: ProjectIssue | null` with a machine-readable `ProjectIssueCode`:

| `ProjectIssueCode`                                             | Meaning                                                                                                                                            |
| :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'unrealized-condition'`                                       | A conditional command (`\newif`, `\if...`, `\else`, `\fi`, or declared setter) reached the structural AST parser (`conditions: { mode: 'none' }`). |
| `'unknown-condition'`                                          | A reached `\if<name>` test had no known boolean value under the active `ConditionPolicy`.                                                          |
| `'unsupported-condition'`                                      | A reached primitive TeX conditional (`\ifnum`, `\ifdim`, `\ifx`, `\ifmmode`, etc.) cannot be evaluated statically.                                 |
| `'unclosed-conditional'`                                       | A conditional block was left open at end of file.                                                                                                  |
| `'cross-file-conditional'`                                     | An `\else` or `\fi` attempted to close a conditional opened in a different file inclusion.                                                         |
| `'missing-entry'` / `'missing-input'`                          | The entry file or an active `\input{...}` target does not exist in the `ProjectSnapshot`.                                                          |
| `'ambiguous-input'` / `'invalid-input-path'` / `'input-cycle'` | An active `\input{...}` matched multiple files, escaped the project root, or formed a cycle.                                                       |
| `'structural-error'`                                           | Unbalanced braces, mismatched `\begin`/`\end` environments, or mismatched math delimiters in the realized token stream.                            |
| `'interpretation-limit'`                                       | Nesting depth, inclusion count, or selected code-unit bound was exceeded.                                                                          |

### Exceptions (`PrepTexError` and `ProjectOperationError`)

Programmatic exception handling should branch on `PrepTexError.code` (`PrepTexErrorCode`):

| `PrepTexErrorCode`                      | Thrown when                                                                                                     |
| :-------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| `PrepTexErrorCode.InvalidArgument`      | A caller-supplied argument, path, version, or option violated runtime validation.                               |
| `PrepTexErrorCode.OperationUnavailable` | `runAnalysis` or `planTransformation` was called on an incomplete/blocked view without `allowIncomplete: true`. |
| `PrepTexErrorCode.StaleResult`          | An edit plan or node selection belongs to a different snapshot/view revision.                                   |
| `PrepTexErrorCode.InvalidEdit`          | An edit plan contains out-of-range, overlapping, or surrogate-splitting ranges.                                 |
| `PrepTexErrorCode.EditConflict`         | Shared-file inclusions disagree on an edit, or inlining would move a preserved relative `\input`.               |
| `PrepTexErrorCode.OutputLimit`          | Generated output exceeded `maxOutputCodeUnits`.                                                                 |

---

## Backend & worker thread integration

### 1. Concurrency and event-loop protection

All `@preptex/core` operations are synchronous and CPU-bound. In browsers, run them inside a Web Worker; in Node.js backends, offload them to `worker_threads` or a job queue. Core functions share no mutable global state and are safe for concurrent execution across workers.

### 2. Filesystem security & path containment

`ProjectFilePath` values are virtual project-relative identifiers, **not** OS paths:

1. Canonicalize the authorized workspace root (`fs.realpath`).
2. Reject absolute paths, drive letters, backslashes, and `..` segments before joining.
3. Verify that the resolved target remains strictly inside the canonical workspace root before reading or writing.

### 3. Complete backend worker-module example

```ts
import {
  PrepTexError,
  PrepTexErrorCode,
  ProjectOperationError,
  createProjectSnapshot,
  planTransformation,
  resolveProjectView,
  type ConditionPolicy,
  type GeneratedArtifact,
  type OperationFailure,
  type ProjectFilePath,
  type ProjectIssue,
  type SourceFile,
} from '@preptex/core';

export interface BackendJobRequest {
  readonly entryPath: ProjectFilePath;
  readonly files: readonly SourceFile[];
  readonly conditions?: ConditionPolicy;
  readonly inlineInputs?: boolean;
  readonly suppressComments?: boolean;
}

export interface BackendJobContext {
  readonly correlationId: string;
  readonly logUnexpectedError: (error: unknown, correlationId: string) => void;
}

export type BackendJobResult =
  | {
      readonly ok: true;
      readonly artifacts: readonly GeneratedArtifact[];
      readonly issues: readonly ProjectIssue[];
    }
  | {
      readonly ok: false;
      readonly code: PrepTexErrorCode | ProjectIssue['code'] | 'internal-error';
      readonly message: string;
      readonly correlationId: string;
      readonly failure?: OperationFailure;
      readonly viewIssue?: ProjectIssue;
    };

export function executeBackendTransform(
  job: BackendJobRequest,
  context: BackendJobContext
): BackendJobResult {
  try {
    const snapshot = createProjectSnapshot(job.files);
    const view = resolveProjectView(snapshot, {
      entryPath: job.entryPath,
      traversal: 'project',
      ...(job.conditions ? { conditions: job.conditions } : {}),
    });

    if (view.status !== 'ready') {
      return {
        ok: false,
        code: view.reason.code,
        message: view.reason.message,
        correlationId: context.correlationId,
        viewIssue: view.reason,
      };
    }

    const transformed = planTransformation(view, {
      operation: 'export-project',
      options: {
        inputs: job.inlineInputs === false ? 'preserve' : 'inline',
        suppressComments: job.suppressComments ?? true,
      },
    });

    return {
      ok: true,
      artifacts: transformed.artifacts,
      issues: transformed.coverage.issues,
    };
  } catch (err: unknown) {
    if (err instanceof ProjectOperationError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        correlationId: context.correlationId,
        failure: err.failure,
      };
    }
    if (err instanceof PrepTexError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        correlationId: context.correlationId,
      };
    }
    context.logUnexpectedError(err, context.correlationId);
    return {
      ok: false,
      code: 'internal-error',
      message: 'PrepTeX processing failed.',
      correlationId: context.correlationId,
    };
  }
}
```
