import {
  createProjectSnapshot,
  resolveProjectView,
  selectProjectNode,
  getSelectedNode,
  createProjectSourceIndex,
  lookupProjectSource,
  sourceOffsetAt,
  inspectProjectEnvironments,
  getSelectedEnvironment,
  planTransformation,
  applyProjectEdits,
  checkOperationCapability,
  type NodeLocation,
  type NodeEditAction,
  type SourceLookupHit,
  type VersionedSourceOrigin,
} from '@preptex/core';

const snapshot = createProjectSnapshot([{ path: 'main.tex', source: '{text}', version: 1 }]);
const view = resolveProjectView(snapshot, { entryPath: 'main.tex' });
const index = createProjectSourceIndex(view);
const position: number = sourceOffsetAt(index, 'main.tex', 1, 1);
const hits: readonly SourceLookupHit[] = lookupProjectSource(index, {
  path: 'main.tex',
  start: position,
  kinds: ['node'],
});
for (const hit of hits) {
  switch (hit.kind) {
    case 'token': {
      const token = snapshot.files[0]!.tokens[hit.tokenIndex];
      void token;
      break;
    }
    case 'environment':
      getSelectedEnvironment(snapshot, hit.selection);
      break;
    case 'node': {
      const selection = selectProjectNode(view, hit.selection.nodeKey);
      const node = getSelectedNode(view, selection);
      const actions: readonly NodeEditAction[] = [{ kind: 'wrap-node', selection, name: 'C' }];
      const result = planTransformation(view, {
        operation: 'edit-nodes',
        options: { target: 'selected', actions },
      });
      if (result.editPlan) applyProjectEdits(snapshot, result.editPlan, view);
      const capability = checkOperationCapability(view, {
        operation: 'edit-nodes',
        options: { target: 'artifact', actions },
      });
      if (!capability.eligible)
        for (const reason of capability.reasons) {
          const locations = reason.failure?.locations;
          void locations;
        }
      if (node.kind === 'environment') {
        const nameRange = node.syntax.opening?.nameRange;
        const body: VersionedSourceOrigin | null = node.syntax.body;
        void nameRange;
        void body;
      }
      // @ts-expect-error A selected node's origin range is readonly.
      node.location.spans[0]!.range.start = 5;
      // @ts-expect-error References are tied to an immutable original view.
      selection.viewId = 'other';
      break;
    }
    default: {
      const exhaustive: never = hit;
      void exhaustive;
    }
  }
}
function primary(location: NodeLocation): number | null {
  switch (location.kind) {
    case 'none': {
      const noSource: null = location.primary;
      return noSource;
    }
    case 'single': {
      const one: readonly [VersionedSourceOrigin] = location.spans;
      return one[0].range.line;
    }
    case 'multiple':
      return location.primary.range.start;
    default: {
      const exhaustive: never = location;
      return exhaustive;
    }
  }
}
const inventory = inspectProjectEnvironments(snapshot, { kind: 'all-files' });
// @ts-expect-error Source inventories are readonly.
inventory.environments.push(inventory.environments[0]!);
// @ts-expect-error Lookup intervals are immutable transport data.
index.files[0]!.intervals!.maxEnd = 0;
const wrong: NodeEditAction = {
  kind: 'remove-node',
  selection: {
    // @ts-expect-error Node operations cannot select source inventories as configured nodes.
    kind: 'source-environment',
    snapshotId: snapshot.id,
    path: 'main.tex',
    version: 1,
    environmentId: 'e1',
  },
};
// @ts-expect-error A wrapper always requires a literal environment name.
const missingName: NodeEditAction = { kind: 'wrap-node', selection: selectProjectNode(view, 'n1') };
// @ts-expect-error Artifact selections do not accept source mode.
planTransformation(view, { operation: 'edit-nodes', options: { target: 'source', actions: [] } });
void primary;
void wrong;
void missingName;
