import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyProjectEdits,
  checkOperationCapability,
  createProjectSnapshot,
  indexProjectView,
  inspectProject,
  planTransformation,
  PrepTexErrorCode,
  ProjectOperationError,
  resolveProjectView,
  runAnalysis,
  updateProjectSnapshot,
  validateProjectEditPlan,
  walkConfiguredNodes,
  type ConditionPolicy,
  type ProjectEditPlan,
  type ProjectSnapshot,
  type ProjectView,
  type TransformationResult,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);
const view = (source: string, conditions?: ConditionPolicy) =>
  resolveProjectView(snapshot(source), {
    entryPath: 'main.tex',
    ...(conditions ? { conditions } : {}),
  });
function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}
function failure(fn: () => unknown, code: PrepTexErrorCode): void {
  try {
    fn();
    throw new Error('Expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectOperationError);
    if (error instanceof ProjectOperationError) expect(error.code).toBe(code);
  }
}
function frozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(frozen);
  }
}
const output = (result: TransformationResult, path = 'main.tex') =>
  result.artifacts.find((f) => f.path === path)!.source;
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/project-model/${name}.tex`, import.meta.url), 'utf8');

describe('C5 configured provenance and consumer reconstruction', () => {
  it('retains its original snapshot and rebuilds mutable transported views before analysis', () => {
    const source = snapshot(String.raw`\label{x}\ref{x}`);
    const configured = resolveProjectView(source, { entryPath: 'main.tex' });
    expect(configured.snapshot).toBe(source);
    const transported = structuredClone(configured);
    expect(runAnalysis(transported, { operation: 'references' })).toEqual(
      runAnalysis(configured, { operation: 'references' })
    );
    const forged = { ...transported, reachedFacts: [] };
    expect(runAnalysis(forged, { operation: 'references' }).references).toHaveLength(1);
  });
  it('keeps every origin for a selected environment and its emitted counterpart', () => {
    const source = createProjectSnapshot([
      file(fixture('F19-main')),
      file(fixture('F19-open'), 'F19-open.tex'),
    ]);
    const configured = resolveProjectView(source, { entryPath: 'main.tex' });
    ready(configured);
    const env = walkConfiguredNodes(configured.root).find((n) => n.kind === 'environment')!;
    expect(new Set(env.origins.map((o) => o.path)).size).toBe(2);
    const result = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'inline' },
    });
    expect(output(result)).not.toContain('hidden');
    expect(output(result)).not.toContain('\\ifdraft');
    ready(view(output(result)));
  });
});

describe('C6 reference analysis', () => {
  it.each([true, false])('F15 counts only selected mutually exclusive labels (%s)', (draft) => {
    const configured = view(String.raw`\ifdraft\label{x}\else\label{x}\fi\ref{x}`, {
      mode: 'manual',
      values: { draft },
    });
    const result = runAnalysis(configured, { operation: 'references' });
    expect(result.references.map((r) => r.status)).toEqual(['matched']);
    expect(result.findings).toEqual([]);
    expect(inspectProject(configured.snapshot, { kinds: ['label'] }).facts).toHaveLength(2);
  });
  it('F16 indexes execution order across inputs and identifies forward references as informational', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\ref{x}\input{part}\ref{x}`),
        file(String.raw`\label{x}`, 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    const result = runAnalysis(configured, { operation: 'references' });
    expect(result.references.map((r) => r.forward)).toEqual([true, false]);
    expect(result.findings.map((f) => [f.code, f.severity])).toEqual([
      ['forward-reference', 'information'],
    ]);
    expect(result.findings[0]!.related[0]!.path).toBe('part.tex');
    const index = indexProjectView(configured);
    expect(
      index.entries
        .filter((e) => e.fact.kind === 'label' || e.fact.kind === 'reference')
        .map((e) => e.fact.kind)
    ).toEqual(['reference', 'label', 'reference']);
    frozen(index);
  });
  it('distinguishes matched, missing, duplicate and generated keys', () => {
    const result = runAnalysis(
      view(String.raw`\label{x}\label{x}\ref{x}\ref{missing}\ref{\generated}\label{\dynamic}`),
      { operation: 'references' }
    );
    expect(result.references.map((r) => r.status)).toEqual(['duplicate', 'missing', 'unresolved']);
    expect(result.references[0]!.targets).toHaveLength(2);
    expect(result.findings.map((f) => f.code)).toContain('duplicate-label');
    expect(result.coverage.status).toBe('partial');
  });
  it('F17 keeps uncalled body labels out of the reached index and explains expansion limits', () => {
    const configured = view(String.raw`\newcommand{\stored}{\label{body}}\ref{body}`);
    const result = runAnalysis(configured, { operation: 'references' });
    expect(result.references[0]!.targets).toEqual([]);
    expect(result.coverage.issues.some((i) => i.code === 'opaque-region')).toBe(true);
    expect(result.findings[0]!.message).toContain('recognized');
  });
  it('requires explicit incomplete analysis and does not certify missing targets beyond its stop boundary', () => {
    const configured = view(String.raw`\ref{x}\ifunknown\label{x}\fi`);
    failure(
      () => runAnalysis(configured, { operation: 'references' }),
      PrepTexErrorCode.OperationUnavailable
    );
    const result = runAnalysis(configured, {
      operation: 'references',
      options: { allowIncomplete: true },
    });
    expect(result.references[0]!.status).toBe('unknown-coverage');
    expect(result.findings).toEqual([]);
    expect(result.coverage.status).toBe('partial');
    expect(
      checkOperationCapability(configured, {
        operation: 'references',
        options: { allowIncomplete: true },
      }).eligible
    ).toBe(true);
  });
  it('counts repeated input labels as distinct reached declarations', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\input{part}\input{part}\ref{x}`),
        file(String.raw`\label{x}`, 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    const result = runAnalysis(configured, { operation: 'references' });
    expect(result.references[0]!.targets.map((o) => o.occurrenceId)).toEqual(['i1', 'i2']);
  });
  it('validates operation/model combinations and does not create artifacts', () => {
    failure(
      () => runAnalysis(snapshot(''), { operation: 'references' }),
      PrepTexErrorCode.OperationUnavailable
    );
    expect(() =>
      runAnalysis(view(''), {
        operation: 'references',
        options: { allowIncomplete: null },
      } as never)
    ).toThrow();
    failure(
      () =>
        runAnalysis(view(''), {
          operation: 'references',
          options: { scope: { kind: 'all-files' } },
        }),
      PrepTexErrorCode.OperationUnavailable
    );
    expect('artifacts' in runAnalysis(view(''), { operation: 'references' })).toBe(false);
  });
});

describe('C6 conservative source command evidence', () => {
  it('retains configured scope ambiguity and separately counts uncalled body references', () => {
    const configured = view(String.raw`{\def\local{}}\def\target{}\def\caller{\target}`);
    ready(configured);
    const result = runAnalysis(configured, { operation: 'unused-commands' });
    expect(result.commands.map((command) => [command.name, command.classification])).toEqual([
      ['local', 'ambiguous-binding'],
      ['target', 'body-referenced'],
      ['caller', 'no-recognized-use'],
    ]);
    expect(result.commands[1]!.bodyReferences[0]!.occurrenceId).toBe('i0');
  });
  it.each([
    String.raw`{\def\local{}}\local`,
    String.raw`\begin{example}\def\local{}\end{example}\local`,
    String.raw`\local\def\local{}`,
    String.raw`\def\local{}\opaque{\local}`,
  ])('reports ambiguous source bindings without choosing a definition: %s', (text) => {
    expect(
      runAnalysis(snapshot(text), { operation: 'unused-commands' }).commands[0]!.classification
    ).toBe('ambiguous-binding');
  });
  it('does not assign execution order across independent source files', () => {
    const source = createProjectSnapshot([
      file(String.raw`\def\local{}`),
      file(String.raw`\local`, 'use.tex'),
    ]);
    expect(runAnalysis(source, { operation: 'unused-commands' }).commands[0]!.classification).toBe(
      'ambiguous-binding'
    );
  });
  it('F18 distinguishes direct, body, self-recursive, unused and redefined commands', () => {
    const source = snapshot(
      String.raw`\newcommand{\used}{}\used\def\bodyOnly{}\def\caller{\bodyOnly}\def\self{\self}\def\unused{}\def\again{}\def\again{new}`
    );
    const result = runAnalysis(source, { operation: 'unused-commands' });
    expect(result.commands.map((c) => [c.name, c.classification])).toEqual([
      ['used', 'directly-used'],
      ['bodyOnly', 'body-referenced'],
      ['caller', 'no-recognized-use'],
      ['self', 'self-recursive-only'],
      ['unused', 'no-recognized-use'],
      ['again', 'ambiguous-binding'],
      ['again', 'ambiguous-binding'],
    ]);
    expect(result.commands.find((c) => c.name === 'self')!.directUses).toEqual([]);
    expect(result.commands.find((c) => c.name === 'self')!.selfReferences).toHaveLength(1);
    expect(result.findings.every((f) => f.severity === 'information')).toBe(true);
    expect(result.findings.every((f) => f.primary.occurrenceId === null)).toBe(true);
  });
  it('does not infer absence of dynamically hidden commands and keeps explicit scope in result keys', () => {
    const source = createProjectSnapshot([
      file(String.raw`\def\foo{}\edef\dynamic{\csname foo\endcsname}`),
      file(String.raw`\def\bar{}`, 'other.tex'),
    ]);
    const all = runAnalysis(source, { operation: 'unused-commands' });
    const one = runAnalysis(source, {
      operation: 'unused-commands',
      options: { scope: { kind: 'files', paths: ['other.tex'] } },
    });
    expect(all.coverage.status).toBe('partial');
    expect(one.commands.map((c) => c.name)).toEqual(['bar']);
    expect(one.resultId).not.toBe(all.resultId);
    frozen(one);
    expect(structuredClone(one)).toEqual(one);
  });
});

describe('C7 source edits, exact previews, atomic application', () => {
  it('locates insertion conflicts on their original line', () => {
    const configured = view('first\nsecond');
    const preview = planTransformation(configured, {
      operation: 'suppress-comments',
      options: { target: 'selected' },
    });
    try {
      applyProjectEdits(
        configured.snapshot,
        {
          ...preview.editPlan!,
          edits: [{ kind: 'insert', path: 'main.tex', offset: 6, text: 'X' }],
        },
        configured
      );
      throw new Error('Expected a boundary conflict');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProjectOperationError);
      if (error instanceof ProjectOperationError)
        expect(error.failure.locations[0]!.range).toEqual({ start: 6, end: 5, line: 2 });
    }
  });
  it('reports literal, ambiguous, dynamic and invalid preserved dependencies', () => {
    const source = createProjectSnapshot([
      file(String.raw`\input{both}\input{missing}\input{\dynamic}\input{../escape}`),
      file('', 'both'),
      file('', 'both.tex'),
    ]);
    const result = planTransformation(source, {
      operation: 'identity',
      options: { target: 'source' },
    });
    expect(result.dependencies.map((d) => d.status)).toEqual([
      'ambiguous',
      'missing',
      'dynamic',
      'invalid-path',
    ]);
  });
  it('validates output bounds again when applying a modified proposal', () => {
    const source = snapshot('A%comment\n');
    const preview = planTransformation(source, {
      operation: 'suppress-comments',
      options: { target: 'source', maxOutputCodeUnits: 10 },
    });
    const edit = preview.editPlan!.edits[0]!;
    expect(edit.kind).toBe('replace');
    if (edit.kind !== 'replace') return;
    failure(
      () =>
        applyProjectEdits(source, {
          ...preview.editPlan!,
          edits: [{ ...edit, replacement: 'x'.repeat(20) }],
        }),
      PrepTexErrorCode.OutputLimit
    );
    expect(source.files[0]!.source).toBe('A%comment\n');
  });
  it('bounds source preview output and includes the limit in result identity', () => {
    const source = snapshot('abc');
    failure(
      () =>
        planTransformation(source, {
          operation: 'identity',
          options: { target: 'source', maxOutputCodeUnits: 2 },
        }),
      PrepTexErrorCode.OutputLimit
    );
    const request = {
      operation: 'identity',
      options: { target: 'source', maxOutputCodeUnits: 3 },
    } as const;
    expect(output(planTransformation(source, request))).toBe('abc');
    expect(planTransformation(source, request).resultId).not.toBe(
      planTransformation(source, { operation: 'identity', options: { target: 'source' } }).resultId
    );
  });
  it.each([
    '',
    '😀\r\nA\rB\n  ',
    String.raw`\iffalse % inactive\fi`,
    String.raw`\verb|% retained|`,
  ])('F01 identity is exact for every source string %j', (text) => {
    const source = snapshot(text);
    const result = planTransformation(source, {
      operation: 'identity',
      options: { target: 'source' },
    });
    expect(output(result)).toBe(text);
    expect(result.editPlan!.edits).toEqual([]);
    expect(applyProjectEdits(source, result.editPlan!)).toBe(source);
  });
  it.each([
    ['A% comment\nB', 'AB'],
    ['A% comment\r\n  B', 'AB'],
    ['\\relax% comment\nabc', '\\relax abc'],
    ['\\relax% one\n% two\nabc', '\\relax abc'],
    ['\\\\relax% comment\nabc', '\\\\relaxabc'],
    ['\\verb|%keep|% remove\nB', '\\verb|%keep|B'],
  ])(
    'F25 preserves lexical meaning and exact preview/application equality: %j',
    (text, expected) => {
      const source = snapshot(text);
      const result = planTransformation(source, {
        operation: 'suppress-comments',
        options: { target: 'source' },
      });
      expect(output(result)).toBe(expected);
      const applied = applyProjectEdits(source, result.editPlan!);
      expect(applied.files[0]!.source).toBe(expected);
      expect(source.files[0]!.source).toBe(text);
      expect(applied.files[0]!.version).toBe(2);
    }
  );
  it('preserves every inactive slice, wrapper, declaration, setter and stored body in active-path previews', () => {
    const text =
      '\\newif\\ifdraft\n\\def\\body{% stored\n}\n\\ifdraft% inactive\nX\\else A% active\nB\\fi';
    const configured = view(text);
    ready(configured);
    const result = planTransformation(configured, {
      operation: 'suppress-comments',
      options: { target: 'selected' },
    });
    const expected = text.replace('A% active\nB', 'AB');
    expect(output(result)).toBe(expected);
    expect(
      applyProjectEdits(configured.snapshot, result.editPlan!, configured).files[0]!.source
    ).toBe(expected);
    frozen(result);
  });
  it('F20/F21 rejects changed-source and changed-view proposals atomically', () => {
    const source = snapshot('%remove\nX');
    const plan = planTransformation(source, {
      operation: 'suppress-comments',
      options: { target: 'source' },
    }).editPlan!;
    const changed = updateProjectSnapshot(source, [
      { kind: 'upsert', file: file('changed', 'main.tex', 2) },
    ]);
    failure(() => applyProjectEdits(changed, plan), PrepTexErrorCode.StaleResult);
    const a = view('%remove\nX');
    const active = planTransformation(a, {
      operation: 'suppress-comments',
      options: { target: 'selected' },
    }).editPlan!;
    const b = resolveProjectView(a.snapshot, {
      entryPath: 'main.tex',
      conditions: { mode: 'manual', values: {} },
    });
    failure(() => applyProjectEdits(a.snapshot, active, b), PrepTexErrorCode.StaleResult);
  });
  it('rejects overlapping, out-of-range, expected-content and scope violations with structured failures', () => {
    const source = snapshot('A%comment\nB');
    const plan = planTransformation(source, {
      operation: 'suppress-comments',
      options: { target: 'source' },
    }).editPlan!;
    failure(
      () => applyProjectEdits(source, { ...plan, edits: [...plan.edits, ...plan.edits] }),
      PrepTexErrorCode.InvalidEdit
    );
    failure(
      () =>
        applyProjectEdits(source, {
          ...plan,
          edits: [
            {
              kind: 'replace',
              path: 'main.tex',
              range: { start: 0, end: 500, line: 1 },
              expected: source.files[0]!.source,
              replacement: '',
            },
          ],
        }),
      PrepTexErrorCode.InvalidEdit
    );
    expect(source.files[0]!.source).toBe('A%comment\nB');
  });
  it('F11/F26 rejects a physical slice that is active in one inclusion and inactive in another', () => {
    const source = createProjectSnapshot([
      file(String.raw`\newif\ifdraft\drafttrue\input{part}\draftfalse\input{part}`),
      file('\\ifdraft A%comment\nB\\else C\\fi', 'part.tex'),
    ]);
    const configured = resolveProjectView(source, { entryPath: 'main.tex' });
    ready(configured);
    failure(
      () =>
        planTransformation(configured, {
          operation: 'suppress-comments',
          options: { target: 'selected' },
        }),
      PrepTexErrorCode.EditConflict
    );
    const exported = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'inline', suppressComments: true },
    });
    expect(output(exported)).toContain('AB');
    expect(output(exported)).toContain(' C');
  });
  it('deduplicates compatible repeated occurrence edits', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\input{part}\input{part}`),
        file('A%comment\nB', 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    const result = planTransformation(configured, {
      operation: 'suppress-comments',
      options: { target: 'selected' },
    });
    expect(result.editPlan!.edits).toHaveLength(1);
    expect(output(result, 'part.tex')).toBe('AB');
  });
  it('rejects bounding-range rewrites spanning omitted or protected source', () => {
    const configured = view(String.raw`\iftrue A\else inactive\fi B`);
    ready(configured);
    const plan: ProjectEditPlan = {
      kind: 'edits',
      provenance: {
        snapshotId: configured.snapshotId,
        viewId: configured.id,
        request: { operation: 'suppress-comments', options: { target: 'selected' } },
        operationVersion: 1,
      },
      edits: [
        {
          kind: 'replace',
          path: 'main.tex',
          range: { start: 8, end: 27, line: 1 },
          expected: configured.snapshot.files[0]!.source.slice(8, 28),
          replacement: 'X',
        },
      ],
    };
    expect(() => validateProjectEditPlan(configured.snapshot, plan, configured)).toThrow();
  });
});

describe('C7 configured export and source mappings', () => {
  it('preserves all occurrence origins for identical shared-file output', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{part}\input{part}`), file('same', 'part.tex')]),
      { entryPath: 'main.tex' }
    );
    const result = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'preserve' },
    });
    const shared = result.artifacts.find((f) => f.path === 'part.tex')!;
    expect(
      shared.origins.flatMap((m) =>
        m.kind === 'source' ? m.origins.map((o) => o.occurrenceId) : []
      )
    ).toEqual(['i1', 'i2']);
  });
  it('rejects inlining that would change a retained input directory', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\input{sub/part}`),
        file(String.raw`\iffalse\input{other}\fi`, 'sub/part.tex'),
        file('other', 'sub/other.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    failure(
      () =>
        planTransformation(configured, {
          operation: 'export-project',
          options: { conditions: 'preserve', inputs: 'inline' },
        }),
      PrepTexErrorCode.EditConflict
    );
    const result = planTransformation(configured, {
      operation: 'export-project',
      options: { conditions: 'preserve', inputs: 'preserve' },
    });
    expect(result.dependencies.find((d) => d.reference === 'other')!.targetPath).toBe(
      'sub/other.tex'
    );
    expect(
      output(
        planTransformation(configured, { operation: 'materialize', options: { inputs: 'inline' } })
      )
    ).toBe('');
  });
  it.each([true, false])(
    'F02 materializes and reparses the selected list for draft=%s',
    (draft) => {
      const configured = view(fixture('F02-crossing-environments'), {
        mode: 'source-with-overrides',
        overrides: { draft },
      });
      const result = planTransformation(configured, {
        operation: 'materialize',
        options: { inputs: 'inline' },
      });
      const parsed = view(output(result));
      ready(parsed);
      expect(
        walkConfiguredNodes(parsed.root)
          .filter((n) => n.kind === 'environment')
          .map((n) => n.kind === 'environment' && n.name)
      ).toEqual([draft ? 'itemize' : 'enumerate']);
      expect(output(result)).not.toMatch(/\\(?:newif|ifdraft|drafttrue|else|fi)/);
      expect(result.entryPath).toBe('main.tex');
    }
  );
  it.each([
    [String.raw`\iftrue\relax\fi abc`, '\\relax abc'],
    [String.raw`\iftrue$\fi\iftrue$\fi`, '${}$'],
  ])('F29 preserves token boundaries when condition syntax disappears: %s', (text, expected) => {
    expect(
      output(
        planTransformation(view(text), { operation: 'materialize', options: { inputs: 'inline' } })
      )
    ).toBe(expected);
  });
  it('F29 preserves input/EOF comment boundaries using explicitly synthetic mappings', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\input{part}abc`),
        file(String.raw`\relax`, 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    const result = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'inline' },
    });
    expect(output(result)).toBe('\\relax abc');
    expect(result.artifacts[0]!.origins.some((o) => o.kind === 'synthetic')).toBe(true);
    const commentView = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{part}abc`), file('%EOF', 'part.tex')]),
      { entryPath: 'main.tex' }
    );
    expect(
      output(
        planTransformation(commentView, { operation: 'materialize', options: { inputs: 'inline' } })
      )
    ).toBe('%EOF\nabc');
  });
  it('F28 preserves inactive inputs and declares partially expanded output dependencies', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\iftrue\input{part}\else\input{missing}\fi`),
        file('ACTIVE', 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    const result = planTransformation(configured, {
      operation: 'export-project',
      options: { conditions: 'preserve', inputs: 'inline' },
    });
    expect(output(result)).toBe(String.raw`\iftrue ACTIVE\else\input{missing}\fi`);
    expect(result.artifacts[0]!.topology).toBe('active-inputs-expanded');
    expect(result.dependencies.map((d) => [d.reference, d.status])).toEqual([
      ['missing', 'missing'],
    ]);
  });
  it('retains relative filenames and validates literal output relationships', () => {
    const source = createProjectSnapshot([
      file(String.raw`\input{dir/part}`),
      file(String.raw`\input{../leaf}`, 'dir/part.tex'),
      file('leaf', 'leaf.tex'),
    ]);
    const result = planTransformation(resolveProjectView(source, { entryPath: 'main.tex' }), {
      operation: 'materialize',
      options: { inputs: 'preserve' },
    });
    expect(result.artifacts.map((f) => f.path)).toEqual(['dir/part.tex', 'leaf.tex', 'main.tex']);
    expect(result.dependencies.every((d) => d.status === 'present')).toBe(true);
    expect(output(result)).toBe(String.raw`\input{dir/part}`);
    expect(output(result, 'dir/part.tex')).toBe(String.raw`\input{../leaf}`);
  });
  it('rejects conflicting shared-file materializations but permits per-occurrence inlining', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\newif\ifdraft\input{part}\drafttrue\input{part}`),
        file(String.raw`\ifdraft T\else F\fi`, 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    failure(
      () =>
        planTransformation(configured, {
          operation: 'materialize',
          options: { inputs: 'preserve' },
        }),
      PrepTexErrorCode.EditConflict
    );
    expect(
      output(
        planTransformation(configured, { operation: 'materialize', options: { inputs: 'inline' } })
      )
    ).toBe(' F T');
  });
  it('retains boolean scaffolding when a stored consumer could need it', () => {
    const configured = view(
      String.raw`\newif\ifdraft\def\stored{\ifdraft X\fi}\ifdraft A\else B\fi`
    );
    const result = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'inline' },
    });
    expect(output(result)).toContain('\\newif\\ifdraft');
    expect(output(result)).toContain('\\def\\stored{\\ifdraft X\\fi}');
    expect(result.coverage.issues.some((i) => i.message.includes('scaffolding'))).toBe(true);
  });
  it('makes every copied mapping exact for Unicode, CRLF, and disjoint input spans', () => {
    const configured = resolveProjectView(
      createProjectSnapshot([file('😀\r\n\\input{part}\iftrue X\fi'), file('PART', 'part.tex')]),
      { entryPath: 'main.tex' }
    );
    const result = planTransformation(configured, {
      operation: 'materialize',
      options: { inputs: 'inline' },
    });
    const artifact = result.artifacts[0]!;
    let end = -1;
    for (const map of artifact.origins) {
      expect(map.outputRange.start).toBe(end + 1);
      end = map.outputRange.end;
      if (map.kind === 'source') {
        const sourceText = map.origins
          .map((o) =>
            configured.snapshot.files
              .find((f) => f.path === o.path)!
              .source.slice(o.range.start, o.range.end + 1)
          )
          .join('');
        expect(artifact.source.slice(map.outputRange.start, map.outputRange.end + 1)).toBe(
          sourceText
        );
      }
    }
    expect(end).toBe(artifact.source.length - 1);
  });
  it('bounds expanded inactive source and total multi-file output before returning artifacts', () => {
    const configured = view(String.raw`\iffalse INACTIVE-LONG-TEXT\else X\fi`);
    failure(
      () =>
        planTransformation(configured, {
          operation: 'export-project',
          options: { conditions: 'preserve', inputs: 'inline', maxOutputCodeUnits: 5 },
        }),
      PrepTexErrorCode.OutputLimit
    );
    const multi = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{part}`), file('TEXT', 'part.tex')]),
      { entryPath: 'main.tex' }
    );
    failure(
      () =>
        planTransformation(multi, {
          operation: 'materialize',
          options: { inputs: 'preserve', maxOutputCodeUnits: 13 },
        }),
      PrepTexErrorCode.OutputLimit
    );
  });
});

describe('C8 source reuse, invalidation and independent result identities', () => {
  it('reuses unchanged scans and agrees with a clean rebuild after an atomic update/delete', () => {
    const base = createProjectSnapshot([file('A'), file('B', 'b.tex'), file('C', 'c.tex')]);
    const next = updateProjectSnapshot(base, [
      { kind: 'upsert', file: file('changed', 'b.tex', 2) },
      { kind: 'remove', path: 'c.tex' },
    ]);
    expect(next.files.find((f) => f.path === 'main.tex')).toBe(
      base.files.find((f) => f.path === 'main.tex')
    );
    expect(next).toEqual(createProjectSnapshot([file('A'), file('changed', 'b.tex', 2)]));
    expect(resolveProjectView(next, { entryPath: 'main.tex' }).snapshot).toBe(next);
  });
  it('reuses token/fact data on revision-only changes but invalidates content/configuration keys', () => {
    const base = snapshot('A');
    const next = updateProjectSnapshot(base, [{ kind: 'upsert', file: file('A', 'main.tex', 2) }]);
    expect(next.files[0]!.tokens).toBe(base.files[0]!.tokens);
    expect(next.files[0]!.facts).toBe(base.files[0]!.facts);
    expect(next.id).not.toBe(base.id);
    expect(resolveProjectView(next, { entryPath: 'main.tex' }).id).not.toBe(
      resolveProjectView(base, { entryPath: 'main.tex' }).id
    );
  });
  it('scan settings invalidate scans and equivalent settings preserve identity', () => {
    const base = snapshot(String.raw`\begin{code}\label{x}\end{code}`);
    const next = updateProjectSnapshot(base, [], { verbatimEnvironments: ['code'] });
    expect(next.files[0]).not.toBe(base.files[0]);
    expect(inspectProject(next).facts).toEqual([]);
    expect(updateProjectSnapshot(next, [], { verbatimEnvironments: ['code', 'code'] })).toBe(next);
    expect(next).toEqual(
      createProjectSnapshot([file(base.files[0]!.source)], { verbatimEnvironments: ['code'] })
    );
  });
  it('F22 an input setter change invalidates later caller analysis and output', () => {
    const base = createProjectSnapshot([
      file(String.raw`\newif\ifdraft\input{setup}\ifdraft\label{x}\fi\ref{x}`),
      file(String.raw`\draftfalse`, 'setup.tex'),
    ]);
    const next = updateProjectSnapshot(base, [
      { kind: 'upsert', file: file(String.raw`\drafttrue`, 'setup.tex', 2) },
    ]);
    const a = runAnalysis(resolveProjectView(base, { entryPath: 'main.tex' }), {
      operation: 'references',
    });
    const b = runAnalysis(resolveProjectView(next, { entryPath: 'main.tex' }), {
      operation: 'references',
    });
    expect(a.references[0]!.status).toBe('missing');
    expect(b.references[0]!.status).toBe('matched');
    expect(a.resultId).not.toBe(b.resultId);
  });
  it('keeps semantically equivalent result identities stable across transport and option order', () => {
    const source = snapshot(String.raw`\label{x}\ref{x}`);
    const configured = resolveProjectView(source, { entryPath: 'main.tex' });
    const a = runAnalysis(configured, { operation: 'references' });
    const b = runAnalysis(structuredClone(configured), {
      operation: 'references',
      options: { allowIncomplete: false },
    });
    expect(a.resultId).toBe(b.resultId);
    expect(inspectProject(source).snapshotId).toBe(source.id);
    expect(
      planTransformation(configured, { operation: 'materialize', options: { inputs: 'inline' } })
        .resultId
    ).not.toBe(
      planTransformation(configured, { operation: 'materialize', options: { inputs: 'preserve' } })
        .resultId
    );
  });
});
