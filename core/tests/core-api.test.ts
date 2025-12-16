import { describe, it, expect } from 'vitest';
import {
  process as processProject,
  transform as transformProject,
  combine_project,
} from '../src/lib/core';
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
    const files = {
      'A.tex': { text: 'Start \\input{B.tex} Middle \\input{C.tex} End', version: 1 },
      'B.tex': { text: 'B1 \\input{D.tex} B2', version: 1 },
      'C.tex': { text: 'C1', version: 1 },
      'D.tex': { text: 'D1', version: 1 },
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN } as const;
    const project = processProject(files);
    const outputs = transformProject('A.tex', project, options);
    // Expected: Start B1 D1 B2 Middle C1 End
    expect(outputs['A.tex']).toBe('Start B1 D1 B2 Middle C1 End');
  });

  it('returns aggregated text when no options provided', () => {
    const files = { 'sample.tex': { text: SAMPLE, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('sample.tex', project);
    const result = outputs['sample.tex'];
    expect(result).toBe('Hello % comment\nWorld');
  });

  it('suppresses comments when requested', () => {
    const options = { suppressComments: true };
    const files = { 'sample.tex': { text: SAMPLE, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('sample.tex', project, options);
    const result = outputs['sample.tex'];
    expect(result).toBe('Hello  World');
  });

  it('applies conditional branch decisions (keep IF)', () => {
    const options = { ifDecisions: new Set(['X']) };
    const files = { 'conditional.tex': { text: CONDITIONAL_SAMPLE, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('conditional.tex', project, options);
    const result = outputs['conditional.tex'];
    expect(result).toContain('Keep');
    expect(result).not.toContain('Drop');
  });

  it('falls back to ELSE branch when name not selected', () => {
    const options = { ifDecisions: new Set<string>() };
    const files = { 'conditional.tex': { text: CONDITIONAL_SAMPLE, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('conditional.tex', project, options);
    const result = outputs['conditional.tex'];
    expect(result).toContain('Drop');
    expect(result).not.toContain('Keep');
  });

  it('omits IF branch entirely when no ELSE provided and name not selected', () => {
    const withoutElse = 'Start \\ifY Hidden\\fi End';
    const options = { ifDecisions: new Set<string>() };
    const files = { 'without-else.tex': { text: withoutElse, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('without-else.tex', project, options);
    const result = outputs['without-else.tex'];
    expect(result).toBe('Start End');
  });

  it('handles nested conditions correctly', () => {
    const nestedSample =
      '\\ifA OuterIf' + '\\ifB b\\else nob\\fi-' + '\\ifC c\\else noc\\fi' + '\\else Outerelse\\fi';
    const options = { ifDecisions: new Set(['A', 'C']) };
    const files = { 'nested.tex': { text: nestedSample, version: 1 } };
    const project = processProject(files);
    const outputs = transformProject('nested.tex', project, options);
    const result = outputs['nested.tex'];
    expect(result).toBe('OuterIfnob-c');
  });

  it('flattens input files using the provided readFile callback', () => {
    const files = {
      'main.tex': { text: 'Start \\input{chapter.tex} End', version: 1 },
      'chapter.tex': { text: 'Chapter body', version: 1 },
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN } as const;
    const project = processProject(files);
    const outputs = transformProject('main.tex', project, options);
    const result = outputs['main.tex'];

    expect(result).toBe('Start Chapter body End');
  });

  it('commented input file - suppress', () => {
    const files = {
      'main.tex': { text: 'Intro % \\input{secret.tex}\nConclusion', version: 1 },
      'secret.tex': { text: 'This is secret content.', version: 1 },
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN, suppressComments: true } as const;
    const project = processProject(files);
    const outputs = transformProject('main.tex', project, options);
    const result = outputs['main.tex'];
    expect(result).toBe('Intro  Conclusion');
  });

  it('commented input file - no suppress', () => {
    const files = {
      'main.tex': { text: 'Intro % \\input{secret.tex}\nConclusion', version: 1 },
      'secret.tex': { text: 'This is secret content.', version: 1 },
    };

    const options = { handleInputCmd: InputCmdHandling.FLATTEN, suppressComments: false } as const;
    const project = processProject(files);
    const outputs = transformProject('main.tex', project, options);
    const result = outputs['main.tex'];
    expect(result).toBe('Intro % \\input{secret.tex}\nConclusion');
  });

  it('applies transforms while flattening nested inputs', () => {
    const files = {
      'root.tex': { text: 'Alpha \\input{mid.tex} Omega', version: 1 },
      'mid.tex': { text: 'Keep % drop\n\\input{leaf.tex}', version: 1 },
      'leaf.tex': { text: '\\ifX Inner\\else Outer\\fi', version: 1 },
    };

    const options = {
      handleInputCmd: InputCmdHandling.FLATTEN,
      suppressComments: true,
      ifDecisions: new Set(['X']),
    } as const;

    const project = processProject(files);
    const outputs = transformProject('root.tex', project, options);
    const result = outputs['root.tex'];

    // Accept either the resolved inner branch or a variant without the inner text
    expect(result).toBe('Alpha Keep  Inner Omega');
  });

  it('combines projects keeping higher version on conflicts', () => {
    const p1 = processProject({
      'a.tex': { text: 'Old', version: 1 },
      'b.tex': { text: 'OnlyIn1', version: 1 },
    });
    const p2 = processProject({
      'a.tex': { text: 'New', version: 2 },
      'c.tex': { text: 'OnlyIn2', version: 1 },
    });

    const combined = combine_project(p1, p2);
    expect(combined).toBe(p1);
    const out = transformProject('a.tex', combined, { handleInputCmd: InputCmdHandling.RECURSIVE });

    expect(out['a.tex']).toBe('New');
    expect(out['b.tex']).toBe('OnlyIn1');
    expect(out['c.tex']).toBe('OnlyIn2');
  });
});
