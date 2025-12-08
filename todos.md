# TODO-List

## Time line

1- Parser logic:

- [ ] Restructure parser
- [ ] Remove `transform.ts`
- [ ] Add set of `ifConditions`
- [ ] Make sure that `ifBranches` form a subset.
- [ ] Add tree exporter in parser and tests.

---

- [ ] Create a feature class that runs after parser and assigns features to nodes:
- This can be implemented like transfomers. Parse does a post-process run on tree, and this lambdas assign features to nodes.
- [ ] Links section name and shortname to section
- [ ] Boolean for starred sections
- [ ] User defined commands can have number of args, and optional args

---

4- UI Plugins:

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
