import type { SourceRange } from '../../api-types.js';
import type { BranchContext, FactContext, ScannedFile } from '../../project-types.js';

const scopeKey = (context: Pick<FactContext, 'definitionBodies' | 'opaqueArguments'>) =>
  JSON.stringify([context.definitionBodies, context.opaqueArguments]);

/** Sweep stored scopes and conditional facts without treating stored text as execution. */
export function environmentContext(file: ScannedFile): (offset: number) => FactContext {
  type Scope = { range: SourceRange; kind: 'definitionBodies' | 'opaqueArguments' };
  const scopes = new Map<string, Scope>();
  function add(range: SourceRange, kind: Scope['kind']): void {
    scopes.set(`${kind}:${range.start}:${range.end}`, { range, kind });
  }
  for (const fact of file.facts) {
    for (const range of fact.context.definitionBodies) add(range, 'definitionBodies');
    for (const range of fact.context.opaqueArguments) add(range, 'opaqueArguments');
    if (fact.kind === 'definition') {
      if (fact.body) add(fact.body, 'definitionBodies');
      for (const range of fact.arguments) add(range, 'definitionBodies');
    }
  }
  const ordered = [...scopes.values()].sort(
    (a, b) => a.range.start - b.range.start || b.range.end - a.range.end
  );
  const states = new Map<string, readonly BranchContext[]>(),
    owners = new Map<number, string>();
  let scopeIndex = 0,
    factIndex = 0,
    active: Scope[] = [];
  return (offset) => {
    while (factIndex < file.facts.length && file.facts[factIndex]!.range.start <= offset) {
      const fact = file.facts[factIndex++]!,
        key = scopeKey(fact.context),
        branches = [...fact.context.branches];
      if (fact.kind === 'condition-test') {
        branches.push({ test: fact.range, arm: 'then' });
        owners.set(fact.range.start, key);
      }
      if (
        fact.kind === 'condition-delimiter' &&
        branches.length &&
        owners.get(branches[branches.length - 1]!.test.start) === key
      ) {
        if (fact.delimiter === 'fi') branches.pop();
        else branches[branches.length - 1] = { ...branches[branches.length - 1]!, arm: 'else' };
      }
      states.set(key, branches);
    }
    while (scopeIndex < ordered.length && ordered[scopeIndex]!.range.start <= offset)
      active.push(ordered[scopeIndex++]!);
    active = active.filter((s) => s.range.end >= offset);
    const context: FactContext = {
      branches: [],
      definitionBodies: active.filter((s) => s.kind === 'definitionBodies').map((s) => s.range),
      opaqueArguments: active.filter((s) => s.kind === 'opaqueArguments').map((s) => s.range),
    };
    let branches = states.get(scopeKey(context));
    // A protected-only body has no facts of its own; inherit its enclosing source context.
    for (let i = active.length; branches === undefined && i >= 0; i--) {
      const parents = active.slice(0, i);
      branches = states.get(
        scopeKey({
          definitionBodies: parents
            .filter((s) => s.kind === 'definitionBodies')
            .map((s) => s.range),
          opaqueArguments: parents.filter((s) => s.kind === 'opaqueArguments').map((s) => s.range),
        })
      );
    }
    return { ...context, branches: branches ?? [] };
  };
}
