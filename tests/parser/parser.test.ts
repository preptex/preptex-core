import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/lib/parse/parser';
import { NodeType } from '../../src/lib/parse/types';
import { CoreOptions } from '../../src/lib/options';

const parse = (input: string) => new Parser({} as CoreOptions).parse(input);

describe('Parser', () => {
  it('parses environment at root', () => {
    const ast = parse(`\\begin{doc}Text\\end{doc}`);
    expect(ast.children.length).toBe(1);
    const env = ast.children[0] as any;
    expect(env.type).toBe(NodeType.Environment);
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(1);
    expect(env.children[0].type).toBe(NodeType.Text);
    expect(env.children[0].value).toBe('Text');
  });

  it('parses braces groups at root', () => {
    const ast = parse(`{Text}`);
    expect(ast.children.length).toBe(1);
    const group = ast.children[0] as any;
    expect(group.type).toBe(NodeType.Group);
    expect(group.children.length).toBe(1);
    expect(group.children[0].type).toBe(NodeType.Text);
    expect(group.children[0].value).toBe('Text');
  });

  it('nests groups inside environment children', () => {
    const ast = parse('\\begin{doc}prefix {{inner}}{sibling} suffix\\end{doc}');
    expect(ast.children.length).toBe(1);
    const env = ast.children[0] as any;
    expect(env.type).toBe(NodeType.Environment);
    const ec = env.children;
    expect(ec.length).toBe(4);
    expect(ec[0].type).toBe(NodeType.Text);
    expect(ec[0].value).toBe('prefix ');

    expect(ec[1].type).toBe(NodeType.Group);
    expect(ec[1].children.length).toBe(1);
    expect(ec[1].children[0].type).toBe(NodeType.Group);
    expect(ec[1].children[0].children.length).toBe(1);
    expect(ec[1].children[0].children[0].type).toBe(NodeType.Text);
    expect(ec[1].children[0].children[0].value).toBe('inner');

    expect(ec[2].type).toBe(NodeType.Group);
    expect(ec[2].children.length).toBe(1);
    expect(ec[2].children[0].type).toBe(NodeType.Text);
    expect(ec[2].children[0].value).toBe('sibling');

    expect(ec[3].type).toBe(NodeType.Text);
    expect(ec[3].value).toBe(' suffix');
  });

  it('nests environments within sections', () => {
    const ast = parse(`\\section{Title}\\begin{doc}Text\\end{doc}`);
    expect(ast.children.length).toBe(1);
    const section = ast.children[0] as any;
    expect(section.type).toBe('Section');
    expect(section.level).toBe(1);
    expect(section.children.length).toBe(2);

    const titleNode = section.children[0];
    expect(titleNode.type).toBe(NodeType.Group);
    expect((titleNode as any).children[0].type).toBe(NodeType.Text);
    expect((titleNode as any).children[0].value).toBe('Title');

    const env = section.children[1];
    expect(env.type).toBe(NodeType.Environment);
    expect((env as any).name).toBe('doc');
    expect((env as any).children[0].type).toBe('Text');
  });

  it('tests math mode command delims', () => {
    const ast = parse(`Text \\(a+b\\)\\[test\\]`);
    expect(ast.children.length).toBe(3);
    const m1 = ast.children[1] as any;
    expect(m1.type).toBe('Math');
    expect(m1.delim).toBe('\\(');
    expect(m1.children.length).toBe(1);
    expect(m1.children[0].type).toBe('Text');
    expect(m1.children[0].value).toBe('a+b');

    const m2 = ast.children[2] as any;
    expect(m2.type).toBe('Math');
    expect(m2.delim).toBe('\\[');
    expect(m2.children.length).toBe(1);
    expect(m2.children[0].type).toBe('Text');
    expect(m2.children[0].value).toBe('test');
  });

  it('tests dollar math mode', () => {
    const ast = parse(`$a+b$ and $$test$$`);
    expect(ast.children.length).toBe(3);
    const m1 = ast.children[0] as any;
    expect(m1.type).toBe('Math');
    expect(m1.delim).toBe('$');
    expect(m1.children.length).toBe(1);
    expect(m1.children[0].type).toBe('Text');
    expect(m1.children[0].value).toBe('a+b');

    const m2 = ast.children[2] as any;
    expect(m2.type).toBe('Math');
    expect(m2.delim).toBe('$$');
    expect(m2.children.length).toBe(1);
    expect(m2.children[0].type).toBe('Text');
    expect(m2.children[0].value).toBe('test');
  });

  it('nests math within environments', () => {
    const ast = parse(
      '\\begin{doc}\\[' +
        '\\mathcal' +
        '{A}' +
        ' = \\{' +
        '\\text' +
        '{some text $1$}' +
        '\\}' +
        '\\].\\end{doc}'
    );
    expect(ast.children.length).toBe(1);
    const env = ast.children[0] as any;
    expect(env.type).toBe('Environment');
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(2);

    const math = env.children[0] as any;
    expect(math.type).toBe('Math');
    expect(math.delim).toBe('\\[');
    expect(math.children.length).toBe(6);
    const mc = math.children;
    expect(mc[0].type).toBe('Command');
    expect(mc[0].name).toBe('mathcal');
    expect(mc[1].type).toBe('Group');
    expect(mc[2].type).toBe('Text');
    expect(mc[3].type).toBe('Command');
    expect(mc[4].type).toBe('Group');
    const txtGrp = mc[4] as any;
    expect(txtGrp.children.length).toBe(2);
    expect(txtGrp.children[0].type).toBe('Text');
    expect(txtGrp.children[1].type).toBe('Math');
    const innerMath = txtGrp.children[1] as any;
    expect(innerMath.delim).toBe('$');
    expect(innerMath.children.length).toBe(1);
    expect(innerMath.children[0].type).toBe('Text');
  });

  it('nests sections, environments, math, and commands', () => {
    const input = [
      `\\section{Top}`,
      `\\begin{doc}`,
      `\\(a+b\\)`,
      ` some text `,
      `\\end{doc}`,
      ` \\subsection{Sub}`,
      `\\[ x^2 \\text{math text $\\mathcal{S}$}\\]`,
      `\\cmd`,
      ` tail`,
      `\\section{Second}`,
    ].join('');
    const ast = parse(input);
    expect(ast.children.length).toBe(2);

    const section = ast.children[0] as any;
    expect(section.type).toBe('Section');
    expect(section.level).toBe(1);
    expect(section.children.length).toBe(4);
    expect(section.children[0].type).toBe(NodeType.Group);
    expect((section.children[0] as any).children[0].value).toBe('Top');
    // Environment is nested under the 'Title' subsection
    const env = section.children[1] as any;
    expect(env.type).toBe('Environment');
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(2);
    const ec = env.children;
    expect(ec[0].type).toBe('Math');
    expect((ec[0] as any).delim).toBe('\\(');
    expect(ec[0].children.length).toBe(1);
    expect((ec[0].children[0] as any).type).toBe('Text');
    expect((ec[0].children[0] as any).value).toBe('a+b');
    expect(ec[1].type).toBe('Text');
    expect(ec[1].value).toBe(' some text ');
    // End of environment
    expect(section.children[2].type).toBe('Text');
    expect(section.children[2].value).toBe(' ');
    // The second subsection
    // A subsection 'Title' appears before environment (node type may vary)
    const sub = section.children[3] as any;
    expect(sub.type).toBe('Section');
    expect(sub.level).toBe(2);
    expect(sub.children.length).toBe(4);
    expect(sub.children[0].type).toBe(NodeType.Group);
    expect((sub.children[0] as any).children[0].value).toBe('Sub');
    // Math display node inside env
    const mathBlock = sub.children[1] as any;
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
    expect(sub.children[2].type).toBe('Command');
    expect((sub.children[2] as any).name).toBe('cmd');
    expect(sub.children[3].type).toBe('Text');
    expect(sub.children[3].value).toBe(' tail');
    // Second top-level section
    const section2 = ast.children[1] as any;
    expect(section2.type).toBe('Section');
    expect(section2.level).toBe(1);
    expect(section2.children.length).toBe(1);
    expect(section2.children[0].type).toBe(NodeType.Group);
    expect((section2.children[0] as any).children[0].value).toBe('Second');
  });
});
