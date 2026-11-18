# Project model integration contract

`@preptex/core@0.4.0` provides a separated two-pipeline architecture over a single stateless whole-file tokenizer:

- **Stage 0**: Source snapshots (`createProjectSnapshot`, `updateProjectSnapshot`), whole-file primitive tokenization (`tokenizeFile`), and source inventories (`inspectProject`, `inspectProjectEnvironments`).
- **Pipeline B**: Standalone condition realization (`realizeProjectConditions` and `operation: 'realize-conditions'`), independent of structural AST generation.
- **Pipeline A**: Condition-free structural views (`resolveProjectView`), AST traversal (`walkConfiguredNodes`), reached analyses (`runAnalysis`), source indexing (`createProjectSourceIndex`, `lookupProjectSource`, `sourceOffsetAt`), node/comment/environment edits, and exports (`planTransformation`, `applyProjectEdits`, `runProjectPipeline`).

See [Node operations](./node-operations.md) for source interval indexing and selected-node transformations, [Integration guide](./integration.md) for complete frontend/backend examples, and [0.4.0 migration](./migration-0.4.md) for migration details.

---

## Public operations

| Operation                                                             | Result                                                                                                                                     | Available |
| :-------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| `tokenizeFile(source)`                                                | Stateless whole-file primitive token array (`SourceToken[]`)                                                                               | Yes       |
| `createProjectSnapshot(files, scanOptions?)`                          | Immutable original sources, lossless tokens, located facts, and per-file coverage                                                          | Yes       |
| `updateProjectSnapshot(snapshot, changes, scanOptions?)`              | Atomic source upserts/removals and optional scan-setting replacement; unchanged scans reused                                               | Yes       |
| `inspectProject(snapshot, request?)`                                  | Located source inventory; no entry or output required                                                                                      | Yes       |
| `inspectProjectEnvironments(snapshot, scope?)`                        | Literal source environments and located ambiguous candidates                                                                               | Yes       |
| `realizeProjectConditions(snapshot, request?)`                        | **Pipeline B**: Standalone condition realization returning `decisions`, `editPlan`, and condition-free `artifacts` without building an AST | Yes       |
| `resolveProjectView(snapshot, configuration)`                         | **Pipeline A**: Ready condition-free structure (`root`) or `incomplete`/`blocked` trace                                                    | Yes       |
| `walkConfiguredNodes(root)` / `isConfiguredContainerNode(node)`       | Public traversal and exhaustive container narrowing                                                                                        | Yes       |
| `checkOperationCapability(model, request)` / `projectOperations`      | Requirements and structured eligibility reasons                                                                                            | Yes       |
| `validateProjectEditPlan(snapshot, plan, view?)`                      | Identity, range, overlap, and occurrence-compatibility validation                                                                          | Yes       |
| `indexProjectView(view)`                                              | Reusable reached facts in encounter order, with coverage                                                                                   | Yes       |
| `runAnalysis(view, request)`                                          | Independent `references` or conservative `unused-commands` findings on a `ProjectView`                                                     | Yes       |
| `planTransformation(model, request)`                                  | `realize-conditions` on `ProjectSnapshot`; `suppress-comments`, `remove-environments`, `edit-nodes`, and `export-project` on `ProjectView` | Yes       |
| `applyProjectEdits(snapshot, plan, view?)`                            | Atomic validated source replacement, advancing changed file revisions                                                                      | Yes       |
| `runProjectPipeline(files, options)`                                  | Frozen snapshot, configured view, ordered analyses, and export result                                                                      | Yes       |
| `createProjectSourceIndex` / `lookupProjectSource` / `sourceOffsetAt` | Indexed source-position lookup and line conversion                                                                                         | Yes       |
| `selectProjectNode` / `getSelectedNode` / `getSelectedEnvironment`    | Canonical revision-bound selections and original locations                                                                                 | Yes       |

All listed descriptors in `projectOperations` are implemented (`realize-conditions`, `references`, `unused-commands`, `suppress-comments`, `remove-environments`, `edit-nodes`, `export-project`). Capability checks use the same model, scope, and readiness rules as execution. Consumers should handle `ProjectOperationError.code` and its frozen, located `failure` data.

---

## Stage 0: Source inspection and atomic replacement

```ts
import {
  createProjectSnapshot,
  inspectProject,
  tokenizeFile,
  updateProjectSnapshot,
  type SourceFile,
} from '@preptex/core';

const tokens = tokenizeFile('\\iftrue\\section{Intro}\\fi');
// tokens.map(t => t.value).join('') === '\\iftrue\\section{Intro}\\fi'

const files: readonly SourceFile[] = [
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newcommand{\hello}{Hi}\label{intro}\ref{intro}`,
  },
];
const source = createProjectSnapshot(files);
const inventory = inspectProject(source, {
  kinds: ['definition', 'label', 'reference'],
});
for (const fact of inventory.facts) {
  console.log(fact.kind, fact.path, fact.range, fact.context);
}
const next = updateProjectSnapshot(source, [
  { kind: 'upsert', file: { path: 'main.tex', version: 2, source: 'Changed' } },
]);
```

- `tokenizeFile(source)` runs once per file during snapshot creation/update (**INV-1**) and produces primitive tokens (`comment`, `space`, `command`, `open`, `close`, `math`, `text`) whose concatenated `value` fields equal `file.source` (**INV-2**).
- Snapshots do not require balanced environments, brace groups, math, or per-file conditionals.
- Facts include supported definitions (`newcommand`, `renewcommand`, `providecommand`, `def`), direct command uses, labels, `ref`/`pageref`/`eqref`, condition declarations/tests/delimiters/setter candidates, and literal/dynamic input candidates.

---

## Pipeline B: Standalone condition realization

```ts
import { applyProjectEdits, createProjectSnapshot, realizeProjectConditions } from '@preptex/core';

const snapshot = createProjectSnapshot([
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\ifcam\camtrue
\ifcam
{ \begin{unclosed}
Keep me
\else
Drop me
\fi`,
  },
]);

const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  traversal: 'project',
  conditions: { mode: 'source' },
  inputs: 'preserve',
  stripDeclarationsAndSetters: true,
});

if (realized.status === 'ready' && realized.editPlan) {
  // In-place condition realization on the workspace snapshot
  const updatedSnapshot = applyProjectEdits(snapshot, realized.editPlan);
  console.log(updatedSnapshot.files[0]?.source); // "{ \begin{unclosed}\nKeep me\n"
}
```

- `realizeProjectConditions(snapshot, request)` (or `planTransformation(snapshot, { operation: 'realize-conditions', options: request })`) evaluates `\newif`, `\if...`, `\else`, `\fi`, and `[\global]\Xtrue`/`\Xfalse` directly over `file.tokens` without building a structural AST (**INV-3**, **INV-5**).
- Unbalanced braces `{`, mismatched `\begin{foo}...\end{bar}`, unclosed math `$`, and unknown user commands do **not** block condition realization.
- Supports `traversal: 'project'` (follows active `\input{...}` from `entryPath` so `\newif` and `\Xtrue`/`\Xfalse` state propagate across files in document order) and `traversal: 'file-only'` (evaluates each file in `scope` independently while leaving `\input{...}` untouched).
- Supports `inputs: 'preserve'` (emits realized artifacts per reached file and provides `editPlan` when shared files have no conflicting specializations) and `inputs: 'inline'` (inlines active `\input{...}` into a single entry artifact).

---

## Pipeline A: Configuration, view resolution, and condition-free AST

```ts
import { checkOperationCapability, resolveProjectView, walkConfiguredNodes } from '@preptex/core';

const view = resolveProjectView(source, {
  entryPath: 'main.tex',
  traversal: 'project',
  conditions: {
    mode: 'source-with-overrides',
    overrides: { draft: false },
  },
});
if (view.status === 'ready') {
  for (const node of walkConfiguredNodes(view.root)) {
    console.log(node.kind, node.occurrenceKey, node.origins);
  }
} else {
  console.log(view.reason.code, view.reason.location, view.reason.inputChain);
}
const eligibility = checkOperationCapability(view, { operation: 'references' });
```

### Condition policies (`ConditionPolicy`)

| Policy                                                         | Meaning                                                                                                                                                                                                                                                                                 |
| :------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ mode: 'source', initialValues? }` (default)                 | Reached `\newif` declarations initialize `false`; reached setters (`\Xtrue`/`\Xfalse`) update state in encounter order. `initialValues` seeds external boolean bindings before entry (reset if later redeclared by `\newif`).                                                           |
| `{ mode: 'source-with-overrides', overrides, initialValues? }` | Tracks source declarations/setters and records them, but forces explicitly supplied `overrides` at each test.                                                                                                                                                                           |
| `{ mode: 'manual', values }`                                   | Forces only supplied `values` at every test; omitted names stop with `'unknown-condition'`.                                                                                                                                                                                             |
| `{ mode: 'none' }`                                             | Disables condition preprocessing in Step 1. Any `\newif`, `\if...`, `\else`, `\fi`, or declared setter encountered in Step 2 immediately blocks the view with `reason.code === 'unrealized-condition'` (**INV-4**). Use after running `realizeProjectConditions` + `applyProjectEdits`. |
| `{ mode: 'ignore' }`                                           | Visits all conditional branches without evaluating or stripping conditionals, treating `\newif`, `\if...`, `\else`, `\fi`, and setters as ordinary LaTeX commands. Cross-branch mismatched structures still report `'structural-error'` if parsed into an AST.                          |

### Supported interpretation profile (`direct-latex-v1`)

- **Condition evaluation (`evaluateConditionStream`)**:
  - Supports `\newif\if<name>`, generated setters `\<name>true`/`\<name>false`, `\global\<name>true`/`\global\<name>false`, literal `\iftrue`/`\iffalse`, `\else`, and `\fi`.
  - Active verbatim (`\verb`, `\verb*`, `verbatim`, `verbatim*`, `comment`, and custom `ScanOptions.verbatimEnvironments`) is preserved literally so `\if`/`\else`/`\fi` inside active verbatim is never treated as condition syntax. In skipped branches, verbatim environments do not execute and `\if...\else...\fi` tokens balance by primitive token kind.
  - Active macro definition bodies (`\newcommand`, `\renewcommand`, `\providecommand`, `\def`) are not executed at definition time. If a definition body contains only primitive TeX conditionals (`\ifmmode`, `\ifx`, `\ifdim`, `\ifnum`) and no document boolean flags, it is preserved intact as opaque without tripping `'unsupported-condition'`. Redefining a tracked boolean test, setter, conditional delimiter, or `\input` marks that command binding opaque so subsequent invocation stops with `'unsupported-effect'`; ordinary user macros (`\newcommand{\myvec}[1]{...}`) do not block interpretation.
  - Stored key/metadata arguments (`\label{...}`, `\ref{...}`, `\cite{...}`, `\usepackage{...}`, etc.) are treated as non-executed opaque spans.
  - Formatting commands (`\section`, `\textbf`, `\emph`, etc.) containing math or macros (`\section{Model $\alpha$}`) and unknown user commands with arguments (`\mycustomcmd{arg}`) do **not** block `resolveProjectView`.
- **Condition-Free Structural AST (`parseConfiguredStructure`)**:
  - Expects zero unrealized condition commands (**INV-4**).
  - Builds `ConfiguredNode` (`root | section | command | environment | group | math | token`) over the realized `SelectedToken[]` stream, attaching `starred` and `ConfiguredCommandArgument` spans (`location`, `innerLocation`, `projectedRange`, `innerProjectedRange`, `childStart`, `childEnd`) to known-signature commands and section headings without duplicating argument text strings.
  - Because condition directives and inactive branches are already stripped in Step 1, environments or brace groups that originally straddled `\if...\else...\fi` in raw source parse cleanly into balanced `ConfiguredEnvironmentNode` or `ConfiguredGroupNode` containers with multi-span `origins` and `location`.

---

## Independent analyses (`runAnalysis`)

```ts
import { indexProjectView, runAnalysis } from '@preptex/core';

const index = indexProjectView(view);
const references = runAnalysis(view, { operation: 'references' });
const commands = runAnalysis(view, { operation: 'unused-commands' });
```

Both `'references'` and `'unused-commands'` operate on a configured `ProjectView` (**INV-6**):

- **`references`**: Matches reached `\ref`, `\pageref`, and `\eqref` occurrences against reached `\label` declarations in encounter order. Reports `matched`, `duplicate`, `missing`, `unresolved`, or `unknown-coverage` status, target locations, and `forward: boolean`.
- **`unused-commands`**: Inspects reached command definitions (`\newcommand`, `\renewcommand`, `\providecommand`, `\def`) and reached command uses in the configured `ProjectView`. Classifies each definition as `'directly-used'`, `'body-used'`, `'self-recursive-only'`, `'no-recognized-use'`, or `'ambiguous-binding'`.
- Incomplete/blocked views require `options: { allowIncomplete: true }` for partial analysis; otherwise `runAnalysis` throws `ProjectOperationError` with `PrepTexErrorCode.OperationUnavailable`.

---

## Checked edits and project exports (`planTransformation` & `applyProjectEdits`)

```ts
import { applyProjectEdits, planTransformation, realizeProjectConditions } from '@preptex/core';

// 1. Standalone condition realization on ProjectSnapshot (Pipeline B)
const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'source' },
});
const afterConds = realized.editPlan ? applyProjectEdits(snapshot, realized.editPlan) : snapshot;

// 2. Selected comment suppression on ProjectView (Pipeline A)
const preview = planTransformation(view, {
  operation: 'suppress-comments',
  options: { target: 'selected', suppressCommentEnvironments: true },
});
const edited = preview.editPlan ? applyProjectEdits(snapshot, preview.editPlan, view) : snapshot;

// 3. Realized project export on ProjectView (Pipeline A)
const exported = planTransformation(view, {
  operation: 'export-project',
  options: {
    inputs: 'inline',
    suppressComments: true,
    suppressCommentEnvironments: true,
  },
});
```

| Operation               | Target Model                      | Options                                                                                                                                            | Result                                                                                                                                |
| :---------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `'realize-conditions'`  | `ProjectSnapshot`                 | `ConditionRealizationRequest` (`entryPath?`, `traversal?`, `scope?`, `conditions?`, `inputs?`, `stripDeclarationsAndSetters?`)                     | Checked `editPlan` (when `inputs: 'preserve'` and no shared-file conflict) and realized condition-free `artifacts`                    |
| `'suppress-comments'`   | `ProjectView` / `ProjectSnapshot` | `{ target?: 'selected' \| 'source', suppressCommentEnvironments?: boolean, entryPath?: string, traversal?: 'project' \| 'file-only' }`             | Checked `editPlan` removing reached `%` comments (and `comment` environments when enabled) plus preview `artifacts`                   |
| `'remove-environments'` | `ProjectView` / `ProjectSnapshot` | `{ target: 'selected' \| 'source' \| 'artifact', names: readonly string[], entryPath?: string, traversal?: 'project' \| 'file-only' }`             | Checked `editPlan` + preview `artifacts` (`'selected'`/`'source'`) or inlined `artifacts` (`'artifact'`)                              |
| `'expand-inputs'`       | `ProjectView` / `ProjectSnapshot` | `{ mode: 'single' \| 'recursive', target?: 'selected' \| 'source' \| 'artifact', entryPath?: string }`                                             | Checked `editPlan` replacing `\input{...}` with target file contents (`'selected'`/`'source'`) or expanded `artifacts` (`'artifact'`) |
| `'edit-nodes'`          | `ProjectView` (`ready`)           | `{ target: 'selected' \| 'artifact', actions: readonly NodeEditAction[] }`                                                                         | Checked `editPlan` + preview `artifacts` (`'selected'`) or inlined `artifacts` (`'artifact'`)                                         |
| `'export-project'`      | `ProjectView` / `ProjectSnapshot` | `ExportOptions` (`inputs?: 'preserve' \| 'inline'`, `suppressComments?`, `suppressCommentEnvironments?`, `nodeEdits?`, `entryPath?`, `traversal?`) | Realized `artifacts` (`editPlan: null`) with `mappings` and `dependencies`; missing `\input` targets emit warnings and stay preserved |

- `export-project` always emits **realized, condition-free** LaTeX from the `ProjectView`:
  - `inputs: 'preserve'` (default): Emits each reached file separately with literal `\input{...}` commands preserved and `dependencies` populated. Fails with `EditConflict` if a shared file was included multiple times with different condition outcomes.
  - `inputs: 'inline'`: Inlines active `\input{...}` files into a single entry artifact (`topology: 'self-contained-profile'`). Required when `nodeEdits` is non-empty.
- When applying a `ProjectEditPlan` derived from a `ProjectView` (`suppress-comments`, `remove-environments`, `edit-nodes`), pass `view` as the third argument to `applyProjectEdits(snapshot, plan, view)`. When applying a `ProjectEditPlan` from `realizeProjectConditions` (`viewId === null`), call `applyProjectEdits(snapshot, plan)`.

---

## Verification commands

Run from the repository root:

```sh
npm run check
npm run build
node examples/project-model.mjs
node examples/node-operations.mjs
node examples/benchmark-project-model.mjs
node examples/benchmark-node-lookup.mjs
npm run docs
npm run pack:check
npm run consumer:check
```
