import type { ProjectSnapshot, ProjectView, ViewConfiguration } from '../../project-types.js';
import { knownView, rememberView } from './canonical.js';
import { evaluateConditionStream } from './conditions.js';
import { normalizeConfiguration } from './configuration.js';
import { coverage, freeze, identity, invalid, issue, record } from './shared.js';
import { validateSnapshot } from './snapshot.js';
import { parseConfiguredStructure } from './structure.js';

/**
 * Resolve reached boolean tests and active literal inputs, then parse the selected token stream
 * into a condition-free structural AST (Pipeline A Step 1 & Step 2, INV-4 & INV-5).
 * @param snapshot - Exact source snapshot; unrelated malformed files do not block a healthy entry.
 * @param configuration - Entry, traversal, boolean policy, profile, and bounded interpretation settings.
 * @returns A deeply frozen ready view or explicit incomplete/blocked trace with no complete AST.
 * @throws {@link PrepTexError} with InvalidArgument for malformed options or stale source identity.
 */
export function resolveProjectView(
  snapshot: ProjectSnapshot,
  configuration: ViewConfiguration
): ProjectView {
  const source = validateSnapshot(snapshot);
  const config = normalizeConfiguration(configuration);
  const id = identity('view', [source.id, config]);
  const entry = source.files.find((f) => f.path === config.entryPath);

  if (!entry) {
    const reason = issue(
      'missing-entry',
      `Entry ${config.entryPath} is absent.`,
      null,
      'blocked' === 'blocked' ? 'error' : 'warning'
    );
    return rememberView(
      freeze({
        kind: 'view' as const,
        snapshot: source,
        id,
        snapshotId: source.id,
        configuration: config,
        occurrences: [],
        decisions: [],
        reachedFacts: [],
        selectedTokens: [],
        status: 'blocked',
        root: null,
        reason,
        coverage: coverage([reason]),
      })
    );
  }

  const evaluation = evaluateConditionStream(source, {
    entryFiles: [entry],
    traversal: config.traversal,
    stopOnFileOnlyInput: true,
    inlineInputs: config.traversal === 'project',
    stripDeclarationsAndSetters: true,
    conditions: config.conditions,
    limits: config.limits,
  });

  const base = {
    kind: 'view' as const,
    snapshot: source,
    id,
    snapshotId: source.id,
    configuration: config,
    occurrences: evaluation.occurrences,
    decisions: evaluation.decisions,
    reachedFacts: evaluation.reachedFacts,
    selectedTokens: evaluation.selectedTokens,
  };

  if (evaluation.failure) {
    return rememberView(
      freeze({
        ...base,
        ...evaluation.failure,
        root: null,
        coverage: coverage([evaluation.failure.reason]),
      })
    );
  }

  const parsed = parseConfiguredStructure(
    evaluation.selectedTokens,
    id,
    config.limits.maxNesting,
    source
  );
  if (parsed.kind === 'error') {
    const inputChain: string[] = [];
    let occurrence = evaluation.occurrences.find((o) => o.id === parsed.issue.inputChain[0]);
    while (occurrence) {
      inputChain.unshift(occurrence.id);
      const parentId = occurrence.parentId;
      occurrence =
        parentId === null ? undefined : evaluation.occurrences.find((o) => o.id === parentId);
    }
    const reason = { ...parsed.issue, inputChain };
    return rememberView(
      freeze({
        ...base,
        status: 'blocked',
        root: null,
        reason,
        coverage: coverage([reason]),
      })
    );
  }

  return rememberView(
    freeze({ ...base, status: 'ready', root: parsed.root, coverage: coverage([]) })
  );
}

export function validateView(value: unknown): ProjectView {
  if (knownView(value)) return value;
  const input = record(value, 'view');
  if (input['kind'] !== 'view') invalid('Expected a configured view.');
  const snapshot = validateSnapshot(input['snapshot']);
  const config = normalizeConfiguration(input['configuration']);
  const view = resolveProjectView(snapshot, config);
  if (input['id'] !== view.id || input['snapshotId'] !== snapshot.id)
    invalid('Stale or inconsistent view identity.');
  return view;
}
