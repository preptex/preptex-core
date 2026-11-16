# Project model performance and bounds

These measurements verify the synchronous performance and deterministic bounds of `@preptex/core@0.3.0`'s single stateless tokenizer (`tokenizeFile`), condition realization engine (`evaluateConditionStream`), structural parser (`parseConfiguredStructure`), and interval source index (`createProjectSourceIndex`).

## Reproducible corpus and method

Run `npm run build`, then `node examples/benchmark-project-model.mjs` and `node examples/benchmark-node-lookup.mjs` from the repository root:

1. **`examples/benchmark-project-model.mjs`**:
   - 16 independently versioned files (an entry file with 15 `\input` commands and 15 part files repeating a literal paragraph 120 times each, totaling 99,214 UTF-16 code units with labels, references, math, and percent comments).
   - Warms each operation once and reports the median of three runs against fixed corpus budgets (`scan: 1500 ms`, `view: 1000 ms`, `inventory: 400 ms`, `references: 400 ms`).
2. **`examples/benchmark-node-lookup.mjs`**:
   - 62,024 UTF-16 code units (a 2,000-environment body file included twice via `\input{body}\input{body}`).
   - Measures fresh `createProjectSourceIndex(view)` construction and 10,000 `lookupProjectSource` point queries against fixed corpus budgets (`buildMs: 2000 ms`, `queriesMs: 1000 ms`).

| Benchmark Operation                                      | Warm Median (Apple M4, Node 26) | Corpus Budget |
| :------------------------------------------------------- | ------------------------------: | ------------: |
| Create/scan snapshot (`createProjectSnapshot`)           |                           15 ms |      1,500 ms |
| Resolve complete view (`resolveProjectView`)             |                           36 ms |      1,000 ms |
| Source inventory (`inspectProject`)                      |                          < 1 ms |        400 ms |
| Reference analysis (`runAnalysis`)                       |                           61 ms |        400 ms |
| Build source interval index (`createProjectSourceIndex`) |                           32 ms |      2,000 ms |
| 10,000 node offset queries (`lookupProjectSource`)       |                           11 ms |      1,000 ms |

## Deterministic bounds

- **Stage 0 & Condition Realization**:
  - `tokenizeFile(source)` scans each file once in $O(N)$ time.
  - `updateProjectSnapshot` reuses unchanged scanned files when text and normalized `ScanOptions` match; revision-only updates reuse token and fact arrays.
- **View & Transformation Bounds**:
  - Defaults: 64 nested source inventory regions, 64 active input levels, 10,000 total inclusion occurrences, 256 conditional/structural nesting levels, 10,000,000 selected UTF-16 code units, and 10,000,000 output UTF-16 code units (configurable up to 100,000,000 via `maxOutputCodeUnits`).
  - Hosts remain responsible for input file/byte quotas, Web Worker / worker thread isolation, and wall-clock timeouts.
