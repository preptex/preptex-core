# Changelog

All notable changes to this project will be documented here.

## [0.5.0] - 2026-11-16

### Added

- **Explicit Argument Child Nodes (`ConfiguredArgumentNode`)**: Command, section, and environment arguments (`[optional]`, `{mandatory}`, or single-token bare arguments) are now first-class AST container children alongside `arguments` range metadata.
- **Dynamic Command Signatures (`CustomCommandSignature`)**: Automatic arity inference from `\newcommand`/`\renewcommand`/`\providecommand`/`\def` (`inferDefinedCommands`) plus caller overrides via `ViewConfiguration.customCommands` for dynamic reparsing of undefined commands.
- **Coarse View Tree (`buildCoarseViewTree`)**: Projects a readable `CoarseTree` of sections, environments, commands, arguments, and optional math/groups/text blocks while preserving `NodeSelection` and `NodeLocation` provenance.
- **Extended Symbol Scanner & Catalog (`inspectProjectCatalog`)**: Scans `\newenvironment`, `\renewenvironment`, `\newtheorem`, `\bibitem`, `\cite`/`\citep`/`\citet`..., and extended `\autoref`/`\cref`/`\Cref` lists; exposes unified lists of introduced/used commands, environments, conditions, labels, and citations with complete occurrence indices.
- **Single-Node & Global Catalog Refactorings (`refactor-symbols` & Extended `NodeEditAction`)**: Added `rename-command`, `rename-section`, and `unwrap-node` (`edit-nodes`), relaxed `rename-environment` on environments with arguments, and added `rename-command-globally`, `edit-command-definition`, `rename-environment-globally`, `rename-condition-globally`, `rename-label-globally`, `rename-citation-globally`, and `edit-metadata`.
- **Document Metadata Extraction (`extractProjectMetadata`)**: Extracts structured metadata (`title`, `authors`, `date`, `abstract`, `documentClass`, `packages`, `bibliography`, `keywords`, and stats) with editable inner locations.
- **Composable Multi-Step Pipeline (`planCompositeTransformation` / `compose-transformations`)**: Chains transformation requests in sequence and composes edits back to original snapshot coordinates in one unified `ProjectEditPlan`.

## [0.4.1] - 2026-11-16

### Added

- Unified command-signature registry and argument parser (`commands.ts`) shared across Stage 0 (`scan.ts`), Pipeline B (`conditions.ts`), and Pipeline A (`structure.ts`).
- `ConfiguredCommandNode` (`kind: 'command'`) and `ConfiguredCommandArgument` in `ConfiguredContainerNode`, with `arguments` also exposed on `ConfiguredSectionNode`.

### Fixed

- Eliminated unbounded lookahead in `structure.ts` (`\section abc` / `\begin foo`) by splitting environment delimiter parsing from section/command argument parsing and handling coalesced `'text'` token boundaries losslessly.
- Stopped `scan.ts` from greedily swallowing following `{...}` groups after unknown commands as `opaqueArguments`.
- Updated `readOptionalBracketTokens` to follow LaTeX's non-nesting `[` rule at brace depth 0 and skip active `\verb` spans.

## [0.4.0] - 2026-11-16

### Added

- **Stage 0 Stateless Whole-File Tokenizer (`tokenizeFile`)**: Scans each `.tex` file once into lossless primitive tokens (`SourceToken[]`: `comment`, `space`, `command`, `open`, `close`, `math`, `text`) without condition or environment coupling (**INV-1**, **INV-2**).
- **Pipeline B Standalone Condition Realizer (`realizeProjectConditions` and `operation: 'realize-conditions'`)**: Evaluates `\newif`, `\if...`, `\else`, `\fi`, and `[\global]\Xtrue`/`\Xfalse` (with `project` or `file-only` traversal and `preserve` or `inline` inputs) independently of AST construction (**INV-3**, **INV-5**), returning both a checked in-place `ProjectEditPlan` and condition-free `GeneratedArtifact[]` files.
- **Pipeline A Condition-Free Structural AST & View Preprocessor (`resolveProjectView`)**: Supports `conditions.mode: 'source' | 'source-with-overrides' | 'manual' | 'none'`, delegates condition preprocessing to the shared condition realizer, and rejects any unrealized condition token in the structural parser with `reason.code === 'unrealized-condition'` (**INV-4**).
- **Source Snapshots, Inventories, and Environment Lookup**: `createProjectSnapshot`, `updateProjectSnapshot`, `inspectProject`, `inspectProjectEnvironments`, `createProjectSourceIndex`, `lookupProjectSource`, `sourceOffsetAt`, `selectProjectNode`, `getSelectedNode`, and `getSelectedEnvironment`.
- **Realized-Only Analyses and Transformations (**INV-6**)**: `indexProjectView`, `runAnalysis` (`references`, `unused-commands`), `planTransformation` (`suppress-comments`, `remove-environments`, `edit-nodes`, `export-project`, `realize-conditions`), `validateProjectEditPlan`, `applyProjectEdits`, `checkOperationCapability`, `projectOperations`, and `runProjectPipeline`.

### Fixed

- Unified verbatim boundary splicing (`spliceVerbatimMatch`) across tokenization, scanning, environment inventory, and structural parsing so trailing syntax after inline `\verb` and `\end{verbatim}` is consistently processed.
- Reset entry state across files in `file-only` traversal so file-local condition declarations do not leak across independent files.
- Evaluated conditions inside textual metadata commands (`\title`, `\author`, `\date`, `\href`) while keeping `\label` keys opaque.
- Tagged emitted verbatim segments to prevent spurious newline insertion after inline `\verb`.

### Breaking

- Removed deprecated `0.2.x` functions, types, and enums (`parseDocument`, `parseProject`, `mergeProjects`, `serializeDocument`, `transformProject`, `InputHandlingMode`, `isInputHandlingMode`, `AstNode`, `NodeType`, `isContainerNode`, `PrepTexSyntaxError`, `DiagnosticCode`, `DiagnosticSeverity`, `TransformedFile`, `ConditionName`, `InputReferencePath`, `LineEnding`).
- Removed deprecated source-target and condition-preservation shim options (`operation: 'identity'`, `operation: 'materialize'`, `target: 'source'`, `ExportOptions.conditions: 'preserve' | 'materialize'`, and unconfigured snapshot `unused-commands` analysis).

## [0.3.0] - 2026-09-15

### Added

- C1–C10 multi-stage project model (`ProjectSnapshot`, `ProjectView`, `ProjectEditPlan`), node/environment selections and operations (`remove-node`, `rename-environment`, `wrap-node`, `remove-environments`), interval source indexing (`createProjectSourceIndex`, `lookupProjectSource`), reference and conservative command-use analysis, `runProjectPipeline`, and CLI `inventory`/`analyze` commands.

## [0.2.1] - Unreleased

### Fixed

- Accept valid empty CLI transformation output instead of reporting that no
  output was generated.
- Reject `null` as an invalid `inputHandling` value at the runtime boundary.
- Make the backend integration examples precise about worker isolation, safe
  error serialization, and symlink-aware filesystem containment.
- Include the integration, architecture, and generated API guides in the
  published core package.

## [0.2.0] - 2026-09-03

### Breaking

- Replaced the mutable class-based surface with explicit `parseDocument`,
  `parseProject`, `mergeProjects`, `serializeDocument`, and `transformProject`
  operations.
- Replaced legacy AST field spellings and ad hoc options with documented,
  discriminated, readonly public types and named enums.

### Added

- Structured diagnostics, stable error codes, and `PrepTexSyntaxError`.
- Immutable, structured-clone-safe project snapshots with version-aware merging.
- Relative, missing, ambiguous, and circular `\input` handling.
- Strict declaration contract tests and generated TypeDoc Markdown.
- Unified integration guide, system architecture, and repository development guidance.

### Fixed

- End offsets for comments and trailing backslashes at end of input.
- Silent acceptance of unclosed supported constructs.
- Nested and parent-relative virtual input resolution.

## [0.1.3] - 2026-05-18

- Added support for starred section commands.

## [0.1.2] - 2026-05-12

- Added explicit newline handling.

## [0.1.1] - 2026-05-07

- Improved nested sections and sections inside grouping constructs.
- Added maximum-section-level handling and more informative CLI diagnostics.
- Added verbose CLI output.

## [0.1.0] - 2026-04-21

- Initial scaffold: TypeScript setup, tests, CI, basic parser skeleton.
