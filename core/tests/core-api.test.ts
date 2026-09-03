import { describe, expect, it } from 'vitest';
import {
  InputHandlingMode,
  TokenType,
  mergeProjects,
  parseProject,
  transformProject,
  type SourceFile,
  type TransformResult,
} from '../src/index';

const SAMPLE = ['Hello % comment', 'World'].join('\n');
const CONDITIONAL_SAMPLE = 'Start \\ifX Keep\\else Drop\\fi End';

function projectFile(path: string, source: string, version = 1): SourceFile {
  return { path, source, version };
}

function outputSource(result: TransformResult, path: string): string {
  const output = result.files.find((file) => file.path === path);
  expect(output, `Expected transformed file ${path}`).toBeDefined();
  return output!.source;
}

describe('public project API', () => {
  it('flattens a nested four-file input tree', () => {
    const project = parseProject([
      projectFile('A.tex', 'Start \\input{B.tex} Middle \\input{C.tex} End'),
      projectFile('B.tex', 'B1 \\input{D.tex} B2'),
      projectFile('C.tex', 'C1'),
      projectFile('D.tex', 'D1'),
    ]);

    const result = transformProject('A.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });

    expect(result.files).toHaveLength(1);
    expect(outputSource(result, 'A.tex')).toBe('Start B1 D1 B2 Middle C1 End');
  });

  it('preserves comments and input commands by default', () => {
    const project = parseProject([
      projectFile('sample.tex', `${SAMPLE}\n\\input{chapter.tex}`),
      projectFile('chapter.tex', 'Chapter'),
    ]);

    const result = transformProject('sample.tex', project);

    expect(outputSource(result, 'sample.tex')).toBe(`${SAMPLE}\n\\input{chapter.tex}`);
  });

  it('suppresses comments when requested', () => {
    const project = parseProject([projectFile('sample.tex', SAMPLE)]);

    const result = transformProject('sample.tex', project, { suppressComments: true });

    expect(outputSource(result, 'sample.tex')).toBe('Hello  World');
  });

  it('keeps the selected conditional branch', () => {
    const project = parseProject([projectFile('conditional.tex', CONDITIONAL_SAMPLE)]);

    const result = transformProject('conditional.tex', project, {
      enabledConditions: ['X'],
    });

    expect(outputSource(result, 'conditional.tex')).toBe('Start  Keep End');
  });

  it('uses the else branch when a condition is not selected', () => {
    const project = parseProject([projectFile('conditional.tex', CONDITIONAL_SAMPLE)]);

    const result = transformProject('conditional.tex', project, {
      enabledConditions: [],
    });

    expect(outputSource(result, 'conditional.tex')).toBe('Start  Drop End');
  });

  it('omits an unselected branch that has no else branch', () => {
    const project = parseProject([projectFile('without-else.tex', 'Start \\ifY Hidden\\fi End')]);

    const result = transformProject('without-else.tex', project, {
      enabledConditions: [],
    });

    expect(outputSource(result, 'without-else.tex')).toBe('Start  End');
  });

  it('resolves nested condition decisions', () => {
    const source =
      '\\ifA OuterIf' + '\\ifB b\\else nob\\fi-' + '\\ifC c\\else noc\\fi' + '\\else Outerelse\\fi';
    const project = parseProject([projectFile('nested.tex', source)]);

    const result = transformProject('nested.tex', project, {
      enabledConditions: ['A', 'C'],
    });

    expect(outputSource(result, 'nested.tex')).toBe(' OuterIf nob- c');
  });

  it('does not resolve inputs that occur inside comments', () => {
    const project = parseProject([
      projectFile('main.tex', 'Intro % \\input{secret.tex}\nConclusion'),
      projectFile('secret.tex', 'This is secret content.'),
    ]);

    const preserved = transformProject('main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });
    const suppressed = transformProject('main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
      suppressComments: true,
    });

    expect(outputSource(preserved, 'main.tex')).toBe('Intro % \\input{secret.tex}\nConclusion');
    expect(outputSource(suppressed, 'main.tex')).toBe('Intro  Conclusion');
  });

  it('applies serialization options while flattening nested inputs', () => {
    const project = parseProject([
      projectFile('root.tex', 'Alpha \\input{mid.tex} Omega'),
      projectFile('mid.tex', 'Keep % drop\n\\input{leaf.tex}'),
      projectFile('leaf.tex', '\\ifX Inner\\else Outer\\fi'),
    ]);

    const result = transformProject('root.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
      suppressComments: true,
      enabledConditions: ['X'],
    });

    expect(outputSource(result, 'root.tex')).toBe('Alpha Keep   Inner Omega');
  });

  it('accepts the frontend lexer token subset as a readonly array', () => {
    const enabledTokens = [
      TokenType.Section,
      TokenType.Condition,
      TokenType.ConditionDeclaration,
      TokenType.Command,
      TokenType.Input,
      TokenType.Comment,
      TokenType.NewLine,
    ] as const;
    const project = parseProject(
      [
        projectFile('main.tex', 'Start \\input{chapter.tex} End'),
        projectFile('chapter.tex', 'Chapter body'),
      ],
      { enabledTokens }
    );

    const result = transformProject('main.tex', project, {
      inputHandling: InputHandlingMode.Flatten,
    });

    expect(outputSource(result, 'main.tex')).toBe('Start Chapter body End');
  });

  it('removes declarations and generated toggle commands when resolving conditions', () => {
    const project = parseProject(
      [projectFile('main.tex', '\\newif\\iflong\n\\longtrue\n\\iflong Yes\\else No\\fi')],
      {
        enabledTokens: [
          TokenType.Section,
          TokenType.Condition,
          TokenType.ConditionDeclaration,
          TokenType.Command,
          TokenType.Input,
          TokenType.Comment,
          TokenType.NewLine,
        ],
      }
    );

    const result = transformProject('main.tex', project, {
      enabledConditions: ['long'],
    });

    expect(outputSource(result, 'main.tex')).toBe(' Yes');
  });

  it('emits all files in deterministic order in separate mode', () => {
    const project = parseProject([projectFile('z.tex', 'Z'), projectFile('a.tex', 'A')]);

    const result = transformProject('z.tex', project, {
      inputHandling: InputHandlingMode.Separate,
    });

    expect(result.files).toEqual([
      { path: 'a.tex', source: 'A' },
      { path: 'z.tex', source: 'Z' },
    ]);
  });

  it('merges projects by version without changing unrelated files', () => {
    const base = parseProject([
      projectFile('a.tex', 'Old', 1),
      projectFile('b.tex', 'OnlyInBase', 1),
    ]);
    const updates = parseProject([
      projectFile('a.tex', 'New', 2),
      projectFile('c.tex', 'OnlyInUpdates', 1),
    ]);

    const merged = mergeProjects(base, updates);
    const result = transformProject('a.tex', merged, {
      inputHandling: InputHandlingMode.Separate,
    });

    expect(result.files).toEqual([
      { path: 'a.tex', source: 'New' },
      { path: 'b.tex', source: 'OnlyInBase' },
      { path: 'c.tex', source: 'OnlyInUpdates' },
    ]);
  });
});
