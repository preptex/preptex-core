# PrepTeX development guide

This file applies to the entire repository. More specific `AGENTS.md` files may
add rules for a future workspace, but they must preserve the public API and trust
boundaries described here.

## Mission

PrepTeX Core turns a virtual collection of LaTeX source files into an immutable,
typed syntax model and can serialize that model with a small set of predictable
transformations. Keep the core library useful from browsers, Web Workers, CLIs,
backends, and future plugin hosts.

The core is not a TeX engine, a filesystem abstraction, or a backend framework.
A backend should consume `@preptex/core` as a versioned dependency and own I/O,
authentication, persistence, scheduling, quotas, and sandboxing.

## Repository map

- `core/src/index.ts` is the only public module boundary.
- `core/src/api-types.ts` contains public, transport-safe data contracts.
- `core/src/errors.ts` contains the expected public error hierarchy.
- `core/src/lib/core.ts` validates arguments and implements the public facade.
- `core/src/lib/options.ts` contains public option types and named modes.
- `core/src/lib/lexer/` tokenizes the supported LaTeX subset.
- `core/src/lib/parse/` performs sanity analysis and builds the AST.
- `core/src/lib/transform/` serializes trees and applies built-in transforms.
- `core/src/lib/virtual-path.ts` implements project-relative path operations.
- `core/tests/` contains unit, regression, and public-contract tests.
- `core/type-tests/` checks the declaration surface with TypeScript, when present.
- `cli/` is the Node.js filesystem adapter and must use only the public core API.
- `docs/integration.md` is the compact consumer guide and worker model.
- `docs/architecture.md` records system boundaries and invariants.
- `docs/api/` is generated from TSDoc by TypeDoc. Do not hand-edit it.
- `examples/` contains small end-to-end LaTeX fixtures.
- `dist/` is generated output. Never make source changes there.

There is no backend service or public plugin runtime in this repository yet. Do
not imply that either exists when documenting or changing the core.

## Standard commands

Run commands from the repository root unless a command says otherwise.

```text
npm ci                 install the locked dependency graph
npm run build          build core first, then the CLI
npm test               run the core test suite
npm run typecheck      type-check every workspace
npm run type-test      validate the published TypeScript contract
npm run docs           regenerate TypeDoc Markdown
npm run docs:check     validate public TSDoc without writing generated files
npm run format:check   check repository formatting
npm run pack:check     inspect the package that would be published
npm run check          run the complete local verification pipeline
```

Use workspace commands for a narrow iteration, for example:

```text
npm run test --workspace=@preptex/core
npm run build --workspace=@preptex/core
npm run docs --workspace=@preptex/core
```

Treat `package.json` as authoritative if a command changes. Do not document or
invoke a script that does not exist.

## Architectural rules

Keep dependencies flowing in this direction:

```text
consumer adapter -> public facade -> lexer/parser -> immutable data
                                  -> serializer/transform pipeline
```

- Consumers import from `@preptex/core`, never `core/src/lib/*`.
- `core/src/index.ts` exports deliberate public contracts, not convenient
  implementation symbols.
- The lexer, parser, sanity checker, call stack, renderer contexts, and built-in
  transformer functions are internal implementation details.
- It is acceptable for parser internals to use mutable working state. No mutable
  collection or internal class may cross the public facade.
- The CLI may depend on Node APIs. The core may not depend on `node:fs`,
  `node:path`, `process`, the DOM, network APIs, databases, or global application
  state.
- Core operations remain deterministic for the same inputs and options.

## The TypeScript API is authoritative

The exported TypeScript declarations and their TSDoc are the source of truth for
all consumers. The published `dist/index.d.ts` must be generated from
`core/src/index.ts`; documentation and examples must agree with it.

For every public change:

- Export it explicitly from `core/src/index.ts`.
- Give every exported declaration and public member useful TSDoc, including
  units, ordering, mutability, defaults, nullable or optional semantics, thrown
  errors, and identity behavior where relevant.
- Use exhaustive discriminated unions and named domain types or enums.
- Do not expose `any`, vague object bags, unexplained `null`, mutable arrays,
  parser classes, renderer contexts, or implementation-only state.
- Use `unknown` only at a real untyped boundary, narrow it immediately, and do
  not make consumers perform implementation-specific casts.
- Prefer a new public data contract over exporting an internal class.
- Add a compile-time contract test. `tsc` feedback is part of the product.
- Regenerate TypeDoc and review the generated Markdown.

Changing a public property name, enum member, union member, default, error code,
path rule, or source-location convention is an API change even when runtime
output looks similar. Adding a `NodeType` member can break exhaustive consumer
switches and must be versioned accordingly.

## Public data invariants

- Parsed results contain plain objects, arrays, strings, numbers, and enum
  values; they are suitable for structured cloning and JSON-shaped transports.
- Returned AST nodes, child arrays, diagnostics, condition lists, file lists,
  projects, and transform results are frozen at runtime and typed `readonly`.
- A structured clone does not preserve JavaScript's frozen status. Receivers must
  still treat the cloned data as readonly or freeze it at their own boundary.
- `SourceFile` inputs belong to the caller and are never mutated.
- Node IDs are unique only within one parsed file. Address a node as
  `(file.path, node.id)` and never persist an ID as a cross-parse identity.
- Serialization and transformation inspect existing nodes without modifying
  them. A fresh parse creates fresh node identities.
- `mergeProjects` is a pure snapshot operation. Canonical deeply frozen files
  retain object identity; mutable transported files are copied and frozen. An
  update replaces an equal path only when its version is greater than or equal
  to the base version.
- Callers must not merge projects parsed with different parse options. Parse
  options are not currently embedded in a project snapshot.

## Diagnostics and errors

Successful parse results may contain structured warnings. Display or log them;
do not discard them merely because parsing completed.

- Use `Diagnostic.code` and `DiagnosticSeverity` for control flow, not message
  text.
- A diagnostic range uses inclusive, zero-based UTF-16 offsets and a one-based
  line number in the original source.
- Invalid supported syntax throws `PrepTexSyntaxError`; its `diagnostic` carries
  the stable location and code.
- Other expected failures throw `PrepTexError` with a `PrepTexErrorCode`, such as
  an invalid argument, missing entry, unresolved input, or circular input.
- Error subclasses are convenient inside one JavaScript realm, but RPC and
  worker boundaries should serialize `name`, `code`, `message`, and an optional
  diagnostic explicitly.
- Do not expose stack traces or raw internal exceptions in a backend response.
  Map stable codes to the backend's protocol and preserve a correlation ID for
  server-side logs.

Do not turn every warning into a fatal error without a new explicit option and a
public API review.

## Backend and trust boundaries

See also [docs/integration.md](./docs/integration.md) for the compact consumer
guide, security controls, and worker thread example.

The backend owns every operation with external effects:

1. Authenticate and authorize access to a project.
2. Load allowed source files from storage and assign caller-owned finite
   versions.
3. Apply limits for file count, per-file bytes, total bytes, nesting, CPU time,
   output size, and concurrent jobs.
4. Convert files to `SourceFile[]` with stable, forward-slash virtual paths.
5. Run `parseProject` and, if requested, `transformProject` in a bounded worker
   or job.
6. Convert diagnostics and typed errors to protocol DTOs.
7. Validate every returned virtual output path before writing or persisting it.

A project path is an identifier inside a virtual project, not an OS path. Never
concatenate an `InputNode.path`, entry path, or output path directly onto a
filesystem root. Reject absolute paths and traversal, canonicalize the backend
root, account for symlinks and case rules, and verify that the resolved target is
still inside the authorized root.

Core path validation prevents absolute and root-escaping project paths, and
input flattening detects missing, ambiguous, and circular references. Those
checks do not replace backend authorization or filesystem containment checks.

LaTeX source and transformed output remain untrusted content. PrepTeX does not
sandbox TeX compilation, macro expansion, shell escape, package loading, or file
access. Any later compiler service requires a separate sandbox and policy.

## Performance and concurrency

All public core operations are synchronous and CPU-bound. Parsing performs a
sanity/tokenization pass followed by AST construction; project parsing processes
every supplied file. Transformation can duplicate content when an input is
included multiple times.

- Keep request threads responsive by moving large or untrusted projects to a Web
  Worker, worker thread, process, or queued backend job.
- Enforce limits before parsing and while collecting output. A valid input graph
  can still produce a large flattened result.
- Core calls share no mutable global project state and may run concurrently in
  separate jobs.
- Cache only by source content, virtual path, parse options, core version, and
  caller version. Do not mix snapshots produced with different options.
- Use `mergeProjects` for incremental snapshots after parsing changed files;
  understand that it has no deletion operation.
- Benchmark representative multi-file projects before changing tokenization,
  tree traversal, path resolution, or serialization.

## Extension and plugin boundaries

There is no supported custom transformer or plugin hook in the public API. Until
one is designed, plugins should depend on the versioned public package and
compose public operations around readonly project data. They must not deep-import
the internal `Transformer`, mutate AST nodes, or construct undocumented node
shapes.

A future backend plugin protocol should be defined outside the core first. Give
it an explicit protocol version, capability declarations, typed input/output
DTOs, namespaced diagnostics, cancellation, resource limits, and isolation for
untrusted code. A plugin may return replacement `SourceFile` data or a documented
result artifact; it must not receive storage credentials or unrestricted host
objects. Promoting a hook into `@preptex/core` requires the same compatibility,
TSDoc, type-test, and release review as any other public API.

## Test expectations

Match verification to the changed layer:

- Lexer/parser changes: token spans, CR/LF/CRLF, escaped syntax, malformed input,
  exact default round trips, and diagnostics.
- AST/type changes: exhaustive narrowing, readonly compile failures, declaration
  inspection, runtime freezing, and structured-clone-safe data.
- Path/input changes: nested relative inputs, optional `.tex`, ambiguity,
  traversal, missing targets, repeated includes, and cycles.
- Transform changes: preserve, flatten, and separate modes; comments;
  condition branches; whitespace; unchanged node identity.
- Backend/adapter changes: authorization, containment, symlinks, I/O failures,
  cancellation, quotas, error mapping, and atomic persistence.
- Packaging changes: a clean build, consumer type test, ESM import smoke test,
  generated docs check, and package tarball inspection.

Do not use a successful TypeScript build as a substitute for runtime tests, and
do not use snapshot output as a substitute for checking type precision.

## Change and release workflow

1. Inspect the existing public contracts, tests, documentation, and current git
   diff. Preserve unrelated work in a dirty worktree.
2. Add or update failing tests before changing behavior where practical.
3. Keep implementation changes inside the lowest applicable layer.
4. Update TSDoc and the compact integration guide with the code change.
5. Run the narrow tests while iterating, then `npm run check`.
6. Inspect `dist/index.d.ts` for accidental exports, `any`, vague fields, and
   implementation classes.
7. Regenerate TypeDoc; never patch generated Markdown by hand.
8. Update the changelog and bump the package version according to SemVer. During
   `0.x`, incompatible public changes require at least a minor-version bump.
9. Run `npm run pack:check` and verify that the tarball contains declarations,
   JavaScript, README, and license, but not source-only or local artifacts.
10. Publish the core before updating a separate frontend or backend to a real
    registry version. Do not use `file:` links for released consumers.

Never publish, deploy, or modify a downstream repository unless the user has
explicitly requested that external action.
