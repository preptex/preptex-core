# Website handoff for `@preptex/core@0.4.0`

This document summarizes the `@preptex/core@0.4.0` public contract for the frontend workspace and records the reproducible verification suite.

---

## Frontend architecture contract

`@preptex/core@0.4.0` provides a clean backend for the frontend workspace where **condition realization is separate from AST generation**:

1. **Stage 0 — Source Ownership & Inventories (`createProjectSnapshot`, `updateProjectSnapshot`, `tokenizeFile`, `inspectProject`, `inspectProjectEnvironments`)**:
   - Scans each `.tex` file once with the stateless whole-file tokenizer (`tokenizeFile`) into `ScannedFile.tokens` (`SourceToken[]`) and `ScannedFile.facts` (`SyntaxFact[]`).
   - Works on incomplete or unbalanced files without requiring an entry file or condition values.
2. **Pipeline B — Standalone Condition Realizer (`realizeProjectConditions`)**:
   - Evaluates `\newif`, `\if...`, `\else`, `\fi`, and `[\global]\Xtrue`/`\Xfalse` over `file.tokens` (with `traversal: 'project'` or `'file-only'`).
   - Ignores non-condition LaTeX constructs (`{}`, `\begin`/`\end`, `$`, sections, and custom macros) so condition realization succeeds even when environments or braces are unbalanced or straddle conditional branches (**INV-3**).
   - Returns:
     - `decisions: readonly ConditionDecision[]`
     - `editPlan: ProjectEditPlan | null` (apply via `applyProjectEdits(snapshot, realized.editPlan)` to strip condition directives and inactive branches in-place)
     - `artifacts: readonly GeneratedArtifact[]` (condition-free files)
3. **Pipeline A — Condition-Free Structural View, Analyses, Node Edits, and Export (`resolveProjectView`, `runAnalysis`, `planTransformation`)**:
   - `resolveProjectView(snapshot, configuration)` either runs the shared condition realizer first (`conditions.mode: 'source' | 'source-with-overrides' | 'manual'`) or expects an already condition-free snapshot (`conditions.mode: 'none'`).
   - The structural parser (`parseConfiguredStructure`) builds a condition-free `ConfiguredNode` tree (`root | section | environment | group | math | token`) and blocks with `reason.code === 'unrealized-condition'` if any condition token reaches it (**INV-4**).
   - `runAnalysis(view, { operation: 'references' | 'unused-commands' })` and `planTransformation(view, { operation: 'suppress-comments' | 'remove-environments' | 'edit-nodes' | 'export-project', options })` operate exclusively on the realized `ProjectView` (**INV-6**).
   - `createProjectSourceIndex(view)`, `sourceOffsetAt`, `lookupProjectSource`, `selectProjectNode`, and `getSelectedNode` provide fast original-source cursor/range mapping and revision-bound node selection.

See:

- [Integration guide](./integration.md) for complete frontend and Web Worker code examples.
- [Project model contract](./project-model.md) for the full operation matrix and condition policies.
- [Node operations](./node-operations.md) for source lookup and node edit actions (`remove-node`, `rename-environment`, `wrap-node`).
- [Migration guide](./migration-0.4.md) for the mapping from removed legacy APIs.
- [Generated API reference](./api/README.md) and `dist/index.d.ts` for exact TypeScript signatures.

---

## Reproducible verification

Run from the repository root:

```sh
npm ci
npm run check
npm run build
npm run docs
npm run pack:check
npm run consumer:check
```

### Verification coverage

- **`npm run check`**:
  - Builds `@preptex/core` and type-checks both `@preptex/core` and `@preptex/cli`.
  - Runs **208 core unit & acceptance tests** across 4 test suites (`project-model.test.ts`, `project-operations.test.ts`, `node-operations.test.ts`, `project-pipeline.test.ts`), including explicit verification cases `V-TOK-1`, `V-COND-1`–`V-COND-5`, `V-AST-1`–`V-AST-2`, and `V-PIPE-1`.
  - Runs **9 CLI integration tests** across `project-cli.test.mjs` and `transform-cli.test.mjs`.
  - Runs compile-time TypeScript contract tests (`core/type-tests/project-model.ts` and `core/type-tests/node-operations.ts`).
  - Validates public TSDoc with TypeDoc (`npm run docs:check`) and repository formatting with Prettier (`npm run format:check`).
- **`npm run consumer:check`**:
  - Packs `@preptex/core@0.4.0` and `@preptex/cli@0.4.0` into release tarballs under `examples/build/release/`, verifies required files and SHA-512 integrity, installs the tarballs in an isolated consumer outside the monorepo with TypeScript 4.9.5 (`target: ES2020`), and runs all type tests, acceptance suites, runnable examples (`examples/project-model.mjs`, `examples/node-operations.mjs`), export boundary checks, and CLI suites.
