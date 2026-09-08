# Website implementation plan: project workspace and independent operations

Status: proposed implementation plan, not an implementation or an assertion that the new core API exists.

Prepared: 2026-09-07. Implement this plan after the required library release described in [the core plan](core-project-model-implementation-plan.md) passes its release gate. API names and types below are capability descriptions; bind them to the public names in that release's shipped declarations.

## 1. Goal and release outcome

Turn the website into a workspace for inspecting a LaTeX project and running analyses or transformations independently. Uploading sources creates a usable source snapshot immediately. A user chooses an entry and a conditional interpretation when an operation requires them. Generating output is one operation, rather than the purpose of every interaction.

The release is successful when a user can:

1. Upload a project, dismiss setup, and inspect recognized command definitions and labels across the sources.
2. Select a stable entry, follow supported source condition state or force named boolean values, and inspect the resulting document structure.
3. Run a configuration-specific reference analysis without generating any output file.
4. Preview a transformation that changes only the selected path while preserving conditional syntax and inactive source, or explicitly materialize the selected path.
5. Download results without adding them to the input project or changing its entry.
6. See which findings are complete, incomplete, stale, or blocked, and navigate findings to their correct original locations.

Keep the client-only React/CRA/CodeMirror stack and the code pane read-only. Preserve the existing visual style while introducing the controls and result views needed for these workflows. Do not add a backend, compilation, deployment, cloud storage, or a general plugin system as part of this migration.

## 2. Verified starting point and migration targets

The manifest, lockfile, and installed package currently agree on `@preptex/core@0.2.1`. There is no supplied `packages/preptex-core` directory in this checkout. The authoritative current integration sources are `docs/architecture.md`, the installed `dist/docs/integration.md`, `dist/docs/architecture.md`, `dist/docs/api/README.md`, and `dist/index.d.ts`.

| Current location | Current behavior | Required change |
| --- | --- | --- |
| `src/App.tsx` | `selectedFile` is both the viewed file and the entry passed to `useCoreProcess`. | Separate source/artifact viewing from project entry and configuration. |
| `src/model/useFiles.ts` | A pure reducer owns source buffers, selection, and upload errors; uploads complete atomically. | Retain atomic source ownership and introduce explicit source revision/import events. Keep generated artifacts elsewhere. |
| `src/model/useCoreProcess.ts` | One parsed project and `canTransform`; any project parse failure removes the usable project. | Expose source availability, configured-view readiness, and independent operation results. |
| `src/services/core.ts` | Incremental `parseProject`/`mergeProjects`; deletions and recovery rebuild; options adapt to one transform call. | Adapt the released source-update, view-resolution, analysis, and transformation APIs. |
| `src/model/useControl.ts` | One `CoreOptionsUI` combines comments, input mode, boolean whitelist, and output name. | Retain one authoritative definition of each UI options group, with configuration and operation/output preferences separated. |
| `src/components/ControlPanel.tsx` | One Pipeline/Run form; enabled conditions are an on/off list. | Present independent operations and separate interpretation from export choices. |
| `src/App.tsx` output handling | Generated text is renamed and upserted into source buffers, selected as the next entry, and reparsed with inputs. | Store artifacts separately; promotion to sources is explicit. |
| `src/components/astview/treebuilder.tsx` and `src/types/LayoutNode.ts` | One file-local structural tree with a line and numeric node ID. | Support source syntax and configured structure with snapshot, origin, and inclusion identity. |
| `src/components/LogPanel.tsx` | Structured warnings and one processing failure. | Show source/view diagnostics and independent operation findings with provenance and navigation. |

Existing tests in `src/services/core.test.ts`, `src/model/project.test.tsx`, and `src/App.test.tsx` protect useful invariants, but some intentionally encode behavior being replaced. For example, the upload-to-output test expects the generated file to become the entry, and parse-error tests expect every operation to be disabled. Replace those expectations explicitly; do not preserve them through compatibility hacks or remove all coverage.

## 3. Required core handoff

Do not implement condition evaluation, command interpretation, label resolution, or source edit mapping in the website. The core release must provide these capabilities through the public `@preptex/core` entry point:

| Core capability required | Website use | Gate |
| --- | --- | --- |
| Immutable lossless source snapshots, version identity, diagnostics, and atomic updates including removal | Uploads, source inspection, incremental refresh | Required before Phase W2 |
| Source-level condition/input inventories without requiring one valid structural AST | Setup and browsing intertwined constructs | Required before Phase W3 |
| Configured interpretation: stable entry, traversal policy, supported source state, forced booleans, explicit unknowns | Condition setup and active operations | Required before Phase W3 |
| Discriminated view status such as ready/incomplete/blocked, reason codes, completeness/support metadata | Accurate availability and status UI | Required before Phase W3 |
| Ordered inclusion occurrences and origins identifying source revision, file, original range(s), and inclusion context | Cross-file navigation and repeated inputs | Required before Phase W4 |
| Structured source inventories and configured analyses, with operation requirements and provenance | Analysis results | Required before Phase W5 |
| Transform results as checked edits or artifacts, preservation/materialization policies, output compatibility diagnostics | Transformation preview and output | Required before Phase W6 |
| Public enums/guards, runtime validation, stable diagnostic/error codes, readonly types | Safe strict TypeScript integration | Required throughout |

Candidate release numbering is a new `0.x` minor, for example `0.3.0`, for the expanded public contracts and planned deprecations. The core plan initially retains legacy entry points and their behavior; any actual breaking change must be explicitly documented. The website must install the exact version actually published and verified, not assume that candidate exists. Read that version's shipped docs and declarations again before migrating.

A source snapshot may contain incomplete syntax information for a damaged file. A configured view may also be incomplete. Neither state means that all source operations are unavailable. The core must state what is known and which operations can safely proceed; the website must not turn unknown conditions into false or label a partial reference search complete. Even a ready view must expose its coverage: it is ready within the documented supported subset, not a certification of full TeX execution.

## 4. Product and state contract

### 4.1 Independent concepts

Use these distinct concepts in state and controls:

- **Viewed item:** a source file or a generated artifact, selected for browsing.
- **Entry:** the source file from which a configured interpretation begins; it can be unset.
- **Source scope:** a file or the uploaded source project for inventories or source-local operations.
- **Interpretation:** entry, semantic input traversal, condition policy and overrides, and supported analysis settings.
- **Operation:** a requested analysis or transformation and its operation-specific options.
- **Output preferences:** conditional retention/materialization, output topology, and output naming. These do not alter an analysis configuration.

Use a discriminated viewed-item identity so a source and an artifact can have the same virtual path without becoming the same selection. An artifact must never be accepted as an entry unless the user explicitly promotes it to sources.

### 4.2 Source scope and configured view

Offer source inspection immediately. Label its scope as “All uploaded sources” or “This source file,” and describe a definitions inventory as recognized declarations in the source. This scope visits both branches for inventories; it does not promise a single structural document or compiler execution.

Configured structure uses a selected entry and traversal. Semantic input choices must use the core's declared policies, such as entry only or entry plus active reachable inputs. A files-independent operation is a collection of independent file contexts, not one document assembled in filename order. State resets between independent contexts according to the core contract.

Output choices such as preserve input commands, flatten reachable inputs, or emit several files belong to a transformation. “Preserve inputs” must not silently mean “ignore their effects while analyzing the project.”

### 4.3 Conditional interaction

The initial workspace is source inspection, with no forced condition values. When requesting a configured view, default to following the condition state supported by the core; unknown results remain unresolved.

For recognized named booleans, show “Follow source,” “Force true,” and “Force false.” Explain once that forced values choose the same branch at every recognized test and are not changed by later setters. Display effective results per occurrence where a boolean changes value during source traversal; one summary checkbox cannot represent that behavior.

If the library supports supplied initial values, place them in an advanced setting separate from forced values and explain the precise injection point defined by the API. For example, a value supplied before execution can later be overwritten by an executed declaration or setter. Do not label an initial value as a forced choice.

Show why an occurrence is true, false, or unknown: source setter/declaration, forced choice, unsupported test, unresolved input, or the specific reason supplied by core. A setting for a named boolean must not purport to evaluate arbitrary primitive tests or macro-generated conditions.

For the first release, the resolver stops at the first unresolved execution event; it does not merge hypothetical branch states and claim that later events are determined. Unresolved conditions block operations requiring a complete active structure. Source inventories remain available with their own coverage information. Do not add a global “unknown means false” fallback. An explicitly incomplete analysis is available only if the core advertises that capability and returns appropriately qualified findings.

Honor the first core release's boundary support explicitly. An enclosing conditional may contain an input, and active environments can span input boundaries where projection supports them. A conditional opened in one physical file and closed in another is unsupported for an active view in this release; preserve the source and show the relevant diagnostic rather than silently applying a browser workaround.

### 4.4 Setup dialog lifecycle

Use one dismissible **Project Setup** dialog with entry/input interpretation and conditions in the same form. Include an output section only when entered from a transformation, or leave output preferences in the transform panel.

| Event | UI response |
| --- | --- |
| First successful external import into an empty workspace | Scan sources, then open setup once for that import; allow “Continue inspecting sources.” |
| Explicit Project Settings action | Open the same dialog with saved choices. |
| User requests an operation missing required configuration | Explain the missing requirement and open setup for that operation. |
| Another source is selected or an artifact is previewed | Change the viewed item only. |
| Sources are replaced or dependencies are added | Refresh inventories and readiness; show a badge for new unresolved conditions; keep saved choices where still applicable. |
| Entry changes | Re-resolve the configured view and update status; do not open a second automatic modal. |
| Artifacts are generated | Update the results area only. |
| Entry is removed | Clear the entry and show “Select an entry”; do not silently use the next viewed source. |
| Last source is removed / project is explicitly reset | Reset entry, configuration association, import/setup lifecycle, and current source results. |

Opening the dialog has no semantic effect. Editing uses a local draft; Apply commits the configuration atomically, while Cancel/Escape restores the saved configuration. Closing the first-import dialog does not discard sources or hide source analysis tools.

### 4.5 Suggested ownership

Names of new files/hooks are recommendations, not mandatory APIs. Keep ownership clear even if implementation combines adjacent hooks.

| Owner | State |
| --- | --- |
| `useFiles` | Authoritative source buffers, per-file versions, atomic upsert/remove/import events, read failures |
| `useProjectConfiguration` or equivalent | Committed stable entry, interpretation settings, and revision/key |
| `ProjectSetupDialog` or equivalent | Uncommitted local form draft, validation messages, and Apply/Cancel behavior |
| `useProjectModel` replacing the transform-centric part of `useCoreProcess` | Current core source snapshot, source diagnostics, derived configured view and readiness |
| `useOperations` or equivalent | Requested operation, keyed running/completed/failed/stale results and selected result |
| Artifact store | Generated files, provenance, selected artifact; excluded from source snapshots |
| `App` / presentation state | Viewed item, panes/tabs, navigation request, resizing, dialog visibility, and acknowledged-import/setup lifecycle |
| Pure adapters in `src/services/` | Public core calls, option mapping, readiness mapping, typed error conversion |

Each domain options type has one authoritative definition. Import core domain types directly; website types may add presentation fields but must not restate core unions. Update `docs/architecture.md` and the relevant state-ownership instructions in `AGENTS.md` when replacing the existing `CoreOptionsUI` arrangement.

## 5. Ordered implementation phases

### Phase W0 — Record the baseline and finalize the integration contract

**Goal:** Have a reproducible baseline and a concrete public core handoff before changing the website.

**Steps:**

1. Read the repository instructions and current architecture. Check the working tree and preserve unrelated changes.
2. Use Node.js 22. Install the current lockfile with `npm ci` if dependencies are absent, and run the four required checks to distinguish baseline failures from migration failures.
3. Record current upload, source navigation, AST filtering, transformation, and download behavior with representative fixtures.
4. Build a capability checklist from Section 3 against the new core release's public declarations. Agree on supported condition syntax, exact unknown behavior, input traversal policies, operation prerequisites, edit conflicts, and origin mapping with the library implementation.
5. Record the released type/API names and explicit old-to-new behavior changes. Do not implement gaps through a private import or local parser.

**Verification / exit:** Baseline check results are recorded. Every required capability has an exported API and at least one library acceptance fixture. Missing prerequisites are recorded as an integration blocker with an exact capability, not discovered halfway through a UI implementation.

### Phase W1 — Upgrade the published package and establish the adapter boundary

**Goal:** Consume the new library reproducibly through its public contract.

**Depends on:** Core release and package-consumer verification.

**Steps:**

1. Pin the exact verified release in `package.json`; update `package-lock.json` together. Do not add a released `file:` dependency or use a sibling repository's private files.
2. Read the installed integration guide, architecture, generated API reference, root declarations, and necessary public declaration re-exports. Verify manifest, lockfile, and installed package versions agree.
3. Extend or split `src/services/core.ts` into small pure adapters for source updates, view resolution, operation invocation, and error normalization. Keep React lifecycle and browser I/O out of these adapters.
4. Use the exported readonly types and guards. Validate DOM/config values starting as `unknown`; preserve diagnostic codes, ranges, related locations, and incomplete/blocked reasons.
5. Add integration tests importing the real published package for the lossless source model, one resolved conditional example, one unresolved example, and one analysis result.
6. Keep old adapters temporarily only where the release offers a documented compatibility path. Mark old whitelist semantics explicitly until removed; do not reinterpret omitted/empty `enabledConditions` silently.

**Verification / exit:** Real-package tests and explicit TypeScript checking pass. Browser build resolves only the public package. No private imports, copied core types, readonly casts, or broader Jest ESM exceptions are introduced.

### Phase W2 — Separate sources, entry, viewing, and artifacts

**Goal:** Browsing and generating output cannot change the analysis project accidentally.

**Depends on:** W1 and the source snapshot/update API.

**Steps:**

1. Retain the pure atomic `useFiles` reducer and batch FileReader behavior. Preserve original strings, virtual paths, and line endings. Add source revision tracking needed by the new core contract.
2. Introduce explicit stable entry state separate from `selectedFile`. Recommend an entry during setup, but commit it only through the defined setup/default action; choosing a file row only changes viewing.
3. Give viewed sources and artifacts distinct tagged identities. Ensure finding navigation switches the viewed source without changing the entry.
4. Replace `writeOutputsToTree` with artifact creation. Previewing or downloading artifacts does not upsert text into `useFiles`.
5. Define deterministic removal/reset behavior from Section 4.4 and keep entry changes atomic with configuration invalidation.
6. Add an explicit “Use as source” action only if needed for the initial release. It must preview collisions, require the chosen source destination, route changes through `useFiles`, and invalidate dependent results. It must not silently replace existing sources.

**Verification / exit:** Tests show that selecting an included file leaves the entry unchanged; generating output does not change source count or source revision; repeating a files-independent transform does not reprocess past outputs. Same-path source and artifact rows remain distinct. Batched upserts/removals and selection during an asynchronous upload retain every intended update under React StrictMode.

### Phase W3 — Introduce source/model readiness and unified configuration

**Goal:** Sources are useful before a configured structural view is available, and conditions are configured without repeated interruptions.

**Depends on:** W2 and core inventories/resolution/status APIs.

**Steps:**

1. Replace the global “parsed project or error” availability model with current source snapshot plus per-file source coverage/diagnostics and separately derived configured-view status.
2. Reuse the current source snapshot when only entry, condition values, or output preferences change. Recompute only dependencies affected according to the core contract; if exact dependency invalidation is unavailable, conservatively invalidate derived views, not the source snapshot.
3. Define configuration identity from the core version, source snapshot, entry, traversal, condition policy, overrides, and relevant semantic options. Keep output naming and purely visual preferences out of this identity.
4. Build the Project Setup dialog and a compact always-visible entry/configuration summary. Follow the event table in Section 4.4 exactly.
5. List potential source conditions and distinguish them from currently reachable condition occurrences. Retain exact case-sensitive names. Preserve explicit settings for names still present; show settings whose names disappeared as inactive and exclude them from effective configuration rather than silently applying them to another symbol.
6. Add force controls, occurrence evidence, supported/unsupported explanations, and unresolved badges. Initial values, if exposed, are distinct advanced fields governed by the core's documented timing.
7. Scope errors to source/view/operation. A syntax problem in an unrelated file must not erase healthy source inventory or block an active view whose core dependencies exclude that file.

**Verification / exit:** First import opens setup once even under StrictMode. Dismissal permits source inspection. File selections, generated artifacts, and reuploads do not reopen it. Apply commits all fields once; Cancel changes none. A source setter followed by another setter shows different occurrence outcomes in Follow source mode; Force true overrides both test decisions. Unknowns are visibly unresolved and never appear as false.

### Phase W4 — Render source syntax and configured structure with correct navigation

**Goal:** Users can inspect source and the chosen document structure without misleading trees or locations.

**Depends on:** W3 and core source/active models with original-location provenance.

**Steps:**

1. Add a clearly labeled source-versus-configured-structure selector. If the source representation cannot express a balanced structural tree, render the available source syntax, conditional regions, and inventories; do not reconstruct a fictitious all-branches AST in the website.
2. Adapt `TreeLayoutBuilder` or introduce separate small builders for the actual public unions. Preserve exhaustive narrowing and readonly derived `LayoutNode` values.
3. Replace the assumption that every row has one line in the selected file. Store a navigation target using the public origin type: source version, file, original range or origin list, and inclusion context where relevant.
4. For nodes spanning disjoint branches or files, make the primary location deterministic and offer their other contributing locations. Never convert their minimum and maximum offsets into one fictitious contiguous range.
5. Key expansion/selection by model kind, source snapshot, view/configuration identity, inclusion occurrence, file, and node identity as appropriate. Clear ephemeral row selection after reparsing instead of treating recycled node IDs as bookmarks.
6. Preserve AST filter preferences, versioning and validating persisted display options if kinds change. Failed localStorage access must remain nonfatal.
7. Keep CodeMirror read-only. Convert core inclusive UTF-16 ranges to CodeMirror's half-open ranges only at the display boundary. Normalize navigation to the matching displayed document and test CRLF, lone CR, and surrogate pairs; do not normalize stored source to make offsets appear to work.
8. Navigate artifact syntax against a separately parsed artifact snapshot or a genuine core artifact map. Original input offsets must never be applied directly to transformed text.

**Verification / exit:** Both branches of the intertwined-environment fixture remain visible in source inspection; a resolved view contains exactly the chosen well-formed structure. Clicking a finding or active node opens the correct source without changing entry. Two inclusions of the same file have distinct occurrence identities. Multi-origin nodes, Unicode, CRLF, empty documents, repeated jumps, and stale results have deterministic navigation behavior.

### Phase W5 — Add independent analysis operations and structured results

**Goal:** An analysis is a useful first-class action with no output-generation prerequisite.

**Depends on:** W3–W4 and released core analysis operations.

**Steps:**

1. Replace the single Pipeline/Run action with an operation selector or compact Analyze/Transform groups. Use specific actions such as “List definitions and labels” and “Check references.” Keep export controls hidden for analysis actions.
2. Use the core's operation requirements to determine availability: source syntax, an occurrence index, a complete configured structure, or an explicitly supported incomplete view. Explain an unavailable action next to its control.
3. Implement the first source inventory for recognized command definitions, labels, and references; show source file, original location, recognized construct, and conditional/definition context as returned by core.
4. Add configured missing/duplicate label and forward-reference analyses after the required core operations exist. Forward reference means source/execution order within the documented model and is informational, since an ordinary LaTeX forward reference is valid.
5. Add possible-unused-command findings only when core supplies the analysis and its uncertainty. Use “No recognized uses found” or the released qualified wording. Do not infer non-use by searching rendered AST row labels or plain substrings in the UI.
6. Render structured result rows with severity, stable code, explanation, primary and related source locations, scope, completeness, and configuration summary. Distinguish no findings from no analysis, no recognized occurrences, and incomplete coverage.
7. Keep findings and diagnostics separate internally even if they share a result panel. Running one analysis must not overwrite another operation's failure or mix results from different configurations.
8. Tie results to core version, exact source snapshot, configuration when applicable, operation identifier/version, and operation options. Invalidate or explicitly mark old results stale after dependencies change; disable stale edit application. Source-only inventory does not become stale merely because the viewed file changes.

**Verification / exit:** A definitions inventory runs with setup dismissed and generates zero artifacts. A missing-label check changes when the condition configuration changes. Mutually exclusive label declarations do not appear as unconditional duplicates in the configured analysis. An unresolved view never produces an unqualified “No missing references” success. Selecting rows navigates related source locations correctly.

### Phase W6 — Migrate transformations, preview, and export

**Goal:** Transformations use the same project model and produce reviewable results without corrupting source or output relationships.

**Depends on:** W2–W5 and core checked-edits/artifacts/output-policy APIs.

**Steps:**

1. Move comment suppression and other transform settings into transform options. Choose the operation's target explicitly: source scope or active configured path, according to its core requirements.
2. Expose conditional output choices separately: keep full conditional source, or materialize the selected path. Default active-path transforms to preserving inactive source unless the user explicitly chooses materialization.
3. Expose output topology separately from traversal. Offer only combinations supported by core; show its incompatibility/conflict reason when one physical input file has different edits in different inclusion contexts. A changed physical slice that is active in one occurrence and inactive in another is also a preservation conflict: deduplicating the edit would still alter the supposedly untouched inactive occurrence.
4. Show changed files and a text/diff preview before applying edits to sources. Core-proposed edits remain proposals until Apply; apply the checked edit set atomically through source ownership and reject it if its source snapshot is stale.
5. Store generated artifacts with source/configuration/operation provenance and a run identity. Keep old artifacts readable as historic results while marking their relation to the current sources clearly.
6. Make output naming an explicit policy. For a single flattened file, a custom name is straightforward. For a multi-file exported project, default to retaining relative paths in a separate artifact namespace. Do not rename every file to `.processed.tex` while leaving preserved `\input` targets pointing at the original names.
7. If multi-file renaming is offered, use the core's finalized artifact/input mapping and checked reference-rewrite result or restrict the option to combinations proven coherent by the release contract. Do not rewrite input spellings with a regular expression. A set of separately processed source files need not be a compilable project; label that output accurately rather than promise portability. Flattening active inputs while preserving inactive branches can leave literal inputs in those branches: label that artifact “active inputs expanded” or “partially flattened,” and do not advertise it as a self-contained file unless the core's output contract establishes that property.
8. Reparse transformed text separately before artifact AST navigation. Preserve artifact grouping and download naming without implicitly promoting output into the input project.
9. Keep downloads client-side and revoke object URLs. Provide individual artifact downloads and a ZIP download for multi-file project exports so their relative virtual paths survive delivery. Choose an existing compatible browser capability or a small reviewed archive dependency in this phase; document the dependency choice and pin it according to repository policy. Test archive entry paths and UTF-8 text against the core artifact set, then extract a representative archive and verify preserved input relationships without compiling or executing TeX.

**Verification / exit:** With an active-only comment transform, comments in inactive branches and conditional wrappers remain exactly unchanged in preserved output; materialized output contains only the selected path according to core fixtures. Source buffers remain unchanged until Apply. Stale or conflicting edits cannot apply. Repeated transformations do not grow input files. Multi-file ZIP contents match the artifact set and retain valid internal input references for every export option advertised as a usable project. Materialization and inlining preserve command boundaries as established by core fixture F29.

### Phase W7 — Harden lifecycle, diagnostics, and measured performance

**Goal:** The workspace remains consistent during imports, replacements, errors, and heavier projects.

**Depends on:** W2–W6.

**Steps:**

1. Audit source replacement, file removal, entry changes, configuration changes, failed reads, failed scans, blocked views, analysis failures, and transform failures. Ensure every result belongs to the exact inputs currently displayed.
2. Keep core errors typed via `catch (error: unknown)`. Preserve expected error codes and source locations, and present unexpected failures without discarding still-valid source data.
3. Verify configuration drafts cannot apply against removed entry files or an obsolete condition inventory without revalidation. Show fresh errors in the draft when sources changed while setup was open.
4. If any operation is asynchronous, use a request identity containing its full input key. Discard late replies from obsolete requests; cancellation and “running” status must be scoped per request, not global to the workspace.
5. Measure import-to-source-ready, view-resolution, analysis, and transformation timings on the agreed representative fixtures, and record browser/hardware, source sizes, file counts, and long tasks. Set and record a concrete responsiveness budget before using results to decide on workers.
6. Keep the first implementation synchronous if measurements meet the recorded budget. If processing causes unacceptable main-thread stalls, add one Web Worker adapter through the same pure service boundary. Validate request/reply DTOs, serialize typed errors, enforce revision matching, and test cancellation/termination and structured-clone readonly assumptions.
7. Cache only immutable results using every semantic input and the core version. Clear cache entries for obsolete snapshots or set a bounded retention policy. Changing visual filters must not rescan source; changing output name must not recompute reference analysis.

**Verification / exit:** An intentionally late response cannot replace a newer result. Failure and recovery leave available source tools usable. All changed or deleted dependencies invalidate affected views, including a newly uploaded input that resolves a prior unknown. Performance measurements meet the recorded budget, or the worker variant demonstrates that controls remain responsive during the same fixture.

### Phase W8 — Complete regression, browser, and documentation verification

**Goal:** The delivered workspace satisfies the user workflows and the repository's development checks.

**Depends on:** All preceding phases.

**Steps:**

1. Update `src/services/core.test.ts` for the new adapter contract and actual core behavior. Keep narrow real-package integration tests; do not mock condition resolution or analyses to make migration tests pass.
2. Extend `src/model/project.test.tsx` for atomic source updates, independent entry/viewing, result keys, artifact separation, per-operation readiness, partial source availability, stale invalidation, and recovery under StrictMode.
3. Update `src/App.test.tsx` for the new visible workflows, including setup lifecycle and explicit source application. Extend AST builder tests for every released public variant and multi-origin navigation data.
4. Exercise the acceptance scenarios in Section 6 in a real browser. Inspect rendered layout at the existing normal desktop layout and a narrow viewport; retain usable source and result panes without clipped dialog actions.
5. Test dialog focus entry/trapping/restoration, Escape, cancel/apply behavior, keyboard operation of condition choices and tabs, visible focus, accessible status messages, and readable disabled-action explanations. Use native radio/select/checkbox semantics where possible rather than unimplemented custom listbox behavior.
6. Check upload/folder selection, file removal, AST filtering, collapsing/resizing, source jumps, result selection, and actual downloaded file contents. Preserve existing features unless a documented behavior change replaces them.
7. Update `docs/architecture.md`, relevant instructions in `AGENTS.md`, and user-facing help. Document state owners, source/configured models, current supported condition subset, uncertainty, artifacts, output naming, partial readiness, and the chosen performance execution model.
8. Under Node.js 22 run `npm run typecheck`, `npm run lint`, `npm run test:ci`, and `npm run build`, then `git diff --check`. Record exact pass/failure results and fix regressions within scope. Do not deploy or push as a verification step.

**Verification / exit:** All required checks pass, all required browser scenarios have recorded results, current architecture/help match actual behavior, and the go/no-go checklist in Section 7 has no unchecked required item.

## 6. Required acceptance scenarios

Use small shared fixtures from the library plan where possible; assert meaningful outcomes, not private implementation details.

| ID | Fixture/action | Expected result |
| --- | --- | --- |
| UI-01 | Upload a file declaring a command and a label; dismiss setup. | Source text and recognized inventory are usable; no artifact is created. |
| UI-02 | Set `main.tex` as entry, inspect `part.tex`, then inspect an artifact. | Entry and interpretation remain `main.tex`; only viewing changes. |
| UI-03 | Upload conditionally intertwined environment openers/closers. | Source inspection remains available; either forced configuration shows its own valid active structure. |
| UI-04 | `\newif\ifdraft`, then false and true tests separated by an executed setter. | Follow source reports the different test results; Force true/false produces its stated override behavior. |
| UI-05 | Setter occurs in an inactive branch. | Later source-driven decisions reflect that the setter was skipped. |
| UI-06 | Active input changes a boolean later tested by the entry. | Source-driven outcome follows input order even when export retains input commands. |
| UI-07 | Unknown test or unsupported syntax affects the requested active structure. | Exact unresolved reason shown; complete active operations unavailable; source inventories remain available with coverage status. |
| UI-08 | Missing input occurs only in an inactive branch, then configuration activates it. | Readiness follows core semantics; no active missing-input failure before activation, then the required reason appears. |
| UI-09 | Same file is included twice with different condition state, including one physical slice active in one occurrence and inactive in another. | Occurrences remain distinct; findings navigate correctly; an edit affecting an inactive occurrence or conflicting edits are rejected rather than combined silently. |
| UI-10 | Duplicate label spelling in mutually exclusive branches. | Source inventory lists both declarations with context; configured duplicate check counts only the active occurrences. |
| UI-11 | Reference precedes a recognized label in input order. | Forward-reference finding is informational and distinct from a missing-label error. |
| UI-12 | Command definition has no recognized uses, or an opaque construct may contain uses. | Results use qualified “possibly unused/no recognized uses” wording and core coverage evidence. |
| UI-13 | Unrelated malformed file is uploaded alongside a healthy entry. | Healthy source information remains available; configured operation availability uses its actual dependencies, not one global error flag. |
| UI-14 | Active-only comment removal with preserved conditional output. | Active comments change; inactive source and wrappers are exact; original source unchanged until explicit Apply. |
| UI-15 | Materialize and flatten a known complete configuration. | Artifact matches the core fixture; its AST/source navigation uses artifact locations or a valid map. |
| UI-16 | Run a files-independent transform twice. | Source file count and inventory remain unchanged; first-run artifacts are not transformed as inputs. |
| UI-17 | Edit setup draft, then Cancel; replace sources while another draft is open. | Cancel preserves committed configuration; Apply revalidates against current sources. |
| UI-18 | Remove entry, remove last source, or upload a missing dependency. | Entry clearing/reset/recovery follows the explicit lifecycle; no accidental fallback entry or stale successful result. |
| UI-19 | Result with an emoji before a target, CRLF/lone-CR text, repeated includes, or several origins. | Navigation reaches the exact intended source occurrence and range. |
| UI-20 | Generate and download a multi-file project with preserved inputs. | ZIP entries preserve relative paths and exact decoded artifact strings; references resolve within the extracted artifact set for the advertised export policy, and naming does not silently break them. |
| UI-21 | A stale analysis/transform completes after a newer source/configuration request. | It cannot replace current findings or apply edits to newer source. |
| UI-22 | Keyboard-only upload/setup/analysis/navigation/export path. | Controls are operable, focus is visible and restored after dialog dismissal, statuses are announced, and actions remain reachable at a narrow viewport. |
| UI-23 | A conditional opens in one file and closes in another, compared with an environment spanning the same input boundary. | Source remains inspectable; the first-release conditional-boundary limitation is explicit, while supported projected environment structure is rendered correctly. |
| UI-24 | Preserve inactive branches while expanding active inputs; an inactive branch contains an input. | The literal inactive input remains, and the result is labeled partially flattened rather than self-contained. |

## 7. Objective release go/no-go checklist

- [ ] The exact published core version, lockfile, installed package, and reviewed docs agree.
- [ ] All required core capabilities are public; the website has no replacement conditional parser or private deep import.
- [ ] Source inspection and at least the definitions/labels inventory work without choosing conditions or producing output.
- [ ] Stable entry, viewed source/artifact, source scope, configuration, and output preferences are separate.
- [ ] First import/setup lifecycle matches the event table; selecting files never reopens setup.
- [ ] Follow source, forced decisions, unsupported/unknown outcomes, and any initial-value setting are described accurately.
- [ ] Intertwined conditional structures work through the configured core view; no all-branches structural AST is fabricated.
- [ ] Analysis results carry exact source/configuration/operation provenance, completeness, and correct cross-file navigation.
- [ ] Independent operations are enabled by their own requirements, including usable source operations during unrelated errors.
- [ ] Preservation/materialization and semantic traversal/output topology are independent and obey core compatibility checks.
- [ ] Artifacts are excluded from inputs; stale/conflicting edits cannot apply; advertised multi-file exports have coherent references.
- [ ] Required automated checks, regression fixtures, browser interactions, accessibility checks, and performance measurements pass.
- [ ] Architecture and user help document the implemented model and limitations rather than the old transform-only behavior.

If a required item fails, do not call the migration complete. Record the exact failing fixture or missing released capability and finish that dependency before presenting the corresponding UI as available.

## 8. Deferred work

Defer named configuration profiles, comparisons across configurations, a saved pipeline editor, persistent project storage, editable CodeMirror buffers, arbitrary plugin loading, collaboration, and compilation/PDF preview. The independent operation model should make a simple pipeline wrapper possible later, but no generic scheduling framework is required for the first release.

Workers are conditional on measured responsiveness in W7, not a prerequisite for designing the model. A comprehensive unused-command proof, arbitrary TeX execution, and evaluating every primitive/package conditional remain outside the website's responsibility; expose only the library's documented capabilities and uncertainty.
