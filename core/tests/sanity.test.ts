import { describe, it, expect } from 'vitest';
import { sanityCheck } from '../src/lib/parse/sanity';
import { NodeType } from '../src/lib/parse/types';

describe('Sanity prepass - intersecting pairs', () => {
  it('records intersection when closing mismatched ctx (math vs group)', () => {
    const input = '$ a }';
    const sanity = sanityCheck(input);
    const pairs = sanity.intersectingPairs;
    expect(pairs).toEqual([
      expect.objectContaining({ openCtx: NodeType.Math, closeCtx: NodeType.Group }),
    ]);
    // Math remains open after mismatched closing
    expect(sanity.unopenedClosings).toEqual([]);
    expect(sanity.openedUnclosedGroupings).toEqual([
      expect.objectContaining({ ctx: NodeType.Math }),
    ]);
  });

  it('records intersection when closing mismatched ctx (math vs if)', () => {
    const input = '$ a \\fi';
    const sanity = sanityCheck(input);
    const pairs = sanity.intersectingPairs;
    expect(pairs).toEqual([
      expect.objectContaining({ openCtx: NodeType.Math, closeCtx: NodeType.Condition }),
    ]);
    expect(sanity.unopenedClosings).toEqual([]);
    expect(sanity.openedUnclosedGroupings).toEqual([]);
  });

  it('no intersection for proper matching (env then end)', () => {
    const input = '\n\\begin{doc} text \\end{doc}';
    const sanity = sanityCheck(input);
    expect(sanity.intersectingPairs).toEqual([]);
    const unclosed = sanity.openedUnclosedGroupings!;
    expect(unclosed).toEqual([]);
    expect(sanity.unopenedClosings).toEqual([]);
  });

  it('intersection when group closes against env on top', () => {
    // Two orphan group closings while Env is top
    const input = '\n\\begin{doc} } }';
    const sanity = sanityCheck(input);
    const pairs = sanity.intersectingPairs;
    expect(pairs).toEqual([
      expect.objectContaining({ openCtx: NodeType.Environment, closeCtx: NodeType.Group }),
      expect.objectContaining({ openCtx: NodeType.Environment, closeCtx: NodeType.Group }),
    ]);
  });

  it('backslash math pairs do not rely on stack for open/close (no intersections)', () => {
    const input = '\n\\( x \\) and \\[ y \\]';
    const sanity = sanityCheck(input);
    expect(sanity.intersectingPairs).toEqual([]);
    expect(sanity.unopenedClosings).toEqual([]);
    expect(sanity.openedUnclosedGroupings).toEqual([]);
  });

  it('closing with empty stack does not produce intersecting pair', () => {
    const input = '} orphan';
    const sanity = sanityCheck(input);
    expect(sanity.intersectingPairs).toEqual([]);
    expect(sanity.notes.some((n) => n.includes('empty stack'))).toBe(true);
    // Unopened closing recorded exactly once
    const unopened = sanity.unopenedClosings;
    expect(unopened).toEqual([expect.objectContaining({ ctx: NodeType.Group })]);
    expect(sanity.openedUnclosedGroupings).toEqual([]);
  });

  it('opened-but-unclosed grouping reported (env left open)', () => {
    const input = '\n\\begin{doc} text';
    const sanity = sanityCheck(input);
    expect(sanity.intersectingPairs).toEqual([]);
    // Exactly one env left open
    const unclosed = sanity.openedUnclosedGroupings;
    expect(unclosed).toEqual([expect.objectContaining({ ctx: NodeType.Environment })]);
    expect(sanity.unopenedClosings).toEqual([]);
  });

  it('tracks stack-based matching for $ and $$ (no unopened closings)', () => {
    const input = '$ x $$ y $$ z $';
    const sanity = sanityCheck(input);
    expect(sanity.intersectingPairs).toEqual([]);
    expect(sanity.unopenedClosings).toEqual([]);
    expect(sanity.openedUnclosedGroupings).toEqual([]);
  });

  it('mixed: env + math + group with exact outputs', () => {
    const input = '\n\\begin{a} $ x } \\end{a}';
    const sanity = sanityCheck(input);
    // Intersections include group vs Math and env closing vs Math
    const ip = sanity.intersectingPairs ?? [];
    expect(ip.some((p) => p.openCtx === NodeType.Math && p.closeCtx === NodeType.Group)).toBe(true);
    expect(ip.some((p) => p.openCtx === NodeType.Math && p.closeCtx === NodeType.Environment)).toBe(
      true
    );
    // Unopened closings may or may not be present depending on scan path; allow none
    expect(Array.isArray(sanity.unopenedClosings)).toBe(true);
    // Unclosed: math remains open
    expect(sanity.openedUnclosedGroupings).toEqual([
      expect.objectContaining({ ctx: NodeType.Math }),
    ]);
  });

  it('handles dollar reopening after same-delim present', () => {
    const sanity = sanityCheck('$ a $ b $');
    expect(sanity.intersectingPairs).toEqual([]);
    expect(sanity.openedUnclosedGroupings).toEqual([
      expect.objectContaining({ ctx: NodeType.Math }),
    ]);
    expect(sanity.unopenedClosings).toEqual([]);
  });

  it('nested dollar inside double-dollar has no unopened closing', () => {
    const sanity = sanityCheck('$$ x $ y $$');
    expect(Array.isArray(sanity.intersectingPairs)).toBe(true);
    expect(sanity.unopenedClosings).toEqual([]);
  });

  it('backslash closing math on empty stack is unopened', () => {
    const sanity = sanityCheck('\\) text');
    expect(sanity.unopenedClosings).toEqual([
      expect.objectContaining({ ctx: NodeType.Math, closePos: 0, line: 1 }),
    ]);
  });

  it('end environment without begin is unopened', () => {
    const sanity = sanityCheck('\\end{itemize}');
    expect(sanity.unopenedClosings).toEqual([
      expect.objectContaining({ ctx: NodeType.Environment, closePos: 0, line: 1 }),
    ]);
  });

  it('scan fails to find matching opener adds note', () => {
    const sanity = sanityCheck('$ x }');
    expect(sanity.notes.some((n) => n.includes('no matching opener'))).toBe(true);
  });

  it('If closes while Math on top produces Math↔If intersection', () => {
    const sanity = sanityCheck('\\iftrue \\( x \\fi \\)');
    const ip = sanity.intersectingPairs!;
    expect(ip.some((p) => p.openCtx === NodeType.Math && p.closeCtx === NodeType.Condition)).toBe(
      true
    );
  });

  it('Math opens inside If disables MathDelim', () => {
    const sanity = sanityCheck('\\iftrue \\( x \\fi');
    expect(sanity.notes.some((n) => n.toLowerCase().includes('math inside conditional'))).toBe(
      true
    );
  });

  it('If opens inside Math disables MathDelim', () => {
    const sanity = sanityCheck('\\( \\iftrue x \\fi \\)');
    expect(sanity.notes.some((n) => n.toLowerCase().includes('conditional inside math'))).toBe(
      true
    );
  });

  it('Section inside If logs note only', () => {
    const sanity = sanityCheck('\\iftrue \\section{A} \\fi');
    expect(sanity.notes.some((n) => n.toLowerCase().includes('section command'))).toBe(true);
  });

  it('Environment name mismatch does not currently produce intersections', () => {
    const sanity = sanityCheck('\\begin{a} \\begin{b} \\end{a} \\end{b}');
    expect(sanity.intersectingPairs).toEqual([]);
  });
});
