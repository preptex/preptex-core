# Source lookup and selected-node transformations

These APIs provide original-source interval indexing, cursor/range lookup, environment inventories, and selected-node transformations in `@preptex/core@0.3.0`. All operations expose deeply readonly data without mutable parser objects or custom callbacks.

The [runnable example](../examples/node-operations.mjs) demonstrates standalone condition realization (`realizeProjectConditions` + `applyProjectEdits`), condition-free view construction (`conditions: { mode: 'none' }`), node selection, environment renaming/wrapping, and comment suppression.

---

## Original source and selections

- Tokens expose `range.line` (one-based) and inclusive, zero-based UTF-16 `range.start` / `range.end` into the original JavaScript string.
- Every `ConfiguredNode` has a `location`: `none` for no contributing source, `single` for one contiguous original extent, or `multiple` for all contributing spans in encounter order (e.g., when an environment or group straddled a realized `\if...\else...\fi` or `\input`). Each span includes `path`, `version`, `snapshotId`, and `occurrenceId`.
- Environment `syntax.opening` and `syntax.closing` expose whole-command and name-only ranges with revision/inclusion metadata. `syntax.body` exists when the environment originates from a single contiguous file span. `hasArguments` conservatively reports a following optional `[...]` or braced `{...}` argument.
- `inspectProjectEnvironments(snapshot, scope?)` inventories literal `\begin`/`\end` environments directly over `file.tokens` without requiring an entry file or condition values, including both conditional branches and stored definition bodies.
- `createProjectSourceIndex(snapshotOrView)` builds frozen per-file line starts and balanced interval trees.
  - `sourceOffsetAt(index, path, line, column?)` converts a 1-based line and 0-based UTF-16 column to a source offset.
  - `lookupProjectSource(index, { path, start, end?, kinds?, occurrenceId? })` queries intersecting `'node'`, `'environment'`, and `'token'` hits (deepest nodes first, then encounter order).
- `selectProjectNode(view, node.occurrenceKey)` creates a snapshot/view/node-bound `NodeSelection`; `getSelectedNode(view, selection)` resolves it. Source environment inventory hits use `EnvironmentSelection` and `getSelectedEnvironment(snapshot, selection)`. Obsolete or mismatched selections fail with `PrepTexErrorCode.StaleResult`.

---

## Preview and apply node transformations

```ts
import {
  applyProjectEdits,
  createProjectSnapshot,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  selectProjectNode,
  walkConfiguredNodes,
} from '@preptex/core';

const snapshot = createProjectSnapshot([
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\newif\ifdraft\drafttrue
\ifdraft\begin{itemize}\item Hello\end{itemize}\fi`,
  },
]);

// Optional Pipeline B step: realize conditions in-place first
const realized = realizeProjectConditions(snapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'source' },
});
const cleanSnapshot = realized.editPlan ? applyProjectEdits(snapshot, realized.editPlan) : snapshot;

// Pipeline A: resolve condition-free structural view
const view = resolveProjectView(cleanSnapshot, {
  entryPath: 'main.tex',
  conditions: { mode: 'none' },
});
if (view.status !== 'ready') throw new Error('A ready view is required.');

const list = walkConfiguredNodes(view.root).find((n) => n.kind === 'environment');
if (!list) throw new Error('No environment found.');

const selection = selectProjectNode(view, list.occurrenceKey);
const result = planTransformation(view, {
  operation: 'edit-nodes',
  options: {
    target: 'selected',
    actions: [
      { kind: 'rename-environment', selection, name: 'enumerate' },
      { kind: 'wrap-node', selection, name: 'center' },
    ],
  },
});

if (result.editPlan) {
  const updated = applyProjectEdits(cleanSnapshot, result.editPlan, view);
  console.log(updated.files[0]?.source);
  // \begin{center}\begin{enumerate}\item Hello\end{enumerate}\end{center}
}
```

### Supported node & environment transformation targets

| Request               | Model & Target               | Behavior                                                                                                                   |
| :-------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `edit-nodes`          | `view`, `target: 'selected'` | Checked physical source edits (`editPlan`) and preview `artifacts` for reached files                                       |
| `edit-nodes`          | `view`, `target: 'artifact'` | Realized, inlined output (`artifacts`, `editPlan: null`) with independent per-inclusion edits                              |
| `remove-environments` | `view`, `target: 'selected'` | Remove matching configured environment nodes through safe physical source edits (`editPlan` + preview `artifacts`)         |
| `remove-environments` | `view`, `target: 'artifact'` | Remove matching environment occurrences in realized inline output (`artifacts`, `editPlan: null`)                          |
| `suppress-comments`   | `view`, `target: 'selected'` | Remove reached `%` comments (and `comment` environments when `suppressCommentEnvironments: true`) with lexical join repair |

- **Actions (`NodeEditAction`)**:
  - `{ kind: 'remove-node', selection }`: Removes the selected node (environment, group, math, section, or structural token) and its descendants.
  - `{ kind: 'rename-environment', selection, name }`: Replaces both `\begin{...}` and `\end{...}` names of a selected environment that has two literal delimiters and no environment arguments.
  - `{ kind: 'wrap-node', selection, name }`: Wraps the selected node inside `\begin{<name>}...\end{<name>}`.
- **`target: 'selected'` vs `target: 'artifact'`**:
  - `target: 'selected'` produces a checked `ProjectEditPlan` against the source files in `view.snapshot`. Removing or wrapping requires a single contiguous original extent (`location.kind === 'single'`), whereas renaming can edit two literal delimiter names across disjoint spans (`\if...\else...\fi` or `\input`). If a file is included multiple times, every inclusion touching the edited range must agree on the edit, or `planTransformation` rejects with `PrepTexErrorCode.EditConflict`.
  - `target: 'artifact'` (and `export-project` with `inputs: 'inline'` and `nodeEdits`) applies edits per inclusion occurrence in the realized inline output, supporting multi-file wrappers and inclusion-specific edits without mutating the source snapshot.
