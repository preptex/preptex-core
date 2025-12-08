# TODO-List

## Time line

Parser logic:

- [ ] Transformers should **not** modify AST. Should run read only. They still should decide prefix/suffix output.
- [ ] Add tree exporter in parser and tests.
- [x] Restructure parser.
- [x] Parser should invoke `transform.ts` internally.
- [x] Add set of `ifConditions`.
- [x] Make sure that `ifBranches` form a subset.
- [x] Condition-transformer should suppress `\Xtrue`/`\Xfalse` for defined conditions `X`.

---

- [ ] Add line numbering and start-position in line to lexer and parser.
- [ ] Handle empty-spaces and empty-lines after suppression (comment-commands and if-conditions)

---

- [ ] Handle `\input` commands:
  1. Flattening: expand them into a single file.
  2. Recursive: parse and apply transformers recursively (but do not flatten).
  3. None.

---

- [ ] Create a feature class that runs after parser and assigns features to nodes:
- This can be implemented like transfomers. Parse does a post-process run on tree, and this lambdas assign features to nodes.
- [ ] Links section name and shortname to section
- [ ] Boolean for starred sections
- [ ] User defined commands can have number of args, and optional args

---

UI Plugins:

Create UI Projects:

- Packages:

- [ ] 1. Website that visualizes everything.
- [ ] 2. Chrome plugin
- [ ] 3. VS-code plugin

- Components:

- [ ] tree visualizer
- [ ] Transformers
- [ ] Custom builds

---

- handle end of file with inline comment without new line
- Handle empty spaces separating commands. Check how tex handles these `\ifX text\fi text`. Also lines that turn empty after realizing `\if/else` (cf. inline comments parse `\n` as end of comment token).

- Keep the invariant that a node children intervals form a partition of its interval (excluding its value).
