# Project model integration contract

This checkout prepares **0.3.0 (unreleased)**. C1–C9 provide source snapshots,
configured structure, independent analyses, checked edits, exports and scan reuse.
The C5a/C7a extension adds [source lookup and node transformations](./node-operations.md).
The pipeline and CLI inventory/analysis are available. C10's registry publication
gate remains open; see [website handoff](./website-handoff.md). Legacy APIs remain
available with [explicit migration guidance](./migration-0.3.md).

## Public operations

| Operation                                                             | Result                                                                                       | Available |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| `createProjectSnapshot(files, scanOptions?)`                          | Immutable original sources, lossless tokens, located facts and per-file coverage             | Yes       |
| `updateProjectSnapshot(snapshot, changes, scanOptions?)`              | Atomic source upserts/removals and optional scan-setting replacement; unchanged scans reused | Yes       |
| `inspectProject(snapshot, request?)`                                  | Located source inventory; no entry or output required                                        | Yes       |
| `resolveProjectView(snapshot, configuration)`                         | Ready structure or incomplete/blocked trace                                                  | Yes       |
| `walkConfiguredNodes(root)` / `isConfiguredContainerNode(node)`       | Public traversal and exhaustive container narrowing                                          | Yes       |
| `checkOperationCapability(model, request)` / `projectOperations`      | Requirements and structured eligibility reasons                                              | Yes       |
| `validateProjectEditPlan(snapshot, plan, view?)`                      | Identity, range, overlap and occurrence-compatibility validation                             | Yes       |
| `indexProjectView(view)`                                              | Reusable reached facts in encounter order, with coverage                                     | Yes       |
| `runAnalysis(model, request)`                                         | Independent reference or conservative command-use findings                                   | Yes       |
| `planTransformation(model, request)`                                  | Checked edit previews or generated artifacts with mappings/dependencies                      | Yes       |
| `applyProjectEdits(snapshot, plan, view?)`                            | Atomic validated source replacement, advancing changed file revisions                        | Yes       |
| `runProjectPipeline(files, options)`                                  | Frozen snapshot, configured view, ordered analyses and export result                         | Yes       |
| `inspectProjectEnvironments(snapshot, scope?)`                        | Literal source environments and located ambiguous candidates                                 | Yes       |
| `createProjectSourceIndex` / `lookupProjectSource` / `sourceOffsetAt` | Indexed source-position lookup and line conversion                                           | Yes       |
| `selectProjectNode` / `getSelectedNode` / `getSelectedEnvironment`    | Canonical revision-bound selections and original locations                                   | Yes       |

All listed descriptors are implemented. Capability checks use the same model,
scope and readiness rules as execution. An eligible operation can still fail on
data-dependent edit conflicts or an output limit; consumers should handle
`ProjectOperationError.code` and its frozen, located `failure` data.

## Source inspection and atomic replacement

```ts
import {
  createProjectSnapshot,
  inspectProject,
  updateProjectSnapshot,
  type SourceFile,
} from '@preptex/core';

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

Source paths are normalized project-relative identifiers and sorted by UTF-16
code-unit order. Duplicate normalized paths fail. A same-revision update with
different text or any older revision fails; identical same-revision source is
accepted. A batch with duplicate changes or an absent removal fails atomically.
The original snapshot and caller-owned input objects are never modified.

Snapshots retain exact JavaScript strings, including lone surrogates, CR/LF/CRLF,
empty files, trailing whitespace and incomplete fragments. Concatenating a
file's `tokens[].value` recreates that file exactly. Bytes/encodings are not part
of the string API. Snapshots do not require balanced environments, brace groups,
math, or per-file conditionals.

Facts include supported definitions (`newcommand`, `renewcommand`,
`providecommand`, ordinary `def` with control-word targets), direct command uses,
labels, `ref`/`pageref`/`eqref`, condition declarations/tests/delimiters/setter
candidates, and literal/dynamic input candidates. Definition targets are not
counted as uses. Optional/starred LaTeX definitions retain parameter/default and
body ranges. Definition bodies and stored arguments have explicit context and
are not reported as document execution.

Literal keys/paths must be nonempty, single-line braced text without nested
braces, control sequences, comments, or parameter markers. Other spellings have
`kind: 'unresolved'`; the scanner never guesses expansion. Unsupported definition
forms produce a candidate and a coverage issue through the end of the current
region rather than inventing body uses. Malformed protected regions and missing
arguments have located diagnostics; healthy file inventories remain usable.
Unterminated inline verbatim recovers at the next line. Unterminated protected
environments retain the rest of the file as one protected region.

`SourceScope` is explicit (`all-files` or named `files`). No filename ordering
shares execution state between independent files. An empty `kinds` list means
no facts, while omission means every supported fact category.

## Configuration and occurrence state

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
// An incomplete view needs explicit allowIncomplete for partial analysis.
```

| Policy                              | Meaning                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `source` (default)                  | Reached declarations initialize false; reached setters update state in encounter order   |
| `manual` with `values`              | Force only supplied names at every test; omitted names are unknown                       |
| `source-with-overrides`             | Track source and record it, but force explicitly supplied names at each test             |
| `initialValues` (source modes only) | Seed assumed external boolean bindings before entry; a later declaration resets the seed |

Names are case-sensitive letters without the `if` prefix. Configuration also
establishes recognition for named booleans supplied by an external preamble.
Primitives (`ifnum`, `ifdefined`, etc.), literal `iftrue`/`iffalse`, and reserved
command-style tests cannot be overridden as names. A later declaration is never
treated as already executed at an earlier unresolved test.

Decisions have `true`, `false`, `unknown`, or `not-reached` outcomes. Tracked and
effective values are distinct; null means unknown or not reached, never false.
The first unresolved reached conditional/effect stops interpretation. Later
source remains inspectable, but there is no fabricated complete AST.

`project` traversal follows active literal braced inputs at the command's
occurrence. State and supported scopes are shared with the caller. Relative paths
resolve from the including file, with an optional `.tex` suffix; matches to both
spellings are ambiguous. Missing/ambiguous/escaping/circular active inputs block
the view, with original reference locations and inclusion chains. Inactive
missing inputs do not fail. Repeated inputs get separate `i0`, `i1`, … IDs;
cycles are detected against the active inclusion chain. `file-only` becomes
incomplete when it encounters input effects. Output topology is not a traversal
option.

## Supported interpretation profile

`direct-latex-v1` is a bounded source interpretation, not a TeX engine:

- Direct `newif`, generated setters, literal tests, `else`/`fi`, literal groups
  and environment scopes are supported. Local changes, declarations and setter
  bindings restore on scope exit. `global` followed by a direct recognized setter
  changes the value in every enclosing save level. Other prefixed assignment and
  definition forms are explicitly unsupported.
  A generated setter also assigns the test binding: a global setter can preserve
  the test of a locally declared flag after group exit without globalizing that
  flag's locally defined setter macros. A recognized setter can restore a test
  binding that was subsequently redefined.
- Recognized command definitions store bodies/defaults without executing them.
  Calling a stored/redefined command is incomplete. A redefined tracked test,
  setter, delimiter, or protected-region command does not keep its old meaning.
- Labels, references and metadata arguments are opaque leaves. Explicit metadata
  grammars cover `documentclass`, `usepackage`, `RequirePackage`, `title`, `author`,
  `date`, `cite`, `citep`, `citet`, `url`, `href`, and `includegraphics`. Packages,
  classes, stored titles and macros are not executed, even at commands such as
  `maketitle`. Ready views assume no unmodeled effects from these operations.
- Section headings and `textbf`, `textit`, `textrm`, `textsf`, `texttt`, `emph`,
  `underline`, `mbox` accept literal text arguments. Nonliteral executable
  arguments stop with `unsupported-effect`; setters are never executed merely
  because their text occurs in such an argument. Unknown argument grammars also
  stop. Bare unrecognized commands are retained under the no-expansion assumption;
  the core cannot detect all hidden macro effects.
- `verb`/`verb*`, `verbatim`/`verbatim*` and `comment` environments protect source
  in ordinary scanning. Additional literal environment names can be configured.
  **Skipped mode is different:** verbatim/definition macros do not execute;
  primitive token meanings determine conditional nesting. A candidate whose
  meaning cannot be established stops interpretation. Newly active text after a
  skipped delimiter is recognized at its original offsets, even if the ordinary
  source scan had protected it.
- `ifthenelse` and other known command-style tests do not invent `fi` nesting;
  their execution is unsupported. `iff` is an ordinary math command. Nonliteral
  inputs, `include`, `includeonly`, dynamic assignment/catcode/expansion primitives
  are explicit unsupported effects.
- A conditional's delimiters must remain in one file occurrence. An ordinary
  conditional enclosing a complete input works. Environments, groups and math
  can span supported active inputs. Inactive invalid structure is ignored.

`ready` means complete structure within this profile and its stated assumptions.
`incomplete` means unresolved/unsupported effects or a resource bound stopped the
interpretation. `blocked` means a definite required-source/input/structure failure.
Only ready views have a root. Source coverage is separate from view readiness;
neither is proof of equivalence with a TeX run.

## Independent analyses

```ts
import { indexProjectView, runAnalysis } from '@preptex/core';

const index = indexProjectView(view);
const references = runAnalysis(view, { operation: 'references' });
const commands = runAnalysis(source, { operation: 'unused-commands' });
```

References require a configured view. Literal labels in uncalled bodies are
source facts, not reached targets. `references` records matched, duplicate,
missing-recognized, unresolved/generated, or unknown-coverage status, exact target
locations, and forward-reference information. A forward reference is valid LaTeX
and produces informational evidence. Partial views require `allowIncomplete:
true`; they cannot certify missing targets past their stop boundary. Stored
definitions and dynamic keys carry explicit expansion limitations in coverage.

Command evidence accepts a source snapshot (optionally scoped to named files)
or a configured view. It records direct uses, other definition-body references,
and self references separately. Self-recursion alone is not a root use.
Redefinitions, conditional/scoped definitions, opaque argument uses and unknown
cross-file source ordering produce `ambiguous-binding`. `no-recognized-use` and
`self-recursive-only` are qualified candidates, never a proof or an automatic
deletion proposal. Calling a stored macro remains outside configured execution;
source analysis can still inspect its literal uses independently.

Analysis results contain no generated source. Their IDs include normalized
request options, operation version and exact source/view identity.

## Source edits and configured exports

```ts
import { applyProjectEdits, planTransformation } from '@preptex/core';

const preview = planTransformation(source, {
  operation: 'suppress-comments',
  options: { target: 'source' },
});
const edited = preview.editPlan ? applyProjectEdits(source, preview.editPlan) : source;
const exported = planTransformation(view, {
  operation: 'export-project',
  options: { conditions: 'materialize', inputs: 'inline', suppressComments: true },
});
```

`identity` produces exact original strings and an empty plan. Source comment
suppression removes recognized percent comments, their line ending and following
indentation. `A% comment` followed by a newline and `B` becomes `AB`; a control
word followed by letters receives a lexical delimiter, so `\\relax` cannot become
`\\relaxabc`. Protected verbatim/comment environments and unrecognized regions
remain exact. No comment-environment macro execution is performed.

The `selected` target requires a ready view and edits only eligible selected
slices. It retains inactive text, wrappers, setters, stored bodies and opaque
arguments. Repeated physical ranges are edited once only if every inclusion
permits the edit; an active/inactive conflict rejects the complete plan. Source
previews are independent files with no entry artifact. Application validates all
files before changing any, returns a new snapshot, and advances each changed file
revision by one; a non-advancing/overflowing revision fails.

`materialize` is shorthand for `export-project` with `conditions: 'materialize'`.
Condition retention and input topology are independent:

| Conditions  | Inputs   | Result                                                                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| preserve    | preserve | Original paths and all supplied files; optional active comment edits                                                            |
| materialize | preserve | Selected source for reached files; shared-file specializations must agree                                                       |
| preserve    | inline   | Only active inputs expanded, inactive inputs may remain; explicitly partially expanded                                          |
| materialize | inline   | Per-occurrence specialization in the entry artifact; self-contained only within the supported profile and when no inputs remain |

Inlining that would move a retained input to a different directory fails with
`edit-conflict`; preserve input topology or materialize those conditions first.
No silent filename/path rewrite is performed. Dependency records report emitted
input ranges, exact literal spellings and present/missing/ambiguous/dynamic/invalid
relationships. Opaque macro-generated dependencies remain outside this profile.

Boolean scaffolding is removed only when bounded consumer inspection permits it.
Definitions or opaque consumers retain declarations/setters and report limited
simplification. Export artifacts never overwrite the source snapshot. Copied
segments retain exact original ranges, inclusion IDs and snapshot IDs; lexical
delimiters have synthetic mappings. Identical shared-file output retains mappings
for every contributing occurrence, which can overlap in output coordinates.
Reparse emitted strings for output AST navigation.

`ProjectOperationError` maps failures to `OperationUnavailable`, `StaleResult`,
`InvalidEdit`, `EditConflict` or `OutputLimit`. Malformed API arguments still use
`InvalidArgument`. The standalone validator preserves its original argument-error
contract for malformed/stale ranges; `applyProjectEdits` converts these into the
structured edit failure contract. Nothing is applied on a failure.

## Identity, coordinates, and checked edits

Snapshot identities include every source path, complete source string, caller
revision, normalized scan option, core version and schema version. View identities
add normalized entry, traversal, policy/maps, profile and limits. Equivalent map
and file orderings give equal identities. Output filenames and display filters
are rejected as view settings. Identities are deterministic 128-bit cache keys,
not cryptographic credentials. Public source operations validate source identity
and rebuild derived data at transport boundaries rather than trusting supplied
token/fact fields. Views also retain their frozen source snapshot; transported
views are reconstructed from source/configuration instead of trusting derived
fields. All implementation stages belong to the same unreleased 0.3.0 version.
Recreate snapshots/views captured during earlier development stages from original strings.

Updates reuse unchanged scanned files when text and normalized scan settings
agree. Revision-only updates retain token/fact arrays with a new file wrapper.
Changing scan settings rescans affected files. Every configured view and index is
fully rebuilt for its new dependencies; there is no shared mutable condition
cache or fine-grained interpretation reuse. Equivalent normalized options retain
result identities; meaningful option changes invalidate them.

All returned graphs are deeply frozen plain data and readonly in declarations.
Structured cloning and JSON transport preserve values, but not frozen status.
Source fact IDs are file-local; configured node keys are view-local. A navigation
identity includes snapshot, view, inclusion occurrence, file and original range.

`SourceRange` uses inclusive zero-based UTF-16 offsets and a one-based original
line. Configured `projectedRange` belongs to the virtual selected token tape.
The tape is **not emitted LaTeX**: its tokens are never re-lexed across omitted
conditions or input switches. Joining their values can produce unsafe command
spellings, so consumers must use artifact emission instead of exporting
`selectedTokens.map(...).join('')`.

Container origins are ordered contributing spans, merged only when adjacent in
the same original inclusion. They may be disjoint/multi-file and never cover
inactive gaps. Empty roots have no origins and projected range `0..-1`. A node's
bounding original offsets are not a safe replacement range.

The edit contract distinguishes a nonempty inclusive replacement (empty
replacement means deletion) from insertion at an offset between code units.
Insertions may target zero/EOF, including an empty file. Edits are ordered by
path, then offset. Replacements may touch but not overlap. Insertion at a
replacement's start or interior and equal-offset insertions are ambiguous and
rejected; insertion immediately after a replacement is allowed. Original edit
boundaries cannot split a valid surrogate pair; existing lone surrogates remain
ordinary preserved code units. Expected old substrings, line numbers, source
identity and any configured identity must match exactly.

## Bounds and executable verification

Defaults are 64 nested source inventory regions, 64 active input levels, 10,000
total inclusion occurrences, 256 conditional/scope/structural levels and
10,000,000 selected UTF-16 units. Transformations additionally default to a total
10,000,000 output UTF-16 units. `maxOutputCodeUnits` accepts positive integers up
to 100,000,000 and counts synthetic delimiters too. Expanded occurrences are
bounded while collecting segments, and emission checks before appending output.
Limits are validated and deterministic. They do
not enforce host file/byte quotas, wall-clock deadlines, scheduling or cancellation.
The host remains responsible for those controls.

Run from the checkout root:

```sh
npm run check
npm run build
node examples/project-model.mjs
node examples/benchmark-project-model.mjs
npm run docs
npm run pack:check
npm run consumer:check
```

`core/tests/project-model.test.ts`, `project-operations.test.ts` and
`project-pipeline.test.ts` contain public-import regressions and legacy characterizations;
`core/tests/fixtures/project-model` contains the shared
crossing/protected/multi-origin LaTeX fixtures. `core/type-tests/project-model.ts`
checks readonly unions and consumer narrowing. CLI regressions execute preserve,
flatten, Separate and AST commands, independent inventory and source/configured
analyses. `consumer:check` runs the project/type/CLI suites against installed
tarballs outside the workspace using TypeScript 4.9.5 and ES2020. The website
checkout is not modified; migration requires C10's verified registry release. The fixed
benchmark corpus and measurements are described in [Performance](./project-model-performance.md).
