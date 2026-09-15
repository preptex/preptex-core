# Source lookup and selected-node transformations

These APIs extend the same unreleased **0.3.0** project model. They expose readonly
data through `@preptex/core`, without mutable parser objects or transformer callbacks.
The [runnable example](../examples/node-operations.mjs) covers source-driven
`\longtrue` / `\shortfalse`, a source prepass, list renaming/wrapping and both
percent-comment and `comment` environment suppression.

## Original source and selections

Tokens expose `range.line` (one-based) and inclusive, zero-based UTF-16
`range.start` / `range.end`. These refer to the original JavaScript string,
including CR/LF/CRLF and surrogate pairs, not bytes or display columns.

Every configured node has a `location`: `none` for no contributing source,
`single` for one original extent, or `multiple` for all contributing spans in
encounter order. Each span includes path, file version, snapshot and inclusion
IDs. `primary` is the first span for navigation; it never authorizes editing an
envelope across omitted source. Projected and original ranges remain separate.

Environment `syntax.opening` / `syntax.closing` expose whole-command and name-only
ranges with revision/inclusion metadata. A delimiter is null when assembled from
disjoint syntax. `syntax.body` exists only for a contiguous original environment;
an empty body has `end === start - 1`. `hasArguments` conservatively reports a
following optional or braced argument; the initial renamer cannot adapt it.

`inspectProjectEnvironments(snapshot, scope?)` inventories literal environments
without an entry or condition values, including both branches and recognized
stored bodies. Matching stays inside the same conditional, stored-argument and
brace context. Unmatched/ambiguous delimiters remain located candidates.
Protected environments use the scanner's exact terminator grammar, not nested
matching. Percent-comment/verbatim lookalikes are not ordinary occurrences.

`createProjectSourceIndex(snapshotOrView)` builds frozen per-file line starts and
balanced interval trees. `sourceOffsetAt(index, path, line, column?)` converts a
one-based line and zero-based UTF-16 column. `lookupProjectSource` accepts
`{ path, start, end?, kinds?, occurrenceId? }`: omitted `end` means point lookup;
otherwise it reports inclusive overlap. EOF point queries are empty. Node hits
come first, deepest first and then in configured encounter order; other hits
follow in source order. Multi-span nodes and repeated inclusions produce separate
hits. An inclusion filter returns only node hits from that inclusion.

Canonical repeat construction reuses the same index. After transport, build an
index from the received model once and reuse the returned canonical index.
Direct lookups on a mutable transported index rebuild derived data each time.
Construction sorts indexed spans; queries prune nonoverlapping subtrees and sort
the returned hits. See [performance measurements](./project-model-performance.md).

`selectProjectNode(view, node.occurrenceKey)` returns a snapshot/view/node-bound
reference; `getSelectedNode(view, selection)` resolves it. Source inventory hits
use `EnvironmentSelection` and `getSelectedEnvironment(snapshot, selection)`.
Unknown or obsolete references fail with `StaleResult`. Rebuild selections after
source or configuration changes; copied AST/index fields are not authority.

## Preview and apply

```ts
import {
  createProjectSnapshot,
  resolveProjectView,
  walkConfiguredNodes,
  selectProjectNode,
  planTransformation,
  applyProjectEdits,
} from '@preptex/core';

const snapshot = createProjectSnapshot([
  {
    path: 'main.tex',
    version: 1,
    source: String.raw`\begin{itemize}\item Hello\end{itemize}`,
  },
]);
const view = resolveProjectView(snapshot, { entryPath: 'main.tex' });
if (view.status !== 'ready') throw new Error('A ready view is required.');
const list = walkConfiguredNodes(view.root).find((n) => n.kind === 'environment');
if (!list) throw new Error('No list found.');
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
// Review result.artifacts, then apply against the exact original source/view.
if (result.editPlan) {
  const updated = applyProjectEdits(snapshot, result.editPlan, view);
  // Construct a fresh view and fresh selections from updated.
}
```

| Request               | Model/target       | Behavior                                                                                |
| --------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `edit-nodes`          | view, `selected`   | Checked physical source edits and exact previews                                        |
| `edit-nodes`          | view, `artifact`   | Materialized, inlined output with independent inclusion edits                           |
| `remove-environments` | snapshot, `source` | Remove literal `names` in all files or a named-file `scope`, without resolving branches |
| `remove-environments` | view, `selected`   | Remove matching configured nodes through safe source edits                              |
| `remove-environments` | view, `artifact`   | Remove matching occurrences in materialized inline output                               |

Actions are `remove-node`, `rename-environment` and `wrap-node`. Removal includes
delimiters and descendants; renaming replaces both names; wrapping retains the
node inside a new environment. Names match `[A-Za-z][A-Za-z0-9@*-]{0,127}` and are
case-sensitive. A name does not prove that a TeX package defines it.

Editable targets are complete environments, groups, math, sections and structural
text/space/comment/protected-region tokens. The synthetic root, structural
delimiter/control-command fragments and stored-argument interiors are rejected.
Renaming needs two literal delimiters and no detected arguments. Complete
protected regions may be removed/wrapped; their interiors are not executable nodes.

Source removal/wrapping requires one contiguous original extent. Renaming can use
two exact name edits across disjoint or multiple files. Every affected physical
inclusion must permit the same change, including wrapper multiplicity and order.
An inactive or incompatible inclusion fails with `EditConflict`. Artifact mode
supports independent inclusion edits and multi-file wrappers after inlining;
it returns no source edit plan.

## Composition and validation

All actions refer to the same original view. Duplicate removals collapse and
ancestor removal subsumes descendant removals. Rename/wrap inside a removed
subtree fails. Rename plus wrap on one environment is supported. Multiple wraps
use request order from outermost to innermost. Coincident insertions normalize;
an adjacent node closes before the next wrapper opens.

`materialize` and `export-project` accept `nodeEdits`; nonempty actions require
materialized conditions and inline inputs. `runProjectPipeline` accepts the same
export options, checking selections against the equivalent source/configuration.
Resolution precedes edits: deleting a node containing a global setter does not
change an already chosen branch. To affect later interpretation, apply a separate
source edit first, then rebuild the snapshot/view/selections.

`suppress-comments` remains percent-only by default. Set
`suppressCommentEnvironments: true` to remove recognized `comment` environments
too. Configured exports accept this independently of `suppressComments`.
Inactive and stored source stays protected in selected operations. Automatic
comment-environment removals obey the same subtree conflict checks: a batch
cannot also wrap or rename a removed comment subtree.

Source-wide removal rejects incomplete recognition coverage or an ambiguous
requested match rather than claiming every occurrence was removed. Nested matches
collapse to the outermost removal. Range, substring, surrogate, overlap, scope and
revision checks remain active. Node/environment plans are recomputed from their
canonical requests before application; copied proposals cannot authorize arbitrary
edits. Application is atomic and advances changed file revisions.

Capabilities include located `failure` data for edit ineligibility; execution
still enforces output bounds. Wrappers count toward nesting limits and all added
text counts toward the UTF-16 output limit. Retained text maps to original spans;
wrappers, renamed text and lexical separators have synthetic provenance. Reparse
artifacts separately for output-tree navigation.
