# `@preptex/cli`

Node.js command-line adapter for `@preptex/core`.

```text
preptex transform --input main.tex --work-dir ./paper --flatten
preptex ast --input main.tex --work-dir ./paper
preptex inventory --work-dir ./paper --kinds condition-declaration,input,label
preptex analyze --work-dir ./paper --entry main.tex --analysis references
preptex analyze --work-dir ./paper --analysis unused-commands --files main.tex
```

Run `preptex --help` or `preptex <command> --help` for supported options. The CLI
owns filesystem access; reusable parsing and transformation contracts live in
`@preptex/core`.

`inventory` prints located source facts as JSON without requiring an entry,
condition configuration or output destination. It includes inactive and stored
body syntax with its context. `analyze` prints structured findings; references
require a configured entry, while unused-command evidence can inspect source
without one. Candidates are not proof that a command can be deleted.

Both commands read `.tex` files recursively under `--work-dir` (the current
directory by default), skip symlinked entries, and leave files unchanged. Source
scope `--files` and inventory `--kinds` accept comma-separated values.

Configured analysis defaults to source-driven conditions and project traversal.
For example, force `draft` false even if the source sets it true:

```text
preptex analyze --work-dir ./paper --entry main.tex --condition-mode source-with-overrides --condition draft=false
```

`manual` forces supplied names and treats omitted names as unknown.
`--initial name=true` seeds either source mode; it cannot be combined with manual
mode. Repeat `--condition` or `--initial` for different names. `--traversal
file-only` stops at input effects. `--allow-incomplete` explicitly requests
partial analysis and preserves coverage limitations. Configured analysis uses
the reached scope and cannot take `--files`.

Success writes JSON to stdout and exits zero. Expected failures write JSON to
stderr with a stable core `code`, optional structured `failure`/`viewIssue`, and
exit one; I/O failures use `cli-error`. No stack is serialized. Legacy
`transform`/`ast` retain their existing text output and option semantics; new
condition policies cannot be mixed into legacy transform flags.

License: MIT
