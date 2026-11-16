import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  extractProjectMetadata,
  resolveProjectView,
  type ProjectView,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

describe('Phase C5: Document Metadata Extraction (extractProjectMetadata)', () => {
  it('extracts title, short title, authors with notes, date, abstract, class, packages, bibliography, keywords, and stats', () => {
    const src = [
      '\\documentclass[11pt,twocolumn]{article}',
      '\\usepackage[utf8]{inputenc}',
      '\\usepackage{amsmath,amssymb}',
      '\\newcommand{\\myop}{\\operatorname{Op}}',
      '\\title[Short Title]{A \\textbf{Great} Paper}',
      '\\author{Alice Smith\\thanks{MIT} \\and Bob Jones\\affil{ETH Zurich}}',
      '\\date{November 2026}',
      '\\keywords{LaTeX, AST, Refactoring}',
      '\\bibliographystyle{plain}',
      '\\begin{document}',
      '\\maketitle',
      '\\begin{abstract}',
      'We study \\emph{structured} TeX.',
      '\\end{abstract}',
      '\\section{Intro}\\label{s1}',
      'Math $x+y$ and \\myop and \\undefcmd.',
      '\\begin{figure}F\\end{figure}\\begin{table}T\\end{table}',
      'See \\ref{s1} and \\cite{a,b}.',
      '\\bibliography{refs,extra}',
      '\\end{document}',
    ].join('\n');

    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const meta = extractProjectMetadata(view);
    expect(meta.kind).toBe('metadata');
    expect(Object.isFrozen(meta)).toBe(true);

    expect(meta.title?.text).toBe('A Great Paper');
    expect(meta.title?.shortText).toBe('Short Title');
    expect(meta.title?.rawSource).toBe('A \\textbf{Great} Paper');
    expect(meta.title?.contentLocation).not.toBeNull();
    expect(meta.title?.nodeKey).not.toBeNull();

    expect(meta.authors).toHaveLength(2);
    expect(meta.authors[0]!.name).toBe('Alice Smith');
    expect(meta.authors[0]!.notes).toEqual(['MIT']);
    expect(meta.authors[1]!.name).toBe('Bob Jones');
    expect(meta.authors[1]!.notes).toEqual(['ETH Zurich']);

    expect(meta.date?.text).toBe('November 2026');
    expect(meta.abstract?.text).toBe('We study structured TeX.');
    expect(meta.abstract?.contentLocation).not.toBeNull();

    expect(meta.documentClass).toMatchObject({
      name: 'article',
      options: ['11pt', 'twocolumn'],
    });
    expect(meta.packages.map((p) => [p.names, p.options])).toEqual([
      [['inputenc'], ['utf8']],
      [['amsmath', 'amssymb'], []],
    ]);
    expect(meta.bibliography.style).toBe('plain');
    expect(meta.bibliography.resources).toEqual(['refs', 'extra']);
    expect(meta.keywords).toEqual(['LaTeX', 'AST', 'Refactoring']);

    expect(meta.stats).toEqual({
      totalFiles: 1,
      reachedFiles: 1,
      sectionCount: 1,
      environmentCount: 4,
      commandUseCount: expect.any(Number),
      introducedCommandCount: 1,
      undefinedCommandCount: 1,
      mathCount: 1,
      figureCount: 1,
      tableCount: 1,
      citationCount: 2,
      labelCount: 1,
      referenceCount: 1,
    });
  });

  it('works on a ProjectSnapshot directly across included files and handles missing fields gracefully', () => {
    const snap = createProjectSnapshot([
      file('\\title{Main Title}\\input{meta}'),
      file('\\author{Only Author}\\begin{abstract}Short abs\\end{abstract}', 'meta.tex'),
    ]);
    const meta = extractProjectMetadata(snap);
    expect(meta.viewId).toBeNull();
    expect(meta.title?.text).toBe('Main Title');
    expect(meta.authors.map((a) => a.name)).toEqual(['Only Author']);
    expect(meta.abstract?.text).toBe('Short abs');
    expect(meta.date).toBeNull();
    expect(meta.documentClass).toBeNull();
    expect(meta.stats.totalFiles).toBe(2);
  });
});
