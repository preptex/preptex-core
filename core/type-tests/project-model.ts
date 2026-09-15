import {
  createProjectSnapshot,
  inspectProject,
  resolveProjectView,
  updateProjectSnapshot,
  checkOperationCapability,
  validateProjectEditPlan,
  walkConfiguredNodes,
  isConfiguredContainerNode,
  indexProjectView,
  runAnalysis,
  planTransformation,
  applyProjectEdits,
  ProjectOperationError,
  runProjectPipeline,
  type ConfiguredNode,
  type SyntaxFact,
  type ProjectSnapshot,
  type ProjectView,
  type ProjectEditPlan,
  type GeneratedArtifact,
  type AnalysisFinding,
} from '@preptex/core';

const sourceFiles = [{ path: 'main.tex', source: '\\label{x}', version: 1 }] as const;
const snapshot: ProjectSnapshot = createProjectSnapshot(sourceFiles);
const inventory = inspectProject(snapshot, { scope: { kind: 'all-files' } });
const view: ProjectView = resolveProjectView(snapshot, {
  entryPath: 'main.tex',
  conditions: {
    mode: 'source-with-overrides',
    overrides: { draft: false },
    initialValues: { draft: true },
  },
});
const available: boolean = checkOperationCapability(view, { operation: 'references' }).eligible;
const newSnapshot = updateProjectSnapshot(snapshot, [
  { kind: 'upsert', file: { path: 'main.tex', source: '', version: 2 } },
]);

// @ts-expect-error Source inputs and facts are deeply readonly.
snapshot.files[0]!.source = 'changed';
// @ts-expect-error Inventory arrays are immutable.
inventory.facts.push(inventory.facts[0]!);
// @ts-expect-error Manual policy requires an explicit values map.
resolveProjectView(snapshot, { entryPath: 'main.tex', conditions: { mode: 'manual' } });
resolveProjectView(snapshot, {
  entryPath: 'main.tex',
  // @ts-expect-error Initial state is not a manual force option.
  conditions: { mode: 'manual', values: {}, initialValues: {} },
});
// @ts-expect-error View options do not include output filenames.
resolveProjectView(snapshot, { entryPath: 'main.tex', outputName: 'out.tex' });

function visit(node: ConfiguredNode): string {
  if (isConfiguredContainerNode(node)) {
    const children: readonly ConfiguredNode[] = node.children;
    void children;
  }
  switch (node.kind) {
    case 'token':
      return node.token.value;
    case 'root':
    case 'group':
      return node.kind;
    case 'environment':
    case 'section':
      return node.name;
    case 'math':
      return node.delimiter;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
function factName(fact: SyntaxFact): string {
  switch (fact.kind) {
    case 'definition':
    case 'condition-declaration':
      return fact.name ?? '';
    case 'command-use':
    case 'condition-assignment':
      return fact.name;
    case 'condition-test':
    case 'reference':
    case 'opaque':
      return fact.command;
    case 'condition-delimiter':
      return fact.delimiter;
    case 'label':
      return fact.key.kind === 'literal' ? fact.key.value : fact.key.source;
    case 'input':
      return fact.target.kind === 'literal' ? fact.target.value : fact.target.source;
    default: {
      const exhaustive: never = fact;
      return exhaustive;
    }
  }
}
if (view.status === 'ready') {
  walkConfiguredNodes(view.root).map(visit);
  // @ts-expect-error Container children are readonly.
  view.root.children.pop();
} else {
  const absent: null = view.root;
  const reason: string = view.reason.code;
  void absent;
  void reason;
}

// Typed preview consumers use only the public entry point.
function reviewResults(
  plan: ProjectEditPlan,
  artifact: GeneratedArtifact,
  findings: readonly AnalysisFinding[]
): void {
  validateProjectEditPlan(snapshot, plan, view);
  const preview: string = artifact.source;
  const key: string = plan.provenance.snapshotId;
  const explanations: readonly string[] = findings.map((f) => f.message);
  void preview;
  void key;
  void explanations;
}
const index = indexProjectView(view);
const references = runAnalysis(view, { operation: 'references' });
const usage = runAnalysis(snapshot, { operation: 'unused-commands' });
const preview = planTransformation(snapshot, {
  operation: 'suppress-comments',
  options: { target: 'source', maxOutputCodeUnits: 1000 },
});
if (preview.editPlan) applyProjectEdits(snapshot, preview.editPlan);
const generated = planTransformation(view, {
  operation: 'export-project',
  options: { inputs: 'inline', conditions: 'materialize' },
});
// @ts-expect-error Analysis cannot accidentally generate a source artifact.
runAnalysis(view, { operation: 'materialize', options: { inputs: 'inline' } });
// @ts-expect-error Transformation APIs cannot invoke analyses.
planTransformation(view, { operation: 'references' });
// @ts-expect-error View source authority is immutable.
view.snapshot.files.pop();
// @ts-expect-error Index observations are immutable.
index.entries.pop();
// @ts-expect-error Target origins are immutable.
references.references[0]!.targets[0]!.range.start = 1;
// @ts-expect-error Counts are represented by readonly located evidence.
usage.commands[0]!.directUses.push(usage.commands[0]!.definition);
// @ts-expect-error Output mappings are readonly.
generated.artifacts[0]!.origins.pop();
try {
  applyProjectEdits(snapshot, preview.editPlan!);
} catch (error: unknown) {
  if (error instanceof ProjectOperationError) {
    const locations: readonly string[] = error.failure.locations.map((location) => location.path);
    void locations;
  }
}
void [newSnapshot, available, factName, reviewResults];
const pipeline = runProjectPipeline(sourceFiles, {
  configuration: { entryPath: 'main.tex' },
  analyses: [{ operation: 'references' }],
  exportOptions: { conditions: 'materialize', inputs: 'inline' },
});
// @ts-expect-error Pipeline analysis results are readonly.
pipeline.analyses.pop();
// @ts-expect-error Pipeline requires explicit export policies.
runProjectPipeline(sourceFiles, { configuration: { entryPath: 'main.tex' } });
runProjectPipeline(sourceFiles, {
  configuration: { entryPath: 'main.tex' },
  exportOptions: { conditions: 'preserve', inputs: 'preserve' },
  // @ts-expect-error Static legacy condition whitelists are not pipeline settings.
  enabledConditions: [],
});
