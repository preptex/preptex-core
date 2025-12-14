# TODO-List

## Current todos:

## General todos

- [ ] Suppress proofs option: add list of special tokens. Even if tokens are not parsed, should check for special ones.
- [ ] Add default parsed tokens. Rest only by options.
- [ ] Consistency issue: ChatGPT vs Windows Testing: After control sequences, suppress a single or all trailing spaces?
- [ ] Use sanitizer to detect errors and condition/nesting intersections:
  - The former emits error.
  - The latter suppresses type tokenization
  - Parser reruns tokenizer.
- [ ] Add tree exporter in parser, update core and cli, add tests.

---

- [x] Bugfix: Recursive main file name.
- [x] Transformers should **not** modify AST. Should run read only. They still decide prefix/suffix output.
- [x] Lexer: separate readControlSequence calls for each type of token.
- [x] Keep the invariant that a node children intervals form a partition of its interval (excluding its value).
- [x] Add spaces to prefix after commands if suppressed.
- [x] Separate core logic to input and out functions, and add a state class `project`.
- [x] Transform should be iterative with stack of nodes (tree is given implicitly by current node).
- [x] Windows endofline handling.
- [x] Correctly recognize and handle comment environment

## ToDo Time line

### Feature Classes - Metadata

- [x] Add line numbering and in-line-start-position to lexer and parser.
- [ ] Create a feature class that runs after parser and assigns features to nodes:
  - This can be implemented like transformers. Parse does a post-process run on tree, and this lambdas assign features to nodes.
- [ ] Links section name and shortname to section.
- [ ] Boolean for starred sections.
- [ ] User defined commands can have number of args, and optional args.

### Transformer update

Transformers are assigned node-wise and apply to the whole subtree rooted at the node they are assigned to:

- [ ] Each node must have a list of transformers.
- [ ] Transform builds a stack of transformers.
- [ ] Pop on leave node.

### Custom Commands and Environments

- [ ] Parse user defined commands and environments.
- [ ] Allow arg umber (and optional-arg number). Features assign start and end of args to each command.
- [ ] Add to parser the option to suppress some tokens (transfer to tokenizer). Possibly only special commands/envs are tokenized.
- [ ] Special commands can have `\xspace` property that suspends suppressing spaces.

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

- [ ] Tree visualizer
- [ ] Allow surrounding envs by envs/conditions (parent node),
- [ ] and suppressing envs, etc. from visualizer.
- [ ] Transformers
- [ ] Custom builds

## Completed Todos

### Pre-/Post-process consistency

Compare to latex output and decide:

- [x] Error in is environment vs is comment.
- [x] ~~Flattened input should always start on new line~~.
- [x] Handle EOF with inline comment without new line.
- [x] Handle empty spaces separating commands. Check how tex handles these `\ifX text\fi text`.
- [x] Lines that turn empty after realizing `\if/else` and `comment` env (cf. inline comments parse `\n`).
- [x] Handle empty-spaces and empty-lines after suppression (comment-commands and if-conditions)

### Input command

- [x] Handle `\input` commands:
  1. Flattening: expand them into a single file.
  2. Recursive: parse and apply transformers recursively (but do not flatten).
  3. None.
- [x] Core and parser get object of files instead of a single file `{[name]: [text]}`, with main file separation.
- [x] Output also object of files.
- [x] AST structure: `\input` is a node in all cases. ~~It is `children[0]` is the root of the other file~~.

### Parser logic:

- [x] Restructure parser.
- [x] Parser should invoke `transform.ts` internally.
- [x] Add set of `ifConditions`.
- [x] Make sure that `ifBranches` form a subset.
- [x] Condition-transformer should suppress `\Xtrue`/`\Xfalse` for defined conditions `X`.

### Sanitizer:

- [x] Find contradicting pairs:
  - [x] Section inside condition.
  - [x] Condition/Grouping intersection.
- [x] Suppress TOKENS that contradict conditions.

---
