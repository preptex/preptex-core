import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import type { SectionNode } from '../../src/lib/parse/types';

const parse = (input: string) => {
  const parser = new Parser({});
  parser.parse(input);
  return parser.getRoot();
};

describe('Parser sections', () => {
  it('nests subsections and closes appropriately', () => {
    const ast = parse('\\section{A}\nalpha\n\\subsection{B}\nbeta\n\\section{C}');
    expect(ast.children.length).toBe(2);

    expect((ast.children[0] as any).type).toBe('Section');
    const secA = ast.children[0] as SectionNode;
    expect(secA.level).toBe(1);
    expect(secA.name).toBe('A');

    const secAc = secA.children;
    expect(secAc.length).toBe(2);
    expect((secAc[0] as any).type).toBe('Text');
    expect((secAc[0] as any).value).toBe('\nalpha\n');

    expect((secAc[1] as any).type).toBe('Section');
    const secB = secAc[1] as SectionNode;
    expect(secB.name).toBe('B');
    expect(secB.level).toBe(2);
    expect(secB.children.length).toBe(1);
    expect((secB.children[0] as any).type).toBe('Text');
    expect((secB.children[0] as any).value).toBe('\nbeta\n');

    expect((ast.children[1] as any).type).toBe('Section');
    const secC = ast.children[1] as SectionNode;
    expect(secC.level).toBe(1);
    expect(secC.children.length).toBe(0);
    expect(secC.name).toBe('C');
  });

  // Not yet implemented
  it('supports starred sections', () => {
    const input = `\\section*{Intro $x$ and more}`;
    void input;
  });

  // Not yet implemented
  it('parses short title', () => {
    const input = `\\section*[Short Title]{Long Title}\\subsection[ST]{LT}`;
    void input;
  });

  it('handles consecutive sections correctly', () => {
    const ast = parse(`\\section{First} text \\section{Second} more`);
    expect(ast.children.length).toBe(2);

    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.name).toBe('First');
    expect(s1.children.length).toBe(1);
    const textBetween = s1.children[0] as any;
    expect(textBetween.type).toBe('Text');
    expect(textBetween.value).toBe(' text ');

    const s2 = ast.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.children.length).toBe(1);
    expect(s2.name).toBe('Second');
    const textAfter = s2.children[0] as any;
    expect(textAfter.type).toBe('Text');
    expect(textAfter.value).toBe(' more');
  });

  it('handles nested sections correctly', () => {
    const input = `\\section{A} one \\subsection{B} two \\subsubsection{C}`;
    const ast = parse(input);
    expect(ast.end).toBe(input.length - 1);
    expect(ast.children.length).toBe(1);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    expect(s1.children.length).toBe(2);
    expect(s1.end).toBe(input.length - 1);
    const s2 = s1.children[1] as any; // skip title group and following text
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    expect(s2.children.length).toBe(2);
    expect(s2.end).toBe(input.length - 1);
    const s3 = s2.children[1] as any; // skip title group and following text
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(3);
    expect(s3.children.length).toBe(0);
    expect(s3.end).toBe(input.length - 1);
  });

  it('handles nested and consecutive sections correctly', () => {
    const input1 = '\\section{A} one \\subsection{B} two ';
    const input2 = '\\section{C} three';
    const input = input1 + input2;
    const ast = parse(input);
    expect(ast.children.length).toBe(2);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    expect(s1.end).toBe(input1.length - 1);
    const s2 = s1.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    expect(s2.end).toBe(input1.length - 1);
    const s3 = ast.children[1] as any;
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(1);
    expect(s3.end).toBe(input.length - 1);
  });
});
