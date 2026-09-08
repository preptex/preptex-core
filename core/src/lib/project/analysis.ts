import type {
  AnalysisFinding,
  AnalysisLocation,
  AnalysisRequest,
  AnalysisResult,
  CommandUsage,
  ConfiguredIndex,
  Coverage,
  ProjectSnapshot,
  ProjectView,
  ReferenceResolution,
  SourceOrigin,
  SyntaxFact,
} from '../../project-types.js';
import { coverage, freeze, identity, issue, invalid, record } from './shared.js';
import { validateSnapshot, inspectProject } from './snapshot.js';
import { validateView } from './view.js';
import { requireCapability, validateOperation } from './operations.js';
import { walkConfiguredNodes } from '../../project-types.js';

function scopedDefinitions(model: ProjectSnapshot | ProjectView): Set<string> {
  const scoped = new Set<string>();
  const key = (path: string, start: number) => `${path}:${start}`;
  if (model.kind === 'view' && model.status === 'ready') {
    for (const node of walkConfiguredNodes(model.root)) {
      if (node.kind !== 'group' && node.kind !== 'environment' && node.kind !== 'math') continue;
      for (const entry of model.reachedFacts)
        if (
          entry.fact.kind === 'definition' &&
          node.origins.some(
            (origin) =>
              origin.path === entry.origin.path &&
              origin.occurrenceId === entry.origin.occurrenceId &&
              origin.range.start <= entry.fact.range.start &&
              origin.range.end >= entry.fact.range.start
          )
        )
          scoped.add(key(entry.fact.path, entry.fact.range.start));
    }
  } else {
    const source = model.kind === 'snapshot' ? model : model.snapshot;
    for (const file of source.files) {
      let depth = 0;
      const definitions = new Set(
        file.facts.filter((f) => f.kind === 'definition').map((f) => f.range.start)
      );
      for (const token of file.tokens) {
        if (definitions.has(token.range.start) && depth > 0)
          scoped.add(key(file.path, token.range.start));
        if (token.kind === 'open' || token.value === '\\begingroup' || token.value === '\\begin')
          depth++;
        if (token.kind === 'close' || token.value === '\\endgroup' || token.value === '\\end')
          depth = Math.max(0, depth - 1);
      }
    }
  }
  return scoped;
}

function indexCoverage(view: ProjectView): Coverage {
  const issues = [...view.coverage.issues];
  for (const entry of view.reachedFacts) {
    if (entry.fact.kind === 'definition')
      issues.push(
        issue(
          'opaque-region',
          'Stored definitions may generate labels, references or command uses through expansion; their bodies are not executed by this index.',
          entry.origin
        )
      );
    if (
      (entry.fact.kind === 'label' || entry.fact.kind === 'reference') &&
      entry.fact.key.kind === 'unresolved'
    )
      issues.push(
        issue(
          'opaque-region',
          'A generated key cannot be resolved without expansion.',
          entry.origin
        )
      );
  }
  return coverage(issues);
}

/**
 * Build a reusable index of recognized reached facts, without emitting source.
 * @param view - Configured trace, including an explicitly marked incomplete trace.
 * @returns Frozen entries in execution order, with exact view identity and coverage.
 * @throws {@link PrepTexError} with InvalidArgument for an invalid transported view.
 */
export function indexProjectView(view: ProjectView): ConfiguredIndex {
  const model = validateView(view);
  return freeze({
    snapshotId: model.snapshotId,
    viewId: model.id,
    resultId: identity('index', [model.id, 1]),
    entries: model.reachedFacts.filter((e) =>
      ['label', 'reference', 'definition', 'command-use'].includes(e.fact.kind)
    ),
    coverage: indexCoverage(model),
  });
}

/**
 * Analyze recognized references or conservative command-use evidence independently.
 * @param model - A view for references; source snapshot or view for command-use candidates.
 * @param request - Analysis and options; incomplete views require allowIncomplete explicitly.
 * @returns Frozen qualified findings, detailed observations and exact operation identity; no artifacts.
 * @throws {@link ProjectOperationError} when the model does not meet operation requirements.
 * @throws {@link PrepTexError} with InvalidArgument for malformed requests or stale transports.
 */
export function runAnalysis(
  model: ProjectSnapshot | ProjectView,
  request: AnalysisRequest
): AnalysisResult {
  const data = record(model, 'analysis model');
  const normalized = data['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const operation = validateOperation(request);
  if (operation.operation !== 'references' && operation.operation !== 'unused-commands')
    invalid('Expected an analysis request.');
  requireCapability(normalized, operation);
  const source = normalized.kind === 'snapshot' ? normalized : normalized.snapshot;
  const provenance = {
    snapshotId: source.id,
    viewId: normalized.kind === 'view' ? normalized.id : null,
    request: operation,
    operationVersion: 1 as const,
  };
  const findings: AnalysisFinding[] = [];
  const references: ReferenceResolution[] = [];
  const commands: CommandUsage[] = [];
  let resultCoverage: Coverage;
  if (operation.operation === 'references') {
    if (normalized.kind !== 'view') invalid('References require a configured view.');
    const index = indexProjectView(normalized);
    resultCoverage = index.coverage;
    const labels = new Map<string, { origin: SourceOrigin; order: number }[]>();
    index.entries.forEach((entry, order) => {
      if (entry.fact.kind !== 'label' || entry.fact.key.kind !== 'literal') return;
      const bucket = labels.get(entry.fact.key.value) ?? [];
      bucket.push({ origin: entry.origin, order });
      labels.set(entry.fact.key.value, bucket);
    });
    index.entries.forEach((entry, order) => {
      const fact = entry.fact;
      if (fact.kind === 'label') {
        if (fact.key.kind === 'unresolved')
          findings.push({
            code: 'unresolved-key',
            severity: 'information',
            message: 'This label key requires expansion.',
            primary: entry.origin,
            related: [],
          });
        else {
          const group = labels.get(fact.key.value)!;
          if (group.length > 1 && group[0]!.origin === entry.origin)
            findings.push({
              code: 'duplicate-label',
              severity: 'warning',
              message: `Multiple reached declarations of label ${fact.key.value}.`,
              primary: entry.origin,
              related: group.slice(1).map((e) => e.origin),
            });
        }
      }
      if (fact.kind !== 'reference') return;
      if (fact.key.kind === 'unresolved') {
        references.push({
          reference: entry.origin,
          key: null,
          status: 'unresolved',
          targets: [],
          forward: null,
        });
        findings.push({
          code: 'unresolved-key',
          severity: 'information',
          message: 'This reference key requires expansion.',
          primary: entry.origin,
          related: [],
        });
        return;
      }
      const candidates = labels.get(fact.key.value) ?? [];
      const targets = candidates.map((e) => e.origin);
      const forward = candidates.length === 1 ? candidates[0]!.order > order : null;
      const status =
        candidates.length > 1
          ? 'duplicate'
          : candidates.length === 1
            ? 'matched'
            : normalized.status === 'ready'
              ? 'missing'
              : 'unknown-coverage';
      references.push({ reference: entry.origin, key: fact.key.value, status, targets, forward });
      if (status === 'missing')
        findings.push({
          code: 'missing-reference',
          severity: 'warning',
          message: `No recognized reached target for ${fact.key.value} within the supported profile. Macro-generated targets are not established by this analysis.`,
          primary: entry.origin,
          related: [],
        });
      if (forward)
        findings.push({
          code: 'forward-reference',
          severity: 'information',
          message: `The recognized target for ${fact.key.value} occurs later in input order. Forward references are valid LaTeX.`,
          primary: entry.origin,
          related: targets,
        });
    });
  } else {
    interface Located {
      fact: SyntaxFact;
      location: AnalysisLocation;
    }
    let located: Located[];
    if (normalized.kind === 'snapshot') {
      const inventory = inspectProject(
        source,
        operation.options?.scope ? { scope: operation.options.scope } : {}
      );
      resultCoverage = inventory.coverage;
      located = inventory.facts.map((fact) => ({
        fact,
        location: { path: fact.path, range: fact.range, snapshotId: source.id, occurrenceId: null },
      }));
    } else {
      resultCoverage = indexCoverage(normalized);
      located = normalized.reachedFacts.map((e) => ({ fact: e.fact, location: e.origin }));
      for (const reached of normalized.reachedFacts) {
        if (reached.fact.kind !== 'definition' || !reached.fact.body) continue;
        const def = reached.fact;
        const file = source.files.find((f) => f.path === def.path)!;
        for (const fact of file.facts)
          if (
            fact.context.definitionBodies.some(
              (r) => r.start === def.body!.start && r.end === def.body!.end
            )
          )
            located.push({ fact, location: { ...reached.origin, range: fact.range } });
      }
    }
    located = [
      ...new Map(
        located.map((entry) => [
          `${entry.fact.path}:${entry.fact.range.start}:${entry.fact.kind}:${entry.location.occurrenceId}`,
          entry,
        ])
      ).values(),
    ];
    const scoped = scopedDefinitions(normalized);
    const definitions = located.filter((e) => e.fact.kind === 'definition' && e.fact.name !== null);
    const uses = located.filter((e) => e.fact.kind === 'command-use');
    for (const definition of definitions) {
      const def = definition.fact;
      if (def.kind !== 'definition' || def.name === null) continue;
      const matching = uses.filter(
        (e) => e.fact.kind === 'command-use' && e.fact.name === def.name
      );
      const own = (entry: Located) =>
        entry.fact.path === def.path &&
        entry.location.occurrenceId === definition.location.occurrenceId &&
        entry.fact.context.definitionBodies.some(
          (r) => def.body !== null && r.start === def.body.start && r.end === def.body.end
        );
      const directUses = matching
        .filter(
          (e) => !e.fact.context.definitionBodies.length && !e.fact.context.opaqueArguments.length
        )
        .map((e) => e.location);
      const selfReferences = matching.filter(own).map((e) => e.location);
      const bodyReferences = matching
        .filter((e) => e.fact.context.definitionBodies.length && !own(e))
        .map((e) => e.location);
      const ambiguous =
        definitions.filter((e) => e.fact.kind === 'definition' && e.fact.name === def.name).length >
          1 ||
        def.context.branches.length > 0 ||
        def.context.definitionBodies.length > 0 ||
        scoped.has(`${def.path}:${def.range.start}`) ||
        matching.some(
          (e) =>
            e.fact.context.opaqueArguments.length > 0 ||
            (normalized.kind === 'snapshot' &&
              (e.fact.path !== def.path ||
                (!e.fact.context.definitionBodies.length && e.fact.range.start < def.range.start)))
        );
      const classification = ambiguous
        ? 'ambiguous-binding'
        : directUses.length
          ? 'directly-used'
          : bodyReferences.length
            ? 'body-referenced'
            : selfReferences.length
              ? 'self-recursive-only'
              : 'no-recognized-use';
      commands.push({
        name: def.name,
        definition: definition.location,
        directUses,
        bodyReferences,
        selfReferences,
        classification,
      });
      if (classification === 'no-recognized-use' || classification === 'self-recursive-only')
        findings.push({
          code: 'no-recognized-use',
          severity: 'information',
          message: `No recognized root use of \\${def.name} in the requested coverage. This is a candidate, not proof of non-use or permission to delete.`,
          primary: definition.location,
          related: selfReferences,
        });
    }
    resultCoverage = {
      ...resultCoverage,
      assumptions: [
        ...resultCoverage.assumptions,
        'Use counts are syntactic evidence. Conditional, scoped, dynamic and repeated definitions may have ambiguous bindings; no arbitrary expansion or unused-definition proof is performed.',
      ],
    };
  }
  return freeze({
    kind: 'findings',
    resultId: identity('analysis', provenance),
    provenance,
    findings,
    references,
    commands,
    coverage: resultCoverage,
  });
}
