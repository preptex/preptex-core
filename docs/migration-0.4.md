# Migrating to `@preptex/core@0.4.0`

`@preptex/core@0.4.0` introduces the **separated condition-realization and condition-free structural AST architecture** and removes all deprecated `0.2.x` / `0.3.0` compatibility functions, enums, and source-target/preserve-condition shim options.

---

## Summary of removed APIs and their `0.4.0` replacements

| Removed API / Option                                                            | `@preptex/core@0.4.0` Replacement                                                                                                               | Notes                                                                                                                                                                                                                            |
| :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseDocument`, `parseProject`                                                 | `createProjectSnapshot(files)` + `resolveProjectView(snapshot, config)`                                                                         | `createProjectSnapshot` tokenizes each file once (`tokenizeFile`) and extracts `SyntaxFact[]` without requiring balanced structure. `resolveProjectView` realizes conditions and builds the condition-free `ConfiguredNode` AST. |
| `mergeProjects`                                                                 | `updateProjectSnapshot(snapshot, changes, scanOptions?)`                                                                                        | Supports atomic `upsert` and `remove` changes and reuses unchanged file scans.                                                                                                                                                   |
| `serializeDocument`, `transformProject`, `InputHandlingMode`, `TransformedFile` | `realizeProjectConditions(snapshot, request)` or `planTransformation(view, { operation: 'export-project', options })`                           | Use `realizeProjectConditions` for standalone condition realization without AST parsing; use `planTransformation` on a `ProjectView` for structural exports (`GeneratedArtifact`).                                               |
| `AstNode`, `NodeType`, `isContainerNode`                                        | `ConfiguredNode`, `walkConfiguredNodes`, `isConfiguredContainerNode`                                                                            | Discriminated by `node.kind` (`'root' \| 'section' \| 'environment' \| 'group' \| 'math' \| 'token'`).                                                                                                                           |
| `PrepTexSyntaxError`, `DiagnosticCode`, `DiagnosticSeverity`                    | `ProjectView.status` / `ProjectView.reason` (`ProjectIssue`), `ConditionRealizationResult.reason`, `PrepTexError`, `ProjectOperationError`      | Expected LaTeX syntax or condition issues are reported as structured `ProjectIssue` records (`status: 'incomplete' \| 'blocked'`) rather than throwing exceptions during parsing.                                                |
| `operation: 'identity'`                                                         | Read `snapshot.files` directly                                                                                                                  | `ProjectSnapshot.files` already holds the exact, frozen original `source` strings.                                                                                                                                               |
| `operation: 'materialize'`                                                      | `realizeProjectConditions(snapshot, request)` (Pipeline B) or `planTransformation(view, { operation: 'export-project', options })` (Pipeline A) | In `0.4.0`, `export-project` always emits condition-realized output from the `ProjectView`, while `realizeProjectConditions` realizes conditions directly on a `ProjectSnapshot`.                                                |
| `ExportOptions.conditions: 'preserve' \| 'materialize'`                         | `ExportOptions` (`{ inputs?: 'preserve' \| 'inline', suppressComments?, suppressCommentEnvironments?, nodeEdits? }`)                            | Conditions are always realized prior to AST construction and export.                                                                                                                                                             |
| `target: 'source'` on `suppress-comments` and `remove-environments`             | `target: 'selected'` (or `'artifact'`) on a ready `ProjectView`                                                                                 | Structural operations (`suppress-comments`, `remove-environments`, `edit-nodes`) operate exclusively on the realized `ProjectView` (**INV-6**).                                                                                  |
| `runAnalysis(snapshot, { operation: 'unused-commands' })`                       | `runAnalysis(view, { operation: 'unused-commands' })`                                                                                           | Both `'references'` and `'unused-commands'` analyses operate on a configured `ProjectView` (**INV-6**). Use `inspectProject(snapshot, { kinds: ['definition', 'command-use'] })` for raw unconfigured source inventories.        |

---

## Separating Condition Realization (Pipeline B) from AST Generation (Pipeline A)

### 1. Standalone Condition Realization (Pipeline B)

When the frontend needs to evaluate and strip `\newif`, `\if...`, `\else`, `\fi`, and `\Xtrue`/`\Xfalse` without requiring balanced environments, braces, or math:

```ts
import {
  applyProjectEdits,
  createProjectSnapshot,
  realizeProjectConditions,
  type SourceFile,
} from '@preptex/core';

const files: readonly SourceFile[] = [
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\ifanon\anontrue
\ifanon Anonymous Author\else Real Author\fi`,
  },
];

const snapshot = createProjectSnapshot(files);
const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  traversal: 'project',
  conditions: { mode: 'source' },
});

if (realized.status === 'ready' && realized.editPlan) {
  const conditionFreeSnapshot = applyProjectEdits(snapshot, realized.editPlan);
  // conditionFreeSnapshot.files[0].source === 'Anonymous Author'
}
```

### 2. Building the Condition-Free AST after Realization (`conditions: { mode: 'none' }`)

Once conditions have been realized in-place on a `ProjectSnapshot`, pass `conditions: { mode: 'none' }` to `resolveProjectView`:

```ts
import { resolveProjectView } from '@preptex/core';

const view = resolveProjectView(conditionFreeSnapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'none' },
});
// If any unrealized \if/\else/\fi remained, view.status === 'blocked'
// and view.reason.code === 'unrealized-condition'.
```

### 3. One-Pass Virtual Realization + Structural Pipeline

If the frontend wants to keep conditional directives in the editor buffers while building the realized AST, running analyses, or exporting:

```ts
import {
  createProjectSnapshot,
  planTransformation,
  resolveProjectView,
  runAnalysis,
  runProjectPipeline,
  type SourceFile,
} from '@preptex/core';

const files: readonly SourceFile[] = [
  { path: 'main.tex', version: 1, source: String.raw`\newif\ifdraft\drafttrue\ref{x}\input{part}` },
  { path: 'part.tex', version: 1, source: String.raw`\ifdraft\label{x}Hello\fi` },
];

const snapshot = createProjectSnapshot(files);
const configuration = {
  entryPath: 'main.tex',
  conditions: { mode: 'source' },
} as const;

const view = resolveProjectView(snapshot, configuration);
const exportOptions = { inputs: 'inline', suppressComments: true } as const;

if (view.status === 'ready') {
  const references = runAnalysis(view, { operation: 'references' });
  const output = planTransformation(view, {
    operation: 'export-project',
    options: exportOptions,
  });
  console.log(references.findings, output.artifacts[0]?.source);
}

// Or compose snapshot + view + analyses + export in one call:
const pipeline = runProjectPipeline(files, {
  configuration,
  analyses: [{ operation: 'references' }, { operation: 'unused-commands' }],
  exportOptions,
});
```
