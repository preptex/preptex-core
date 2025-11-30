import { describe, it, expect } from 'vitest';
import { Parser } from '../src/lib/parse/parser';
import { CallStack } from '../src/lib/parse/callstack';
import { text } from 'stream/consumers';

const parse = (input: string) => new Parser(new CallStack(), {}).parse(input);

describe('Parser', () => {
  it('nests environments within sections', () => {
    const ast = parse(`\\section{Title}\\begin{doc}Text\\end{doc}`);
    const section = ast.children[0] as any;
    expect(section.type).toBe('Section');
    expect(section.title[0].type).toBe('Text');
    const env = section.children[0];
    expect(env.type).toBe('Environment');
    expect((env as any).name).toBe('doc');
    expect((env as any).children[0].type).toBe('Text');
  });

  it('nests brace groups as Group nodes', () => {
    const ast = parse(`prefix {inner {deep} text} suffix`);
    const rootChildren = ast.children;
    expect(rootChildren[0].type).toBe('Text');
    expect(rootChildren[1].type).toBe('Group');
    expect(rootChildren[2].type).toBe('Text');
    const group = rootChildren[1] as any;
    expect(group.children[0].type).toBe('Text');
    expect(group.children[1].type).toBe('Group');
    expect(group.children[2].type).toBe('Text');
    const inner = group.children[1] as any;
    expect(inner.children[0].type).toBe('Text');
    expect(inner.children[0].value).toBe('deep');
  });

  it('handles consecutive sections correctly', () => {
    const ast = parse(`\\section{First} text \\section{Second} more`);
    expect(ast.children.length).toBe(2);

    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.title[0].value).toBe('First');
    expect(s1.children.length).toBe(1);
    const textBetween = s1.children[0] as any;
    expect(textBetween.type).toBe('Text');
    expect(textBetween.value).toBe(' text ');

    const s2 = ast.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.title[0].value).toBe('Second');
    expect(s2.children.length).toBe(1);
    const textAfter = s2.children[0] as any;
    expect(textAfter.type).toBe('Text');
    expect(textAfter.value).toBe(' more');
  });

  it('handles nested sections correctly', () => {
    const ast = parse(`\\section{A} one \\subsection{B} two \\subsubsection{C} three`);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    const s2 = s1.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    const s3 = s2.children[1] as any;
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(3);
  });

  it('handles nested and consecutive sections correctly', () => {
    const ast = parse(`\\section{A} one \\subsection{B} two \\section{C} three`);
    expect(ast.children.length).toBe(2);
    const s1 = ast.children[0] as any;
    expect(s1.type).toBe('Section');
    expect(s1.level).toBe(1);
    const s2 = s1.children[1] as any;
    expect(s2.type).toBe('Section');
    expect(s2.level).toBe(2);
    const s3 = ast.children[1] as any;
    expect(s3.type).toBe('Section');
    expect(s3.level).toBe(1);
  });

  // [TODO] why are types strings? shouldn't they be enum? can we import the num classes and compare to them?

  it('nests sections, environments, math, and commands', () => {
    const input = [
      `\\section{Top}`,
      `Intro\\ntext `,
      '\\subsection{Title}',
      `\\begin{doc}`,
      `env text `,
      `\\(a+b\\)`,
      ` more `,
      `\\end{doc}`,
      ` \\subsection{Sub}`,
      `\\[ x^2 \\text{math text $\\mathcal{S}$}\\]`,
      ` \\cmd outside`,
      ` tail`,
      '\\section{Second}',
    ].join('');
    const ast = parse(input);
    expect(ast.children.length).toBe(2);

    const section = ast.children[0] as any;
    expect(section.type).toBe('Section');
    expect(section.level).toBe(1);
    expect(section.title[0].value).toBe('Top');
    // After title, first child should be Text 'Intro text '
    expect(section.children[0].type).toBe('Text');
    expect(section.children[0].value).toBe('Intro\\ntext ');
    // A subsection 'Title' appears before environment (node type may vary)
    const subsection = section.children[1] as any;
    expect(subsection.type).toBe('Section');
    expect(subsection.level).toBe(2);
    expect(subsection.title[0].value).toBe('Title');
    expect(subsection.children.length).toBe(2);
    // Environment is nested under the 'Title' subsection
    const env = subsection.children[0] as any;
    expect(env.type).toBe('Environment');
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(3);
    const ec = env.children;
    expect(ec[0].type).toBe('Text');
    expect(ec[1].type).toBe('Math');
    expect((ec[1] as any).delim).toBe('\\(');
    expect(ec[1].children.length).toBe(1);
    expect((ec[1].children[0] as any).type).toBe('Text');
    expect((ec[1].children[0] as any).value).toBe('a+b');
    expect(ec[2].type).toBe('Text');
    expect(ec[2].value).toBe(' more ');
    // End of environment
    expect(subsection.children[1].type).toBe('Text');
    expect(subsection.children[1].value).toBe(' ');
    // The second subsection
    const subsection2 = section.children[2] as any;
    expect(subsection2.type).toBe('Section');
    expect(subsection2.level).toBe(2);
    expect(subsection2.title[0].value).toBe('Sub');
    expect(subsection2.children.length).toBe(4);
    const ss2c = subsection2.children;
    // Math display node inside env
    const mathBlock = ss2c[0] as any;
    expect(mathBlock.type).toBe('Math');
    expect(mathBlock.delim).toBe('\\[');
    expect(mathBlock.children.length).toBe(3);
    expect(mathBlock.children[0].type).toBe('Text');
    expect((mathBlock.children[0] as any).value).toBe(' x^2 ');
    // Command inside math block
    const mathTxtCmd = mathBlock.children[1] as any;
    expect(mathTxtCmd.type).toBe('Command');
    expect(mathTxtCmd.name).toBe('text');
    // Group argument to \text
    const textGroup = mathBlock.children[2] as any;
    expect(textGroup.type).toBe('Group');
    expect(textGroup.children.length).toBe(2);
    expect(textGroup.children[0].type).toBe('Text');
    expect((textGroup.children[0] as any).value).toBe('math text ');
    const innerMath = textGroup.children[1] as any;
    expect(innerMath.type).toBe('Math');
    expect(innerMath.delim).toBe('$');
    expect(innerMath.children.length).toBe(2);
    expect(innerMath.children[0].type).toBe('Command');
    expect(innerMath.children[0].name).toBe('mathcal');
    const mathcalArg = innerMath.children[1] as any;
    expect(mathcalArg.type).toBe('Group');
    expect(mathcalArg.children.length).toBe(1);
    expect(mathcalArg.children[0].type).toBe('Text');
    expect((mathcalArg.children[0] as any).value).toBe('S');
    // After math block
    expect(ss2c[1].type).toBe('Text');
    expect(ss2c[1].value).toBe(' ');
    expect(ss2c[2].type).toBe('Command');
    expect((ss2c[2] as any).name).toBe('cmd');
    expect(ss2c[3].type).toBe('Text');
    expect(ss2c[3].value).toBe(' outside tail');
    // Second top-level section
    const section2 = ast.children[1] as any;
    expect(section2.type).toBe('Section');
    expect(section2.level).toBe(1);
    expect(section2.title[0].value).toBe('Second');
    expect(section2.children.length).toBe(0);
  });
});
