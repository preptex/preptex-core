# Project model: C1–C5 integration contract

This checkout prepares **0.3.0 (unreleased)**. It implements the source and
configured-view foundation from C1–C5. Reference/unused-command analyses (C6),
transformation planning, edit application and artifact emission (C7), performance
and reuse work (C8), expanded CLI/pipeline support (C9), and the published website
handoff (C10) remain later work. The legacy API remains available unchanged.

## Public operations

| Operation                                                        | Result                                                                           | Available |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| `createProjectSnapshot(files, scanOptions?)`                     | Immutable original sources, lossless tokens, located facts and per-file coverage | Yes       |
| `updateProjectSnapshot(snapshot, changes)`                       | Atomic source upserts/removals, rescanned as a new snapshot                      | Yes       |
| `inspectProject(snapshot, request?)`                             | Located source inventory; no entry or output required                            | Yes       |
| `resolveProjectView(snapshot, configuration)`                    | Ready structure or incomplete/blocked trace                                      | Yes       |
| `walkConfiguredNodes(root)` / `isConfiguredContainerNode(node)`  | Public traversal and exhaustive container narrowing                              | Yes       |
| `checkOperationCapability(model, request)` / `projectOperations` | Requirements and structured eligibility reasons                                  | Yes       |
| `validateProjectEditPlan(snapshot, plan, view?)`                 | Preliminary C1 identity/range/overlap validation, without applying source edits  | Yes       |
| Reference and unused-command analysis execution                  | `AnalysisResult` contract                                                        | C6        |
| Transformation preview / applying edits / exporting artifacts    | `ProjectEditPlan` / `GeneratedArtifact` contracts                                | C7        |

The descriptor's `implemented` field and capability reason `not-implemented`
prevent a consumer from advertising a reserved operation as runnable. The edit
validator establishes the C1 range contract only. C7 must still enforce
operation-specific semantics, active/inactive occurrence conflicts, mappings and
atomic application. It is not a substitute for those checks, and there is no
`applyProjectEdits`, `planTransformation`, or `runAnalysis` executor yet.

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
// C1–C5 returns not-implemented for this C6 operation.
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

## Identity, coordinates, and future edits

Snapshot identities include every source path, complete source string, caller
revision, normalized scan option, core version and schema version. View identities
add normalized entry, traversal, policy/maps, profile and limits. Equivalent map
and file orderings give equal identities. Output filenames and display filters
are rejected as view settings. Identities are deterministic 128-bit cache keys,
not cryptographic credentials. Public source operations validate source identity
and rebuild derived data at transport boundaries rather than trusting supplied
token/fact fields. Fine-grained reuse and performance optimization remain C8.

All returned graphs are deeply frozen plain data and readonly in declarations.
Structured cloning and JSON transport preserve values, but not frozen status.
Source fact IDs are file-local; configured node keys are view-local. A navigation
identity includes snapshot, view, inclusion occurrence, file and original range.

`SourceRange` uses inclusive zero-based UTF-16 offsets and a one-based original
line. Configured `projectedRange` belongs to the virtual selected token tape.
The tape is **not emitted LaTeX**: its tokens are never re-lexed across omitted
conditions or input switches. Joining their values can produce unsafe command
spellings, so consumers must wait for C7 artifact emission instead of exporting
`selectedTokens.map(...).join('')`.

Container origins are ordered contributing spans, merged only when adjacent in
the same original inclusion. They may be disjoint/multi-file and never cover
inactive gaps. Empty roots have no origins and projected range `0..-1`. A node's
bounding original offsets are not a safe replacement range.

The C1 edit contract distinguishes a nonempty inclusive replacement (empty
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
10,000,000 selected UTF-16 units. Limits are validated and deterministic. They do
not enforce host file/byte quotas, wall-clock deadlines, scheduling or cancellation.
The host remains responsible for those controls.

Run from the checkout root:

```sh
npm run check
npm run build
node examples/project-model.mjs
npm run docs
npm run pack:check
```

`core/tests/project-model.test.ts` contains public-import C1–C5 regressions and
legacy characterizations; `core/tests/fixtures/project-model` contains the shared
crossing/protected/multi-origin LaTeX fixtures. `core/type-tests/project-model.ts`
checks readonly unions and consumer narrowing. The CLI regression executes its
existing preserve, flatten, Separate and AST commands. New CLI inventory/analysis
commands remain C9. The website checkout is not modified by this work, and its
full migration still requires C6–C10 and a verified registry release.
