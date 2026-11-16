import { describe, expect, it } from 'vitest';
import {
  applyProjectEdits,
  buildCoarseViewTree,
  createProjectSnapshot,
  planTransformation,
  PrepTexErrorCode,
  resolveProjectView,
  type CoarseNode,
  type ProjectView,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

function flattenCoarse(node: CoarseNode): CoarseNode[] {
  return [node, ...node.children.flatMap(flattenCoarse)];
}

describe('Phase C2: Coarse View Tree (buildCoarseViewTree)', () => {
  it('builds a clean coarse tree hiding lexical noise and built-in inline formatting by default', () => {
    const src = [
      '\\documentclass{article}',
      '\\newcommand{\\myterm}[2][opt]{#1: \\textbf{#2}}',
      '\\begin{document}',
      '\\section[Intro]{Introduction with \\textbf{bold}}',
      'Some prose with \\emph{emphasis}, $x^2 + y^2 = z^2$, and \\cite{knuth84}.',
      '\\begin{theorem}[Main]\\label{thm:main}',
      '  \\myterm[key]{value} and \\unknowncmd{u}',
      '\\end{theorem}',
      '\\end{document}',
    ].join('\n');

    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const coarse = buildCoarseViewTree(view);
    expect(coarse.kind).toBe('coarse-tree');
    expect(coarse.snapshotId).toBe(view.snapshotId);
    expect(coarse.viewId).toBe(view.id);
    expect(Object.isFrozen(coarse)).toBe(true);
    expect(Object.isFrozen(coarse.root.children)).toBe(true);

    const all = flattenCoarse(coarse.root);
    // No spaces, brace groups, inline math, or built-in formatting (\textbf, \emph, \cite, \label, \documentclass) by default
    expect(
      all.some((n) => n.kind === 'group' || n.kind === 'math' || n.kind === 'text-block')
    ).toBe(false);
    expect(
      all.some((n) => n.kind === 'command' && (n.name === 'textbf' || n.name === 'emph'))
    ).toBe(false);

    // Root -> environment(document) -> section(Introduction...) -> environment(theorem) -> [argument([Main]), command(myterm), command(unknowncmd)]
    const doc = coarse.root.children.find(
      (n) => n.kind === 'environment' && n.name === 'document'
    )!;
    expect(doc).toBeDefined();

    const sec = doc.children.find((n) => n.kind === 'section')!;
    expect(sec.name).toBe('Introduction with \\textbf{bold}');
    expect(sec.previewText).toBe('Intro');
    expect(sec.sectionLevel).toBe(1);
    // Section header arguments are absorbed; only body structures appear as children
    expect(sec.children.every((c) => c.kind !== 'argument')).toBe(true);

    const thm = sec.children.find((n) => n.kind === 'environment' && n.name === 'theorem')!;
    expect(thm).toBeDefined();
    expect(thm.editableName).toBe(true);
    expect(thm.selection).not.toBeNull();
    expect(thm.children.map((c) => [c.kind, c.name])).toEqual([
      ['argument', '[#1]'],
      ['command', 'myterm'],
      ['command', 'unknowncmd'],
    ]);

    const thmArg = thm.children[0]!;
    expect(thmArg.previewText).toBe('Main');
    expect(thmArg.argumentInfo).toEqual({
      argKind: 'optional',
      slot: 0,
      delimiter: 'bracket',
      opaque: false,
    });

    const myterm = thm.children[1]!;
    expect(myterm.children.map((c) => [c.kind, c.name, c.previewText])).toEqual([
      ['argument', '[#1]', 'key'],
      ['argument', '{#2}', 'value'],
    ]);
  });

  it('supports coarse tree options: includeBuiltinCommands, commandFilter, includeMath, includeDisplayMath, includeGroups, includeTextBlocks', () => {
    const src = '\\section{S}Hello {world} \\textbf{B} $a$ \\[b\\]';
    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const withBuiltin = buildCoarseViewTree(view, {
      includeBuiltinCommands: true,
      includeDisplayMath: true,
      includeGroups: true,
      includeTextBlocks: true,
    });
    const allBuiltin = flattenCoarse(withBuiltin.root);
    expect(allBuiltin.some((n) => n.kind === 'command' && n.name === 'textbf')).toBe(true);
    expect(allBuiltin.some((n) => n.kind === 'math' && n.name === '\\[')).toBe(true);
    expect(allBuiltin.some((n) => n.kind === 'math' && n.name === '$')).toBe(false);
    expect(allBuiltin.some((n) => n.kind === 'group')).toBe(true);
    expect(allBuiltin.some((n) => n.kind === 'text-block' && n.previewText.includes('Hello'))).toBe(
      true
    );

    const filteredCmd = buildCoarseViewTree(view, {
      commandFilter: ['textbf'],
      includeMath: true,
    });
    const allFiltered = flattenCoarse(filteredCmd.root);
    expect(allFiltered.some((n) => n.kind === 'command' && n.name === 'textbf')).toBe(true);
    expect(allFiltered.filter((n) => n.kind === 'math')).toHaveLength(2);
  });

  it('hoists children inside anonymous brace groups when includeGroups is false', () => {
    const src = '{\\begin{itemize}\\item A\\end{itemize}}';
    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const coarse = buildCoarseViewTree(view);
    expect(coarse.root.children.map((c) => [c.kind, c.name])).toEqual([['environment', 'itemize']]);
  });

  it('preserves NodeSelection on coarse nodes so edits can be planned directly from them', () => {
    const src = '\\begin{enumerate}[label=(\\alph*)]\\item One\\end{enumerate}';
    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const coarse = buildCoarseViewTree(view);
    const enumNode = coarse.root.children.find((n) => n.kind === 'environment')!;
    expect(enumNode.selection).not.toBeNull();

    const result = planTransformation(view, {
      operation: 'edit-nodes',
      options: {
        target: 'selected',
        actions: [{ kind: 'rename-environment', selection: enumNode.selection!, name: 'itemize' }],
      },
    });
    const updated = applyProjectEdits(view.snapshot, result.editPlan!, view);
    expect(updated.files[0]!.source).toBe(
      '\\begin{itemize}[label=(\\alph*)]\\item One\\end{itemize}'
    );
  });

  it('rejects incomplete or blocked views', () => {
    const blocked = resolveProjectView(snapshot('\\ifunknown A\\fi'), { entryPath: 'main.tex' });
    expect(() => buildCoarseViewTree(blocked)).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable })
    );
  });
});
