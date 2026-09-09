import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  resolveProjectView,
  runAnalysis,
  planTransformation,
  runProjectPipeline,
  parseDocument,
  parseProject,
  serializeDocument,
  transformProject,
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
  exportOptions: { inputs: 'inline', conditions: 'materialize', suppressComments: true },
};

describe('C9 public pipeline and compatibility boundary', () => {
  it.each([
    [String.raw`\ifDraft A\else B\fi`, ['draft'], ' B'],
    [String.raw`\ifDraft A\else B\fi`, ['Draft'], ' A'],
    [String.raw`\iftrue A\else B\fi`, [], ' B'],
    [String.raw`\ifthenelse A\else B\fi`, ['thenelse'], ' A'],
    [
      '\\newif\\ifFoo\n\\Footrue ShouldNotShow\n\\Foofalse NeitherThis',
      [],
      'ShouldNotShow\nNeitherThis',
    ],
  ] as const)(
    'preserves legacy broad recognition, case and stripping: %s',
    (source, enabledConditions, expected) => {
      const parsed = parseDocument(source);
      const project = parseProject([{ path: 'main.tex', source, version: 1 }]);
      expect(serializeDocument(parsed.root)).toBe(source);
      expect(serializeDocument(parsed.root, { enabledConditions })).toBe(expected);
      expect(transformProject('main.tex', project, { enabledConditions }).files[0]!.source).toBe(
        expected
      );
    }
  );
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
  it('allows no analyses and exposes incomplete interpretation through a typed failure', () => {
    expect(runProjectPipeline(files, { ...options, analyses: [] }).analyses).toEqual([]);
    expect(() =>
      runProjectPipeline(
        [{ path: 'main.tex', source: String.raw`\ifunknown X\fi`, version: 1 }],
        options
      )
    ).toThrow(expect.objectContaining({ code: PrepTexErrorCode.OperationUnavailable }));
  });
  it.each([
    { ...options, enabledConditions: [] },
    { ...options, configuration: { entryPath: 'main.tex', enabledConditions: [] } },
    { ...options, analyses: [{ operation: 'identity', options: { target: 'source' } }] },
    { ...options, analyses: null },
    {
      ...options,
      exportOptions: { inputs: 'inline', conditions: 'materialize', inputHandling: 'flatten' },
    },
  ])('rejects ambiguous or malformed pipeline options before execution', (value) => {
    expect(() => runProjectPipeline(files, value as never)).toThrow(
      expect.objectContaining({ code: PrepTexErrorCode.InvalidArgument })
    );
  });
  it.each([
    'entryPath',
    'conditions',
    'configuration',
    'traversal',
    'scanOptions',
    'exportOptions',
    'inputs',
    'maxOutputCodeUnits',
  ])('rejects new %s settings on legacy entry points', (field) => {
    const mixed = { [field]: {} };
    const parsed = parseDocument('A');
    const project = parseProject([{ path: 'main.tex', source: 'A', version: 1 }]);
    for (const action of [
      () => parseDocument('A', mixed),
      () => parseProject(files, mixed),
      () => serializeDocument(parsed.root, mixed),
      () => transformProject('main.tex', project, mixed),
    ])
      expect(action).toThrow(expect.objectContaining({ code: PrepTexErrorCode.InvalidArgument }));
  });
});
