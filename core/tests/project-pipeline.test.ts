import { describe, expect, it } from 'vitest';
import {
  applyProjectEdits,
  createProjectSnapshot,
  realizeProjectConditions,
  resolveProjectView,
  runAnalysis,
  planTransformation,
  runProjectPipeline,
  PrepTexErrorCode,
  type ProjectPipelineOptions,
} from '../src/index.js';

const files = [
  { path: 'main.tex', source: String.raw`\ref{x}\input{part}`, version: 1 },
  {
    path: 'part.tex',
    source: String.raw`\label{x}A%comment
B`,
    version: 1,
  },
];
const options: ProjectPipelineOptions = {
  configuration: { entryPath: 'main.tex' },
  analyses: [{ operation: 'references' }],
  exportOptions: { inputs: 'inline', suppressComments: true },
};

describe('C9 public pipeline and two-pipeline composition', () => {
  it('equals independently composed public operations and retains immutable source identity', () => {
    const source = createProjectSnapshot(files);
    const view = resolveProjectView(source, options.configuration);
    const result = runProjectPipeline(files, options);
    expect(result).toEqual({
      kind: 'pipeline',
      snapshot: source,
      view,
      analyses: [runAnalysis(view, { operation: 'references' })],
      transformation: planTransformation(view, {
        operation: 'export-project',
        options: options.exportOptions,
      }),
    });
    expect(result.view.snapshot).toBe(result.snapshot);
    expect(result.analyses[0]!.references[0]!.forward).toBe(true);
    expect(result.transformation.artifacts[0]!.source).toBe(String.raw`\ref{x}\label{x}AB`);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.analyses)).toBe(true);
    expect(structuredClone(result)).toEqual(result);
    expect(files[1]!.source).toContain('%comment');
  });

  it('composes Pipeline B (realizeProjectConditions) with Pipeline A (runProjectPipeline with mode: none)', () => {
    const rawFiles = [
      {
        path: 'main.tex',
        source: String.raw`\newif\ifdraft\drafttrue\ifdraft\ref{x}\input{part}\else\ref{y}\fi`,
        version: 1,
      },
      {
        path: 'part.tex',
        source: String.raw`\ifdraft\label{x}A\else\label{y}B\fi`,
        version: 1,
      },
    ];
    const snap1 = createProjectSnapshot(rawFiles);
    const realized = realizeProjectConditions(snap1, {
      entryPath: 'main.tex',
      conditions: { mode: 'source' },
    });
    expect(realized.status).toBe('ready');
    const snap2 = applyProjectEdits(snap1, realized.editPlan!);
    const result = runProjectPipeline(
      snap2.files.map((f) => ({ path: f.path, source: f.source, version: f.version })),
      {
        configuration: { entryPath: 'main.tex', conditions: { mode: 'none' } },
        analyses: [{ operation: 'references' }],
        exportOptions: { inputs: 'inline' },
      }
    );
    expect(result.view.status).toBe('ready');
    expect(result.analyses[0]!.references.map((r) => r.status)).toEqual(['matched']);
    expect(result.transformation.artifacts[0]!.source).toBe(String.raw`\ref{x}\label{x}A`);
  });

  it('allows no analyses and exposes incomplete or unrealized interpretation through a typed failure', () => {
    expect(runProjectPipeline(files, { ...options, analyses: [] }).analyses).toEqual([]);
    expect(() =>
      runProjectPipeline(
        [{ path: 'main.tex', source: String.raw`\ifunknown X\fi`, version: 1 }],
        options
      )
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
    expect(() =>
      runProjectPipeline([{ path: 'main.tex', source: String.raw`\iftrue X\fi`, version: 1 }], {
        ...options,
        configuration: { entryPath: 'main.tex', conditions: { mode: 'none' } },
      })
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
  });

  it.each([
    { ...options, enabledConditions: [] },
    { ...options, configuration: { entryPath: 'main.tex', enabledConditions: [] } },
    {
      ...options,
      analyses: [{ operation: 'realize-conditions', options: { conditions: { mode: 'source' } } }],
    },
    { ...options, analyses: null },
    {
      ...options,
      exportOptions: { inputs: 'inline', conditions: 'materialize' },
    },
    {
      ...options,
      exportOptions: { inputs: 'inline', inputHandling: 'flatten' },
    },
  ])('rejects ambiguous or malformed pipeline options before execution', (value) => {
    expect(() => runProjectPipeline(files, value as never)).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.InvalidArgument })
    );
  });
});
