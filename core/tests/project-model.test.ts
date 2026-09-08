import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkOperationCapability,
  createProjectSnapshot,
  inspectProject,
  InputHandlingMode,
  isConfiguredContainerNode,
  parseProject,
  PrepTexError,
  projectOperations,
  resolveProjectView,
  serializeDocument,
  transformProject,
  updateProjectSnapshot,
  validateProjectEditPlan,
  walkConfiguredNodes,
  type ConditionPolicy,
  type ProjectEdit,
  type ProjectEditPlan,
  type ProjectSnapshot,
  type ProjectView,
  type SourceFile,
  type ViewConfiguration,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1): SourceFile => ({
  path,
  source,
  version,
});
const snapshot = (source: string) => createProjectSnapshot([file(source)]);
const resolve = (source: string, conditions?: ConditionPolicy) =>
  resolveProjectView(snapshot(source), {
    entryPath: 'main.tex',
    ...(conditions ? { conditions } : {}),
  });
const selected = (view: ProjectView) => view.selectedTokens.map((t) => t.token.value).join('');
const outcomes = (view: ProjectView) => view.decisions.map((d) => d.outcome);
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/project-model/${name}.tex`, import.meta.url), 'utf8');
function ready(view: ProjectView): asserts view is ProjectView & { status: 'ready' } {
  expect(view.status, view.status === 'ready' ? '' : JSON.stringify(view.reason)).toBe('ready');
}
function failure(view: ProjectView, status: 'incomplete' | 'blocked', code: string): void {
  expect(view.status).toBe(status);
  if (view.status !== 'ready') expect(view.reason.code).toBe(code);
  expect(view.root).toBeNull();
  expect(view.coverage.status).toBe('partial');
}
function allFrozen(value: unknown): void {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(allFrozen);
  }
}

describe('C1/C2: source authority and runtime contracts', () => {
  it.each([
    '',
    '😀 \\% text% comment\r\nend  ',
    'A\nB\rC\r\nD',
    '\ud800x\udfff',
    '\\',
    '{fragment',
    '\\begin{list}',
    '\\ifdraft open',
  ])('F01 lossless independent source: %j', (source) => {
    const model = snapshot(source);
    expect(model.files[0]?.source).toBe(source);
    expect(model.files[0]?.tokens.map((t) => t.value).join('')).toBe(source);
    let offset = 0;
    for (const token of model.files[0]!.tokens) {
      expect(token.range.start).toBe(offset);
      expect(source.slice(token.range.start, token.range.end + 1)).toBe(token.value);
      offset = token.range.end + 1;
    }
    expect(offset).toBe(source.length);
  });

  it('locates UTF-16 facts across CR/LF/CRLF with exact originals', () => {
    const source = '😀\r\n\\label{a}\r\\ref{b}\n\\label{c}';
    const facts = inspectProject(snapshot(source), { kinds: ['label', 'reference'] }).facts;
    expect(facts.map((f) => [f.range.start, f.range.line])).toEqual([
      [4, 2],
      [14, 3],
      [22, 4],
    ]);
    expect(facts.map((f) => source.slice(f.range.start, f.range.end + 1))).toEqual([
      '\\label{a}',
      '\\ref{b}',
      '\\label{c}',
    ]);
  });

  it('is deterministic, deeply frozen, transport-safe, and does not freeze caller input', () => {
    const inputs = [file('Hello'), file('Other', 'z.tex')];
    const a = createProjectSnapshot(inputs);
    const b = createProjectSnapshot([...inputs].reverse());
    expect(a).toEqual(b);
    expect(Object.isFrozen(inputs[0])).toBe(false);
    allFrozen(a);
    expect(inspectProject(structuredClone(a))).toEqual(inspectProject(a));
    allFrozen(inspectProject(a));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('F20/F21 identities include content, revision, options, entry, traversal and every semantic condition setting', () => {
    const base = snapshot('x');
    expect(snapshot('y').id).not.toBe(base.id);
    expect(createProjectSnapshot([file('x', 'main.tex', 2)]).id).not.toBe(base.id);
    expect(createProjectSnapshot([file('x')], { maxNesting: 32 }).id).not.toBe(base.id);
    const a = resolveProjectView(base, {
      entryPath: 'main.tex',
      conditions: { mode: 'manual', values: { z: true, a: false } },
    });
    const b = resolveProjectView(base, {
      entryPath: './main.tex',
      traversal: 'project',
      conditions: { mode: 'manual', values: { a: false, z: true } },
    });
    expect(a.id).toBe(b.id);
    expect(resolveProjectView(base, { entryPath: 'main.tex', traversal: 'file-only' }).id).not.toBe(
      a.id
    );
    expect(resolveProjectView(base, { entryPath: 'other.tex' }).id).not.toBe(a.id);
    expect(
      resolveProjectView(base, { entryPath: 'main.tex', limits: { maxOccurrences: 5 } }).id
    ).not.toBe(resolveProjectView(base, { entryPath: 'main.tex' }).id);
    const changed = { ...base, files: [{ ...base.files[0]!, source: 'y' }] };
    expect(() => inspectProject(changed)).toThrow(/identity/);
  });

  it('F22 atomically updates and removes sources, rejecting same-revision conflicts and old revisions', () => {
    const base = createProjectSnapshot([file('a'), file('b', 'b.tex')]);
    expect(() => updateProjectSnapshot(base, [{ kind: 'upsert', file: file('changed') }])).toThrow(
      /revision/
    );
    expect(() =>
      updateProjectSnapshot(base, [{ kind: 'upsert', file: file('a', 'main.tex', 0) }])
    ).toThrow(/revision/);
    const result = updateProjectSnapshot(base, [
      { kind: 'remove', path: 'b.tex' },
      { kind: 'upsert', file: file('c', 'main.tex', 2) },
    ]);
    expect(result).toEqual(createProjectSnapshot([file('c', 'main.tex', 2)]));
    expect(base.files).toHaveLength(2);
    expect(() =>
      updateProjectSnapshot(base, [
        { kind: 'remove', path: 'b.tex' },
        { kind: 'remove', path: 'missing.tex' },
      ])
    ).toThrow();
    expect(base.files).toHaveLength(2);
  });

  it.each([
    null,
    { mode: 'bad' },
    { mode: 'manual', values: { draft: 1 } },
    { mode: 'manual', values: [] },
    { mode: 'manual', values: { num: true } },
    { mode: 'manual', values: { true: false } },
    { mode: 'source', overrides: {} },
  ])('rejects malformed condition policies %j', (conditions) => {
    expect(() =>
      resolveProjectView(snapshot(''), { entryPath: 'main.tex', conditions } as ViewConfiguration)
    ).toThrow(PrepTexError);
  });

  it.each([
    null,
    { traversal: 'flatten' },
    { profile: 'tex' },
    { limits: { maxInputDepth: 0 } },
    { outputName: 'out.tex' },
  ])('rejects unsupported configuration fields %j', (opts) => {
    expect(() =>
      resolveProjectView(
        snapshot(''),
        opts === null
          ? (null as unknown as ViewConfiguration)
          : ({ entryPath: 'main.tex', ...opts } as ViewConfiguration)
      )
    ).toThrow(PrepTexError);
  });

  it('localizes malformed protected source while healthy source inspection remains complete', () => {
    const project = createProjectSnapshot([
      file('\\label{healthy}'),
      file('\\begin{verbatim}\\label{hidden}', 'bad.tex'),
    ]);
    expect(
      inspectProject(project, { scope: { kind: 'files', paths: ['main.tex'] } }).coverage.status
    ).toBe('complete');
    expect(inspectProject(project).coverage.status).toBe('partial');
    expect(inspectProject(project, { kinds: ['label'] }).facts).toHaveLength(1);
    ready(resolveProjectView(project, { entryPath: 'main.tex' }));
  });
});

describe('C3: inventories and recognition evidence', () => {
  it('F02 imports crossing environments without imposing an all-branches structural AST', () => {
    const model = snapshot(fixture('F02-crossing-environments'));
    expect(model.files[0]!.coverage.status).toBe('complete');
    expect(inspectProject(model, { kinds: ['condition-test'] }).facts).toHaveLength(2);
  });

  it('F06 ignores comments/verbatim and records uncalled body syntax only as source facts', () => {
    const model = snapshot(fixture('F06-protected-source'));
    const labels = inspectProject(model, { kinds: ['label'] }).facts;
    expect(labels).toHaveLength(1);
    expect(labels[0]!.context.definitionBodies).toHaveLength(1);
    const view = resolveProjectView(model, { entryPath: 'main.tex' });
    ready(view);
    expect(outcomes(view)).toEqual(['false']);
    expect(
      view.reachedFacts.filter(
        (f) =>
          f.fact.kind === 'label' ||
          f.fact.kind === 'input' ||
          f.fact.kind === 'condition-assignment'
      )
    ).toHaveLength(0);
  });

  it('F15 inventories both branches with exact source and definition-body contexts', () => {
    const source = String.raw`\newif\ifdraft\ifdraft\label{x}\else\label{x}\fi\def\foo#1{\label{body}\ref{#1}}`;
    const facts = inspectProject(snapshot(source), { kinds: ['label', 'reference'] }).facts;
    expect(
      facts.filter((f) => f.kind === 'label').map((f) => f.context.branches.map((b) => b.arm))
    ).toEqual([['then'], ['else'], []]);
    expect(facts[2]!.context.definitionBodies).toHaveLength(1);
    const ref = facts.find((f) => f.kind === 'reference');
    expect(ref?.kind === 'reference' && ref.key.kind).toBe('unresolved');
  });

  it.each(['newcommand', 'renewcommand', 'providecommand'])(
    'recognizes starred/optional %s without counting its target as a use',
    (form) => {
      const source = `\\${form}*{\\foo}[2][default]{\\bar{#1} #2}\\foo`;
      const facts = inspectProject(snapshot(source)).facts;
      const def = facts.find((f) => f.kind === 'definition');
      expect(def?.kind === 'definition' && [def.name, def.starred, def.arguments.length]).toEqual([
        'foo',
        true,
        2,
      ]);
      expect(facts.filter((f) => f.kind === 'command-use' && f.name === 'foo')).toHaveLength(1);
      expect(
        facts.find((f) => f.kind === 'command-use' && f.name === 'bar')?.context.definitionBodies
      ).toHaveLength(1);
    }
  );

  it('records unsupported definitions without inventing body execution or complete coverage', () => {
    const result = inspectProject(
      snapshot(String.raw`\NewDocumentCommand{\foo}{m}{\label{hidden}}`)
    );
    expect(result.facts.filter((f) => f.kind === 'definition')).toHaveLength(1);
    expect(result.facts.filter((f) => f.kind === 'label')).toHaveLength(0);
    expect(result.coverage.status).toBe('partial');
  });

  it('F13 ordinary if-prefixed command grammars do not create fi nesting', () => {
    const source = String.raw`\ifthenelse{a}{b}{c}\iff`;
    expect(inspectProject(snapshot(source), { kinds: ['condition-test'] }).facts).toEqual([]);
    failure(resolve(source), 'incomplete', 'unsupported-effect');
    ready(resolve(String.raw`$a\iff b$`));
  });

  it('does not reinterpret an earlier use as a declaration that was already executed', () => {
    const source = String.raw`\ifdraft A\else B\fi\newif\ifdraft`;
    const fact = inspectProject(snapshot(source), { kinds: ['condition-test'] }).facts[0];
    expect(fact?.recognition).toBe('candidate');
    failure(resolve(source), 'incomplete', 'unknown-condition');
    expect(outcomes(resolve(source))).toEqual(['unknown']);
  });
});

describe('C4: reached state, scopes, skipped tokens and input traversal', () => {
  it('F04 tracks different values at successive tests and keeps configurations independent', () => {
    const source = String.raw`\newif\ifdraft\drafttrue\ifdraft A\else B\fi\draftfalse\ifdraft C\else D\fi`;
    const a = resolve(source);
    ready(a);
    expect(outcomes(a)).toEqual(['true', 'false']);
    expect(selected(a)).toBe(String.raw`\newif\ifdraft\drafttrue A\draftfalse D`);
    expect(outcomes(resolve(source, { mode: 'manual', values: { draft: false } }))).toEqual([
      'false',
      'false',
    ]);
    expect(outcomes(resolve(source))).toEqual(['true', 'false']);
    allFrozen(a);
    expect(structuredClone(a)).toEqual(a);
  });

  it('F05 records inactive nested tests as not reached and ignores skipped setters and missing inputs', () => {
    const view = resolve(
      String.raw`\newif\ifdraft\iffalse\drafttrue\input{missing}\ifdraft skipped\fi\fi\ifdraft yes\else no\fi`
    );
    ready(view);
    expect(outcomes(view)).toEqual(['false', 'not-reached', 'false']);
    expect(view.decisions[1]?.effectiveValue).toBeNull();
    expect(view.occurrences).toHaveLength(1);
    expect(selected(view)).toBe(String.raw`\newif\ifdraft no`);
  });

  it('F27 initial seeds reset on declaration, unlike permanent forcing', () => {
    const text = String.raw`\ifdraft A\fi\newif\ifdraft\ifdraft B\fi\drafttrue\ifdraft C\fi`;
    const view = resolve(text, { mode: 'source', initialValues: { draft: true } });
    ready(view);
    expect(outcomes(view)).toEqual(['true', 'false', 'true']);
    const forced = resolve(text, {
      mode: 'source-with-overrides',
      initialValues: { draft: true },
      overrides: { draft: true },
    });
    ready(forced);
    expect(outcomes(forced)).toEqual(['true', 'true', 'true']);
    expect(forced.decisions.map((d) => d.trackedValue)).toEqual([true, false, true]);
    failure(resolve(text, { mode: 'manual', values: {} }), 'incomplete', 'unknown-condition');
  });

  it.each(['{BODY}', '\\begin{box}BODY\\end{box}'])(
    'F07 restores local scopes and preserves supported global assignments: %s',
    (wrapper) => {
      const prefix = String.raw`\newif\ifdraft`;
      const suffix = String.raw`\ifdraft A\else B\fi`;
      const local = resolve(
        prefix + wrapper.replace('BODY', String.raw`\drafttrue\ifdraft X\fi`) + suffix
      );
      ready(local);
      expect(outcomes(local)).toEqual(['true', 'false']);
      const global = resolve(
        prefix + wrapper.replace('BODY', String.raw`\global\drafttrue`) + suffix
      );
      ready(global);
      expect(outcomes(global)).toEqual(['true']);
    }
  );

  it('global assignment cancels earlier local saves at every nested scope', () => {
    const v = resolve(
      String.raw`\newif\ifdraft{\drafttrue{\global\draftfalse}\drafttrue}\ifdraft A\else B\fi`
    );
    ready(v);
    expect(outcomes(v)).toEqual(['false']);
  });

  it('F30 restores/discards declaration and generated setter bindings', () => {
    failure(
      resolve(String.raw`{\newif\ifdraft\drafttrue}\ifdraft A\fi`),
      'incomplete',
      'unknown-condition'
    );
    failure(
      resolve(String.raw`{\newif\ifdraft}\drafttrue`),
      'incomplete',
      'unsupported-assignment'
    );
    const nested = resolve(
      String.raw`\newif\ifdraft\drafttrue{\newif\ifdraft\ifdraft A\fi}\ifdraft B\fi`
    );
    ready(nested);
    expect(outcomes(nested)).toEqual(['false', 'true']);
  });

  it.each([
    String.raw`\def\ifdraft{X}\ifdraft A\fi`,
    String.raw`\renewcommand{\drafttrue}{}\drafttrue`,
    String.raw`\let\drafttrue\relax`,
  ])('F30 invalidates tracked bindings on redefinition: %s', (source) => {
    const view = resolve(String.raw`\newif\ifdraft` + source);
    expect(view.status).toBe('incomplete');
    expect(view.root).toBeNull();
  });

  it('local redefinitions restore and providecommand retains an existing boolean binding', () => {
    const a = resolve(String.raw`\newif\ifdraft{\def\ifdraft{X}}\ifdraft A\else B\fi`);
    ready(a);
    expect(outcomes(a)).toEqual(['false']);
    const b = resolve(
      String.raw`\newif\ifdraft\providecommand{\drafttrue}{}\drafttrue\ifdraft A\fi`
    );
    ready(b);
    expect(outcomes(b)).toEqual(['true']);
  });

  it('F06/F17 does not execute stored body or key arguments', () => {
    const view = resolve(
      String.raw`\newif\ifdraft\newcommand{\foo}{\drafttrue\label{body}\input{missing}}\label{\drafttrue}\ifdraft A\else B\fi`
    );
    ready(view);
    expect(outcomes(view)).toEqual(['false']);
    expect(view.reachedFacts.filter((f) => f.fact.kind === 'label')).toHaveLength(1);
    expect(view.reachedFacts.filter((f) => f.fact.kind === 'condition-assignment')).toHaveLength(0);
  });

  it('opaque executable arguments stop instead of executing an apparent setter', () => {
    failure(
      resolve(String.raw`\newif\ifdraft\textbf{\drafttrue}\ifdraft A\fi`),
      'incomplete',
      'unsupported-effect'
    );
    failure(resolve(String.raw`\unknown{\drafttrue}`), 'incomplete', 'unsupported-effect');
    ready(resolve(String.raw`\textbf{literal}`));
  });

  it('skipped mode does not execute verbatim or definition scanners', () => {
    const verb = resolve(String.raw`\iffalse\verb|\fi|TAIL`);
    ready(verb);
    expect(selected(verb)).toBe('|TAIL');
    const def = resolve(String.raw`\iffalse\def\foo{\fi}TAIL`);
    failure(def, 'blocked', 'structural-error');
    failure(resolve(String.raw`\iffalse\ifunknown A\fi\fi`), 'incomplete', 'unknown-condition');
    ready(resolve(String.raw`\iffalse\ifnum 1=1 A\fi\fi`));
  });

  it('F08/F11 follows active inputs in encounter order, with distinct repeated inclusion IDs', () => {
    const model = createProjectSnapshot([
      file(String.raw`\newif\ifdraft\input{part}\ifdraft A\fi\draftfalse\input{part}\ifdraft B\fi`),
      file(String.raw`\ifdraft T\else F\fi\drafttrue`, 'part.tex'),
    ]);
    const view = resolveProjectView(model, { entryPath: 'main.tex' });
    ready(view);
    expect(outcomes(view)).toEqual(['false', 'true', 'false', 'true']);
    expect(view.occurrences.map((o) => o.id)).toEqual(['i0', 'i1', 'i2']);
    expect(view.occurrences.map((o) => o.parentId)).toEqual([null, 'i0', 'i0']);
    expect(
      view.decisions.filter((d) => d.origin.path === 'part.tex').map((d) => d.origin.occurrenceId)
    ).toEqual(['i1', 'i2']);
    failure(
      resolveProjectView(model, { entryPath: 'main.tex', traversal: 'file-only' }),
      'incomplete',
      'file-only-input'
    );
  });

  it.each([
    ['missing-input', [file(String.raw`\input{absent}`)]],
    ['ambiguous-input', [file(String.raw`\input{part}`), file('a', 'part'), file('b', 'part.tex')]],
    ['input-cycle', [file(String.raw`\input{part}`), file(String.raw`\input{main}`, 'part.tex')]],
    ['invalid-input-path', [file(String.raw`\input{../outside}`)]],
  ] as const)('F10 reports %s with original location and active chain', (code, files) => {
    const view = resolveProjectView(createProjectSnapshot(files), { entryPath: 'main.tex' });
    failure(view, 'blocked', code);
    if (view.status !== 'ready') {
      expect(view.reason.location?.range.start).toBe(0);
      expect(view.reason.inputChain.length).toBeGreaterThan(0);
    }
  });

  it('resolves nested relative paths and permits enclosing conditionals across a complete input', () => {
    const view = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\iftrue\input{dir/part}\fi`),
        file(String.raw`\input{../leaf}`, 'dir/part.tex'),
        file('LEAF', 'leaf.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    ready(view);
    expect(selected(view)).toBe('LEAF');
  });

  it.each([
    [file(String.raw`\iftrue\input{part}`), file(String.raw`\fi`, 'part.tex')],
    [file(String.raw`\input{part}\fi`), file(String.raw`\iftrue`, 'part.tex')],
  ])('F14 rejects cross-file conditional delimiters but retains all source', (...files) => {
    const model = createProjectSnapshot(files);
    expect(model.files).toHaveLength(2);
    failure(
      resolveProjectView(model, { entryPath: 'main.tex' }),
      'incomplete',
      'cross-file-conditional'
    );
  });

  it('F12 primitive and literal truth cannot be overridden as a named flag', () => {
    failure(resolve(String.raw`\ifnum1=1 A\else B\fi`), 'incomplete', 'unsupported-condition');
    const v = resolve(String.raw`\iftrue A\else B\fi\iffalse C\else D\fi`, {
      mode: 'manual',
      values: {},
    });
    ready(v);
    expect(outcomes(v)).toEqual(['true', 'false']);
  });

  it('stops at the first unresolved point without settled observations afterward', () => {
    const v = resolve(String.raw`\label{before}\ifunknown\label{later}\else\label{other}\fi`);
    failure(v, 'incomplete', 'unknown-condition');
    expect(v.reachedFacts.filter((f) => f.fact.kind === 'label')).toHaveLength(1);
    expect(selected(v)).toBe(String.raw`\label{before}`);
  });

  it.each([
    [String.raw`\input{\generated}`, 'dynamic-input'],
    [String.raw`\include{x}`, 'unsupported-effect'],
    [String.raw`\global\newif\ifdraft`, 'unsupported-assignment'],
    [String.raw`\catcode`, 'unsupported-effect'],
  ])('diagnoses unsupported effects: %s', (source, code) =>
    failure(resolve(source), 'incomplete', code)
  );

  it('bounds repeated inputs, input depth, condition nesting, and selected size', () => {
    const model = createProjectSnapshot([
      file(String.raw`\input{part}\input{part}`),
      file('abc', 'part.tex'),
    ]);
    for (const limits of [{ maxOccurrences: 2 }, { maxInputDepth: 1 }, { maxSelectedCodeUnits: 2 }])
      failure(
        resolveProjectView(model, { entryPath: 'main.tex', limits }),
        'incomplete',
        'interpretation-limit'
      );
    failure(
      resolveProjectView(snapshot(String.raw`\iftrue\iftrue X\fi\fi`), {
        entryPath: 'main.tex',
        limits: { maxNesting: 1 },
      }),
      'incomplete',
      'interpretation-limit'
    );
  });
});

describe('C5: configured structure and original provenance', () => {
  it.each([true, false])('F02 builds exactly one selected list for forced draft=%s', (value) => {
    const model = snapshot(fixture('F02-crossing-environments'));
    const view = resolveProjectView(model, {
      entryPath: 'main.tex',
      conditions: { mode: 'source-with-overrides', overrides: { draft: value } },
    });
    ready(view);
    const nodes = walkConfiguredNodes(view.root);
    expect(
      nodes.filter((n) => n.kind === 'environment').map((n) => n.kind === 'environment' && n.name)
    ).toEqual([value ? 'itemize' : 'enumerate']);
    expect(nodes.every((n) => n.viewId === view.id)).toBe(true);
    expect(new Set(nodes.map((n) => n.occurrenceKey)).size).toBe(nodes.length);
    expect(isConfiguredContainerNode(view.root)).toBe(true);
  });

  it('F03 inactive invalid structure does not block the selected path', () => {
    const view = resolve(
      String.raw`\iffalse\begin{broken}{$\else\begin{itemize}\item OK\end{itemize}\fi`
    );
    ready(view);
    expect(walkConfiguredNodes(view.root).filter((n) => n.kind === 'environment')).toHaveLength(1);
  });

  it.each([true, false])(
    'retains section/math structure across conditional boundaries for %s',
    (value) => {
      const view = resolve(
        String.raw`\ifdraft\section{Alpha}$\else\section{Beta}\[\fi x\ifdraft$\else\]\fi`,
        { mode: 'manual', values: { draft: value } }
      );
      ready(view);
      const nodes = walkConfiguredNodes(view.root);
      expect(
        nodes.filter((n) => n.kind === 'section').map((n) => n.kind === 'section' && n.name)
      ).toEqual([value ? 'Alpha' : 'Beta']);
      expect(
        nodes.filter((n) => n.kind === 'math').map((n) => n.kind === 'math' && n.delimiter)
      ).toEqual([value ? '$' : '\\[']);
    }
  );

  it('F19 returns ordered multi-file/disjoint origins excluding inactive gaps', () => {
    const model = createProjectSnapshot([
      file(fixture('F19-main')),
      file(fixture('F19-open'), 'F19-open.tex'),
    ]);
    const view = resolveProjectView(model, { entryPath: 'main.tex' });
    ready(view);
    const environment = walkConfiguredNodes(view.root).find((n) => n.kind === 'environment');
    expect(environment?.origins.map((o) => o.path)).toEqual([
      'F19-open.tex',
      'main.tex',
      'main.tex',
      'main.tex',
    ]);
    const slices = environment!.origins.map((o) =>
      model.files.find((f) => f.path === o.path)!.source.slice(o.range.start, o.range.end + 1)
    );
    expect(slices.join('')).not.toContain('hidden');
    expect(slices.join('')).not.toContain('\\fi');
    expect(environment!.origins.every((o) => o.snapshotId === model.id)).toBe(true);
  });

  it('supports groups and math spanning active inputs', () => {
    const view = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{part}x$}`), file('{$', 'part.tex')]),
      { entryPath: 'main.tex' }
    );
    ready(view);
    expect(
      walkConfiguredNodes(view.root)
        .filter((n) => n.kind === 'math' || n.kind === 'group')
        .map((n) => n.kind)
    ).toEqual(['group', 'math']);
  });

  it('F29 never retokenizes joins into different control sequences', () => {
    const condition = resolve(String.raw`\iftrue\relax\fi abc`);
    ready(condition);
    expect(
      walkConfiguredNodes(condition.root)
        .filter((n) => n.kind === 'token' && n.token.kind === 'command')
        .map((n) => n.kind === 'token' && n.token.value)
    ).toEqual(['\\relax']);
    const input = resolveProjectView(
      createProjectSnapshot([
        file(String.raw`\input{part}abc`),
        file(String.raw`\relax`, 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    ready(input);
    expect(input.selectedTokens.map((t) => t.token.value)).toEqual(['\\relax', 'abc']);
    expect(
      walkConfiguredNodes(input.root).filter(
        (n) => n.kind === 'token' && n.token.kind === 'command'
      )
    ).toHaveLength(1);
  });

  it('reports structural errors against original source with no invented AST', () => {
    const view = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{bad}`), file('😀\r\n$x', 'bad.tex')]),
      { entryPath: 'main.tex' }
    );
    failure(view, 'blocked', 'structural-error');
    if (view.status !== 'ready')
      expect(view.reason.location).toEqual({
        path: 'bad.tex',
        range: { start: 4, end: 4, line: 2 },
      });
  });

  it('represents the empty selected document without bogus original ranges', () => {
    const view = resolve('');
    ready(view);
    expect(view.root.origins).toEqual([]);
    expect(view.root.projectedRange).toEqual({ start: 0, end: -1, line: 1 });
    expect(view.root.children).toEqual([]);
  });
});

describe('C1: operation requirements and checked proposal contracts', () => {
  it('allows independent inventory and analysis and enforces model and scope requirements', () => {
    const model = snapshot('');
    expect(checkOperationCapability(model, { operation: 'source-inventory' }).eligible).toBe(true);
    const request = {
      operation: 'source-inventory',
      options: { scope: { kind: 'files', paths: ['absent.tex'] } },
    } as const;
    expect(checkOperationCapability(model, request).reasons.map((r) => r.code)).toEqual([
      'missing-file',
    ]);
    expect(() => inspectProject(model, request.options)).toThrow();
    const view = resolve('');
    expect(
      checkOperationCapability(view, { operation: 'source-inventory' }).reasons.map((r) => r.code)
    ).toEqual(['wrong-model']);
    expect(
      checkOperationCapability(view, { operation: 'references' }).reasons.map((r) => r.code)
    ).toEqual([]);
    allFrozen(projectOperations);
  });

  function plan(source: ProjectSnapshot, edits: readonly ProjectEdit[]): ProjectEditPlan {
    return {
      kind: 'edits',
      provenance: {
        snapshotId: source.id,
        viewId: null,
        request: { operation: 'suppress-comments', options: { target: 'source' } },
        operationVersion: 1,
      },
      edits,
    };
  }

  it('accepts empty/EOF insertions and rejects splits of surrogate pairs and stale contents', () => {
    const empty = snapshot('');
    validateProjectEditPlan(
      empty,
      plan(empty, [{ kind: 'insert', path: 'main.tex', offset: 0, text: 'A' }])
    );
    const source = snapshot('😀x');
    validateProjectEditPlan(
      source,
      plan(source, [{ kind: 'insert', path: 'main.tex', offset: 3, text: 'A' }])
    );
    expect(() =>
      validateProjectEditPlan(
        source,
        plan(source, [{ kind: 'insert', path: 'main.tex', offset: 1, text: 'A' }])
      )
    ).toThrow(/surrogate/);
    expect(() => validateProjectEditPlan(snapshot('😀y'), plan(source, []))).toThrow(/Stale/);
    expect(() =>
      validateProjectEditPlan(
        source,
        plan(source, [
          {
            kind: 'replace',
            path: 'main.tex',
            range: { start: 2, end: 2, line: 1 },
            expected: 'z',
            replacement: '',
          },
        ])
      )
    ).toThrow(/contents/);
  });

  it('validates inclusive replacements, ordering, overlaps and simultaneous insertion ambiguity', () => {
    const source = snapshot('abc');
    const a: ProjectEdit = {
      kind: 'replace',
      path: 'main.tex',
      range: { start: 0, end: 0, line: 1 },
      expected: 'a',
      replacement: '',
    };
    const b: ProjectEdit = {
      kind: 'replace',
      path: 'main.tex',
      range: { start: 1, end: 1, line: 1 },
      expected: 'b',
      replacement: 'B',
    };
    validateProjectEditPlan(source, plan(source, [a, b]));
    for (const edits of [
      [a, a],
      [b, a],
      [{ kind: 'insert', path: 'main.tex', offset: 0, text: 'x' }, a],
      [{ kind: 'insert', path: 'main.tex', offset: 4, text: 'x' }],
    ] as const)
      expect(() => validateProjectEditPlan(source, plan(source, edits))).toThrow();
    expect(source.files[0]!.source).toBe('abc');
  });
});

describe('adversarial source, token and contract boundaries', () => {
  it('global generated setters preserve the test binding but do not globalize local setter macros', () => {
    const view = resolve(String.raw`{\newif\ifdraft\global\drafttrue}\ifdraft Y\fi`);
    ready(view);
    expect(outcomes(view)).toEqual(['true']);
    failure(
      resolve(String.raw`{\newif\ifdraft\global\drafttrue}\draftfalse`),
      'incomplete',
      'unsupported-assignment'
    );
    const reset = resolve(String.raw`\newif\ifdraft\def\ifdraft{opaque}\drafttrue\ifdraft Y\fi`);
    ready(reset);
    expect(outcomes(reset)).toEqual(['true']);
  });
  it('uses live bindings before if-prefix spelling, including setters whose flag begins with if', () => {
    const view = resolve(String.raw`\newif\ififdraft\ifdrafttrue\ififdraft Y\fi`);
    ready(view);
    expect(outcomes(view)).toEqual(['true']);
  });

  it('recognizes newly reached facts after skipped-mode delimiters inside a source-protected region', () => {
    const text = String.raw`\iffalse\verb|\fi\label{reached}|`;
    const view = resolve(text);
    ready(view);
    const labels = view.reachedFacts.filter((f) => f.fact.kind === 'label');
    expect(labels).toHaveLength(1);
    expect(labels[0]!.origin.range.start).toBe(text.indexOf('\\label'));
  });
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'does not treat prototype property %s as a grammar handler',
    (name) => {
      const view = resolve(`\\${name}`);
      ready(view);
      expect(
        walkConfiguredNodes(view.root)
          .filter((n) => n.kind !== 'token')
          .map((n) => n.kind)
      ).toEqual(['root']);
      expect(structuredClone(view)).toEqual(view);
    }
  );

  it('consumes exactly the declared command arguments before resuming execution groups', () => {
    const text = String.raw`\newif\ifdraft\label{x}{\drafttrue\ifdraft Y\fi}\ifdraft N\fi`;
    const model = snapshot(text);
    const setter = inspectProject(model, { kinds: ['condition-assignment'] }).facts[0]!;
    expect(setter.context.opaqueArguments).toEqual([]);
    const view = resolveProjectView(model, { entryPath: 'main.tex' });
    ready(view);
    expect(outcomes(view)).toEqual(['true', 'false']);
  });

  it('parses starred section titles with braced optional short titles and sibling hierarchy', () => {
    const view = resolve(
      String.raw`\section*[short {nested}]{Long}\subsection{Child}x\section{Next}`
    );
    ready(view);
    const sections = walkConfiguredNodes(view.root).filter((n) => n.kind === 'section');
    expect(sections.map((n) => n.kind === 'section' && [n.name, n.level, n.starred])).toEqual([
      ['Long', 1, true],
      ['Child', 2, false],
      ['Next', 1, false],
    ]);
    expect(view.root.children.filter((n) => n.kind === 'section')).toHaveLength(2);
  });

  it.each([
    String.raw`\def\fi{}\iftrue x\fi`,
    String.raw`\def\else{}\iffalse x\else y\fi`,
    String.raw`\def\verb{}\verb|x|`,
  ])('does not reuse redefined delimiter/protected meanings: %s', (text) => {
    failure(resolve(text), 'incomplete', 'binding-redefined');
  });

  it.each([
    String.raw`\newcommand{\foo}[10]{x}`,
    String.raw`\newcommand{\foo}[0][x]{y}`,
    String.raw`\newcommand{\foo`,
    String.raw`\newif x`,
  ])('localizes malformed declarations: %s', (text) => {
    expect(inspectProject(snapshot(text)).coverage.status).toBe('partial');
    failure(resolve(text), 'blocked', 'malformed-syntax');
  });

  it('does not claim complete coverage after an unterminated literal argument', () => {
    const result = inspectProject(snapshot(String.raw`\label{broken\ref{x}`));
    expect(result.coverage.status).toBe('partial');
    expect(result.coverage.issues[0]!.location!.range.start).toBe(0);
  });

  it('supports configurable protected environments with normalized identity', () => {
    const inputs = [file(String.raw`\begin{code}\input{missing}\ifdraft\end{code}`)];
    const first = createProjectSnapshot(inputs, { verbatimEnvironments: ['code', 'code'] });
    expect(first.id).toBe(createProjectSnapshot(inputs, { verbatimEnvironments: ['code'] }).id);
    expect(inspectProject(first).facts).toEqual([]);
    ready(resolveProjectView(first, { entryPath: 'main.tex' }));
  });

  it('locates recovered facts after malformed inline verbatim and bounds recursive inventory', () => {
    const model = snapshot('\\verb|broken\n\\label{after}');
    expect(inspectProject(model, { kinds: ['label'] }).facts[0]?.range.line).toBe(2);
    expect(inspectProject(model).coverage.status).toBe('partial');
    const nested = createProjectSnapshot([file(String.raw`\def\one{\def\two{\label{deep}}}`)], {
      maxNesting: 1,
    });
    expect(inspectProject(nested).coverage.issues.some((i) => i.code === 'scan-limit')).toBe(true);
  });

  it('validates source paths, dense arrays, own data properties, and missing scopes', () => {
    expect(() => createProjectSnapshot([file('a'), file('b', './main.tex')])).toThrow();
    expect(() => createProjectSnapshot([file('', '../escape')])).toThrow();
    expect(() => createProjectSnapshot([file('', 'C:/absolute')])).toThrow();
    expect(() => createProjectSnapshot(new Array<SourceFile>(1))).toThrow();
    const getter = {
      path: 'main.tex',
      version: 1,
      get source(): string {
        throw new Error('Getter must not execute');
      },
    };
    expect(() => createProjectSnapshot([getter])).toThrow(/data fields/);
    expect(() => inspectProject(snapshot(''), { kinds: ['bogus'] } as never)).toThrow();
    expect(() =>
      checkOperationCapability(snapshot(''), { operation: 'invalid' } as never)
    ).toThrow();
  });

  it('rejects stale configured edit provenance while source-local inventory remains valid', () => {
    const model = snapshot(String.raw`\ifdraft A\else B\fi`);
    const a = resolveProjectView(model, {
      entryPath: 'main.tex',
      conditions: { mode: 'manual', values: { draft: true } },
    });
    const b = resolveProjectView(model, {
      entryPath: 'main.tex',
      conditions: { mode: 'manual', values: { draft: false } },
    });
    const plan: ProjectEditPlan = {
      kind: 'edits',
      provenance: {
        snapshotId: model.id,
        viewId: a.id,
        request: { operation: 'suppress-comments', options: { target: 'selected' } },
        operationVersion: 1,
      },
      edits: [],
    };
    validateProjectEditPlan(model, plan, a);
    expect(() => validateProjectEditPlan(model, plan, b)).toThrow(/Stale/);
    expect(() =>
      checkOperationCapability({ ...a, id: 'stale' }, { operation: 'references' })
    ).toThrow(/identity/);
    expect(inspectProject(model).snapshotId).toBe(model.id);
  });
});

describe('C0 regression: legacy semantics remain isolated', () => {
  it('F23 preserves omitted conditions, all-false empty list and static explicit whitelist', () => {
    const text = String.raw`\newif\ifdraft\draftfalse\ifdraft A\else B\fi`;
    const model = parseProject([file(text)]);
    expect(serializeDocument(model.files[0]!.root)).toBe(text);
    expect(transformProject('main.tex', model).files[0]!.source).toBe(text);
    expect(transformProject('main.tex', model, { enabledConditions: [] }).files[0]!.source).toBe(
      ' B'
    );
    expect(
      transformProject('main.tex', model, { enabledConditions: ['draft'] }).files[0]!.source
    ).toBe(' A');
  });
  it('F24 preserves every supplied file in Separate, including unreachable files', () => {
    const model = parseProject([
      file(String.raw`\input{part}`),
      file('part', 'part.tex'),
      file('unreachable', 'unused.tex'),
    ]);
    expect(
      transformProject('main.tex', model, { inputHandling: InputHandlingMode.Separate }).files.map(
        (f) => f.path
      )
    ).toEqual(['main.tex', 'part.tex', 'unused.tex']);
    expect(
      transformProject('main.tex', model, { inputHandling: InputHandlingMode.Flatten }).files[0]!
        .source
    ).toBe('part');
    expect(
      transformProject('main.tex', model, { inputHandling: InputHandlingMode.Preserve }).files[0]!
        .source
    ).toBe(String.raw`\input{part}`);
    expect(() => parseProject([file('ok'), file('\\begin{unclosed}', 'bad.tex')])).toThrow();
  });
});
