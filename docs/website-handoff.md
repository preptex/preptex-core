# Website handoff for 0.3.0

The implementation targets one exact version, **`@preptex/core@0.3.0`**; the CLI
uses that same exact dependency. C9 is implemented. C10's local verification is
reproducible with the commands below. **Publication and registry installation
remain pending.** The registry returned no 0.3.0 release, and the release login
returned `401 Unauthorized` on 2026-09-08. A local tarball is not the website's
released dependency.

## Public contract

The [project model guide](./project-model.md) lists every public executor and its
support matrix. The [migration guide](./migration-0.3.md) explains legacy behavior,
configuration choices, result ownership and pipeline composition. Generated
[API documentation](./api/README.md) and `dist/index.d.ts` define the typed surface.

Use `createProjectSnapshot`, `updateProjectSnapshot` and `inspectProject` for
source ownership and located inventories. Use `resolveProjectView` and
`checkOperationCapability` for readiness, `walkConfiguredNodes` for structure,
`indexProjectView` and `runAnalysis` for reached evidence, and
`planTransformation` / `applyProjectEdits` for reviewed output. Each source,
view, analysis, edit plan and artifact carries the corresponding identity or
provenance. `runProjectPipeline` is optional convenience around those operations.

Ready structure is valid only within `direct-latex-v1` and its assumptions.
Source facts in inactive branches or stored bodies are potential occurrences;
they are not reached observations. Unknown interpretation stops explicitly.
Forward references are informational; command-use candidates do not prove safe
deletion. Source preservation covers JavaScript strings and UTF-16 units, not
original byte encodings, arbitrary expansion or every possible configuration.

## Reproducible acceptance evidence

```sh
npm ci
npm run check
npm run build
npm run docs
npm run pack:check
npm run consumer:check
```

`consumer:check` clean-builds and packs both workspaces, checks package contents
and SHA-512 integrity, then installs their actual tarballs in a temporary consumer
outside the monorepo. Its compiler is pinned to TypeScript **4.9.5**, targeting
ES2020 with strict checking, checked indexed access, exact optional properties,
no skipped library checks, and no Node/DOM ambient types. Both public type suites
run against the installed declarations. The script also checks ESM exports and
blocked deep imports, executes the public example, all three public project
suites, and both CLI suites against the installed packages. CI runs this check.

Tarballs and a machine-readable `verification.json` remain under
`examples/build/release/` (ignored by Git). The report identifies local artifacts
and their integrity; it never implies registry verification. Temporary installed
consumers are removed after checking.

The 0.3.0 verification covers 342 core tests and nine CLI tests in the checkout;
175 public project acceptance tests, both public declaration suites and the nine
CLI tests also run against the installed tarballs. The standalone example checks
inventory, both source/override views, reference findings, checked edits, export,
and equality of the composed pipeline with the individual calls.

| Fixtures | Executable evidence in `core/tests/`                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01      | `project-model.test.ts`: lossless strings, UTF-16 coordinates, freeze/clone/determinism; `project-operations.test.ts`: exact identity output                                                                                                          |
| F02–F03  | `project-model.test.ts`: crossing environments, sections/math and inactive invalid structure; `project-operations.test.ts`: materialize and reparse                                                                                                   |
| F04–F08  | `project-model.test.ts`: sequential setters, skipped effects, protected bodies, local/global state and active inputs                                                                                                                                  |
| F09–F14  | `project-model.test.ts`: inactive missing inputs, located input failures, repeated occurrences, unknown/primitive tests, ordinary if-prefixed commands and cross-file condition failures; `project-operations.test.ts`: retained missing dependencies |
| F15–F18  | `project-operations.test.ts`: mutually exclusive labels, forward/duplicate/missing references, stored body coverage and command-use classifications                                                                                                   |
| F19–F22  | Both project suites: disjoint/multi-file origins, stale source/view rejection, atomic updates/removals, scan invalidation and rebuild equality                                                                                                        |
| F23–F24  | `project-model.test.ts`: omitted/empty/explicit legacy whitelists and all-supplied Separate; `project-pipeline.test.ts`: case sensitivity, broad recognition, stripping and mixed-policy rejection                                                    |
| F25–F26  | `project-operations.test.ts`: lexical comment removal and active/inactive shared-range conflicts                                                                                                                                                      |
| F27–F30  | `project-model.test.ts`: seed/declaration semantics, token boundaries and binding redefinitions; `project-operations.test.ts`: remaining dependencies and emitted conditional/input boundaries                                                        |

`project-pipeline.test.ts` also checks equality with individually composed public
operations, readonly/frozen clone-safe results and unavailable export failures.
CLI tests exercise inventory without an entry/destination, source and configured
analysis, structured failures, partial coverage, option validation, symlink
exclusion, and the existing transform/AST behavior. The
[performance report](./project-model-performance.md) records the fixed C8 corpus
and regression budgets.

## Remaining release gate

An authorized maintainer must authenticate to npm, verify that 0.3.0 is still
available, and publish the verified core tarball before the CLI tarball. After
publication, compare each registry `dist.integrity` with `verification.json`,
install `@preptex/core@0.3.0` and `@preptex/cli@0.3.0` from the registry in a fresh
consumer, and repeat the type/runtime checks with
`npm run consumer:check -- --registry`. This mode compares the freshly packed
contents to registry integrity, installs exact registry versions, runs the same
suites and writes `registry-verification.json`. Record registry success before
marking C10 complete and updating downstream dependencies.

Then start the [website plan](./plans/website-project-workspace-implementation-plan.md):
W0 confirms the contract; W1 pins the published dependency and adapter; W2
separates source, entry, viewing and artifacts; W3 adds readiness/configuration;
W4 renders syntax/structure with original navigation; W5 exposes independent
analyses; W6 migrates transformations and preview/export; W7 hardens lifecycle and
performance; W8 completes regression/browser/documentation verification.
