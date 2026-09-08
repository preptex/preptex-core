# PrepTeX Core: project model, analyses, and transformations

Status: implementation plan, not an implemented API. Prepared against the installed
`@preptex/core@0.2.1`. Complete this plan before migrating the website using the
[website implementation plan](website-project-workspace-implementation-plan.md).

Prepared: 2026-09-07.

## 1. Goal and intended result

Make a reusable, immutable representation of a LaTeX project the foundation of
PrepTeX. A consumer must be able to inspect source, run an analysis, or request a
transformation independently. Generating output is one operation, not a
prerequisite for using the library. Pipelines remain convenient compositions of
these operations.

The first release must support:

- Source inspection without selecting condition values or obtaining a complete
  environment/section AST.
- Inventories of recognized command definitions, command uses, labels,
  references, conditional constructs, and input references.
- A configured document view derived from a stable entry, input traversal, and
  explicit condition policy.
- Structural parsing of the selected stream, including environments and
  sections that cross conditional boundaries.
- Reference analyses and conservative unused-command candidates.
- Independent transformations, including processing selected source while
  preserving inactive source, and exporting a selected configuration.
- Explicit diagnostics, coverage, source provenance, and stale-result detection.
- An incremental migration path for existing public API consumers.

### Scope boundary

This is a source-processing library for a documented LaTeX subset. The first
release does not implement a TeX engine, arbitrary macro expansion, package
execution, arbitrary catcodes, PDF compilation, or symbolic analysis of every
possible configuration. It does not introduce filesystem, DOM, network, or
framework dependencies into core.

The implementation belongs in the authoritative core repository. The installed
package in this website is evidence for its current contract, not the place to
implement core changes. No `packages/preptex-core` package is supplied here.

## 2. Verified baseline and changes required

The website manifest, lockfile, and installed package agree on version `0.2.1`.
The baseline contracts are documented in the installed package's
`dist/docs/integration.md`, `dist/docs/architecture.md`, `dist/docs/api/README.md`,
and `dist/index.d.ts` with its public declaration re-exports.

| Current behavior | Required new behavior |
| --- | --- |
| `parseProject` structurally parses every supplied file atomically. | A new source snapshot remains inspectable when one file or one interpretation cannot be structurally parsed. |
| Conditions, groups, environments, and sections must fit one structural tree. | Preserve source independently; construct a structural tree for a selected interpretation. |
| `enabledConditions` applies after parsing. | Resolve supported conditions and active inputs before or while constructing the structural view. |
| One static whitelist selects the same branch at every occurrence. | Source tracking records decisions per occurrence; explicit overrides are separate from tracked state. |
| Condition evaluation also removes syntax, declarations, setters, and inactive branches. | Separate interpretation, transformation scope, and output retention. |
| `declaredConditions` contains names discovered from declarations. | Expose located declarations, tests, assignments, unresolved candidates, and recognition support. |
| `InputHandlingMode` combines traversal with output arrangement. | Separate semantic traversal from whether inputs are preserved or inlined in output. |
| Results have original file-local ranges and ephemeral IDs; transformed output has no map. | Retain that legacy contract and add explicit origins for configured occurrences and new artifacts. |
| Public operations mainly parse, merge, serialize, and transform. | Add source inspection and analysis APIs plus a common requirements/result contract. |

Do not silently change legacy `parseProject` to return partial results or make
legacy `Separate` omit files. Introduce new types and entry points first.

## 3. Decisions to implement

These decisions establish the baseline for both implementation plans. Proposed
type and function names below are illustrative. Finalize names in C1, export them
from the public package entry point, and document the exact signatures before
the website migration begins.

### 3.1 Three representations

1. **Project source snapshot:** original strings, virtual paths, file revisions,
   source syntax/events, local facts, diagnostics, and normalized scan options.
   It requires no entry or condition configuration.
2. **Configured project view:** one snapshot plus entry, traversal, condition
   settings, and interpretation profile. Contains selected occurrences,
   condition decisions, input trace, structural nodes where available, and
   provenance.
3. **Operation result:** findings, edits, or output artifacts tied to the exact
   snapshot, view where applicable, operation version, and operation options.

```text
Original source files
        |
        v
Immutable project source snapshot -----> Source inventories/local transforms
        |
        | entry + input traversal + condition policy
        v
Configured view -----> Structural/reference analyses
        |
        +------------> Selected-path transforms -----> Edits or output artifacts
```

The source representation may contain a token tape, conditional events, and
recognized syntax regions. It must not require all environments and conditions
to nest within one conventional tree. A source file can also be an incomplete
fragment of a larger document.

### 3.2 Conditions and uncertainty

| Choice | Exact intended meaning |
| --- | --- |
| Source inventory / all branches | Inspect recognized syntax in every requested source region. This is not a single executable document or a merged structural AST. |
| Follow source | Track supported direct boolean declarations and assignments in encounter order. Evaluate only the reached tests. |
| Manual values | Force an explicitly configured value at every reached test of that named boolean. Omitted names remain unresolved. |
| Follow source with overrides | Track source normally, but an override controls the effective value at each test of that name. Record both tracked and effective values. |
| Initial state, advanced | Seed state before the entry begins. A reached `\newif` initializes its flag to false; later reached assignments overwrite the seed. This never means a permanent override. |

Automatic decisions have three states: true, false, and unknown. Inactive tests
are recorded as not reached, not as false. Names remain case-sensitive.

The first release supports direct `\newif\ifNAME`, generated `\NAMEtrue` and
`\NAMEfalse`, `\ifNAME...\else...\fi`, and literal `\iftrue`/`\iffalse` in
documented execution contexts. Support the ordinary direct local assignments and
documented global forms; explicitly diagnose unsupported assignment forms. A
manual named-boolean override must not reinterpret `\ifnum` as a flag named
`num`, or override literal primitive truth values.

For an unresolved reached conditional, the first implementation stops configured
interpretation at that point and returns its trace and reason. It does not guess
false, concatenate branches, or report subsequent observations as settled. The
source snapshot and source inventories remain available. A caller can supply an
override for a recognized named boolean or select a source-level operation.

Use these view states:

- `ready`: the requested interpretation and required structure are available
  within the documented supported profile.
- `incomplete`: an unresolved test, dynamic input, or unsupported effect prevents
  completing the requested interpretation; partial observations have explicit
  coverage boundaries.
- `blocked`: malformed required syntax, missing entry, missing/ambiguous active
  input, input recursion, or another definite failure prevents the view.

Ready does not certify equivalence with a TeX run. Every result states the
supported profile and any assumptions or omitted behavior. Unknown arbitrary
macro behavior cannot all be detected statically; the API must not promise that
it can.

### 3.3 Input traversal and output are independent

- A file-only operation examines a specified file. A configured file-only view
  that encounters an input with unknown effects becomes incomplete; a source
  inventory can still list the literal reference.
- A project view starts at an entry and follows supported active inputs in
  encounter order, sharing condition state and supported scopes across inputs.
- An all-files independent operation treats each requested file as an isolated
  context. It must not silently share state in filename-sorted order.
- Output separately chooses preserved input commands/multiple files, or inlining.
  Reading a file to determine later state does not require inlining it.
- A repeated input creates another occurrence. It is not automatically a cycle.
  Detect cycles against the active inclusion chain and impose documented bounds.

Only literal braced `\input` is required initially. `\include`, `\includeonly`,
dynamic paths, and package loading remain explicit unsupported semantics.
An ordinary conditional enclosing an input is supported. A conditional opener
and its closer located in different files are retained in source but explicitly
unsupported for configured interpretation in this release. Do not impose that
restriction on the source snapshot, or mistake an enclosing conditional for a
conditional crossing a file boundary.

### 3.4 Preservation and transformation safety

Preserve exact JavaScript source strings and UTF-16 code units. Original byte
encodings are not available to the string-only core and must not be promised.

- **Preserve conditional source:** retain wrappers, declarations, setters, and
  inactive slices exactly; process only eligible active slices.
- **Materialize configuration:** emit the resolved selected stream and omit
  resolved wrappers and inactive regions. Remove declarations/setters only when
  all supported consumers in the exported scope are resolved and none remain
  needed; otherwise retain them and report the limited simplification.
- **Process all source branches:** allow operations whose contract is explicitly
  local to source syntax. Do not make structural analyses or state tracking use
  a concatenation of alternatives.

A structural node can correspond to several disjoint original ranges, possibly
in several files. Replacing its bounding source range is unsafe. Require exact
mapped edits or reject the proposed rewrite.

Keeping inactive source exact does not promise equivalent behavior for every
other configuration: shared active text can also be used in those configurations.
Results must identify the interpretation for which the operation was performed.

## 4. Ordered implementation steps

Each step should be a reviewable change with its own tests. Complete its
acceptance criteria before treating dependent work as ready.

### C0. Establish the source repository and executable baseline

**Goal:** preserve a reproducible record of existing public behavior.

**Steps**

1. Open the authoritative core checkout; read its `AGENTS.md`, README,
   architecture, package/workspace manifests, lockfile, and test instructions.
2. Confirm that its source corresponds to the intended migration baseline.
   Record differences from the installed `0.2.1` package before editing.
3. Run the existing checks and record failures independently of this work.
4. Add public-API characterization fixtures for omitted versus empty
   `enabledConditions`, static whitelisting, every input mode, immutable results,
   exact no-op serialization, and legacy failure behavior.
5. Add named target fixtures from section 5. Tests for not-yet-supported behavior
   belong in the new API suite, not disguised as passing legacy tests.

**Acceptance**

- [ ] The baseline package version, commands, and results are recorded.
- [ ] Legacy preservation and all-false selection produce different expected
  strings, and legacy Separate still emits every supplied file.
- [ ] Every target fixture has expected observations or exact output, not only
  “does not throw.”

### C1. Define public contracts and operation requirements

**Depends on:** C0. **Goal:** give all consumers the same explicit semantics.

**Steps**

1. Define readonly contracts for source snapshots, normalized scan options,
   syntax facts, named-boolean configuration, view status, occurrence trace,
   structural origins, analysis findings, edit plans, and generated artifacts.
2. Give snapshots deterministic identity based on all source contents/revisions,
   paths, core/schema version, and scan options. Reject conflicting same-revision
   updates in the new API or make content identity part of validation. File
   revisions alone must not allow stale edits to be accepted.
3. Give configured views identity based on snapshot identity and all interpretation
   settings. Output filenames and display filters must not change that identity.
4. Define provenance as original file/range plus inclusion occurrence and snapshot
   identity. Keep projected offsets separate from original offsets.
5. Retain inclusive UTF-16 `SourceRange` semantics. Specify a distinct edit type:
   replace/delete an inclusive range, or insert at an offset between code units.
   Define empty input, insertion at EOF, ordering, overlap, and surrogate-pair rules.
6. Define operation descriptors with ID/version, required representation,
   supported scopes, required coverage, options, and result kind. Use typed unions
   and public guards; no stringly typed catch-all payloads or explicit `any`.
7. Export a capability check that explains eligibility using structured reasons.
   Core must enforce the same requirements when an operation executes.
8. Write public-import examples for source inventory, view resolution, analysis,
   transformation preview, and applying an edit plan to a new snapshot.

**Proposed API responsibilities**

| Responsibility | Illustrative entry point |
| --- | --- |
| Create an inspectable source snapshot | `createProjectSnapshot(files, scanOptions)` |
| Atomically upsert/remove source files | `updateProjectSnapshot(snapshot, changes)` |
| Obtain located source inventories | `inspectProject(snapshot, request)` |
| Resolve one configured interpretation | `resolveProjectView(snapshot, configuration)` |
| Run a typed analysis against its required model | `runAnalysis(model, request)` |
| Plan a source-local or configured transformation | `planTransformation(model, request)` |
| Validate and apply edits, returning a new snapshot | `applyProjectEdits(snapshot, editPlan)` |

**Acceptance**

- [ ] Public TypeScript examples compile without private imports or casts.
- [ ] Runtime validation rejects invalid modes, malformed maps, stale identity,
  invalid ranges, and incompatible operation/model combinations.
- [ ] Results remain deterministic, deeply frozen, and structured-cloneable.
- [ ] Manual force, source state, initial state, and unknown have separate tests.

### C2. Build the lossless source layer and partial diagnostics

**Depends on:** C1. **Goal:** importing source always enables useful inspection.

**Steps**

1. Store original strings as the authority for emission and source locations.
2. Scan source into lossless tokens/events and recognized regions. Record
   conditional delimiters without first requiring balanced environments, math,
   or document-wide brace groups.
3. Recognize comments, standard `\verb`/`\verb*`, and documented verbatim
   environments as protected regions in ordinary scanning. Preserve unrecognized
   region syntax and report limited coverage rather than inventing its contents.
4. Record conditional declarations, tests, setter candidates, literal inputs,
   and opaque/recoverable regions with locations and recognition evidence.
5. Replace the blanket `if`-prefix opener rule in the new model. Distinguish
   known primitives, declared/configured named booleans, command-style tests such
   as `\ifthenelse`, and unresolved candidates. Later scanning must not retroactively
   claim that a declaration was already executed at an earlier use.
6. Localize scan errors and preserve the entire file. Recovery boundaries must
   be explicit; do not claim findings are complete beyond an uncertain region.
7. Allow file fragments and unmatched per-file conditional events in source
   snapshots. View resolution determines whether the requested assembled
   interpretation is supported.

**Acceptance**

- [ ] Reassembling each scan produces the original string exactly for empty
  files, LF/CRLF/CR, Unicode, escaped percent signs, and trailing whitespace.
- [ ] Inventory in a healthy file remains usable when another file is malformed.
- [ ] Crossing-environment source imports without a full structural parse.
- [ ] Comment/verbatim examples do not create active condition or input events.
- [ ] `\ifthenelse` does not demand a primitive-style matching `\fi`.

### C3. Extract reusable syntax inventories

**Depends on:** C2. **Goal:** deliver a useful independent analysis before an
execution view is needed.

**Steps**

1. Add syntax handlers for literal `\newcommand`, `\renewcommand`,
   `\providecommand`, and ordinary `\def` forms. Recognize optional/starred
   declaration spelling and retain argument/body ranges without expanding bodies.
   Record other definition forms as unsupported candidates until implemented.
2. Record direct command occurrences, excluding declaration targets from use
   counts. Distinguish occurrences inside definition bodies from document uses.
3. Recognize literal `\label`, `\ref`, `\pageref`, and `\eqref` arguments.
   A nonliteral/generated key is unresolved, not a guessed string. Additional
   reference command grammars can be added as data or dedicated core handlers.
4. Attach file, range, branch context, definition-body context, and coverage to
   each fact. Source inventory must work without an entry or any condition values.
5. Keep input/declaration inventories independent of generated artifacts or UI
   selection. The caller explicitly supplies the source set to inspect.

**Acceptance**

- [ ] An inventory lists definitions and labels in both source branches with
  their exact locations and contexts.
- [ ] A `\label` or setter written inside an uncalled definition is a source
  occurrence and is not reported as executed.
- [ ] Comments and protected verbatim regions do not create false definitions.
- [ ] Inventory results are deterministic and do not alter source or require
  serialization/transformation.

### C4. Resolve supported conditions and inputs together

**Depends on:** C2 and relevant recognition from C3. **Goal:** obtain the selected
stream in the correct encounter order.

**Steps**

1. Implement an iterator over source occurrences with an input stack, conditional
   state, supported scope stack, and an append-only decision trace.
2. Implement the condition policies in section 3.2. A reached `\newif` starts
   false; direct setters change state only when reached; repeated tests can differ.
3. Implement supported local/global assignment semantics and restoration through
   literal execution groups and recognized environment boundaries. Brace groups
   used to store macro arguments or definition bodies are not automatically
   execution scopes. Scope restoration covers declarations and generated setter
   bindings as well as values. Redefining a tracked test/setter invalidates its
   recognized meaning or makes the view incomplete; its old name must not keep
   triggering the original boolean behavior.
4. Give common recognized commands explicit argument handling. Never execute
   setters, inputs, or labels merely because their tokens occur in a definition
   body or an opaque argument. Do not attempt general macro expansion.
5. Document the scanner's separate skipped-conditional mode: ordinary commands
   and assignments there do not execute; conditional nesting is tracked under
   supported token meanings. Do not run ordinary verbatim/definition handlers as
   if their macros executed in skipped text. Stop if delimiter recognition cannot
   be established within the profile.
6. Resolve supported active inputs at their occurrence, using the virtual path
   resolver. Share state with the caller, then return to the next caller token.
7. Distinguish absent inputs in inactive source from absent required inputs.
   Include the input chain and original reference location in failures.
8. Add distinct inclusion IDs, depth/occurrence/output limits, active-chain cycle
   detection, and the explicit cross-file-conditional limitation from section 3.3.
9. Stop at unresolved reached effects as specified; preserve inventory access and
   expose partial trace plus a machine-readable reason.

**Acceptance**

- [ ] Two tests of the same flag separated by a setter choose different branches.
- [ ] Inactive setters and uncalled definition bodies do not affect later tests.
- [ ] Local changes restore; supported global changes persist after group exit.
- [ ] An input's setter affects the next caller test even when output will keep
  the input command literal.
- [ ] Repeated inputs produce distinct traces; active recursion is diagnosed.
- [ ] An unknown test returns incomplete, never an implicit else decision.

### C5. Parse configured structure with original-source provenance

**Depends on:** C4. **Goal:** correctly represent the selected document structure.

**Steps**

1. Feed selected token occurrences to structural parsing. Conditional wrappers
   belong to source/provenance metadata, not mandatory environment ancestors.
2. Maintain environment, group, math, and section state over the selected stream,
   including supported structure spanning input boundaries.
3. Preserve token boundaries when omitting a branch or switching input files.
   Do not concatenate raw character strings and accidentally form new commands.
4. Add a configured structural-node union with explicit view identity and ordered
   origin spans. Keep the legacy file-local `AstNode` contract intact initially.
5. Let a node's origins be disjoint and multi-file. Add a stable-within-view
   occurrence key; source node IDs alone cannot identify a configured occurrence.
6. Report projected structural errors against original source locations. Inactive
   invalid structure must not block an otherwise supported selected path.
7. Provide public traversal/inspection helpers sufficient for consumers to use
   the new data without reaching into internal parser modules.

**Acceptance**

- [ ] Both values in fixture F02 produce the intended single list environment.
- [ ] Section/math nodes in the selected path are not globally downgraded merely
  because the original source contained conditional boundaries.
- [ ] A node spanning an input or omitted branch returns every contributing
  origin without falsely covering inactive gaps.
- [ ] A partial view never presents an invented complete AST.

### C6. Implement independent analyses and explain their coverage

**Depends on:** C3; configured analyses also require C4/C5.
**Goal:** deliver the requested inspection tools with defensible conclusions.

**Steps**

1. Expose definitions/labels/references as source inventories independent of
   configuration. Keep each source occurrence distinct from reached occurrences.
2. Build a reusable configured index of recognized labels, references, and direct
   command definitions/uses. Ordering follows the occurrence trace, not filenames.
3. Implement reference results: matched target, missing recognized target,
   duplicate reached target, forward reference, and unresolved/generated key.
   Treat forward references as information, not invalid LaTeX.
4. Exclude definition-body labels from the executed-label index unless an
   explicitly supported execution mechanism reaches them. Explain potential
   macro-generated labels in coverage rather than presenting a definitive absence.
5. Implement command-use candidates conservatively: direct use counts,
   references from recognized definition bodies, and no-recognized-use findings.
   Track definition occurrences/redefinitions and scope where supported. If a
   definition-to-use binding is ambiguous, expose ambiguity instead of picking one.
6. Do not treat self-recursion alone as a root use. Do not offer automatic deletion
   based on an unused candidate. An explicit entry/root-use graph can be added
   where the supported syntax permits it; report its assumptions.
7. Give findings stable codes, severity or informational status, primary and
   related locations, configuration identity, evidence, and coverage limitations.
8. Enforce eligibility: a source inventory can be complete for recognized syntax
   while a reached-reference analysis is unavailable. Partial results must retain
   their partial status and cannot certify absence beyond their coverage.

**Acceptance**

- [ ] Mutually exclusive labels do not become duplicate labels in one selected
  configuration; a source inventory still shows both occurrences.
- [ ] Forward references through inputs use the correct encounter order.
- [ ] Uncalled macro-body labels are not mistaken for reached targets.
- [ ] Directly used, body-referenced, recursively self-referenced, redefined, and
  dynamically constructed command examples receive their documented classifications.
- [ ] Each analysis runs without generating or changing a LaTeX file.

### C7. Implement edit plans and independent transformation/emission policies

**Depends on:** C2/C3 for source-local work; C4/C5 for configured work.
**Goal:** transform selected content with explicit preservation guarantees.

**Steps**

1. Implement immutable edit plans with source and optional view preconditions.
   Validate all files, offsets, expected contents, and overlaps before applying
   anything. Apply accepted multi-file edits atomically to a new snapshot.
2. Implement identity/no-op and comment suppression first. Test lexical boundaries:
   removing `A% comment` plus its newline before `B` must not introduce a space;
   removing a comment after a control word must not merge it with following letters.
   Preserve supported verbatim and unrecognized regions as required by the request.
3. Give traversal three dispositions: transform eligible content, emit original
   content verbatim, and omit selected resolved syntax during materialization.
4. For preserve-source mode, emit untouched source slices around exact edits.
   Do not regenerate inactive subtrees or modify their whitespace incidentally.
5. Reject structural rewrites across disjoint origins unless the operation supplies
   validated per-origin edits. Preserve wrappers/setters when preserving conditions.
6. When a source span occurs multiple times, deduplicate identical compatible
   edits only if every affected occurrence permits them. Reject conflicting edits,
   including a slice active in one occurrence but protected as inactive in another.
7. Implement configured materialization and input inlining as artifact-producing
   operations. Inlining can specialize each occurrence independently; writing one
   shared source file cannot silently choose between conflicting specializations.
   Preserve token boundaries when emitting removed-condition and input joins,
   using lexical delimiters where needed without adding visible word spacing.
8. Remove boolean scaffolding only with the bounded consumer analysis in section
   3.4. A retained input or opaque macro may still require a declaration/setter.
9. Define export combinations precisely. Inlining only active inputs while retaining
   inactive branches can leave literal inactive inputs: label that result partially
   flattened, record remaining dependencies, and never call it self-contained.
10. For separate outputs, preserve logical virtual paths and relative input
    relationships. Return dependency metadata and entry identity. The website can
    use a separate artifact namespace; filename rewriting requires an explicit
    mapping contract, not a regex over output text.
11. Provide origin mappings for copied/rewritten output segments. Synthetic output
    has an explicit synthetic origin. Output AST navigation requires reparsing the
    emitted source, not reusing original offsets.

**Acceptance**

- [ ] No-op output is exactly equal to each input string.
- [ ] Preserve-source transforms leave every protected inactive slice and every
  source slice outside accepted edits exactly unchanged.
- [ ] Stale, overlapping, invalid, and conflicting multi-occurrence edits fail
  atomically with structured reasons.
- [ ] Materialized crossing-environment output reparses with the expected structure.
- [ ] Output dependency metadata accurately identifies every preserved input.
- [ ] Analyses and transformations leave the originating snapshot untouched.

### C8. Complete updates, invalidation, and operational bounds

**Depends on:** C1-C7. **Goal:** make reuse correct before optimizing it.

**Steps**

1. Implement atomic additions, replacements, and deletions in the new source API.
   Reuse unchanged scanned files when both contents and scan options agree.
2. Changing scan options invalidates affected scans. Changing entry/condition/
   traversal settings rebuilds views without needlessly rescanning source.
3. Initially recompute complete configured views and affected indexes after any
   relevant source change. Optimize dependency-based reuse only with equivalent
   results demonstrated against a clean full rebuild.
4. Include operation version/options and view/snapshot identity in result keys.
   Never use a global mutable condition-state cache between requests.
5. Expose documented limits on nesting, input occurrences, and output size with
   deterministic failure results. A host owns scheduling, worker termination,
   and hard wall-clock deadlines; synchronous core must not promise cancellation
   merely because an async wrapper accepts an abort signal.
6. Measure scan/view/analysis costs separately on a checked-in corpus, recording
   file count, total characters, tool versions, and reference machine. Set and
   record regression budgets before accepting performance optimizations.

**Acceptance**

- [ ] Incremental and clean-rebuild results agree after edits and deletions.
- [ ] A changed setter invalidates observations in later caller files.
- [ ] Two configurations of the same source can coexist without state leakage.
- [ ] Reordering options with equivalent semantics does not create inconsistent
  results; changing meaningful options never reuses stale results.
- [ ] Repeated inclusion and nesting limits have bounded, tested failure paths.

### C9. Preserve compatibility and keep pipeline convenience

**Depends on:** C7/C8. **Goal:** migrate consumers without hidden behavioral changes.

**Steps**

1. Keep legacy public functions/types available for the migration release.
   Implement adapters where equivalent; retain a clearly isolated legacy path
   where its behavior cannot be represented by the new supported semantics.
2. Preserve omitted `enabledConditions` versus supplied arrays, including empty
   arrays, case sensitivity, legacy broad recognition, stripping behavior, and
   legacy Separate's all-supplied-files scope.
3. Reject ambiguous requests combining legacy fields with incompatible new
   policies. Deprecate legacy entry points/options with a concrete mapping guide.
4. Offer a convenience one-shot operation that builds prerequisites and produces
   output through the new API. Independent analyses remain equally accessible.
5. Demonstrate a short pipeline in documentation by composing public functions:
   resolve view, analyze references, inspect structured findings, transform/export.
   A persistent workflow engine or plugin runtime is not required.
6. If the core checkout includes the CLI described by its docs, keep its existing
   transform command working and add independent inventory/analysis access using
   the same public API. Keep its filesystem responsibilities outside core.

**Acceptance**

- [ ] C0's public compatibility suite passes or every intentional break is
  explicitly versioned and accompanied by a tested migration.
- [ ] No website/CLI consumer requires internal parser imports.
- [ ] A source inventory works with no output destination or transform settings.
- [ ] A composed pipeline and the equivalent individual calls give equal results.

### C10. Validate the package, publish its contract, and hand off

**Depends on:** C0-C9. **Goal:** provide a real, tested dependency for the website.

**Steps**

1. Run the actual repository's required checks. The installed package records
   `typecheck`, `test`, `type-test`, `build`, `format:check`, `docs`, and
   `docs:check` scripts. Verify their current names/workspace locations before
   executing them; do not run development scripts inside website `node_modules`.
2. Run section 5's fixtures through public imports, including runtime,
   compile-time, structured-clone, determinism, immutability, and range tests.
3. Update the core README, architecture, integration guide, generated API docs,
   support matrix, migration guide, and examples. State where source facts differ
   from reached observations, and where operations require a configured view.
4. Compile a clean consumer using the website's TypeScript 4.9/ES2020 settings,
   strict checking, and checked indexed access. Avoid emitting public declaration
   syntax unsupported by that consumer, or resolve a separately documented
   compatibility change before handoff.
5. Create and inspect the package tarball. Install it in an isolated consumer and
   run the example inventory/view/analysis/transform flows using public imports.
   Verify bundled docs, declarations, export maps, and runtime files agree.
6. Select the next appropriate exact release version. `0.3.0` is a candidate for
   this API expansion; do not assume that version is free or already published.
   Prepare release notes and follow the repository's normal release authorization.
7. After the chosen version is published and verified, hand off its exact version,
   migration instructions, support matrix, fixture outputs, and result contracts
   to the website implementation. A local tarball validates the package but is
   not the website's final released dependency.

**Acceptance**

- [ ] All repository checks and the public acceptance matrix pass.
- [ ] Packed and published contents match the documented API.
- [ ] The actual exact release installs and typechecks in a clean consumer.
- [ ] No full-compiler, all-configurations, or complete-byte-preservation claim
  exceeds what the implementation and its input types support.
- [ ] Every capability in section 6 is available through the public entry point.

## 5. Minimum acceptance fixtures

Use small checked-in `.tex` fixtures plus exact expected strings, structured
observations, and diagnostic codes. Add table-driven variants where appropriate.

| ID | Fixture | Required result |
| --- | --- | --- |
| F01 | Empty source, emoji, escaped `%`, LF/CRLF/CR, trailing spaces | Exact source-string round trip; correct UTF-16 locations and insertion boundaries. |
| F02 | Alternative list openings and corresponding conditional closings below | Each resolved configuration has one correctly matched environment; source inventory needs no configuration. |
| F03 | Unbalanced environment only in the skipped arm | Selected active view succeeds; inactive source remains exact. |
| F04 | A flag set true, tested, set false, tested | Source mode chooses different arms at the two occurrences. |
| F05 | A setter inside an inactive arm | Later active state is unaffected. |
| F06 | Setter/input/label inside comments, verbatim, and an uncalled definition | Protected tokens do not execute; definition-body syntax facts retain that context. |
| F07 | Local toggle in a supported execution group, then a global variant | Local value restores; supported global assignment persists. |
| F08 | Included file changes a flag before a caller test | Caller observes the included assignment even with preserved input output. |
| F09 | Missing input only in an inactive arm | No active input failure; retained-source output lists the remaining dependency. |
| F10 | Missing, ambiguous, and circular active inputs | Stable structured errors with original locations and input chain. |
| F11 | Same file included twice under different flags | Distinct occurrence traces; flattened specialization works; incompatible shared-source edits are rejected. |
| F12 | Undecidable/externally defined test and an unsupported primitive test | No implicit false; incomplete view and usable inventory. Named overrides do not reinterpret primitive operands. |
| F13 | `\ifthenelse`, `\iff`, or another ordinary `if`-prefixed command | No invented primitive-style conditional nesting. |
| F14 | Conditional delimiter crosses an input boundary | Source remains inspectable; configured view reports the documented unsupported case. |
| F15 | Same `\label{x}` in mutually exclusive arms | Source has two occurrences; each selected path has no duplicate. |
| F16 | Reference before a label, including across input boundaries | Informational forward-reference result with both locations, correct execution order. |
| F17 | Label exists only inside an uncalled macro definition | Potential source occurrence; no falsely reached target. Coverage explains macro limits. |
| F18 | Used, unused-candidate, self-recursive, indirectly referenced, and redefined commands | Exact documented counts/classifications; no automatic deletion suggestion presented as proof. |
| F19 | Selected structural node spans inactive source and multiple files | Multi-span provenance; no bounding-range rewrite of inactive content. |
| F20 | Source changes after an edit plan is generated | Atomic stale-plan rejection. |
| F21 | Condition configuration changes after a view-dependent result | Result is not accepted for the new view; source-only result remains tied to its own source identity. |
| F22 | Add/delete files, change scan settings, change earlier setter | Correct scan/view/index invalidation and full-rebuild equivalence. |
| F23 | Legacy omission, empty whitelist, and explicit whitelist | Existing three-way behavior is preserved by legacy entry points. |
| F24 | Legacy Separate with an unreachable supplied file | Every supplied file is still emitted. |
| F25 | Local comment removal at text/control-word boundaries | Expected lexical output, no accidental command merging or introduced word space. |
| F26 | One physical slice is active in one inclusion and inactive in another | Preserve-source edit reports a context conflict; neither occurrence silently wins. |
| F27 | Initial true seed followed by `\newif`, then setter; forced true variant | Seed resets on declaration, source setter applies, and forcing has distinct documented results. |
| F28 | Preserve conditions while inlining only active inputs | Remaining literal inputs/dependencies are reported; artifact is not labeled fully flattened/self-contained. |
| F29 | Materialize `\iftrue\relax\fi abc`; inline a file ending in `\relax` immediately before caller text `abc` | Emit the command token followed by the letters, for example `\relax abc`, never the different command `\relaxabc`. Test both conditional and input boundaries independently. |
| F30 | Declare a flag inside a group and use it outside; redefine a tracked test or generated setter | Local bindings restore/disappear according to the supported scope rules. Redefined names do not keep their stale boolean behavior; an unsupported new meaning yields an incomplete view. |

### F02: required crossing-environment example

```tex
\newif\ifdraft
\drafttrue
\ifdraft
  \begin{itemize}
\else
  \begin{enumerate}
\fi
  \item Shared content.
\ifdraft
  \end{itemize}
\else
  \end{enumerate}
\fi
```

Source mode must produce the `itemize` view. Force-false mode must produce the
`enumerate` view despite the source setter. Neither requires treating both list
openings as simultaneous structure. Add section and math variants using the same
test pattern. Also add a view with an environment opened in one input and closed
later in the caller, distinct from the unsupported cross-file conditional case.

## 6. Website handoff contract and completion gate

Deliver these capabilities under the finalized public names. The website must
not recreate them with private imports, regex parsing, or locally invented core
types.

| Capability | Required handoff evidence |
| --- | --- |
| Inspectable source snapshots and atomic updates/deletions | Public examples; F01, F03, F20, F22. |
| Located condition/input/definition/label/reference inventories | Typed facts with context and coverage; F06, F13, F17. |
| Independent entry/traversal/condition configuration | Public validated configuration type; F04-F12 and F27. |
| Ready/incomplete/blocked views and operation eligibility | Stable structured reasons and partial coverage; F10/F12/F14. |
| Configured structure and original origins | Public node union/traversal; F02/F19 plus inclusion IDs. |
| Independent analyses | Public requests/results; F15-F18 and informational forward references. |
| Independent transformations and previewable results | Typed edit/artifact outputs; F19-F21/F25/F26. |
| Export dependency and path semantics | Entry identity, remaining dependencies, no hidden rename; F09/F28. |
| Legacy compatibility | C0 characterization suite and migration examples. |
| Consumer compatibility | Clean install, TypeScript 4.9 consumer check, exact version, bundled docs. |

The core work is complete when these capabilities ship in the verified release
and all required acceptance fixtures pass. A working parser alone, a successful
build alone, or a modal-ready list of condition names does not meet this gate.

## 7. Follow-up work outside this release

- General macro expansion, arbitrary primitive evaluation, package execution,
  unrestricted catcodes, and exact compiler tracing.
- Symbolic analysis across every configuration and a universal conditional AST.
- Automatic cloning/rewriting of shared files for conflicting inclusion contexts.
- Arbitrary rename/extract/delete refactorings before mapped edits are validated.
- Full `\include`/`\includeonly` and auxiliary-file reference semantics.
- A plugin runtime, persistent workflow engine, backend, or TeX compiler service.
- Fine-grained incremental interpretation beyond the verified full-view rebuild.

These features can use the new architecture later; none is required to make
source inspection, analyses, and transformations independent now.
