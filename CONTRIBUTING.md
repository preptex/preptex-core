# Contributing

## Setup

Use Node.js 20 or newer and install the locked workspace dependency graph:

```sh
npm ci
```

## Verification

Run the full check before submitting a change:

```sh
npm run check
```

Useful focused commands are:

- `npm run build` — compile the core, then the CLI.
- `npm run typecheck` — apply the strict compiler configuration to both workspaces.
- `npm test` — run the core Vitest suite.
- `npm run type-test` — compile a consumer contract against built declarations.
- `npm run docs` — regenerate `docs/api/` from public TSDoc.
- `npm run docs:check` — validate public documentation without writing files.
- `npm run format:check` — check formatting.
- `npm run pack:check` — inspect the core tarball that npm would publish.

## Public API changes

`core/src/index.ts` is the only supported library entry point. When changing it:

1. Keep exported data plain, deeply readonly, and environment-neutral.
2. Avoid `any`, vague object bags, undocumented optional or nullable fields, raw
   unnamed domain unions, and implementation classes.
3. Add TSDoc to every exported declaration and public member.
4. Add runtime tests and compile-time assertions under `core/type-tests/`.
5. Regenerate and review TypeDoc Markdown.
6. Update the integration guide, architecture guide, and changelog when behavior
   or compatibility changes.
7. Use SemVer and verify `npm run pack:check`; do not publish as part of a normal
   pull request.

Keep filesystem, network, persistence, authentication, and TeX compilation code
outside the core. See [AGENTS.md](./AGENTS.md) for the full architectural and
backend trust-boundary rules.
