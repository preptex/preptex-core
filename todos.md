# TODO-List

## General todos

- [ ] Use sanitizer to detect errors and condition/nesting intersections:
  - The former emits error.
  - The latter suppresses type tokenization
  - Parser reruns tokenizer.
- [ ] Transformers should **not** modify AST. Should run read only. They still decide prefix/suffix output.
- [ ] Add tree exporter in parser, update core and cli, add tests.
- [ ] Keep the invariant that a node children intervals form a partition of its interval (excluding its value).

## ToDo Time line

### Input command

- [ ] Handle `\input` commands:
  1. Flattening: expand them into a single file.
  2. Recursive: parse and apply transformers recursively (but do not flatten).
  3. None.
- [ ] Core and parser get object of files instead of a single file `{[name]: [text]}`, with main file separation.
- [ ] Output also object of files.
- [ ] AST structure: `\input` is a node in all cases. It is `children[0]` is the root of the other file.

### Pre-/Post-process consistency

- [ ] handle end of file with inline comment without new line.
- [ ] Handle empty spaces separating commands. Check how tex handles these `\ifX text\fi text`. Also lines that turn empty after realizing `\if/else` (cf. inline comments parse `\n` as end of comment token).
- [ ] Handle empty-spaces and empty-lines after suppression (comment-commands and if-conditions)

### Feature Classes - Metadata

- [x] Add line numbering and in-line-start-position to lexer and parser.
- [ ] Create a feature class that runs after parser and assigns features to nodes:
  - This can be implemented like transformers. Parse does a post-process run on tree, and this lambdas assign features to nodes.
- [ ] Links section name and shortname to section.
- [ ] Boolean for starred sections.
- [ ] User defined commands can have number of args, and optional args.

### Custom Commands and Environments

- [ ] Parse user defined commands and environments.
- [ ] Allow arg umber (and optional-arg number). Features assign start and end of args to each command.
- [ ] Add to parser the option to suppress some tokens (transfer to tokenizer). Possibly only special commands/envs are tokenized.

### Statistical data

- [ ] Add statistical data size of tree, number of nodes/tokens of each type.
- [ ] Add data export to core and cli.
- [ ] Separate repo: Run stats on your projects and random arxiv projects.
- [ ] Analyze size of tree with/without command and env tokenization.
- [ ] Also stats for user defined commands/envs.

### UI Plugins:

Create UI Projects:

- Packages:

- [ ] 1. Website that visualizes everything.
- [ ] 2. Chrome plugin
- [ ] 3. VS-code plugin

- Components:

- [ ] tree visualizer
- [ ] Transformers
- [ ] Custom builds

## Completed Todos

### Parser logic:

- [x] Restructure parser.
- [x] Parser should invoke `transform.ts` internally.
- [x] Add set of `ifConditions`.
- [x] Make sure that `ifBranches` form a subset.
- [x] Condition-transformer should suppress `\Xtrue`/`\Xfalse` for defined conditions `X`.

---
