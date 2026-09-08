# Changelog

All notable changes to this project will be documented here.

## [0.3.0] - Unreleased

### Added

- C1–C5 source snapshots, atomic source changes, lossless syntax inventories,
  normalized boolean policies, operation requirements and preliminary edit
  precondition/range validation.
- Bounded condition/input interpretation with local/global boolean state,
  repeated inclusion identities, explicit incomplete/blocked results, and
  configured structures with disjoint original-source provenance.
- Public declaration tests, source/view regression fixtures, CLI compatibility
  verification and a runnable public-import project-model example.
- Reserved typed C6/C7 findings/edit/artifact contracts. Analysis, new
  transformation/emission and edit-application executors are not implemented yet.

### Compatibility

- Keep the legacy parser, `AstNode`, static condition whitelist and all-supplied
  Separate output behavior unchanged. The new model uses separate entry points.
- Prepare both package manifests and the CLI's exact core dependency as 0.3.0;
  no registry publication or downstream migration is performed.

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
