# `@preptex/cli`

Node.js command-line adapter for `@preptex/core`.

```text
preptex transform --input main.tex --work-dir ./paper --flatten
preptex ast --input main.tex --work-dir ./paper
```

Run `preptex --help` or `preptex <command> --help` for supported options. The CLI
owns filesystem access; reusable parsing and transformation contracts live in
`@preptex/core`.

License: MIT
