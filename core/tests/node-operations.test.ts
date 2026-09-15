import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyProjectEdits,
  checkOperationCapability,
  createProjectSnapshot,
  createProjectSourceIndex,
  getSelectedEnvironment,
  getSelectedNode,
  inspectProjectEnvironments,
  lookupProjectSource,
  planTransformation,
  PrepTexErrorCode,
  resolveProjectView,
  runProjectPipeline,
  selectProjectNode,
  sourceOffsetAt,
  updateProjectSnapshot,
  validateProjectEditPlan,
  walkConfiguredNodes,
  type ConfiguredNode,
  type NodeEditAction,
  type ProjectView,
  type TransformationResult,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ source, path, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);
const view = (source: string) => resolveProjectView(snapshot(source), { entryPath: 'main.tex' });
const output = (result: TransformationResult) => result.artifacts[0]!.source;
function nodes(v: ProjectView): readonly ConfiguredNode[] {
  expect(v.status).toBe('ready');
  return walkConfiguredNodes(v.root!);
}
function env(v: ProjectView, name: string, index = 0): ConfiguredNode {
  return nodes(v).filter((n) => n.kind === 'environment' && n.name === name)[index]!;
}
const remove = (v: ProjectView, n: ConfiguredNode): NodeEditAction => ({
  kind: 'remove-node',
  selection: selectProjectNode(v, n.occurrenceKey),
});
const wrap = (v: ProjectView, n: ConfiguredNode, name: string): NodeEditAction => ({
  kind: 'wrap-node',
  selection: selectProjectNode(v, n.occurrenceKey),
  name,
});
const rename = (v: ProjectView, n: ConfiguredNode, name: string): NodeEditAction => ({
  kind: 'rename-environment',
  selection: selectProjectNode(v, n.occurrenceKey),
  name,
});
const edit = (
  v: ProjectView,
  actions: readonly NodeEditAction[],
  target: 'selected' | 'artifact' = 'selected'
) => planTransformation(v, { operation: 'edit-nodes', options: { target, actions } });
function applied(v: ProjectView, r: TransformationResult): string {
  expect(r.editPlan).not.toBeNull();
  const updated = applyProjectEdits(v.snapshot, r.editPlan!, v);
  expect(updated.files[0]!.source).toBe(output(r));
  return output(r);
}
function frozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}

describe('C5a source locations and indexed selections', () => {
  it('preserves UTF-16 offsets, CR/LF/CRLF and exact literal delimiters', () => {
    const text = '😀\r\nα\rβ\n' + String.raw`\begin {itemize}\item X\end {itemize}`;
    const v = view(text),
      n = env(v, 'itemize');
    expect(n.location.kind).toBe('single');
    expect(n.location.primary).toMatchObject({
      path: 'main.tex',
      version: 1,
      range: { start: text.indexOf('\\begin'), end: text.length - 1, line: 4 },
    });
    if (n.kind === 'environment') {
      const d = n.syntax.opening!;
      expect(text.slice(d.range.start, d.range.end + 1)).toBe(String.raw`\begin {itemize}`);
      expect(text.slice(d.nameRange.start, d.nameRange.end + 1)).toBe('itemize');
    }
    const index = createProjectSourceIndex(v);
    expect(createProjectSourceIndex(v)).toBe(index);
    expect(sourceOffsetAt(index, 'main.tex', 2)).toBe(4);
    expect(sourceOffsetAt(index, 'main.tex', 4)).toBe(8);
    const hits = lookupProjectSource(index, {
      path: 'main.tex',
      start: text.indexOf('X'),
      kinds: ['node'],
    });
    expect(hits[0]!.kind).toBe('node');
    if (hits[0]!.kind === 'node') expect(getSelectedNode(v, hits[0]!.selection).kind).toBe('token');
    expect(lookupProjectSource(index, { path: 'main.tex', start: text.length })).toEqual([]);
    expect(() => sourceOffsetAt(index, 'main.tex', 2, 3)).toThrow();
    expect(lookupProjectSource(structuredClone(index), { path: 'main.tex', start: 8 })).toEqual(
      lookupProjectSource(index, { path: 'main.tex', start: 8 })
    );
    frozen(index);
    frozen(hits);
  });
  it('does not invent source spans across inactive gaps or file inclusions', () => {
    const s = createProjectSnapshot([
      file(String.raw`\begin{C}A\iftrue B\else HIDDEN\fi\input{x}\end{C}`),
      file('X', 'x.tex'),
    ]);
    const v = resolveProjectView(s, { entryPath: 'main.tex' }),
      n = env(v, 'C');
    expect(n.location.kind).toBe('multiple');
    expect(new Set(n.location.spans.map((o) => o.path)).size).toBe(2);
    const hits = lookupProjectSource(createProjectSourceIndex(v), {
      path: 'main.tex',
      start: s.files[0]!.source.indexOf('HIDDEN'),
      kinds: ['node'],
    });
    expect(hits).toEqual([]);
    expect(() => edit(v, [remove(v, n)])).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.EditConflict })
    );
    expect(output(edit(v, [remove(v, n)], 'artifact'))).toBe('');
  });
  it('rejects stale and forged selections, and reconstructs transported derived indexes', () => {
    const v = view(String.raw`\begin{C}X\end{C}`),
      n = env(v, 'C'),
      selection = selectProjectNode(v, n.occurrenceKey);
    expect(getSelectedNode(structuredClone(v), selection)).toEqual(n);
    const changed = updateProjectSnapshot(v.snapshot, [
      { kind: 'upsert', file: file('new', 'main.tex', 2) },
    ]);
    const next = resolveProjectView(changed, { entryPath: 'main.tex' });
    expect(() => getSelectedNode(next, selection)).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.StaleResult })
    );
    expect(() => getSelectedNode(v, { ...selection, nodeKey: 'invented' })).toThrow();
    const idx = createProjectSourceIndex(v),
      clone = { ...structuredClone(idx), files: [] };
    expect(lookupProjectSource(clone, { path: 'main.tex', start: 0 })).toEqual(
      lookupProjectSource(idx, { path: 'main.tex', start: 0 })
    );
    expect(() =>
      lookupProjectSource({ ...clone, id: 'wrong' }, { path: 'main.tex', start: 0 })
    ).toThrow();
  });
});

describe('C7a environment inventory and source operations', () => {
  it('finds all branches and stored bodies while protecting literal lookalikes', () => {
    const text = String.raw`\iftrue\begin{C}yes\end{C}\else\begin{C}no\end{C}\fi
\newcommand{\f}{\begin{C}stored\end{C}}
\verb|\begin{C}literal\end{C}|
\begin{verbatim}\begin{C}literal\end{C}\end{verbatim}
% \begin{C}comment\end{C}
\begin{comment}\begin{C}ignored\end{C}\end{comment}`;
    const s = snapshot(text),
      inventory = inspectProjectEnvironments(s);
    expect(inventory.environments.filter((e) => e.name === 'C')).toHaveLength(3);
    expect(inventory.environments.every((e) => e.status === 'matched')).toBe(true);
    const found = inventory.environments[0]!;
    expect(
      getSelectedEnvironment(s, {
        kind: 'source-environment',
        snapshotId: s.id,
        path: found.path,
        version: found.version,
        environmentId: found.id,
      })
    ).toBe(found);
    const result = planTransformation(s, {
      operation: 'remove-environments',
      options: { target: 'source', names: ['C', 'comment'] },
    });
    expect(output(result)).not.toContain('stored');
    expect(output(result)).not.toContain('ignored');
    expect(output(result)).toContain(String.raw`\verb|\begin{C}literal\end{C}|`);
    expect(output(result)).toContain('% \\begin{C}');
    expect(applyProjectEdits(s, result.editPlan!).files[0]!.source).toBe(output(result));
    frozen(inventory);
  });
  it('collapses nested matching removals and respects a named file scope', () => {
    const text = String.raw`A\begin{C}outer\begin{C}inner\end{C}\end{C}Z`;
    const s = createProjectSnapshot([file(text), file(text, 'other.tex')]);
    const result = planTransformation(s, {
      operation: 'remove-environments',
      options: { target: 'source', names: ['C'], scope: { kind: 'files', paths: ['main.tex'] } },
    });
    expect(result.editPlan!.edits).toHaveLength(1);
    expect(output(result)).toBe('AZ');
    expect(applyProjectEdits(s, result.editPlan!).files[1]!.source).toBe(text);
  });
  it.each([
    String.raw`\begin{C}oops`,
    String.raw`\end{C}`,
    String.raw`\begin{C}\iftrue\end{C}\fi`,
    String.raw`\begin{C}\begin{D}\end{C}\end{D}`,
    String.raw`\begin{C}{\end{C}}`,
  ])('rejects an unproven whole environment: %s', (text) => {
    const s = snapshot(text),
      request = {
        operation: 'remove-environments',
        options: { target: 'source', names: ['C'] },
      } as const;
    expect(checkOperationCapability(s, request).eligible).toBe(false);
    expect(() => planTransformation(s, request)).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.EditConflict })
    );
    expect(s.files[0]!.source).toBe(text);
  });
  it('suppresses comment environments only when explicitly requested', () => {
    const text = 'A%gone\r\n  B' + String.raw`\begin{comment}\ifunknown{bad\end{comment}` + 'C';
    const s = snapshot(text);
    expect(
      output(
        planTransformation(s, { operation: 'suppress-comments', options: { target: 'source' } })
      )
    ).toContain('\\begin{comment}');
    const r = planTransformation(s, {
      operation: 'suppress-comments',
      options: { target: 'source', suppressCommentEnvironments: true },
    });
    expect(output(r)).toBe('ABC');
    expect(applyProjectEdits(s, r.editPlan!).files[0]!.source).toBe('ABC');
  });
});

describe('C7a selected-node edit batches', () => {
  it('F31 removes a whole section and its nested environment while retaining neighboring sections', () => {
    const text = readFileSync(
      new URL('./fixtures/project-model/F31-node-removal.tex', import.meta.url),
      'utf8'
    );
    const v = view(text),
      section = nodes(v).find((n) => n.kind === 'section' && n.name === 'Drop')!;
    expect(applied(v, edit(v, [remove(v, section)]))).toBe(
      '\\section{Keep}\nA\n\\section{Keep}\nB\n'
    );
    const groups = view('{keep}{drop}{keep}'),
      group = nodes(groups).filter((n) => n.kind === 'group')[1]!;
    expect(applied(groups, edit(groups, [remove(groups, group)]))).toBe('{keep}{keep}');
  });
  it.each(['selected', 'artifact'] as const)(
    'removes named configured environments with %s output',
    (target) => {
      const v = view(
        String.raw`\iftrue\begin{C}outer\begin{C}inner\end{C}\end{C}\else\begin{C}inactive\end{C}\fi\begin{c}keep\end{c}`
      );
      const r = planTransformation(v, {
        operation: 'remove-environments',
        options: { target, names: ['C'] },
      });
      if (target === 'selected')
        expect(applied(v, r)).toBe(
          String.raw`\iftrue\else\begin{C}inactive\end{C}\fi\begin{c}keep\end{c}`
        );
      else expect(output(r)).toBe(String.raw`\begin{c}keep\end{c}`);
    }
  );
  it('renames one list and wraps it in request order with exact source previews', () => {
    const v = view(
        String.raw`A\begin{itemize}\item X\end{itemize}Z\begin{itemize}\item Y\end{itemize}`
      ),
      n = env(v, 'itemize');
    const r = edit(v, [rename(v, n, 'enumerate'), wrap(v, n, 'outer'), wrap(v, n, 'inner')]);
    expect(applied(v, r)).toBe(
      String.raw`A\begin{outer}\begin{inner}\begin{enumerate}\item X\end{enumerate}\end{inner}\end{outer}Z\begin{itemize}\item Y\end{itemize}`
    );
    expect(env(v, 'itemize')).toBe(n);
    frozen(r);
    expect(r.artifacts[0]!.origins.some((o) => o.kind === 'synthetic')).toBe(true);
    expect(output(edit(v, [rename(v, n, 'enumerate'), wrap(v, n, 'outer')], 'artifact'))).toBe(
      String.raw`A\begin{outer}\begin{enumerate}\item X\end{enumerate}\end{outer}Z\begin{itemize}\item Y\end{itemize}`
    );
  });
  it('combines coincident wrapper boundaries deterministically', () => {
    const v = view('{A}{B}'),
      groups = nodes(v).filter((n) => n.kind === 'group');
    expect(applied(v, edit(v, [wrap(v, groups[0]!, 'C'), wrap(v, groups[1]!, 'D')]))).toBe(
      String.raw`\begin{C}{A}\end{C}\begin{D}{B}\end{D}`
    );
  });
  it('deduplicates subtree removals and rejects actions inside removed subtrees', () => {
    const v = view(String.raw`a\begin{C}\begin{D}body\end{D}\end{C}b`),
      a = env(v, 'C'),
      b = env(v, 'D');
    expect(applied(v, edit(v, [remove(v, b), remove(v, a), remove(v, a)]))).toBe('ab');
    expect(() => edit(v, [remove(v, a), wrap(v, b, 'E')])).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.EditConflict })
    );
    expect(() => edit(v, [rename(v, a, 'E'), rename(v, a, 'F')])).toThrow();
  });
  it('rejects root/delimiter edits, invalid names, argument adaptation and forged proposals', () => {
    const v = view(String.raw`\begin{itemize}[x]\item X\end{itemize}`),
      n = env(v, 'itemize');
    expect(() => edit(v, [remove(v, v.root!)])).toThrow();
    expect(() => edit(v, [rename(v, n, 'enumerate')])).toThrow();
    expect(() => edit(v, [wrap(v, n, 'C}evil')])).toThrow();
    const r = edit(v, [remove(v, n)]),
      e = r.editPlan!.edits[0]!;
    expect(e.kind).toBe('replace');
    if (e.kind === 'replace')
      expect(() =>
        validateProjectEditPlan(
          v.snapshot,
          { ...r.editPlan!, edits: [{ ...e, replacement: 'forged' }] },
          v
        )
      ).toThrow();
  });
  it('requires compatible actions on every repeated physical inclusion', () => {
    const s = createProjectSnapshot([
      file(String.raw`\input{x}\input{x}`),
      file(String.raw`\begin{C}X\end{C}`, 'x.tex'),
    ]);
    const v = resolveProjectView(s, { entryPath: 'main.tex' }),
      a = env(v, 'C'),
      b = env(v, 'C', 1);
    expect(() => edit(v, [remove(v, a)])).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.EditConflict })
    );
    expect(output(edit(v, [remove(v, a)], 'artifact'))).toBe(String.raw`\begin{C}X\end{C}`);
    const r = edit(v, [rename(v, a, 'D'), rename(v, b, 'D')]);
    expect(r.editPlan!.edits).toHaveLength(2);
    expect(applyProjectEdits(s, r.editPlan!, v).files[1]!.source).toBe(
      String.raw`\begin{D}X\end{D}`
    );
    expect(() =>
      edit(v, [wrap(v, a, 'outer'), wrap(v, a, 'inner'), wrap(v, b, 'inner'), wrap(v, b, 'outer')])
    ).toThrow();
    expect(() => edit(v, [wrap(v, a, 'C'), wrap(v, a, 'C'), wrap(v, b, 'C')])).toThrow();
    const wrapped = edit(v, [
      wrap(v, a, 'outer'),
      wrap(v, a, 'inner'),
      wrap(v, b, 'outer'),
      wrap(v, b, 'inner'),
    ]);
    expect(applyProjectEdits(s, wrapped.editPlan!, v).files[1]!.source).toBe(
      String.raw`\begin{outer}\begin{inner}\begin{C}X\end{C}\end{inner}\end{outer}`
    );
  });
  it('rejects non-inline or preserved-condition node artifact edits', () => {
    const v = view('{A}'),
      n = nodes(v).find((n) => n.kind === 'group')!,
      actions = [wrap(v, n, 'C')];
    for (const [conditions, inputs] of [
      ['preserve', 'inline'],
      ['materialize', 'preserve'],
    ] as const)
      expect(() =>
        planTransformation(v, {
          operation: 'export-project',
          options: { conditions, inputs, nodeEdits: actions },
        })
      ).toThrow();
  });
  it('resolves source booleans first and suppresses active comments/environment content', () => {
    const text =
      String.raw`\newif\iflong\newif\ifshort\longtrue\shortfalse\iflong\begin{itemize}\item long\end{itemize}\else hidden\fi\ifshort hidden\fi` +
      '%gone\n' +
      String.raw`\begin{comment}ignored\end{comment}`;
    const v = view(text),
      n = env(v, 'itemize');
    const r = planTransformation(v, {
      operation: 'export-project',
      options: {
        conditions: 'materialize',
        inputs: 'inline',
        suppressComments: true,
        suppressCommentEnvironments: true,
        nodeEdits: [rename(v, n, 'enumerate'), wrap(v, n, 'C')],
      },
    });
    expect(output(r)).toBe(String.raw`\begin{C}\begin{enumerate}\item long\end{enumerate}\end{C}`);
  });
});

describe('C5a/C7a edge cases and operation ordering', () => {
  it('composes selected edits with the public pipeline using the same source/configuration', () => {
    const files = [file(String.raw`\begin{C}body\end{C}`)],
      configuration = { entryPath: 'main.tex' },
      v = resolveProjectView(createProjectSnapshot(files), configuration),
      n = env(v, 'C');
    const exportOptions = {
      conditions: 'materialize',
      inputs: 'inline',
      nodeEdits: [wrap(v, n, 'D')],
    } as const;
    const standalone = planTransformation(v, {
      operation: 'export-project',
      options: exportOptions,
    });
    expect(runProjectPipeline(files, { configuration, exportOptions }).transformation).toEqual(
      standalone
    );
    expect(() =>
      runProjectPipeline([file('other', 'main.tex', 2)], { configuration, exportOptions })
    ).toThrow();
  });
  it.each(['preserve', 'materialize'] as const)(
    'suppresses active comment environments with %s conditions and retained inputs',
    (conditions) => {
      const files = [
        file(
          String.raw`\input{x}\iftrue\begin{comment}active\end{comment}\else\begin{comment}inactive\end{comment}\fi`
        ),
        file(
          String.raw`\newcommand{\f}{\begin{comment}stored\end{comment}}\begin{comment}active\end{comment}`,
          'x.tex'
        ),
      ];
      const s = createProjectSnapshot(files),
        v = resolveProjectView(s, { entryPath: 'main.tex' });
      const r = planTransformation(v, {
        operation: 'export-project',
        options: { conditions, inputs: 'preserve', suppressCommentEnvironments: true },
      });
      expect(r.artifacts.find((a) => a.path === 'main.tex')!.source).not.toContain(
        '{comment}active'
      );
      expect(r.artifacts.find((a) => a.path === 'x.tex')!.source).toContain('{comment}stored');
      expect(r.artifacts.find((a) => a.path === 'x.tex')!.source).not.toContain('{comment}active');
      if (conditions === 'preserve') expect(r.artifacts[0]!.source).toContain('{comment}inactive');
      const stored = nodes(v).find(
        (n) => n.kind === 'token' && n.token.value.includes('{comment}stored')
      )!;
      expect(() => edit(v, [remove(v, stored)])).toThrow();
    }
  );
  it('suppresses selected comment environments with a checked, clone-safe source plan', () => {
    const v = view('A%gone\r\n' + String.raw`\begin{comment}hidden\end{comment}` + 'B');
    const r = planTransformation(v, {
      operation: 'suppress-comments',
      options: { target: 'selected', suppressCommentEnvironments: true },
    });
    expect(applied(v, r)).toBe('AB');
    expect(
      applyProjectEdits(
        structuredClone(v.snapshot),
        structuredClone(r.editPlan!),
        structuredClone(v)
      ).files[0]!.source
    ).toBe('AB');
  });
  it('rejects inactive shared-file effects and incomplete configured models', () => {
    const s = createProjectSnapshot([
        file(String.raw`\newif\iflong\longtrue\input{x}\longfalse\input{x}`),
        file(String.raw`\iflong\begin{C}body\end{C}\fi`, 'x.tex'),
      ]),
      v = resolveProjectView(s, { entryPath: 'main.tex' }),
      n = env(v, 'C');
    expect(() => edit(v, [remove(v, n)])).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.EditConflict })
    );
    expect(output(edit(v, [remove(v, n)], 'artifact'))).toBe('');
    const partial = view(String.raw`\ifunknown text\fi`);
    expect(
      checkOperationCapability(partial, {
        operation: 'edit-nodes',
        options: { target: 'artifact', actions: [] },
      }).eligible
    ).toBe(false);
    expect(createProjectSourceIndex(partial).viewId).toBe(partial.id);
  });
  it('tracks protected regions in stored arguments without leaking their conditions', () => {
    const text = String.raw`\newcommand{\f}{\iftrue\begin{comment}body\end{comment}}\begin{comment}outside\end{comment}\iftrue\begin{comment}then\end{comment}\else\begin{comment}else\end{comment}\fi`;
    const inv = inspectProjectEnvironments(snapshot(text));
    expect(
      inv.environments.map((e) => [e.context.definitionBodies.length, e.context.branches.length])
    ).toEqual([
      [1, 1],
      [0, 0],
      [0, 1],
      [0, 1],
    ]);
    expect(inv.environments[3]!.context.branches[0]!.arm).toBe('else');
  });
  it('reports incomplete source coverage rather than claiming every environment was removed', () => {
    const s = snapshot(String.raw`\gdef\x{\begin{C}stored\end{C}}`);
    expect(() =>
      planTransformation(s, {
        operation: 'remove-environments',
        options: { target: 'source', names: ['C'] },
      })
    ).toThrow();
  });
  it('handles empty source/body and every range boundary', () => {
    const v = view(''),
      idx = createProjectSourceIndex(v);
    expect(v.root!.location).toEqual({ kind: 'none', primary: null, spans: [] });
    expect(sourceOffsetAt(idx, 'main.tex', 1)).toBe(0);
    expect(lookupProjectSource(idx, { path: 'main.tex', start: 0 })).toEqual([]);
    const e = env(view(String.raw`\begin{C}\end{C}`), 'C');
    if (e.kind === 'environment')
      expect(e.syntax.body!.range.end).toBe(e.syntax.body!.range.start - 1);
    expect(() => lookupProjectSource(idx, { path: 'main.tex', start: -1 })).toThrow();
    expect(() => lookupProjectSource(idx, { path: 'missing.tex', start: 0 })).toThrow();
  });
  it('filters repeated inclusion hits and indexes all disjoint origins separately', () => {
    const s = createProjectSnapshot([file(String.raw`\input{x}\input{x}`), file('{😀}', 'x.tex')]),
      v = resolveProjectView(s, { entryPath: 'main.tex' }),
      idx = createProjectSourceIndex(v);
    const hits = lookupProjectSource(idx, { path: 'x.tex', start: 1, end: 2, kinds: ['node'] });
    expect(
      hits.filter((h) => h.kind === 'node' && getSelectedNode(v, h.selection).kind === 'token')
    ).toHaveLength(2);
    const occurrenceId = v.occurrences[1]!.id;
    expect(
      lookupProjectSource(idx, { path: 'x.tex', start: 1, occurrenceId }).every(
        (h) => h.kind === 'node' && h.location.occurrenceId === occurrenceId
      )
    ).toBe(true);
  });
  it('permits precise renaming across different active bodies and files', () => {
    const s = createProjectSnapshot([
      file(String.raw`\newif\iflong\longtrue\input{x}\longfalse\input{x}`),
      file(String.raw`\begin{C}\iflong A\else B\fi\end{C}`, 'x.tex'),
    ]);
    const v = resolveProjectView(s, { entryPath: 'main.tex' }),
      a = env(v, 'C'),
      b = env(v, 'C', 1);
    const r = edit(v, [rename(v, a, 'D'), rename(v, b, 'D')]);
    expect(applyProjectEdits(s, r.editPlan!, v).files[1]!.source).toBe(
      String.raw`\begin{D}\iflong A\else B\fi\end{D}`
    );
    const cross = createProjectSnapshot([
      file(String.raw`\input{open}body\end{C}`),
      file(String.raw`\begin{C}`, 'open.tex'),
    ]);
    const cv = resolveProjectView(cross, { entryPath: 'main.tex' }),
      cn = env(cv, 'C');
    expect(edit(cv, [rename(cv, cn, 'D')]).editPlan!.edits).toHaveLength(2);
    expect(output(edit(cv, [wrap(cv, cn, 'outer')], 'artifact'))).toBe(
      String.raw`\begin{outer}\begin{C}body\end{C}\end{outer}`
    );
  });
  it('repairs lexical joins and wraps an EOF percent comment with a synthetic newline', () => {
    const v = view(String.raw`\alpha\begin{C}gone\end{C}beta`),
      n = env(v, 'C');
    expect(applied(v, edit(v, [remove(v, n)]))).toBe(String.raw`\alpha beta`);
    const c = view('%last'),
      comment = nodes(c).find((n) => n.kind === 'token')!;
    const expected = '\\begin{C}%last\n\\end{C}';
    expect(applied(c, edit(c, [wrap(c, comment, 'C')]))).toBe(expected);
    expect(output(edit(c, [wrap(c, comment, 'C')], 'artifact'))).toBe(expected);
  });
  it('removes complete opaque containers but rejects a stored interior', () => {
    const v = view(String.raw`\begin{C}\newcommand{\f}{stored}\end{C}`),
      n = env(v, 'C');
    expect(applied(v, edit(v, [remove(v, n)]))).toBe('');
    const stored = nodes(v).find((n) => n.kind === 'token' && n.token.value === 'stored')!;
    expect(() => edit(v, [remove(v, stored)])).toThrow();
  });
  it('preserves selected-node condition decisions and distinguishes a source prepass', () => {
    const text = String.raw`\newif\iflong\begin{C}\global\longtrue\end{C}\iflong YES\else NO\fi`,
      v = view(text),
      n = env(v, 'C');
    expect(output(edit(v, [remove(v, n)], 'artifact'))).toBe(' YES');
    const r = planTransformation(v.snapshot, {
      operation: 'remove-environments',
      options: { target: 'source', names: ['C'] },
    });
    const updated = applyProjectEdits(v.snapshot, r.editPlan!),
      after = resolveProjectView(updated, { entryPath: 'main.tex' });
    expect(
      output(planTransformation(after, { operation: 'materialize', options: { inputs: 'inline' } }))
    ).toBe(' NO');
    expect(() => edit(after, [remove(v, n)])).toThrow();
  });
  it('enforces inserted nesting and output bounds before producing output', () => {
    const s = snapshot('{A}'),
      v = resolveProjectView(s, { entryPath: 'main.tex', limits: { maxNesting: 1 } }),
      n = nodes(v).find((n) => n.kind === 'group')!;
    expect(() => edit(v, [wrap(v, n, 'C')])).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.OutputLimit })
    );
    const regular = view('{A}'),
      group = nodes(regular).find((n) => n.kind === 'group')!;
    for (const target of ['selected', 'artifact'] as const)
      expect(() =>
        planTransformation(regular, {
          operation: 'edit-nodes',
          options: { target, actions: [wrap(regular, group, 'C')], maxOutputCodeUnits: 3 },
        })
      ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OutputLimit }));
  });
});
