import { describe, it, expect } from 'vitest';
import { parseToAst } from '../../src/lib/parse/parseToAst';
import { NodeType } from '../../src/lib/parse/types';
import type { CoreOptions } from '../../src/lib/options';

const parse = (input: string) => parseToAst(input, {} as CoreOptions);

describe('parseToAst', () => {
  it('parses environment at root', () => {
    const ast = parse(`\\begin{doc}Text\\end{doc}`);
    expect(ast.children.length).toBe(1);
    const env = ast.children[0] as any;
    expect(env.type).toBe(NodeType.Environment);
    expect(env.name).toBe('doc');
    expect(env.prefix).toBe('\\begin{doc}');
    expect(env.suffix).toBe('\\end{doc}');
    expect(env.children.length).toBe(1);
    expect(env.children[0].type).toBe(NodeType.Text);
    expect(env.children[0].value).toBe('Text');
  });

  it('parses braces groups at root', () => {
    const ast = parse(`{Text}`);
    expect(ast.children.length).toBe(1);
    const group = ast.children[0] as any;
    expect(group.type).toBe(NodeType.Group);
    expect(group.prefix).toBe('{');
    expect(group.suffix).toBe('}');
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
    expect(section.type).toBe(NodeType.Section);
    expect(section.level).toBe(1);
    expect(section.name).toBe('Title');
    expect(section.children.length).toBe(1);

    const env = section.children[0];
    expect(env.type).toBe(NodeType.Environment);
    expect((env as any).name).toBe('doc');
    expect((env as any).children[0].type).toBe(NodeType.Text);
  });

  it('parses math mode command delimiters', () => {
    const ast = parse(`Text \\(a+b\\)\\[test\\]`);
    expect(ast.children.length).toBe(3);
    const m1 = ast.children[1] as any;
    expect(m1.type).toBe(NodeType.Math);
    expect(m1.delim).toBe('\\(');
    expect(m1.prefix).toBe('\\(');
    expect(m1.suffix).toBe('\\)');
    expect(m1.children.length).toBe(1);
    expect(m1.children[0].type).toBe(NodeType.Text);
    expect(m1.children[0].value).toBe('a+b');

    const m2 = ast.children[2] as any;
    expect(m2.type).toBe(NodeType.Math);
    expect(m2.delim).toBe('\\[');
    expect(m2.prefix).toBe('\\[');
    expect(m2.suffix).toBe('\\]');
    expect(m2.children.length).toBe(1);
    expect(m2.children[0].type).toBe(NodeType.Text);
    expect(m2.children[0].value).toBe('test');
  });

  it('parses dollar math mode', () => {
    const ast = parse(`$a+b$ and $$test$$`);
    expect(ast.children.length).toBe(3);
    const m1 = ast.children[0] as any;
    expect(m1.type).toBe(NodeType.Math);
    expect(m1.delim).toBe('$');
    expect(m1.prefix).toBe('$');
    expect(m1.suffix).toBe('$');
    expect(m1.children.length).toBe(1);
    expect(m1.children[0].type).toBe(NodeType.Text);
    expect(m1.children[0].value).toBe('a+b');

    const m2 = ast.children[2] as any;
    expect(m2.type).toBe(NodeType.Math);
    expect(m2.delim).toBe('$$');
    expect(m2.prefix).toBe('$$');
    expect(m2.suffix).toBe('$$');
    expect(m2.children.length).toBe(1);
    expect(m2.children[0].type).toBe(NodeType.Text);
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
    expect(env.type).toBe(NodeType.Environment);
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(2);

    const math = env.children[0] as any;
    expect(math.type).toBe(NodeType.Math);
    expect(math.delim).toBe('\\[');
    expect(math.children.length).toBe(6);
    const mc = math.children;
    expect(mc[0].type).toBe(NodeType.Command);
    expect(mc[0].name).toBe('mathcal');
    expect(mc[0].value).toBe('\\mathcal');
    expect(mc[1].type).toBe(NodeType.Group);
    expect((mc[1] as any).prefix).toBe('{');
    expect((mc[1] as any).suffix).toBe('}');
    expect(mc[2].type).toBe(NodeType.Text);
    expect(mc[3].type).toBe(NodeType.Command);
    expect(mc[4].type).toBe(NodeType.Group);
    const txtGrp = mc[4] as any;
    expect(txtGrp.children.length).toBe(2);
    expect(txtGrp.children[0].type).toBe(NodeType.Text);
    expect(txtGrp.children[1].type).toBe(NodeType.Math);
    const innerMath = txtGrp.children[1] as any;
    expect(innerMath.delim).toBe('$');
    expect(innerMath.prefix).toBe('$');
    expect(innerMath.suffix).toBe('$');
    expect(innerMath.children.length).toBe(1);
    expect(innerMath.children[0].type).toBe(NodeType.Text);
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
      `\\section  {Second}`,
      'final',
    ].join('');
    const ast = parse(input);
    expect(ast.children.length).toBe(2);

    const section = ast.children[0] as any;
    expect(section.type).toBe(NodeType.Section);
    expect(section.level).toBe(1);
    expect(section.children.length).toBe(3);
    expect(section.name).toBe('Top');
    expect(section.prefix).toBe('\\section{Top}');

    const env = section.children[0] as any;
    expect(env.type).toBe(NodeType.Environment);
    expect(env.name).toBe('doc');
    expect(env.children.length).toBe(2);
    const ec = env.children;
    expect(ec[0].type).toBe(NodeType.Math);
    expect((ec[0] as any).delim).toBe('\\(');
    expect(ec[0].children.length).toBe(1);
    expect((ec[0].children[0] as any).type).toBe(NodeType.Text);
    expect((ec[0].children[0] as any).value).toBe('a+b');
    expect(ec[1].type).toBe(NodeType.Text);
    expect(ec[1].value).toBe(' some text ');

    expect(section.children[1].type).toBe(NodeType.Text);
    expect((section.children[1] as any).value).toBe(' ');

    const sub = section.children[2] as any;
    expect(sub.type).toBe(NodeType.Section);
    expect(sub.level).toBe(2);
    expect(sub.children.length).toBe(3);
    expect(sub.name).toBe('Sub');

    const mathBlock = sub.children[0] as any;
    expect(mathBlock.type).toBe(NodeType.Math);
    expect(mathBlock.delim).toBe('\\[');
    expect(mathBlock.prefix).toBe('\\[');
    expect(mathBlock.suffix).toBe('\\]');
    expect(mathBlock.children.length).toBe(3);
    expect(mathBlock.children[0].type).toBe(NodeType.Text);
    expect((mathBlock.children[0] as any).value).toBe(' x^2 ');

    const mathTxtCmd = mathBlock.children[1] as any;
    expect(mathTxtCmd.type).toBe(NodeType.Command);
    expect(mathTxtCmd.name).toBe('text');
    expect(mathTxtCmd.value).toBe('\\text');

    const textGroup = mathBlock.children[2] as any;
    expect(textGroup.type).toBe(NodeType.Group);
    expect(textGroup.prefix).toBe('{');
    expect(textGroup.suffix).toBe('}');
    expect(textGroup.children.length).toBe(2);
    expect(textGroup.children[0].type).toBe(NodeType.Text);
    expect((textGroup.children[0] as any).value).toBe('math text ');

    const innerMath = textGroup.children[1] as any;
    expect(innerMath.type).toBe(NodeType.Math);
    expect(innerMath.delim).toBe('$');
    expect(innerMath.prefix).toBe('$');
    expect(innerMath.suffix).toBe('$');
    expect(innerMath.children.length).toBe(2);
    expect(innerMath.children[0].type).toBe(NodeType.Command);
    expect(innerMath.children[0].name).toBe('mathcal');
    expect(innerMath.children[0].value).toBe('\\mathcal');

    const mathcalArg = innerMath.children[1] as any;
    expect(mathcalArg.type).toBe(NodeType.Group);
    expect(mathcalArg.prefix).toBe('{');
    expect(mathcalArg.suffix).toBe('}');
    expect(mathcalArg.children.length).toBe(1);
    expect(mathcalArg.children[0].type).toBe(NodeType.Text);
    expect((mathcalArg.children[0] as any).value).toBe('S');

    const cmd = sub.children[1] as any;
    expect(cmd.type).toBe(NodeType.Command);
    expect(cmd.name).toBe('cmd');
    expect(cmd.value).toBe('\\cmd ');

    const tailText = sub.children[2] as any;
    expect(tailText.type).toBe(NodeType.Text);
    expect(tailText.value).toBe('tail');

    const section2 = ast.children[1] as any;
    expect(section2.type).toBe(NodeType.Section);
    expect(section2.level).toBe(1);
    expect(section2.name).toBe('Second');
    expect(section2.prefix).toBe('\\section  {Second}');
    expect(section2.children.length).toBe(1);
    const finalText = section2.children[0] as any;
    expect(finalText.type).toBe(NodeType.Text);
    expect(finalText.value).toBe('final');
    expect(section2.end).toBe(input.length - 1);
  });
});
