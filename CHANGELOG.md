# Changelog

All notable changes to this project will be documented here.

## [0.2.0] - Unreleased

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
