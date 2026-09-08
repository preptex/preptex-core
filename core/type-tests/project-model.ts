import {
  createProjectSnapshot,
  inspectProject,
  resolveProjectView,
  updateProjectSnapshot,
  checkOperationCapability,
  validateProjectEditPlan,
  walkConfiguredNodes,
  isConfiguredContainerNode,
  type ConfiguredNode,
  type SyntaxFact,
  type ProjectSnapshot,
  type ProjectView,
  type ProjectEditPlan,
  type GeneratedArtifact,
  type AnalysisFinding,
} from '@preptex/core';

const snapshot: ProjectSnapshot = createProjectSnapshot([
  { path: 'main.tex', source: '\\label{x}', version: 1 },
]);
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

// Typed preview consumers for the reserved C6/C7 results. No unavailable executor is invoked.
function reviewFutureResults(
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
void [newSnapshot, available, factName, reviewFutureResults];
