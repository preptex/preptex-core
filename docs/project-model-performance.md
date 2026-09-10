# Project model performance and bounds

Measured 2026-09-08 on Windows x64, Intel Core i5-10210U CPU at 1.60 GHz,
Node.js 22.16.0, TypeScript 5.9.3. These are local reference measurements, not
deadlines promised by the synchronous core.

## Reproducible corpus and method

Run `npm run build`, then `node examples/benchmark-project-model.mjs` from the
repository root. The checked-in script defines the complete corpus: an entry
with 15 inputs and 15 part files, each repeating the same literal paragraph 120
times. There are 16 files and exactly 99,214 UTF-16 code units, with labels,
references, math and percent comments. Line endings are explicit LF and do not
depend on Git checkout settings. Repeated label keys deliberately exercise
duplicate-target reference analysis.

Each measurement warms the operation once, then reports the median of three
runs. Source scanning, view resolution, source inventory and reference analysis
are measured independently. Inventory/analysis reuse the already created
canonical immutable source/view. Transport reconstruction has additional costs.
The script prints its machine/tool versions and fails if a budget is exceeded.

The warm median budgets below were recorded before accepting C8 reuse changes.
Run on a comparable idle machine when evaluating regressions; a heavily loaded
host or instrumentation can affect elapsed times.

| Operation             | C1–C5 baseline (ms) | C1–C8 result (ms) | Budget (ms) |
| --------------------- | ------------------: | ----------------: | ----------: |
| Create/scan snapshot  |                  98 |               102 |       1,500 |
| Resolve complete view |                 263 |               195 |       1,000 |
| Source inventory      |                  98 |                 2 |         400 |
| Reference analysis    |     Not implemented |               297 |         400 |

The baseline is the 0.3.0 foundation at `c8b2596`; the result is the local
0.3.0 preparation with C1–C8 implemented. Scanning is substantially unchanged. Recognizing canonical
frozen snapshots avoids revalidating/rescanning original strings on every
inventory call. Updates reuse unchanged scans and revision-only updates reuse
token/fact arrays. No condition state is shared across calls. Views and indexes
are rebuilt completely for their exact dependencies.

## Deterministic bounds and correctness checks

Scan nesting, active input depth, occurrence count, conditional/scope/structural
nesting and selected token size have explicit limits. Transformations additionally
bound total output code units, including synthetic delimiters, and check expanded
occurrences while collecting segments. Output bounds also apply when validating
an edited proposal for application.

The public regression suites check limit failures, repeated inclusion, scan-option
changes, additions/removals, earlier setter invalidation, concurrent independent
configurations, equivalent option ordering and clean-rebuild equivalence. Hosts
remain responsible for input byte/file quotas, scheduling, workers, termination
and wall-clock deadlines. Fine-grained incremental interpretation is deferred.

## C5a lookup measurements (2026-09-10)

`node examples/benchmark-node-lookup.mjs` uses 62,024 UTF-16 units: a 2,000-environment
body file included twice. It measures fresh index construction after scan/view
creation, then 10,000 original-offset queries. On the same Windows/Node 22.16.0
host, warm medians were **280 ms** for construction and **85 ms** for all queries,
against fixed corpus budgets of 2,000 ms and 1,000 ms respectively. Each inclusion
is indexed distinctly. Index construction is cached only for canonical immutable
models; these construction measurements use fresh models for each sample.

The original C8 benchmark also passes after adding node metadata: scan **125 ms**,
view **254 ms**, inventory **2 ms**, references **203 ms**. These are local corpus
measurements, not latency guarantees or substitutes for host resource limits.
