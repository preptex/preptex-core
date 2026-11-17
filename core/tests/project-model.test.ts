import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyProjectEdits,
  buildCoarseViewTree,
  checkOperationCapability,
  createProjectSnapshot,
  inspectProject,
  inspectProjectEnvironments,
  isConfiguredContainerNode,
  planTransformation,
  PrepTexError,
  projectOperations,
  realizeProjectConditions,
  resolveProjectView,
  tokenizeFile,
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

describe('C4: reached state, skipped tokens and input traversal', () => {
  it('F04 tracks different values at successive tests and keeps configurations independent', () => {
    const source = String.raw`\newif\ifdraft\drafttrue\ifdraft A\else B\fi\draftfalse\ifdraft C\else D\fi`;
    const a = resolve(source);
    ready(a);
    expect(outcomes(a)).toEqual(['true', 'false']);
    expect(selected(a)).toBe('AD');
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
    expect(selected(view)).toBe('no');
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
    'supports condition setters inside groups and environments without scope resets: %s',
    (wrapper) => {
      const prefix = String.raw`\newif\ifdraft`;
      const suffix = String.raw`\ifdraft A\else B\fi`;
      const local = resolve(
        prefix + wrapper.replace('BODY', String.raw`\drafttrue\ifdraft X\fi`) + suffix
      );
      ready(local);
      expect(outcomes(local)).toEqual(['true', 'true']);
      const global = resolve(
        prefix + wrapper.replace('BODY', String.raw`\global\drafttrue`) + suffix
      );
      ready(global);
      expect(outcomes(global)).toEqual(['true']);
    }
  );

  it.each([
    String.raw`\def\ifdraft{X}\ifdraft A\fi`,
    String.raw`\renewcommand{\drafttrue}{}\drafttrue`,
    String.raw`\let\drafttrue\relax`,
  ])('F30 invalidates tracked bindings on redefinition: %s', (source) => {
    const view = resolve(String.raw`\newif\ifdraft` + source);
    expect(view.status).toBe('incomplete');
    expect(view.root).toBeNull();
  });

  it('providecommand retains an existing boolean binding', () => {
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

  it('permits formatting commands with math/macros and unknown user commands with arguments', () => {
    ready(resolve(String.raw`\textbf{$\alpha$}\unknown{arg}`));
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

  it('F10 reports missing-input as a warning and continues parsing', () => {
    const view = resolveProjectView(
      createProjectSnapshot([file(String.raw`\input{absent}\section{After}`)]),
      { entryPath: 'main.tex' }
    );
    ready(view);
    expect(view.coverage.status).toBe('partial');
    expect(view.coverage.issues).toHaveLength(1);
    expect(view.coverage.issues[0]).toMatchObject({
      code: 'missing-input',
      severity: 'warning',
      location: { path: 'main.tex', range: { start: 0, end: 5, line: 1 } },
    });
    expect(view.coverage.issues[0]!.inputChain.length).toBeGreaterThan(0);
    expect(selected(view)).toBe(String.raw`\input{absent}\section{After}`);
  });

  it.each([
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

  function plan(view: ProjectView, edits: readonly ProjectEdit[]): ProjectEditPlan {
    return {
      kind: 'edits',
      provenance: {
        snapshotId: view.snapshotId,
        viewId: view.id,
        request: { operation: 'suppress-comments', options: { target: 'selected' } },
        operationVersion: 1,
      },
      edits,
    };
  }

  it('accepts interior insertions and rejects splits of surrogate pairs and stale contents', () => {
    const source = snapshot('😀xy');
    const v = resolveProjectView(source, { entryPath: 'main.tex' });
    validateProjectEditPlan(
      source,
      plan(v, [{ kind: 'insert', path: 'main.tex', offset: 2, text: 'A' }]),
      v
    );
    expect(() =>
      validateProjectEditPlan(
        source,
        plan(v, [{ kind: 'insert', path: 'main.tex', offset: 1, text: 'A' }]),
        v
      )
    ).toThrow(/surrogate/);
    expect(() => validateProjectEditPlan(snapshot('😀y'), plan(v, []), v)).toThrow(/Stale/);
    expect(() =>
      validateProjectEditPlan(
        source,
        plan(v, [
          {
            kind: 'replace',
            path: 'main.tex',
            range: { start: 2, end: 2, line: 1 },
            expected: 'z',
            replacement: '',
          },
        ]),
        v
      )
    ).toThrow(/contents/);
  });

  it('validates inclusive replacements, ordering, overlaps and simultaneous insertion ambiguity', () => {
    const source = snapshot('abc');
    const v = resolveProjectView(source, { entryPath: 'main.tex' });
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
    validateProjectEditPlan(source, plan(v, [a, b]), v);
    for (const edits of [
      [a, a],
      [b, a],
      [{ kind: 'insert', path: 'main.tex', offset: 0, text: 'x' }, a],
      [{ kind: 'insert', path: 'main.tex', offset: 4, text: 'x' }],
    ] as const)
      expect(() => validateProjectEditPlan(source, plan(v, edits), v)).toThrow();
    expect(source.files[0]!.source).toBe('abc');
  });
});

describe('adversarial source, token and contract boundaries', () => {
  it('global generated setters preserve the test binding and setter resets opaque test macro', () => {
    const view = resolve(String.raw`{\newif\ifdraft\global\drafttrue}\ifdraft Y\fi`);
    ready(view);
    expect(outcomes(view)).toEqual(['true']);
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
    expect(outcomes(view)).toEqual(['true', 'true']);
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

describe('Stage 0, Pipeline B & Pipeline A separation acceptance matrix (V-TOK, V-COND, V-AST, V-PIPE)', () => {
  it('V-TOK-1: lossless whole-file tokenization with primitive tokens inside verbatim', () => {
    const raw = '\\iftrue\r\n\\begin{verbatim}\n\\fi\n\\end{verbatim}\n\\fi % comment\n$x$';
    const snap = snapshot(raw);
    const f = snap.files[0]!;
    expect(f.tokens.map((t) => t.value).join('')).toBe(f.source);
    expect(tokenizeFile(raw).map((t) => t.value)).toEqual(f.tokens.map((t) => t.value));
    const values = f.tokens.map((t) => t.value);
    expect(values).toContain('\\begin');
    expect(values).toContain('{');
    expect(values).toContain('verbatim');
    expect(values).toContain('}');
    expect(values.filter((v) => v === '\\fi')).toHaveLength(2);
  });

  it('V-COND-1: standalone condition realization ignores broken environments & braces (INV-3)', () => {
    const snap = snapshot(
      '\\newif\\ifcam\\camtrue\n\\ifcam\n{ \\begin{unclosed}\nKeep me\n\\else\nDrop me\n\\fi'
    );
    const res = realizeProjectConditions(snap, { conditions: { mode: 'source' } });
    expect(res.status).toBe('ready');
    expect(res.editPlan).not.toBeNull();
    const updated = applyProjectEdits(snap, res.editPlan!);
    expect(updated.files[0]!.source).toBe('{ \\begin{unclosed}\nKeep me\n');
    expect(res.artifacts[0]!.source).toBe('{ \\begin{unclosed}\nKeep me\n');
    allFrozen(res);
  });

  it('V-COND-2: standalone condition realization with straddling environments', () => {
    const snap = snapshot(
      '\\iflong\n\\begin{figure*}\n\\else\n\\begin{figure}\n\\fi\nBody\n\\iflong\n\\end{figure*}\n\\else\n\\end{figure}\n\\fi'
    );
    const res = realizeProjectConditions(snap, {
      conditions: { mode: 'manual', values: { long: false } },
    });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe('\\begin{figure}\nBody\n\\end{figure}');
    const updated = applyProjectEdits(snap, res.editPlan!);
    expect(updated.files[0]!.source).toBe('\\begin{figure}\nBody\n\\end{figure}');
  });

  it('V-COND-3: active vs. skipped \\begin{verbatim} containing \\fi', () => {
    const snap = snapshot(
      '\\iftrue\n\\begin{verbatim}\n\\fi\n\\end{verbatim}\n\\fi\n\\iffalse\n\\begin{verbatim}\n\\fi'
    );
    const res = realizeProjectConditions(snap, { conditions: { mode: 'source' } });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe('\\begin{verbatim}\n\\fi\n\\end{verbatim}\n');
  });

  it('V-COND-4: sequential state mutation (\\Xtrue -> \\Xfalse)', () => {
    const snap = snapshot(
      '\\newif\\ifdraft\n\\drafttrue\n\\ifdraft A\\else B\\fi\n\\draftfalse\n\\ifdraft C\\else D\\fi'
    );
    const res = realizeProjectConditions(snap, {
      conditions: { mode: 'source' },
      stripDeclarationsAndSetters: true,
    });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe('A\nD');
  });

  it('V-COND-5: macro definition body with internal \\ifmmode preserved', () => {
    const snap = snapshot(
      '\\newcommand{\\myvec}[1]{\\ifmmode \\mathbf{#1}\\else $\\mathbf{#1}$\\fi}\n\\newif\\iflong\\longtrue\n\\iflong Text\\fi'
    );
    const res = realizeProjectConditions(snap, { conditions: { mode: 'source' } });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe(
      '\\newcommand{\\myvec}[1]{\\ifmmode \\mathbf{#1}\\else $\\mathbf{#1}$\\fi}\nText'
    );
  });

  it('V-AST-1: structural parser rejects unrealized conditions (INV-4)', () => {
    const snap = snapshot('\\section{Intro}\n\\ifdraft\nDraft text\n\\fi');
    const v = resolveProjectView(snap, {
      entryPath: 'main.tex',
      conditions: { mode: 'none' },
    });
    failure(v, 'blocked', 'unrealized-condition');
    if (v.status !== 'ready') {
      expect(v.reason.location?.range.line).toBe(2);
    }
  });

  it('V-AST-2: structural parser succeeds on Step 1 realized view with formatting math & custom macros', () => {
    const snap = snapshot(
      '\\newif\\ifcam\\camtrue\n\\section{Model $\\alpha$}\n\\mycustomcmd{arg}\n\\ifcam\n\\begin{theorem}x\\end{theorem}\n\\fi'
    );
    const v = resolveProjectView(snap, {
      entryPath: 'main.tex',
      conditions: { mode: 'source' },
    });
    ready(v);
    const nodes = walkConfiguredNodes(v.root);
    const sec = nodes.find((n) => n.kind === 'section');
    const env = nodes.find((n) => n.kind === 'environment');
    expect(sec?.kind === 'section' && sec.name).toBe('Model $\\alpha$');
    expect(env?.kind === 'environment' && env.name).toBe('theorem');
  });

  it('V-PIPE-1: two-pipeline composition (Realize Conditions in-place -> Parse with mode: none)', () => {
    const snap1 = createProjectSnapshot([
      file('\\newif\\ifanon\\anontrue\n\\input{sec.tex}\n\\ifanon Anonymous\\else Authors\\fi'),
      file('\\ifanon\\section{Blind}\\else\\section{Named}\\fi', 'sec.tex'),
    ]);
    const realized = realizeProjectConditions(snap1, {
      entryPath: 'main.tex',
      conditions: { mode: 'source' },
    });
    expect(realized.status).toBe('ready');
    expect(realized.editPlan).not.toBeNull();
    const snap2 = applyProjectEdits(snap1, realized.editPlan!);
    const v = resolveProjectView(snap2, {
      entryPath: 'main.tex',
      conditions: { mode: 'none' },
    });
    ready(v);
    const sections = walkConfiguredNodes(v.root).filter((n) => n.kind === 'section');
    expect(sections.map((s) => s.kind === 'section' && s.name)).toEqual(['Blind']);
  });
});

describe('Tokenizer, Pipeline B, and Pipeline A edge cases & pitfall regressions', () => {
  it('INV-1/INV-2: tokenizeFile emits frozen lossless primitive tokens across CRLF, math, and trailing backslash', () => {
    const raw = 'a%c\r\n  {b}$x$$$y$$\\(\\)\\[\\]\\\\\\';
    const tokens = tokenizeFile(raw);
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(tokens.every((t) => Object.isFrozen(t) && Object.isFrozen(t.range))).toBe(true);
    expect(tokens.map((t) => t.value).join('')).toBe(raw);
    expect(tokens.map((t) => [t.kind, t.name, t.range.line])).toEqual([
      ['text', '', 1],
      ['comment', '', 1],
      ['space', '', 2],
      ['open', '', 2],
      ['text', '', 2],
      ['close', '', 2],
      ['math', '', 2],
      ['text', '', 2],
      ['math', '', 2],
      ['math', '', 2],
      ['text', '', 2],
      ['math', '', 2],
      ['math', '(', 2],
      ['math', ')', 2],
      ['math', '[', 2],
      ['math', ']', 2],
      ['command', '\\', 2],
      ['command', '', 2],
    ]);
  });

  it('INV-3: realizeProjectConditions ignores unclosed math, unmatched braces, and CRLF cleanup', () => {
    const raw =
      '  \\newif\\ifcam\\camtrue\r\n  \\ifcam\r\nKeep $unclosed } \\begin{a}\\end{b}\r\n  \\else\r\nDrop $$\r\n  \\fi';
    const snap = snapshot(raw);
    const res = realizeProjectConditions(snap, { conditions: { mode: 'source' } });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe('Keep $unclosed } \\begin{a}\\end{b}\r\n');
    expect(applyProjectEdits(snap, res.editPlan!).files[0]!.source).toBe(
      'Keep $unclosed } \\begin{a}\\end{b}\r\n'
    );
  });

  it('file-only condition realization isolates bindings/state per file and preserves inputs', () => {
    const snap = createProjectSnapshot([
      file(String.raw`\newif\ifdraft\drafttrue\ifdraft A\fi\input{part}\input{\dyn}`, 'a.tex'),
      file(String.raw`\ifdraft B\else C\fi`, 'b.tex'),
    ]);
    const isolated = realizeProjectConditions(snap, {
      traversal: 'file-only',
      conditions: { mode: 'source' },
    });
    expect(isolated.status).toBe('incomplete');
    expect(isolated.reason?.code).toBe('unknown-condition');
    expect(isolated.reason?.location?.path).toBe('b.tex');

    const aOnly = realizeProjectConditions(snap, {
      traversal: 'file-only',
      scope: { kind: 'files', paths: ['a.tex'] },
      conditions: { mode: 'source' },
    });
    expect(aOnly.status).toBe('ready');
    expect(aOnly.artifacts).toHaveLength(1);
    expect(aOnly.artifacts[0]!.source).toBe(String.raw`A\input{part}\input{\dyn}`);
  });

  it('project condition realization supports inline inputs and rejects conflicting shared inputs in preserve mode', () => {
    const snap = createProjectSnapshot([
      file(String.raw`\newif\ifdraft\drafttrue\input{part}\draftfalse\input{part}`),
      file(String.raw`\ifdraft T\else F\fi`, 'part.tex'),
    ]);
    expect(() =>
      realizeProjectConditions(snap, {
        entryPath: 'main.tex',
        inputs: 'preserve',
        conditions: { mode: 'source' },
      })
    ).toThrow(
      expect.objectContaining({ failure: expect.objectContaining({ code: 'edit-conflict' }) })
    );

    const inlined = realizeProjectConditions(snap, {
      entryPath: 'main.tex',
      inputs: 'inline',
      conditions: { mode: 'source' },
    });
    expect(inlined.status).toBe('ready');
    expect(inlined.editPlan).toBeNull();
    expect(inlined.artifacts).toHaveLength(1);
    expect(inlined.artifacts[0]!.source).toBe('TF');
  });

  it('realizes conditions inside document metadata text (title, author, date, href text) while protecting label keys', () => {
    const snap = snapshot(
      String.raw`\newif\ifanon\anontrue
\title{\ifanon Blind\else Named\fi}
\author{\ifanon Anonymous\else Alice\fi}
\date{\ifanon Hidden\else 2026\fi}
\href{https://example.com}{\ifanon Masked\else Link\fi}
\label{\anontrue}`
    );
    const res = realizeProjectConditions(snap, { conditions: { mode: 'source' } });
    expect(res.status).toBe('ready');
    expect(res.artifacts[0]!.source).toBe(
      String.raw`\title{Blind}
\author{Anonymous}
\date{Hidden}
\href{https://example.com}{Masked}
\label{\anontrue}`
    );
  });

  it('handles \\verb with % delimiter, trailing text, and % \\end{verbatim} cleanly across scan, conditions, AST, and environments', () => {
    const raw =
      '\\textbf{\\verb%x%}\n' +
      '\\verb%y%\\iftrue A\\else B\\fi\n' +
      '\\verb%z% % trailing comment\n' +
      '\\verb|p|tail\\label{after}\n' +
      '\\begin{verbatim}\n% \\end{verbatim}\\iftrue OK\\fi';
    const snap = snapshot(raw);
    expect(inspectProject(snap, { kinds: ['label'] }).facts.map((f) => f.range.line)).toEqual([4]);
    const envs = inspectProjectEnvironments(snap);
    expect(envs.environments).toHaveLength(1);
    expect(envs.environments[0]!.status).toBe('matched');
    expect(envs.environments[0]!.name).toBe('verbatim');

    const v = resolveProjectView(snap, { entryPath: 'main.tex', conditions: { mode: 'source' } });
    ready(v);
    const envNodes = walkConfiguredNodes(v.root).filter((n) => n.kind === 'environment');
    expect(envNodes).toHaveLength(1);
    expect(envNodes[0]!.kind === 'environment' && envNodes[0]!.syntax.closing?.name).toBe(
      'verbatim'
    );

    const exported = planTransformation(v, {
      operation: 'export-project',
      options: { inputs: 'inline', suppressComments: true },
    });
    expect(exported.artifacts[0]!.source).toBe(
      '\\textbf{\\verb%x%}\n' +
        '\\verb%y%A\n' +
        '\\verb%z% \\verb|p|tail\\label{after}\n' +
        '\\begin{verbatim}\n% \\end{verbatim}OK'
    );
  });

  it('INV-4: mode none rejects \\newif, \\else, \\fi, \\ifnum, declared setters, and included conditionals, while allowing verbatim/comments/definitions', () => {
    for (const [src, expectedLine] of [
      ['\\newif\\ifx', 1],
      ['text\n\\ifnum 1=1 A\\fi', 2],
      ['\\else', 1],
      ['\\fi', 1],
      ['\\newif\\ifdraft\n\\drafttrue', 1],
    ] as const) {
      const v = resolve(src, { mode: 'none' });
      failure(v, 'blocked', 'unrealized-condition');
      if (v.status !== 'ready') expect(v.reason.location?.range.line).toBe(expectedLine);
    }

    const nested = resolveProjectView(
      createProjectSnapshot([file('Intro\\input{part}'), file('Body\n\\iftrue X\\fi', 'part.tex')]),
      { entryPath: 'main.tex', conditions: { mode: 'none' } }
    );
    failure(nested, 'blocked', 'unrealized-condition');
    if (nested.status !== 'ready') {
      expect(nested.reason.location?.path).toBe('part.tex');
      expect(nested.reason.location?.range.line).toBe(2);
      expect(nested.reason.inputChain).toEqual(['i0', 'i1']);
    }

    const clean = resolve(
      '\\verb|\\iftrue|\n\\begin{verbatim}\n\\ifdraft\n\\end{verbatim}\n% \\iftrue\n\\newcommand{\\m}[1]{\\ifmmode #1\\fi}',
      { mode: 'none' }
    );
    ready(clean);
  });
});

describe('Unified command-with-arguments model and lookahead regressions', () => {
  it('handles unbraced section headings without swallowing downstream environments', () => {
    const src =
      '\\section abc\n\\subsection cd\n\n\\begin{itemize}\n\\item Some env\n\\end{itemize}';
    const v = resolve(src);
    ready(v);
    const sections = walkConfiguredNodes(v.root).filter((n) => n.kind === 'section');
    expect(sections.map((s) => s.kind === 'section' && [s.name, s.level, s.starred])).toEqual([
      ['a', 1, false],
      ['c', 2, false],
    ]);
    const sec = sections[0]!;
    if (sec.kind === 'section') {
      expect(sec.arguments).toHaveLength(1);
      expect(sec.arguments[0]!.location.primary?.range).toEqual({ start: 9, end: 9, line: 1 });
      expect(sec.children.some((c) => c.kind === 'token' && c.token.value === 'bc')).toBe(true);
    }
    const envs = walkConfiguredNodes(v.root).filter((n) => n.kind === 'environment');
    expect(envs.map((e) => e.kind === 'environment' && e.name)).toEqual(['itemize']);
  });

  it('supports single-command section headings and rejects malformed headings/delimiters at the opener', () => {
    const cmdTitle = resolve('\\section \\mytitle\n\\begin{itemize}\\item x\\end{itemize}');
    ready(cmdTitle);
    const sec = walkConfiguredNodes(cmdTitle.root).find((n) => n.kind === 'section');
    expect(sec?.kind === 'section' && sec.name).toBe('\\mytitle');

    const nonStar = resolve('\\section foo * {Bar}');
    ready(nonStar);
    const nonStarSec = walkConfiguredNodes(nonStar.root).find((n) => n.kind === 'section');
    expect(nonStarSec?.kind === 'section' && [nonStarSec.name, nonStarSec.starred]).toEqual([
      'f',
      false,
    ]);

    for (const badSection of [
      '\\section',
      '{\\section}',
      '\\section[unclosed',
      '{\\section[unclosed}',
      '\\begin{itemize}\\section\\end{itemize}',
    ]) {
      const v = resolve(badSection);
      failure(v, 'blocked', 'structural-error');
      if (v.status !== 'ready') {
        expect(v.reason.location?.range.start).toBe(badSection.indexOf('\\section'));
      }
    }

    for (const badEnv of [
      '\\begin foo',
      '\\begin*{itemize}\\end{itemize}',
      '\\begin[opt]{itemize}\\end{itemize}',
      '\\begin{itemize}\\end foo',
    ]) {
      const v = resolve(badEnv);
      failure(v, 'blocked', 'structural-error');
    }
  });

  it('parses known commands with optional/mandatory argument positions and avoids outer group depth doubling', () => {
    const src =
      '\\textbf{hello}\\cite*[see][p.5]{k1}\\item[p.1]tail{k2}\\href{https://a.com}{\\iftrue \\emph{Link}\\fi}';
    const v = resolve(src);
    ready(v);
    const cmds = walkConfiguredNodes(v.root).filter((n) => n.kind === 'command');
    expect(
      cmds.map((c) =>
        c.kind === 'command'
          ? [c.name, c.starred, c.arguments.map((a) => [a.kind, a.slot, a.opaque])]
          : []
      )
    ).toEqual([
      ['textbf', false, [['mandatory', 0, false]]],
      [
        'cite',
        true,
        [
          ['optional', 0, true],
          ['optional', 1, true],
          ['mandatory', 2, true],
        ],
      ],
      ['item', false, [['optional', 0, false]]],
      [
        'href',
        false,
        [
          ['mandatory', 0, true],
          ['mandatory', 1, false],
        ],
      ],
      ['emph', false, [['mandatory', 0, false]]],
    ]);
    // \textbf{hello} places delimiters directly inside command.children without an outer group container.
    expect(cmds[0]!.kind === 'command' && cmds[0]!.children.some((c) => c.kind === 'group')).toBe(
      false
    );
    // \item[p.1]tail{k2} leaves 'tail' and {k2} outside \item.
    expect(v.root.children.some((n) => n.kind === 'token' && n.token.value === 'tail')).toBe(true);
    expect(v.root.children.some((n) => n.kind === 'group')).toBe(true);
    // \cite[p.1]tail{k2} fails at \cite because mandatory {key} is blocked by 'tail'.
    failure(resolve('\\cite[p.1]tail{k2}'), 'blocked', 'structural-error');

    // 200 nested \textbf{...} fits comfortably inside default maxNesting (256) without doubling depth.
    const deep = '\\textbf{'.repeat(200) + 'x' + '}'.repeat(200);
    const deepView = resolve(deep);
    ready(deepView);
    allFrozen(deepView);
  });

  it('handles section headings with math/nested braces, part/chapter commands, empty args, and non-nesting brackets', () => {
    const v = resolve(
      '\\part*{Intro}\\chapter[Ch1]{One}\\section*[short {nested} $\\beta$]{Model $\\alpha$}\\textbf{}\\cite[$[0,1)$]{k}\\cite[{[1]}]{k}'
    );
    ready(v);
    const sec = walkConfiguredNodes(v.root).find((n) => n.kind === 'section');
    expect(sec?.kind === 'section' && [sec.name, sec.starred, sec.arguments.length]).toEqual([
      'Model $\\alpha$',
      true,
      2,
    ]);
    if (sec?.kind === 'section') {
      const headingMath = walkConfiguredNodes(sec).filter((c) => c.kind === 'math');
      expect(headingMath).toHaveLength(2);
      expect(walkConfiguredNodes(sec).some((c) => c.kind === 'group')).toBe(true);
    }
    const cmds = walkConfiguredNodes(v.root).filter((n) => n.kind === 'command');
    expect(cmds.map((c) => c.kind === 'command' && c.name)).toEqual([
      'part',
      'chapter',
      'textbf',
      'cite',
      'cite',
    ]);
    const emptyTextbf = cmds[2]!;
    if (emptyTextbf.kind === 'command') {
      const arg = emptyTextbf.arguments[0]!;
      expect(arg.innerLocation).toEqual({ kind: 'none', primary: null, spans: [] });
      expect(arg.innerProjectedRange.end).toBe(arg.innerProjectedRange.start - 1);
    }
  });

  it('tracks multi-file/conditional argument locations, surrogate-safe tex-args, verbatim in args, and unknown commands', () => {
    const multi = resolveProjectView(
      createProjectSnapshot([
        file('\\textbf{A\\iftrue B\\else C\\fi\\input{part}}'),
        file('D', 'part.tex'),
      ]),
      { entryPath: 'main.tex' }
    );
    ready(multi);
    const bold = walkConfiguredNodes(multi.root).find(
      (n) => n.kind === 'command' && n.name === 'textbf'
    );
    if (bold?.kind === 'command') {
      expect(bold.arguments[0]!.location.kind).toBe('multiple');
      expect(bold.arguments[0]!.innerLocation.kind).toBe('multiple');
      expect(new Set(bold.arguments[0]!.innerLocation.spans.map((s) => s.path)).size).toBe(2);
    }

    const surrogate = resolve('\\textbf 😀x\\unknown{arg}');
    ready(surrogate);
    const surCmd = walkConfiguredNodes(surrogate.root).find(
      (n) => n.kind === 'command' && n.name === 'textbf'
    );
    expect(
      surCmd?.kind === 'command' &&
        surCmd.children.map((c) => (c.kind === 'token' ? c.token.value : c.kind))
    ).toEqual(['\\textbf', ' ', 'argument']);
    expect(
      surCmd?.kind === 'command' &&
        surCmd.children[2]?.kind === 'argument' &&
        surCmd.children[2].children[0]?.kind === 'token' &&
        surCmd.children[2].children[0].token.value
    ).toBe('😀');
    expect(surrogate.root.children.some((n) => n.kind === 'token' && n.token.value === 'x')).toBe(
      true
    );
    expect(surrogate.root.children.some((n) => n.kind === 'group')).toBe(true);

    const verbInArgs = resolve('\\section[\\verb|]|]{\\verb|{|}\\href{\\verb|u|}{\\textbf{t}}');
    ready(verbInArgs);
    const verbSec = walkConfiguredNodes(verbInArgs.root).find((n) => n.kind === 'section');
    expect(verbSec?.kind === 'section' && verbSec.name).toBe('\\verb|{|');

    const macroBody = resolve(
      '\\newcommand{\\mybold}[1]{\\textbf{#1}\\label{x}}\\def\\g#1{\\cite{#1}}\\mybold{hi}'
    );
    ready(macroBody);
    // \textbf and \label inside macro bodies stay opaque leaves, while \mybold is inferred.
    const docCmds = walkConfiguredNodes(macroBody.root).filter((n) => n.kind === 'command');
    expect(docCmds.map((c) => c.kind === 'command' && c.name)).toEqual(['mybold']);

    // INV-3: Pipeline B ignores malformed non-condition commands.
    const cond = realizeProjectConditions(snapshot('\\iftrue\\textbf{\\else\\frac{a}\\fi'));
    expect(cond.status).toBe('ready');

    // Unknown commands do not swallow adjacent {...} into opaqueArguments in scan.ts.
    const unknownGroup = snapshot('\\def\\unused{}\\relax{\\unused}');
    const unusedFact = inspectProject(unknownGroup, { kinds: ['command-use'] }).facts.find(
      (f) => f.kind === 'command-use' && f.name === 'unused'
    );
    expect(unusedFact?.context.opaqueArguments).toEqual([]);
  });

  it('parses additional standard LaTeX signatures and rejects missing mandatory arguments at the command', () => {
    const ok = resolve(
      '\\usepackage[utf8]{inputenc}[2020/01/01]\\textcolor[rgb]{1,0,0}{\\textbf{hi}}\\frac 1 2\\sqrt[3]{x}\\parbox[t][2cm]{3cm}{body}\\item[n] x\\\\*[5pt]'
    );
    ready(ok);
    const cmds = walkConfiguredNodes(ok.root).filter((n) => n.kind === 'command');
    expect(cmds.map((c) => c.kind === 'command' && c.name)).toEqual([
      'usepackage',
      'textcolor',
      'textbf',
      'frac',
      'sqrt',
      'parbox',
      'item',
      '\\',
    ]);
    const pkg = cmds[0]!;
    expect(pkg.kind === 'command' && pkg.arguments.map((a) => a.slot)).toEqual([0, 1, 2]);
    const lineBreak = cmds[7]!;
    expect(lineBreak.kind === 'command' && [lineBreak.starred, lineBreak.arguments.length]).toEqual(
      [true, 1]
    );

    failure(resolve('\\label x'), 'blocked', 'malformed-syntax');
    for (const bad of ['\\cite{k', '\\frac{a}', '\\textbf}', '\\textcolor{red}']) {
      const v = resolve(bad);
      failure(v, 'blocked', 'structural-error');
    }
  });

  it('supports ignore condition policy visiting all branches and treating conditionals as normal commands', () => {
    const tex = [
      '\\newif\\ifdraft\\drafttrue',
      '\\ifdraft',
      '\\section{Draft}\\badge{a}',
      '\\else',
      '\\section{Final}\\badge{b}',
      '\\fi',
      '\\ifunknown\\badge{c}\\fi',
      '\\ifthenelse{1=1}{\\badge{d}}{}',
    ].join('\n');

    const view = resolveProjectView(snapshot(tex), {
      entryPath: 'main.tex',
      conditions: { mode: 'ignore' },
    });
    ready(view);
    expect(view.decisions).toEqual([]);
    expect(selected(view)).toBe(tex);

    const sections = walkConfiguredNodes(view.root)
      .filter((n) => n.kind === 'section')
      .map((n) => (n.kind === 'section' ? n.name : ''));
    expect(sections).toEqual(['Draft', 'Final']);

    const badgeCount = view.reachedFacts.filter(
      (f) => f.fact.kind === 'command-use' && f.fact.name === 'badge'
    ).length;
    expect(badgeCount).toBe(4);

    // Coarse tree hides conditional scaffolding (\newif, \ifdraft, \else, \fi) by default
    const coarse = buildCoarseViewTree(view);
    const coarseNames = coarse.root.children.flatMap((c) => [
      c.name,
      ...c.children.map((g) => g.name),
    ]);
    expect(coarseNames).toContain('Draft');
    expect(coarseNames).toContain('Final');
    expect(coarseNames).not.toContain('ifdraft');
    expect(coarseNames).not.toContain('else');
    expect(coarseNames).not.toContain('fi');
    expect(coarseNames).not.toContain('newif');
    expect(coarseNames).not.toContain('drafttrue');

    // Cross-branch unbalanced structures still report structural-error in ignore mode
    const mismatched = resolveProjectView(
      snapshot('\\ifdraft\\begin{itemize}\\else\\begin{enumerate}\\fi\\item X\\end{itemize}'),
      { entryPath: 'main.tex', conditions: { mode: 'ignore' } }
    );
    failure(mismatched, 'blocked', 'structural-error');

    // mode: 'none' still strictly blocks on unrealized conditions (INV-4)
    failure(
      resolveProjectView(snapshot('\\ifdraft A\\fi'), {
        entryPath: 'main.tex',
        conditions: { mode: 'none' },
      }),
      'blocked',
      'unrealized-condition'
    );

    // Standalone Pipeline B condition realization rejects 'ignore' mode
    expect(() =>
      realizeProjectConditions(snapshot(tex), {
        conditions: { mode: 'ignore' } as never,
      })
    ).toThrow(/Invalid condition policy mode/);
  });

  it('resolves subfolder, entry-relative, quoted, and parenthesized relative inputs', () => {
    // 1. Braced, quoted, and parenthesized subfolder inputs from entry and nested subfolder files
    const multi = createProjectSnapshot([
      file('\\input{intro/part1}\\input{"intro/quoted"}\\input("intro/paren")', 'paper/main.tex'),
      file('\\input{intro/history.tex}\\input{sibling}', 'paper/intro/part1.tex'),
      file('HIST ', 'paper/intro/history.tex'),
      file('SIB ', 'paper/intro/sibling.tex'),
      file('QUOT ', 'paper/intro/quoted.tex'),
      file('PAR', 'paper/intro/paren.tex'),
    ]);
    const view = resolveProjectView(multi, {
      entryPath: 'paper/main.tex',
      conditions: { mode: 'ignore' },
    });
    ready(view);
    expect(selected(view)).toBe('HIST SIB QUOT PAR');

    // Scan facts record unquoted literal targets for quoted and parenthesized inputs
    const mainFacts = multi.files
      .find((f) => f.path === 'paper/main.tex')!
      .facts.filter((f) => f.kind === 'input');
    expect(
      mainFacts.map((f) =>
        f.kind === 'input' && f.target.kind === 'literal' ? f.target.value : null
      )
    ).toEqual(['intro/part1', 'intro/quoted', 'intro/paren']);

    // 2. Root-escaping relative paths are still rejected with invalid-input-path
    const escaping = resolveProjectView(
      createProjectSnapshot([file('\\input("../../outside")', 'paper/main.tex')]),
      { entryPath: 'paper/main.tex' }
    );
    failure(escaping, 'blocked', 'invalid-input-path');
  });

  it('supports command and recursive view input modes alongside ignore conditions', () => {
    const multi = createProjectSnapshot([
      file('\\section{Top}\n\\input{sub/part}\n\\input{missing}\\section{End}', 'main.tex'),
      file('\\subsection{Nested}\n% child comment\nBody', 'sub/part.tex'),
      file('\\section{Unused}', 'orphan.tex'),
    ]);

    // 1. Command mode: does not halt or follow \input; treats \input as a command node
    const cmdView = resolveProjectView(multi, {
      entryPath: 'main.tex',
      inputs: 'command',
      conditions: { mode: 'ignore' },
    });
    ready(cmdView);
    expect(cmdView.occurrences.map((o) => o.path)).toEqual(['main.tex']);
    expect(cmdView.coverage.issues).toEqual([]);
    const cmdInputs = walkConfiguredNodes(cmdView.root).filter(
      (n) => n.kind === 'command' && n.name === 'input'
    );
    expect(cmdInputs).toHaveLength(2);

    const cmdCoarse = buildCoarseViewTree(cmdView);
    const cmdCoarseInputs = cmdCoarse.root.children
      .flatMap((c) => [c, ...c.children])
      .filter((n) => n.kind === 'command' && n.name === 'input');
    expect(cmdCoarseInputs).toHaveLength(2);

    // 2. Recursive mode: follows reachable inputs, warns on missing, and groups in CoarseTree
    const recView = resolveProjectView(multi, {
      entryPath: 'main.tex',
      inputs: 'recursive',
      conditions: { mode: 'ignore' },
    });
    ready(recView);
    expect(recView.occurrences.map((o) => o.path)).toEqual(['main.tex', 'sub/part.tex']);
    expect(recView.coverage.issues.map((i) => i.code)).toEqual(['missing-input']);
    expect(recView.coverage.issues[0]?.severity).toBe('warning');

    const recCoarse = buildCoarseViewTree(recView);
    const topSection = recCoarse.root.children.find(
      (n) => n.kind === 'section' && n.name === 'Top'
    )!;
    const wrappedInput = topSection.children.find(
      (n) => n.kind === 'command' && n.name === 'input'
    )!;
    expect(wrappedInput.previewText).toBe('sub/part.tex');
    expect(wrappedInput.children.map((c) => [c.kind, c.name])).toEqual([['section', 'Nested']]);
  });
});
