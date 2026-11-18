import { describe, expect, it } from 'vitest';
import {
  applyProjectEdits,
  createProjectSnapshot,
  planCompositeTransformation,
  planTransformation,
  PrepTexErrorCode,
  resolveProjectView,
  selectProjectNode,
  walkConfiguredNodes,
  type ProjectView,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

describe('Phase C6: Composable Multi-Step Transformation Pipeline (planCompositeTransformation)', () => {
  it('composes realize-conditions -> refactor-symbols -> remove-environments -> suppress-comments into one unified ProjectEditPlan', () => {
    const src = [
      '\\newif\\ifdraft\\drafttrue',
      '\\newcommand{\\myvec}[1]{\\mathbf{#1}}',
      '\\begin{comment}drop me\\end{comment}',
      '\\ifdraft',
      '\\section{Draft}\\label{sec:a}',
      'Use \\myvec{x} in \\ref{sec:a}. % trailing comment',
      '\\else',
      'Hidden',
      '\\fi',
      '\\begin{draftnote}todo\\end{draftnote}',
    ].join('\n');

    const snap = snapshot(src);
    const result = planCompositeTransformation(snap, {
      configuration: { entryPath: 'main.tex', conditions: { mode: 'source' } },
      steps: [
        { operation: 'realize-conditions', options: { conditions: { mode: 'source' } } },
        {
          operation: 'refactor-symbols',
          options: {
            actions: [
              { kind: 'rename-command-globally', oldName: 'myvec', newName: 'boldVec' },
              { kind: 'rename-label-globally', oldKey: 'sec:a', newKey: 'sec:main' },
            ],
          },
        },
        {
          operation: 'remove-environments',
          options: { target: 'selected', names: ['draftnote'] },
        },
        {
          operation: 'suppress-comments',
          options: { target: 'selected', suppressCommentEnvironments: true },
        },
      ],
    });

    expect(result.kind).toBe('transformation');
    expect(result.editPlan).not.toBeNull();
    expect(Object.isFrozen(result)).toBe(true);

    const applied = applyProjectEdits(snap, result.editPlan!);
    const expected = [
      '\\newcommand{\\boldVec}[1]{\\mathbf{#1}}',
      '',
      '\\section{Draft}\\label{sec:main}',
      'Use \\boldVec{x} in \\ref{sec:main}. ',
    ].join('\n');

    expect(applied.files[0]!.source).toBe(expected);
    expect(result.artifacts[0]!.source).toBe(expected);

    // Verify composed result equals step-by-step application
    const s1 = applyProjectEdits(
      snap,
      planTransformation(snap, {
        operation: 'realize-conditions',
        options: { conditions: { mode: 'source' } },
      }).editPlan!
    );
    const v1 = resolveProjectView(s1, { entryPath: 'main.tex', conditions: { mode: 'none' } });
    ready(v1);
    const s2 = applyProjectEdits(
      s1,
      planTransformation(v1, {
        operation: 'refactor-symbols',
        options: {
          actions: [
            { kind: 'rename-command-globally', oldName: 'myvec', newName: 'boldVec' },
            { kind: 'rename-label-globally', oldKey: 'sec:a', newKey: 'sec:main' },
          ],
        },
      }).editPlan!,
      v1
    );
    const v2 = resolveProjectView(s2, { entryPath: 'main.tex', conditions: { mode: 'none' } });
    ready(v2);
    const s3 = applyProjectEdits(
      s2,
      planTransformation(v2, {
        operation: 'remove-environments',
        options: { target: 'selected', names: ['draftnote'] },
      }).editPlan!,
      v2
    );
    const v3 = resolveProjectView(s3, { entryPath: 'main.tex', conditions: { mode: 'none' } });
    ready(v3);
    const s4 = applyProjectEdits(
      s3,
      planTransformation(v3, {
        operation: 'suppress-comments',
        options: { target: 'selected', suppressCommentEnvironments: true },
      }).editPlan!,
      v3
    );
    expect(applied.files[0]!.source).toBe(s4.files[0]!.source);
  });

  it('supports starting with edit-nodes on a view and ending with export-project (inline)', () => {
    const snap = createProjectSnapshot([
      file('\\begin{enumerate}\\item A\\end{enumerate}\\input{sec}'),
      file('% comment\nBody', 'sec.tex'),
    ]);
    const view = resolveProjectView(snap, { entryPath: 'main.tex' });
    ready(view);
    const enumNode = walkConfiguredNodes(view.root).find(
      (n) => n.kind === 'environment' && n.name === 'enumerate'
    )!;

    const result = planCompositeTransformation(view, {
      steps: [
        {
          operation: 'edit-nodes',
          options: {
            target: 'selected',
            actions: [
              {
                kind: 'rename-environment',
                selection: selectProjectNode(view, enumNode.occurrenceKey),
                name: 'itemize',
              },
            ],
          },
        },
        {
          operation: 'export-project',
          options: { inputs: 'inline', suppressComments: true },
        },
      ],
    });

    expect(result.editPlan).toBeNull();
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.source).toBe('\\begin{itemize}\\item A\\end{itemize}Body');
  });

  it('works through planTransformation with operation compose-transformations and rejects invalid step sequences', () => {
    const snap = snapshot('A\\iftrue B\\fi');
    const viaPlan = planTransformation(snap, {
      operation: 'compose-transformations',
      options: {
        steps: [{ operation: 'realize-conditions', options: { conditions: { mode: 'source' } } }],
      },
    });
    expect(applyProjectEdits(snap, viaPlan.editPlan!).files[0]!.source).toBe('AB');

    expect(() =>
      planCompositeTransformation(snap, {
        steps: [],
      })
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.InvalidArgument }));

    expect(() =>
      planCompositeTransformation(snap, {
        configuration: { entryPath: 'main.tex' },
        steps: [
          { operation: 'export-project', options: { inputs: 'inline' } },
          { operation: 'suppress-comments', options: { target: 'selected' } },
        ],
      })
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
  });

  it('composes snapshot-wide (target: source) steps across all branches without ViewConfiguration or Phase 0', () => {
    const src = [
      '\\newcommand{\\myvec}[1]{\\mathbf{#1}}',
      '\\ifunknown',
      '\\myvec{a} % c1',
      '\\begin{note}n1\\end{note}',
      '\\else',
      '\\myvec{b} % c2',
      '\\begin{note}n2\\end{note}',
      '\\fi',
    ].join('\n');
    const snap = snapshot(src);

    const res = planCompositeTransformation(snap, {
      steps: [
        {
          operation: 'refactor-symbols',
          options: {
            target: 'source',
            actions: [{ kind: 'rename-command-globally', oldName: 'myvec', newName: 'vecBold' }],
          },
        },
        {
          operation: 'remove-environments',
          options: { target: 'source', names: ['note'] },
        },
        {
          operation: 'suppress-comments',
          options: { target: 'source', suppressCommentEnvironments: true },
        },
      ],
    });

    expect(res.provenance.viewId).toBeNull();
    expect(res.editPlan).not.toBeNull();
    const applied = applyProjectEdits(snap, res.editPlan!);
    expect(applied.files[0]!.source).toBe(
      [
        '\\newcommand{\\vecBold}[1]{\\mathbf{#1}}',
        '\\ifunknown',
        '\\vecBold{a} ',
        '\\else',
        '\\vecBold{b} ',
        '\\fi',
      ].join('\n')
    );
  });

  it('composes realize-conditions -> expand-inputs -> suppress-comments into one ProjectEditPlan with warnings', () => {
    const snap = createProjectSnapshot([
      file('\\newif\\ifdraft\\drafttrue\n\\ifdraft\\input{part}\\fi\n\\input{missing}\n% top'),
      file('% part\nHello', 'part.tex'),
    ]);

    const res = planCompositeTransformation(snap, {
      configuration: { entryPath: 'main.tex', inputs: 'command', conditions: { mode: 'source' } },
      steps: [
        { operation: 'realize-conditions', options: { conditions: { mode: 'source' } } },
        { operation: 'expand-inputs', options: { mode: 'recursive', target: 'selected' } },
        { operation: 'suppress-comments', options: { target: 'selected' } },
      ],
    });

    expect(res.editPlan).not.toBeNull();
    expect(res.coverage.issues.some((i) => i.code === 'missing-input')).toBe(true);
    const applied = applyProjectEdits(snap, res.editPlan!);
    expect(applied.files.find((f) => f.path === 'main.tex')!.source).toBe(
      'Hello\n\\input{missing}\n'
    );
  });
});
