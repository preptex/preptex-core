import type { ProjectSnapshot, ProjectView } from '../../project-types.js';

// Weak identity attestations, not semantic caches: they retain no project data,
// permit immutable reuse and never share condition state between operations.
const snapshots = new WeakSet<ProjectSnapshot>();
const views = new WeakSet<ProjectView>();
export function rememberSnapshot(value: ProjectSnapshot): ProjectSnapshot {
  snapshots.add(value);
  return value;
}
export function knownSnapshot(value: unknown): value is ProjectSnapshot {
  return typeof value === 'object' && value !== null && snapshots.has(value as ProjectSnapshot);
}
export function rememberView(value: ProjectView): ProjectView {
  views.add(value);
  return value;
}
export function knownView(value: unknown): value is ProjectView {
  return typeof value === 'object' && value !== null && views.has(value as ProjectView);
}
