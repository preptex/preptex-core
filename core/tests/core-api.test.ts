import { describe, it, expect } from 'vitest';
import { process as processProject, transform as transformProject } from '../src/lib/core';
import { InputCmdHandling } from '../src/lib/options';

const SAMPLE = ['Hello % comment', 'World'].join('\n');
const CONDITIONAL_SAMPLE = 'Start \\ifX Keep\\else Drop\\fi End';

describe('process/transform API', () => {
  it('flattens input files with a 4-file tree (A inputs B and C, B inputs D)', () => {
    // File structure:
    // A: "Start \input{B.tex} Middle \input{C.tex} End"
    // B: "B1 \input{D.tex} B2"
    // C: "C1"
    // D: "D1"
    const files = new Map<string, string>([
      ['A.tex', 'Start \\input{B.tex} Middle \\input{C.tex} End'],
      ['B.tex', 'B1 \\input{D.tex} B2'],
      ['C.tex', 'C1'],
      ['D.tex', 'D1'],
    ]);

    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN } as const;
    const project = processProject('A.tex', read, options);
    const outputs = transformProject(project, options);
    // Expected: Start B1 D1 B2 Middle C1 End
    expect(outputs['A.tex']).toBe('Start B1 D1 B2 Middle C1 End');
  });

  it('returns aggregated text when no options provided', () => {
    const files = new Map<string, string>([['sample.tex', SAMPLE]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('sample.tex', read);
    const outputs = transformProject(project);
    const result = outputs[project.entry];
    expect(result).toBe('Hello % comment\nWorld');
  });

  it('suppresses comments when requested', () => {
    const options = { suppressComments: true };
    const files = new Map<string, string>([['sample.tex', SAMPLE]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('sample.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toBe('Hello World');
  });

  it('applies conditional branch decisions (keep IF)', () => {
    const options = { ifDecisions: new Set(['X']) };
    const files = new Map<string, string>([['conditional.tex', CONDITIONAL_SAMPLE]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('conditional.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toContain('Keep');
    expect(result).not.toContain('Drop');
  });

  it('falls back to ELSE branch when name not selected', () => {
    const options = { ifDecisions: new Set<string>() };
    const files = new Map<string, string>([['conditional.tex', CONDITIONAL_SAMPLE]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('conditional.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toContain('Drop');
    expect(result).not.toContain('Keep');
  });

  it('omits IF branch entirely when no ELSE provided and name not selected', () => {
    const withoutElse = 'Start \\ifY Hidden\\fi End';
    const options = { ifDecisions: new Set<string>() };
    const files = new Map<string, string>([['without-else.tex', withoutElse]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('without-else.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toBe('Start  End');
  });

  it('handles nested conditions correctly', () => {
    const nestedSample =
      '\\ifA OuterIf' + '\\ifB b\\else nob\\fi-' + '\\ifC c\\else noc\\fi' + '\\else Outerelse\\fi';
    const options = { ifDecisions: new Set(['A', 'C']) };
    const files = new Map<string, string>([['nested.tex', nestedSample]]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };
    const project = processProject('nested.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toBe(' OuterIf nob- c');
  });

  it('flattens input files using the provided readFile callback', () => {
    const files = new Map<string, string>([
      ['main.tex', 'Start \\input{chapter.tex} End'],
      ['chapter.tex', 'Chapter body'],
    ]);

    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN } as const;
    const project = processProject('main.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];

    expect(result).toBe('Start Chapter body End');
  });

  it('commented input file - suppress', () => {
    const files = new Map<string, string>([
      ['main.tex', 'Intro % \\input{secret.tex}\nConclusion'],
      ['secret.tex', 'This is secret content.'],
    ]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN, suppressComments: true } as const;
    const project = processProject('main.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toBe('Intro Conclusion');
  });

  it('commented input file - no suppress', () => {
    const files = new Map<string, string>([
      ['main.tex', 'Intro % \\input{secret.tex}\nConclusion'],
      ['secret.tex', 'This is secret content.'],
    ]);
    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN, suppressComments: false } as const;
    const project = processProject('main.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];
    expect(result).toBe('Intro % \\input{secret.tex}\nConclusion');
  });

  it('applies transforms while flattening nested inputs', () => {
    const files = new Map<string, string>([
      ['root.tex', 'Alpha \\input{mid.tex} Omega'],
      ['mid.tex', 'Keep % drop\n\\input{leaf.tex}'],
      ['leaf.tex', '\\ifX Inner\\else Outer\\fi'],
    ]);

    const read = (filename: string): string => {
      const text = files.get(filename);
      if (text === undefined) throw new Error(`Missing ${filename}`);
      return text;
    };

    const options = {
      handleInputCmd: InputCmdHandling.FLATTEN,
      suppressComments: true,
      ifDecisions: new Set(['X']),
    } as const;

    const project = processProject('root.tex', read, options);
    const outputs = transformProject(project, options);
    const result = outputs[project.entry];

    // Accept either the resolved inner branch or a variant without the inner text
    expect(result).toBe('Alpha Keep  Inner Omega');
  });
});
