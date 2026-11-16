# `@preptex/cli`

Node.js command-line adapter for `@preptex/core`.

```text
preptex realize --work-dir ./paper --input main.tex --flatten
preptex transform --input main.tex --work-dir ./paper --flatten
preptex ast --input main.tex --work-dir ./paper
preptex inventory --work-dir ./paper --kinds condition-declaration,input,label
preptex inventory --work-dir ./paper --environments
preptex analyze --work-dir ./paper --entry main.tex --analysis references
preptex analyze --work-dir ./paper --entry main.tex --analysis unused-commands
```

Run `preptex --help` or `preptex <command> --help` for supported options. The CLI owns filesystem access; reusable tokenization, condition realization, structural parsing, analysis, and transformation contracts live in `@preptex/core`.

- **`realize`** (Pipeline B): Evaluates `\newif`, `\if...`, `\else`, `\fi`, and setters without requiring balanced braces, environments, or math. Supports `--flatten`/`--inputs inline`, `--traversal project|file-only`, `--condition-mode source|manual|source-with-overrides`, `--condition name=true|false`, `--initial name=true|false`, `--keep-declarations`, and `--json`.
- **`transform`** (Pipeline A export, or Pipeline B for `--recursive` without comment suppression): Resolves conditions, builds the condition-free AST (`resolveProjectView`), and exports realized LaTeX files. Supports `--suppress-comments`, `--suppress-comment-environments`, `--flatten`, `--recursive`, `--if-branches`, and `--condition-mode` (`source`, `manual`, `source-with-overrides`, `none`).
- **`ast`** (Pipeline A): Resolves and prints the `ProjectView` AST as JSON; accepts `--condition-mode`, `--condition`, `--initial`, and `--traversal`.
- **`inventory`** (Stage 0): Prints located source facts (`--kinds`) or environment inventories (`--environments`) as JSON without requiring an entry, condition configuration, or output destination. It includes inactive and stored body syntax with its context.
- **`analyze`** (Pipeline A): Prints structured findings (`references` or `unused-commands`) for a configured project view (`--entry`).

All commands read `.tex` files recursively under `--work-dir` (the current directory by default) and skip symlinked entries. `inventory`, `analyze`, `ast`, and `realize --json` leave project files unchanged.

Configured commands (`realize`, `transform`, `ast`, `analyze`) default to source-driven conditions and project traversal. For example, force `draft` false even if the source sets it true:

```text
preptex analyze --work-dir ./paper --entry main.tex --condition-mode source-with-overrides --condition draft=false
```

`manual` forces supplied names and treats omitted names as unknown. `none` (`transform`, `ast`, `analyze`) requires the reached source to already be condition-free. `--initial name=true` seeds either source mode; it cannot be combined with `manual` or `none` mode. Repeat `--condition` or `--initial` for different names. `--traversal file-only` stops at input effects. `--allow-incomplete` (`analyze`) explicitly requests partial analysis and preserves coverage limitations. Configured analysis uses the reached scope and cannot take `--files`.

For `inventory`, `analyze`, and `realize --json`, success writes JSON to stdout and exits zero. Expected failures in `inventory`/`analyze` write JSON to stderr with a stable core `code`, optional structured `failure`/`viewIssue`, and exit one; I/O failures use `cli-error`. No stack trace is serialized.

License: MIT
