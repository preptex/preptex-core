import { describe, it, expect } from 'vitest';
import { Parser } from '../src/lib/parse/parser';
import { CallStack } from '../src/lib/parse/callstack';
import type { CoreOptions } from '../src/lib/options';
import type { AstRoot, SectionNode } from '../src/lib/parse/types';

function sectionsOf(root: AstRoot): SectionNode[] {
  return root.children.filter((n): n is SectionNode => (n as any).type === 'Section');
}

describe('Parser sections', () => {
  it('nests subsections and closes appropriately', () => {
    const input = `\\section{A}\nalpha\n\\subsection{B}\nbeta\n\\section{C}\ngamma`;
    const p = new Parser(new CallStack(), {} as CoreOptions);
    const ast = p.parse(input);

    const topSections = sectionsOf(ast);
    expect(topSections.length).toBe(2);

    const secA = topSections[0];
    expect(secA.level).toBe(1);
    expect((secA.title[0] as any).value as string).toContain('A');

    const nestedInA = secA.children.filter((n): n is SectionNode => (n as any).type === 'Section');
    expect(nestedInA.length).toBe(1);
    expect(nestedInA[0].level).toBe(2);
    expect((nestedInA[0].title[0] as any).value as string).toContain('B');

    const secC = topSections[1];
    expect(secC.level).toBe(1);
    expect((secC.title[0] as any).value as string).toContain('C');
  });

  it('supports starred sections', () => {
    const input = `\\section*{Intro $x$ and more}`;
    const p = new Parser(new CallStack(), {} as CoreOptions);
    const ast = p.parse(input);
    const s = sectionsOf(ast);
    expect(s.length).toBe(1);
    const sec = s[0];
    expect(sec.starred).toBe(true);
    const kinds = sec.title.map((n) => n.type);
    // Expect at least Text, Math, and trailing Text nodes (possibly multiple Text segments)
    expect(kinds[0]).toBe('Text');
    expect(kinds[1]).toBe('Math');
    expect(kinds.slice(2).every((k) => k === 'Text')).toBe(true);
  });

  it('parses short title and math in long title', () => {
    const input = `\\section[Short]{Long $E=mc^2$ end}`;
    const p = new Parser(new CallStack(), {} as CoreOptions);
    const ast = p.parse(input);
    const s = sectionsOf(ast);
    expect(s.length).toBe(1);
    const sec = s[0];
    expect(sec.shortTitle).toBeDefined();
    expect(sec.shortTitle!.length).toBe(1);
    expect(sec.shortTitle![0].type).toBe('Text');
    const kinds = sec.title.map((n) => n.type);
    expect(kinds).toEqual(['Text', 'Math', 'Text']);
    const mathNode = sec.title[1] as any;
    expect(mathNode.type).toBe('Math');
    expect(mathNode.delim).toBe('$');
    // Math nodes now have children; expect a single Text child with the formula
    expect(mathNode.children.length).toBe(1);
    expect(mathNode.children[0].type).toBe('Text');
    expect(mathNode.children[0].value).toBe('E=mc^2');
  });
});
