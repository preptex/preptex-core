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

    const secAc = secA.children;
    expect(secAc.length).toBe(3);
    expect((secAc[0] as any).type).toBe('Group');
    expect((secAc[0] as any).prefix).toBe('{');
    expect((secAc[0] as any).suffix).toBe('}');
    expect((secAc[0] as any).children[0].type).toBe('Text');
    expect((secAc[0] as any).children[0].value).toBe('A');
    expect((secAc[1] as any).type).toBe('Text');
    expect((secAc[1] as any).value).toBe('\nalpha\n');

    expect((secAc[2] as any).type).toBe('Section');
    const secB = secAc[2] as SectionNode;
    expect(secB.level).toBe(2);
    expect(secB.children.length).toBe(2);
    expect((secB.children[0] as any).type).toBe('Group');
    expect((secB.children[0] as any).prefix).toBe('{');
    expect((secB.children[0] as any).suffix).toBe('}');
    expect((secB.children[0] as any).children[0].type).toBe('Text');
    expect((secB.children[0] as any).children[0].value).toBe('B');
    expect((secB.children[1] as any).type).toBe('Text');
    expect((secB.children[1] as any).value).toBe('\nbeta\n');

    expect((ast.children[1] as any).type).toBe('Section');
    const secC = ast.children[1] as SectionNode;
    expect(secC.level).toBe(1);
    expect(secC.children.length).toBe(1);
    expect((secC.children[0] as any).type).toBe('Group');
    expect((secC.children[0] as any).prefix).toBe('{');
    expect((secC.children[0] as any).suffix).toBe('}');
    expect((secC.children[0] as any).children[0].type).toBe('Text');
    expect((secC.children[0] as any).children[0].value).toBe('C');
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
    expect(s1.children.length).toBe(2);
    const s1Title = s1.children[0] as any;
    expect(s1Title.type).toBe('Group');
    expect(s1Title.children[0].type).toBe('Text');
    expect(s1Title.children[0].value).toBe('First');
    const textBetween = s1.children[1] as any;
    expect(textBetween.type).toBe('Text');
    expect(textBetween.value).toBe(' text ');

    const s2 = ast.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.children.length).toBe(2);
    const s2Title = s2.children[0] as any;
    expect(s2Title.type).toBe('Group');
    expect(s2Title.children[0].type).toBe('Text');
    expect(s2Title.children[0].value).toBe('Second');
    const textAfter = s2.children[1] as any;
    expect(textAfter.type).toBe('Text');
    expect(textAfter.value).toBe(' more');
  });

  it('handles nested sections correctly', () => {
    const ast = parse(`\\section{A} one \\subsection{B} two \\subsubsection{C}`);
    expect(ast.children.length).toBe(1);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    expect(s1.children.length).toBe(3);
    const s2 = s1.children[2] as any; // skip title group and following text
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    expect(s2.children.length).toBe(3);
    const s3 = s2.children[2] as any; // skip title group and following text
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(3);
    expect(s3.children.length).toBe(1);
  });

  it('handles nested and consecutive sections correctly', () => {
    const ast = parse(`\\section{A} one \\subsection{B} two \\section{C} three`);
    expect(ast.children.length).toBe(2);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    const s2 = s1.children[2] as any;
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    const s3 = ast.children[1] as any;
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(1);
  });
});
