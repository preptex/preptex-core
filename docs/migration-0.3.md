# Migrating to the 0.3.0 project model

All C1–C10 changes belong to **0.3.0**. The legacy functions and option types
remain exported, with deprecation annotations to guide new integrations. Existing
valid calls retain their behavior. Mixing legacy fields with new policies now
throws `PrepTexError` with `PrepTexErrorCode.InvalidArgument` in either API.

## Choose the representation explicitly

| Legacy API                                          | New workflow                                                                             | Migration difference                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `parseDocument`, `parseProject`                     | `createProjectSnapshot`; optionally `resolveProjectView`                                 | Source scanning accepts incomplete fragments and retains all branches. Only a ready configured view has structural nodes.        |
| `mergeProjects`                                     | `updateProjectSnapshot`                                                                  | Atomic upserts and removals. Equal revisions with different text are rejected; legacy merging permits equal-version replacement. |
| `serializeDocument`                                 | `planTransformation(snapshot, { operation: 'identity', options: { target: 'source' } })` | Exact original strings, including incomplete source, rather than serialization of a legacy AST.                                  |
| `transformProject`                                  | `planTransformation(view, request)` or `runProjectPipeline`                              | Interpretation, analysis and export have separate settings and results.                                                          |
| `AstNode`, `NodeType`, `isContainerNode`            | `ConfiguredNode`, `walkConfiguredNodes`, `isConfiguredContainerNode`                     | Narrow by `kind`; navigation uses original spans and inclusion identities, not file-local AST IDs.                               |
| `ParseOptions.enabledTokens`, `maximumSectionLevel` | Keep the legacy parser when these behaviors are required                                 | No equivalent scanner option. `ScanOptions` describes the new supported source profile.                                          |

Keep source buffers as caller-owned `SourceFile` data. Store returned snapshots,
views and results as readonly. Generated `artifacts` are separate output buffers;
apply a checked `editPlan` only after reviewing it against its source/view identity.
Structured cloning preserves data but does not preserve runtime freezing.

## Condition semantics are different

Legacy omission of `enabledConditions` preserves conditional source. An empty
array chooses the false arm of every recognized legacy test; a supplied list is
a static, case-sensitive whitelist, independent of encountered setters. Legacy
recognition includes broad `if`-prefixed spellings. Filtering strips recognized
declarations and generated setters, even when a stored consumer could need them.

The new default `source` policy interprets supported declarations and setters in
encounter order, including active inputs. `manual` forces explicitly supplied
names; omitted names are **unknown**, so `{ values: {} }` is not the old empty
whitelist. `source-with-overrides` forces selected names while retaining source
observations. `initialValues` seeds source state; a later declaration resets it.
Literal and primitive tests cannot be reinterpreted as arbitrary named booleans.
The [support matrix](./project-model.md#supported-interpretation-profile) describes
the bounded profile and the points where interpretation stops.

To migrate a whitelist for a known set of supported named flags, supply explicit
true/false values for every relevant name. Do not guess false for unrecognized or
externally generated tests. Use the legacy path if its broader recognition and
unconditional stripping are needed. New materialization retains boolean
scaffolding when bounded inspection cannot establish that removal is safe.

Exact source preservation needs no condition policy or ready view: use the
source `identity` operation. `conditions: 'preserve'` on configured export still
requires a ready view because it may apply active edits or expand inputs.

## Input scope and output topology

Legacy `Preserve` emits only the entry; `Flatten` expands reachable inputs;
`Separate` emits every supplied file, including unreachable files. New
`traversal: 'project'` follows input effects regardless of the output topology.
`file-only` stops incomplete at input effects; it is not a replacement for
legacy `Preserve`.

New exports choose `inputs: 'preserve' | 'inline'` independently from
`conditions: 'preserve' | 'materialize'`. Preserving both emits all supplied files.
Materializing with preserved inputs emits reached files and rejects conflicting
specializations of a shared file. Inlining permits distinct inclusion outputs.
Preserving conditions while inlining can leave inactive literal dependencies;
inspect `dependencies` and each artifact's `topology`. No new option exactly
recreates every legacy Separate transformation; retain that entry point when
its all-supplied-files filtering is required.

## Compose operations or use the pipeline

```ts
import {
  createProjectSnapshot,
  resolveProjectView,
  runAnalysis,
  planTransformation,
  runProjectPipeline,
  type SourceFile,
} from '@preptex/core';

const files: readonly SourceFile[] = [
  { path: 'main.tex', version: 1, source: String.raw`\ref{x}\input{part}` },
  { path: 'part.tex', version: 1, source: String.raw`\label{x}Hello` },
];
const snapshot = createProjectSnapshot(files);
const configuration = { entryPath: 'main.tex' } as const;
const view = resolveProjectView(snapshot, configuration);
const exportOptions = { conditions: 'materialize', inputs: 'inline' } as const;
if (view.status === 'ready') {
  const references = runAnalysis(view, { operation: 'references' });
  for (const finding of references.findings) console.log(finding.code, finding.severity);
  const output = planTransformation(view, { operation: 'export-project', options: exportOptions });
  console.log(output.artifacts);
}
const pipeline = runProjectPipeline(files, {
  configuration,
  analyses: [{ operation: 'references' }],
  exportOptions,
});
// pipeline.snapshot, .view, .analyses and .transformation equal the individual calls.
```

The pipeline requires explicit export policies and an exportable view. Analyses
run in request order, defaulting to none. It throws on an unavailable or failed
operation, returning no partial pipeline. Use independent calls to retain an
incomplete view or request explicitly partial analysis. Source inventory and
source command-use analysis never require export settings or a destination.

Handle `ProjectOperationError.code` and `failure`, and view `status` and
`reason.code`; do not parse messages. The CLI's new `inventory` and `analyze`
commands emit JSON, while existing `transform` and `ast` commands keep their
legacy options. See the packaged CLI README for examples.
