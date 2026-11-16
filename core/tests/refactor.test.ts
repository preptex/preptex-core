import { describe, expect, it } from 'vitest';
import {
  applyProjectEdits,
  createProjectSnapshot,
  inspectProject,
  planTransformation,
  PrepTexErrorCode,
  resolveProjectView,
  selectProjectNode,
  walkConfiguredNodes,
  type ProjectView,
  type TransformationResult,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

function applyResult(v: ProjectView, r: TransformationResult): string {
  expect(r.editPlan).not.toBeNull();
  const updated = applyProjectEdits(v.snapshot, r.editPlan!, v);
  expect(updated.files[0]!.source).toBe(r.artifacts[0]!.source);
  return updated.files[0]!.source;
}

describe('Phase C4: Single-node editing extensions (NodeEditAction)', () => {
  it('renames a single command node or undefined command token while preserving * and arguments', () => {
    const src = '\\textbf{hello} \\emph{world} \\undefCmd{arg}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const all = walkConfiguredNodes(v.root);
    const bold = all.find((n) => n.kind === 'command' && n.name === 'textbf')!;
    const undef = all.find((n) => n.kind === 'token' && n.token.name === 'undefCmd')!;

    const res = planTransformation(v, {
      operation: 'edit-nodes',
      options: {
        target: 'selected',
        actions: [
          {
            kind: 'rename-command',
            selection: selectProjectNode(v, bold.occurrenceKey),
            name: 'textit',
          },
          {
            kind: 'rename-command',
            selection: selectProjectNode(v, undef.occurrenceKey),
            name: 'definedCmd',
          },
        ],
      },
    });
    expect(applyResult(v, res)).toBe('\\textit{hello} \\emph{world} \\definedCmd{arg}');
  });

  it('renames section level and starred flag cleanly', () => {
    const src = '\\section*{Intro}Body\\subsection{Sub}Text';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const sections = walkConfiguredNodes(v.root).filter((n) => n.kind === 'section');
    const res = planTransformation(v, {
      operation: 'edit-nodes',
      options: {
        target: 'selected',
        actions: [
          {
            kind: 'rename-section',
            selection: selectProjectNode(v, sections[0]!.occurrenceKey),
            sectionCommand: 'subsection',
            starred: false,
          },
          {
            kind: 'rename-section',
            selection: selectProjectNode(v, sections[1]!.occurrenceKey),
            sectionCommand: 'subsubsection',
            starred: true,
          },
        ],
      },
    });
    expect(applyResult(v, res)).toBe('\\subsection{Intro}Body\\subsubsection*{Sub}Text');
  });

  it('unwraps environments, groups, and single-argument formatting commands while rejecting multi-arg commands', () => {
    const src = '\\begin{center}{\\textbf{Hello}}\\end{center}\\href{u}{t}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const all = walkConfiguredNodes(v.root);
    const center = all.find((n) => n.kind === 'environment')!;
    const grp = all.find((n) => n.kind === 'group')!;
    const bold = all.find((n) => n.kind === 'command' && n.name === 'textbf')!;
    const href = all.find((n) => n.kind === 'command' && n.name === 'href')!;

    expect(
      applyResult(
        v,
        planTransformation(v, {
          operation: 'edit-nodes',
          options: {
            target: 'selected',
            actions: [
              { kind: 'unwrap-node', selection: selectProjectNode(v, center.occurrenceKey) },
            ],
          },
        })
      )
    ).toBe('{\\textbf{Hello}}\\href{u}{t}');

    expect(
      applyResult(
        v,
        planTransformation(v, {
          operation: 'edit-nodes',
          options: {
            target: 'selected',
            actions: [{ kind: 'unwrap-node', selection: selectProjectNode(v, grp.occurrenceKey) }],
          },
        })
      )
    ).toBe('\\begin{center}\\textbf{Hello}\\end{center}\\href{u}{t}');

    expect(
      applyResult(
        v,
        planTransformation(v, {
          operation: 'edit-nodes',
          options: {
            target: 'selected',
            actions: [{ kind: 'unwrap-node', selection: selectProjectNode(v, bold.occurrenceKey) }],
          },
        })
      )
    ).toBe('\\begin{center}{Hello}\\end{center}\\href{u}{t}');

    expect(() =>
      planTransformation(v, {
        operation: 'edit-nodes',
        options: {
          target: 'selected',
          actions: [{ kind: 'unwrap-node', selection: selectProjectNode(v, href.occurrenceKey) }],
        },
      })
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
  });
});

describe('Phase C4: Bulk catalog refactorings & metadata edits (refactor-symbols)', () => {
  it('renames a command globally across all occurrences and its \\newcommand definition', () => {
    const src = '\\newcommand{\\myvec}[1]{\\mathbf{#1}}\\myvec{x} + \\myvec{y}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [{ kind: 'rename-command-globally', oldName: 'myvec', newName: 'vecBold' }],
      },
    });
    expect(applyResult(v, res)).toBe(
      '\\newcommand{\\vecBold}[1]{\\mathbf{#1}}\\vecBold{x} + \\vecBold{y}'
    );
  });

  it('edits a \\newcommand definition (name, numArgs, defaultArg, body)', () => {
    const src = '\\newcommand{\\greet}[1]{Hello #1}\\greet{World}';
    const snap = snapshot(src);
    const v = resolveProjectView(snap, { entryPath: 'main.tex' });
    ready(v);

    const defFact = inspectProject(snap, { kinds: ['definition'] }).facts[0]!;
    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [
          {
            kind: 'edit-command-definition',
            definitionLocation: { path: defFact.path, range: defFact.range },
            newName: 'salute',
            numArgs: 2,
            defaultArg: 'Hi',
            newBody: '#1 #2!',
          },
        ],
      },
    });
    expect(applyResult(v, res)).toBe('\\newcommand{\\salute}[2][Hi]{#1 #2!}\\greet{World}');
  });

  it('renames an environment globally across all uses and \\newenvironment definitions', () => {
    const src =
      '\\newenvironment{oldenv}{\\begin{quote}}{\\end{quote}}\\begin{oldenv}A\\end{oldenv}\\begin{oldenv}B\\end{oldenv}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [{ kind: 'rename-environment-globally', oldName: 'oldenv', newName: 'newenv' }],
      },
    });
    expect(applyResult(v, res)).toBe(
      '\\newenvironment{newenv}{\\begin{quote}}{\\end{quote}}\\begin{newenv}A\\end{newenv}\\begin{newenv}B\\end{newenv}'
    );
  });

  it('renames a condition globally across \\newif, setters, and tests', () => {
    const src = '\\newif\\ifdraft\\drafttrue\\ifdraft A\\else B\\fi\\draftfalse';
    const snap = snapshot(src);
    const res = planTransformation(snap, {
      operation: 'refactor-symbols',
      options: {
        target: 'source',
        actions: [{ kind: 'rename-condition-globally', oldName: 'draft', newName: 'preview' }],
      },
    });
    const updated = applyProjectEdits(snap, res.editPlan!);
    expect(updated.files[0]!.source).toBe(
      '\\newif\\ifpreview\\previewtrue\\ifpreview A\\else B\\fi\\previewfalse'
    );
  });

  it('renames a label key and a citation key globally across declarations and comma-separated lists', () => {
    const src = [
      '\\label{old:sec}\\ref{old:sec}\\cref{other, old:sec}',
      '\\cite{k1, oldcite, k2}\\bibitem{oldcite} Book',
    ].join('\n');
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [
          { kind: 'rename-label-globally', oldKey: 'old:sec', newKey: 'new:sec' },
          { kind: 'rename-citation-globally', oldKey: 'oldcite', newKey: 'newcite' },
        ],
      },
    });
    expect(applyResult(v, res)).toBe(
      [
        '\\label{new:sec}\\ref{new:sec}\\cref{other, new:sec}',
        '\\cite{k1, newcite, k2}\\bibitem{newcite} Book',
      ].join('\n')
    );
  });

  it('edits document metadata fields (title, short title, author, date, abstract) via edit-metadata', () => {
    const src = [
      '\\title[Old Short]{Old Title}',
      '\\author{Alice}',
      '\\date{2025}',
      '\\begin{abstract}Old abstract.\\end{abstract}',
    ].join('\n');
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [
          { kind: 'edit-metadata', field: 'title', newValue: 'New Title', shortValue: 'New Short' },
          { kind: 'edit-metadata', field: 'author', newValue: 'Alice \\and Bob' },
          { kind: 'edit-metadata', field: 'date', newValue: 'November 2026' },
          { kind: 'edit-metadata', field: 'abstract', newValue: 'New abstract.' },
        ],
      },
    });
    expect(applyResult(v, res)).toBe(
      [
        '\\title[New Short]{New Title}',
        '\\author{Alice \\and Bob}',
        '\\date{November 2026}',
        '\\begin{abstract}New abstract.\\end{abstract}',
      ].join('\n')
    );
  });

  it('supports target: artifact for Phase C4 single-node edits and Phase C5 symbol refactorings', () => {
    const src = [
      '\\section{Intro}',
      '\\textbf{Bold}',
      '\\begin{quote}Quoted\\end{quote}',
      '\\label{sec:a}\\ref{sec:a}',
      '\\title{Title}',
    ].join('\n');
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const nodes = walkConfiguredNodes(v.root);
    const secNode = nodes.find((n) => n.kind === 'section')!;
    const cmdNode = nodes.find((n) => n.kind === 'command' && n.name === 'textbf')!;
    const envNode = nodes.find((n) => n.kind === 'environment' && n.name === 'quote')!;

    const nodeArt = planTransformation(v, {
      operation: 'edit-nodes',
      options: {
        target: 'artifact',
        actions: [
          {
            kind: 'rename-section',
            selection: selectProjectNode(v, secNode.occurrenceKey),
            sectionCommand: 'subsection',
          },
          {
            kind: 'rename-command',
            selection: selectProjectNode(v, cmdNode.occurrenceKey),
            name: 'emph',
          },
          {
            kind: 'unwrap-node',
            selection: selectProjectNode(v, envNode.occurrenceKey),
          },
        ],
      },
    });
    expect(nodeArt.editPlan).toBeNull();
    expect(nodeArt.artifacts[0]!.source).toBe(
      [
        '\\subsection{Intro}',
        '\\emph{Bold}',
        'Quoted',
        '\\label{sec:a}\\ref{sec:a}',
        '\\title{Title}',
      ].join('\n')
    );

    const symArt = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'artifact',
        actions: [
          { kind: 'rename-label-globally', oldKey: 'sec:a', newKey: 'sec:intro' },
          { kind: 'edit-metadata', field: 'title', newValue: 'Updated', shortValue: 'Upd' },
        ],
      },
    });
    expect(symArt.editPlan).toBeNull();
    expect(symArt.artifacts[0]!.source).toBe(
      [
        '\\section{Intro}',
        '\\textbf{Bold}',
        '\\begin{quote}Quoted\\end{quote}',
        '\\label{sec:intro}\\ref{sec:intro}',
        '\\title[Upd]{Updated}',
      ].join('\n')
    );
  });

  it('edits \\def command definitions and clears optional metadata shortValue', () => {
    const src = '\\def\\foo#1{Hi #1}\\title[Short]{Long}\\foo{there}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const info = inspectProject(v.snapshot, { kinds: ['definition'] });
    const defFact = info.facts.find(
      (f) => f.kind === 'definition' && f.form === 'def' && f.name === 'foo'
    );
    expect(defFact).toBeDefined();
    if (!defFact || defFact.kind !== 'definition') throw new Error('expected definition fact');

    const res = planTransformation(v, {
      operation: 'refactor-symbols',
      options: {
        target: 'selected',
        actions: [
          {
            kind: 'edit-command-definition',
            definitionLocation: { path: defFact.path, range: defFact.range },
            newName: 'bar',
            newBody: 'Bye #1',
          },
          {
            kind: 'edit-metadata',
            field: 'title',
            newValue: 'Plain Title',
            shortValue: null,
          },
        ],
      },
    });
    expect(applyResult(v, res)).toBe('\\def\\bar#1{Bye #1}\\title{Plain Title}\\foo{there}');
  });

  it('rejects invalid symbol refactorings and invalid metadata shortValue with explicit PrepTexError codes', () => {
    const src =
      '\\newcommand{\\greet}[1]{Hi #1}\\abstract{Text}\\begin{abstract}Text\\end{abstract}\\date{2026}';
    const v = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(v);

    const info = inspectProject(v.snapshot, { kinds: ['definition'] });
    const defFact = info.facts.find(
      (f) => f.kind === 'definition' && f.form === 'newcommand' && f.name === 'greet'
    );
    if (!defFact || defFact.kind !== 'definition') throw new Error('expected definition fact');

    expect(() =>
      planTransformation(v, {
        operation: 'refactor-symbols',
        options: {
          target: 'selected',
          actions: [
            {
              kind: 'edit-command-definition',
              definitionLocation: { path: defFact.path, range: defFact.range },
              numArgs: 0,
              defaultArg: 'bad',
            },
          ],
        },
      })
    ).toThrowError(expect.objectContaining({ code: PrepTexErrorCode.InvalidEdit }));

    expect(() =>
      planTransformation(v, {
        operation: 'refactor-symbols',
        options: {
          target: 'selected',
          actions: [
            {
              kind: 'edit-metadata',
              field: 'abstract',
              newValue: 'Updated',
              shortValue: 'Short',
            },
          ],
        },
      })
    ).toThrowError(expect.objectContaining({ code: PrepTexErrorCode.InvalidEdit }));

    expect(() =>
      planTransformation(v, {
        operation: 'refactor-symbols',
        options: {
          target: 'selected',
          actions: [
            {
              kind: 'edit-metadata',
              field: 'date',
              newValue: '2027',
              shortValue: null,
            },
          ],
        },
      })
    ).toThrowError(expect.objectContaining({ code: PrepTexErrorCode.InvalidEdit }));

    expect(() =>
      planTransformation(v, {
        operation: 'refactor-symbols',
        options: {
          target: 'selected',
          actions: [
            { kind: 'rename-condition-globally', oldName: 'nonexistent', newName: 'other' },
          ],
        },
      })
    ).toThrowError(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
  });
});
