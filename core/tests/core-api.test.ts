import { describe, it, expect } from 'vitest';
import { transformCode } from '../src/lib/core';

const SAMPLE = ['Hello % comment', 'World'].join('\n');
const CONDITIONAL_SAMPLE = 'Start \\ifX Keep\\else Drop\\fi End';

describe('transformCode', () => {
  it('returns aggregated text when no options provided', () => {
    const result = transformCode(SAMPLE);
    expect(result).toBe('Hello % comment\nWorld');
  });

  it('suppresses comments when requested', () => {
    const result = transformCode(SAMPLE, { suppressComments: true });
    expect(result).toBe('Hello World');
  });

  it('applies conditional branch decisions (keep IF)', () => {
    const result = transformCode(CONDITIONAL_SAMPLE, { ifDecisions: new Set(['X']) });
    expect(result).toContain('Keep');
    expect(result).not.toContain('Drop');
  });

  it('falls back to ELSE branch when name not selected', () => {
    const result = transformCode(CONDITIONAL_SAMPLE, { ifDecisions: new Set<string>() });
    expect(result).toContain('Drop');
    expect(result).not.toContain('Keep');
  });

  it('omits IF branch entirely when no ELSE provided and name not selected', () => {
    const withoutElse = 'Start \\ifY Hidden\\fi End';
    const result = transformCode(withoutElse, { ifDecisions: new Set<string>() });
    expect(result).toBe('Start  End');
  });
  it('handels nested conditions correctly', () => {
    const nestedSample =
      '\\ifA OuterIf' + '\\ifB b\\else nob\\fi-' + '\\ifC c\\else noc\\fi' + '\\else Outerelse\\fi';
    const result = transformCode(nestedSample, { ifDecisions: new Set(['A', 'C']) });
    expect(result).toBe(' OuterIf nob- c');
  });
});
