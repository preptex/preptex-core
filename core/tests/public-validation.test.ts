import { describe, expect, it } from 'vitest';
import {
  InputHandlingMode,
  NodeType,
  PrepTexError,
  PrepTexErrorCode,
  isContainerNode,
  mergeProjects,
  parseDocument,
  parseProject,
  serializeDocument,
  transformProject,
  type AstNode,
  type ParsedFile,
} from '../src/index';

function expectInvalidArgument(action: () => unknown): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(PrepTexError);
  expect((thrown as PrepTexError).code).toBe(PrepTexErrorCode.InvalidArgument);
}

function findFile(files: readonly ParsedFile[], path: string): ParsedFile {
  const file = files.find((candidate) => candidate.path === path);
  expect(file).toBeDefined();
  return file!;
}

function astNodes(root: AstNode): readonly AstNode[] {
  const nodes: AstNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    nodes.push(node);
    if (isContainerNode(node)) pending.push(...node.children);
  }
  return nodes;
}

describe('public runtime validation', () => {
  it('rejects null and non-object option arguments with a stable public error', () => {
    const parsed = parseDocument('text');
    const project = parseProject([{ path: 'main.tex', source: 'text', version: 1 }]);

    expectInvalidArgument(() => parseDocument('text', null as never));
    expectInvalidArgument(() => parseProject([], [] as never));
    expectInvalidArgument(() => serializeDocument(parsed.root, null as never));
    expectInvalidArgument(() => transformProject('main.tex', project, null as never));
  });

  it('rejects mistyped option fields instead of applying JavaScript truthiness', () => {
    const parsed = parseDocument('% comment');
    const project = parseProject([{ path: 'main.tex', source: 'text', version: 1 }]);

    expectInvalidArgument(() => parseDocument('text', { enabledTokens: 'Text' } as never));
    expectInvalidArgument(() => parseDocument('text', { maximumSectionLevel: 1.5 } as never));
    expectInvalidArgument(() =>
      serializeDocument(parsed.root, { suppressComments: 'false' } as never)
    );
    expectInvalidArgument(() =>
      transformProject('main.tex', project, { inputHandling: 'unknown' } as never)
    );
  });

  it('rejects drive-relative, absolute, and NUL-containing virtual paths', () => {
    expectInvalidArgument(() => parseDocument('text', { sourcePath: 'C:main.tex' }));
    expectInvalidArgument(() => parseDocument('text', { sourcePath: '/main.tex' }));
    expectInvalidArgument(() => parseDocument('text', { sourcePath: 'bad\0name.tex' }));
    expectInvalidArgument(() =>
      parseProject([{ path: 'D:chapter.tex', source: 'text', version: 1 }])
    );
  });

  it('rejects malformed roots and projects without leaking raw TypeErrors', () => {
    const malformedRoot = {
      type: NodeType.Root,
      id: 0,
      start: 0,
      end: 0,
      line: 1,
      children: [null],
      prefix: '',
      suffix: '',
    };
    const project = parseProject([{ path: 'main.tex', source: 'text', version: 1 }]);

    expectInvalidArgument(() => serializeDocument(null as never));
    expectInvalidArgument(() => serializeDocument(malformedRoot as never));
    expectInvalidArgument(() => transformProject('main.tex', null as never));
    expectInvalidArgument(() => mergeProjects({ files: null } as never, project));
  });

  it('validates file and diagnostic paths in transported projects', () => {
    const projectWithWarning = parseProject([
      { path: 'main.tex', source: '\\ifFlag\\section{Nested}yes\\fi', version: 1 },
    ]);
    const badFilePath = structuredClone(projectWithWarning);
    (badFilePath.files[0] as unknown as { path: string }).path = 'C:main.tex';
    const badDiagnosticPath = structuredClone(projectWithWarning);
    (badDiagnosticPath.files[0]!.diagnostics[0] as unknown as { path: string }).path = '/main.tex';

    expectInvalidArgument(() => transformProject('main.tex', badFilePath));
    expectInvalidArgument(() => transformProject('main.tex', badDiagnosticPath));
  });
});

describe('transported project normalization', () => {
  it('copies and deeply freezes structured-cloned files during a merge', () => {
    const base = parseProject([{ path: 'a.tex', source: 'base', version: 1 }]);
    const transportedUpdates = structuredClone(
      parseProject([
        { path: 'a.tex', source: 'newer', version: 2 },
        { path: 'b.tex', source: '\\section{B}body', version: 1 },
      ])
    );
    const transportedA = findFile(transportedUpdates.files, 'a.tex');
    expect(Object.isFrozen(transportedA)).toBe(false);

    const merged = mergeProjects(base, transportedUpdates);
    const mergedA = findFile(merged.files, 'a.tex');
    const mergedB = findFile(merged.files, 'b.tex');

    expect(mergedA).not.toBe(transportedA);
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.files)).toBe(true);
    for (const file of [mergedA, mergedB]) {
      expect(Object.isFrozen(file)).toBe(true);
      expect(Object.isFrozen(file.root)).toBe(true);
      expect(Object.isFrozen(file.root.children)).toBe(true);
      expect(astNodes(file.root).every(Object.isFrozen)).toBe(true);
      expect(Object.isFrozen(file.diagnostics)).toBe(true);
      expect(file.diagnostics.every(Object.isFrozen)).toBe(true);
      expect(file.diagnostics.every((item) => Object.isFrozen(item.range))).toBe(true);
      expect(Object.isFrozen(file.declaredConditions)).toBe(true);
      expect(Object.isFrozen(file.referencedFiles)).toBe(true);
    }
  });

  it('retains canonical frozen file identities that win a merge', () => {
    const base = parseProject([
      { path: 'a.tex', source: 'base', version: 2 },
      { path: 'b.tex', source: 'unchanged', version: 1 },
    ]);
    const updates = parseProject([{ path: 'a.tex', source: 'stale', version: 1 }]);

    const merged = mergeProjects(base, updates);

    expect(findFile(merged.files, 'a.tex')).toBe(findFile(base.files, 'a.tex'));
    expect(findFile(merged.files, 'b.tex')).toBe(findFile(base.files, 'b.tex'));
  });

  it('accepts a structured-cloned project for transformation', () => {
    const transported = structuredClone(
      parseProject([
        {
          path: 'main.tex',
          source: '\\section{}Before \\input{part.tex}',
          version: 1,
        },
        { path: 'part.tex', source: 'part', version: 1 },
      ])
    );

    expect(
      transformProject('main.tex', transported, { inputHandling: InputHandlingMode.Flatten })
    ).toEqual({ files: [{ path: 'main.tex', source: '\\section{}Before part' }] });
  });
});
