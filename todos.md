- [ ] Create a feature class that runs after parser and assigns features to nodes:
- [ ] Links section name and shortname to section
- [ ] Boolean for starred sections
- [ ] User defined commands can have number of args, and optional args

---

- [ ] Parser should be a stateful class having root node attribute
- [ ] Parse only keep state internally and returns nothing.
- [ ] Keep in parser set of encountered conditions. Feed-in to transform
- [ ] Transform should be a method of parser that runs on root-node and returns text.

---

- handle end of file with inline comment without new line
- Handle empty spaces separating commands. Check how tex handles these `\ifX text\fi text`. Also lines that turn empty after realizing `\if/else` (cf. inline comments parse `\n` as end of comment token).

- Keep the invariant that a node children intervals form a partition of its interval (excluding its value).
