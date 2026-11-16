import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  isConfiguredContainerNode,
  resolveProjectView,
  walkConfiguredNodes,
  type ConfiguredArgumentNode,
  type ConfiguredNode,
  type ProjectView,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

function argsOf(node: ConfiguredNode): readonly ConfiguredArgumentNode[] {
  if (!isConfiguredContainerNode(node)) return [];
  return node.children.filter((c): c is ConfiguredArgumentNode => c.kind === 'argument');
}

describe('Phase C1: ConfiguredArgumentNode child nodes & dynamic command signatures', () => {
  it('attaches command and section arguments as explicit ConfiguredArgumentNode children', () => {
    const src = '\\section*[Short]{Title}\\textbf{bold \\emph{inner}}\\cite[p.1]{ref1}\\textbf a';
    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const all = walkConfiguredNodes(view.root);
    const sec = all.find((n) => n.kind === 'section')!;
    expect(sec.kind).toBe('section');
    if (sec.kind === 'section') {
      const secArgs = argsOf(sec);
      expect(secArgs).toHaveLength(2);
      expect(secArgs.map((a) => [a.argKind, a.slot, a.delimiter, a.opaque])).toEqual([
        ['optional', 0, 'bracket', false],
        ['mandatory', 1, 'braced', false],
      ]);
      expect(sec.arguments[0]!.childStart).toBe(sec.children.indexOf(secArgs[0]!));
      expect(sec.arguments[1]!.childStart).toBe(sec.children.indexOf(secArgs[1]!));
      expect(
        secArgs[0]!.children.map((c) => (c.kind === 'token' ? c.token.value : c.kind))
      ).toEqual(['[', 'Short', ']']);
      expect(
        secArgs[1]!.children.map((c) => (c.kind === 'token' ? c.token.value : c.kind))
      ).toEqual(['{', 'Title', '}']);
    }

    const bolds = all.filter((n) => n.kind === 'command' && n.name === 'textbf');
    expect(bolds).toHaveLength(2);
    const firstBoldArgs = argsOf(bolds[0]!);
    expect(firstBoldArgs).toHaveLength(1);
    expect(
      firstBoldArgs[0]!.children.map((c) => (c.kind === 'token' ? c.token.value : c.kind))
    ).toEqual(['{', 'bold', ' ', 'command', '}']);
    const bareBoldArgs = argsOf(bolds[1]!);
    expect(bareBoldArgs).toHaveLength(1);
    expect(bareBoldArgs[0]!.delimiter).toBe('bare');
    expect(
      bareBoldArgs[0]!.children.map((c) => (c.kind === 'token' ? c.token.value : c.kind))
    ).toEqual(['a']);

    const cite = all.find((n) => n.kind === 'command' && n.name === 'cite')!;
    const citeArgs = argsOf(cite);
    expect(citeArgs.map((a) => [a.argKind, a.slot, a.delimiter, a.opaque])).toEqual([
      ['optional', 0, 'bracket', true],
      ['mandatory', 2, 'braced', true],
    ]);
  });

  it('parses environment arguments into ConfiguredArgumentNode children', () => {
    const src =
      '\\begin{theorem}[Main Result]Statement\\end{theorem}\\begin{tabular}[t]{lcc}a & b\\\\\\end{tabular}';
    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const envs = walkConfiguredNodes(view.root).filter((n) => n.kind === 'environment');
    expect(envs).toHaveLength(2);
    const thm = envs[0]!;
    const tab = envs[1]!;
    expect(argsOf(thm).map((a) => [a.argKind, a.delimiter])).toEqual([['optional', 'bracket']]);
    expect(argsOf(tab).map((a) => [a.argKind, a.delimiter])).toEqual([
      ['optional', 'bracket'],
      ['mandatory', 'braced'],
    ]);
    if (tab.kind === 'environment') {
      expect(tab.arguments).toHaveLength(2);
      expect(tab.syntax.hasArguments).toBe(true);
    }
  });

  it('automatically infers command signatures from \\newcommand and \\def declarations', () => {
    const src = [
      '\\newcommand{\\mybox}[2][blue]{#1: #2}',
      '\\def\\pair#1#2{(#1,#2)}',
      '\\mybox[red]{Hello}\\mybox{World}\\pair{A}{B}',
    ].join('\n');

    const view = resolveProjectView(snapshot(src), { entryPath: 'main.tex' });
    ready(view);

    const cmds = walkConfiguredNodes(view.root).filter((n) => n.kind === 'command');
    expect(cmds.map((c) => (c.kind === 'command' ? [c.name, argsOf(c).length] : []))).toEqual([
      ['mybox', 2],
      ['mybox', 1],
      ['pair', 2],
    ]);
    expect(argsOf(cmds[0]!).map((a) => a.argKind)).toEqual(['optional', 'mandatory']);
    expect(argsOf(cmds[1]!).map((a) => a.argKind)).toEqual(['mandatory']);
    expect(argsOf(cmds[2]!).map((a) => a.argKind)).toEqual(['mandatory', 'mandatory']);

    // Opting out of inference keeps undefined/custom commands unparsed as command nodes
    const noInfer = resolveProjectView(snapshot(src), {
      entryPath: 'main.tex',
      inferDefinedCommands: false,
    });
    ready(noInfer);
    expect(walkConfiguredNodes(noInfer.root).filter((n) => n.kind === 'command')).toEqual([]);
  });

  it('reparses used undefined commands when customCommands assigns optional and mandatory argument counts', () => {
    const src = '\\unknowncmd[opt1]{arg1}{arg2} tail';
    const snap = snapshot(src);

    const before = resolveProjectView(snap, { entryPath: 'main.tex' });
    ready(before);
    expect(walkConfiguredNodes(before.root).filter((n) => n.kind === 'command')).toEqual([]);

    const after = resolveProjectView(snap, {
      entryPath: 'main.tex',
      customCommands: [{ name: 'unknowncmd', optionalArgs: 1, mandatoryArgs: 2 }],
    });
    ready(after);
    expect(after.id).not.toBe(before.id);

    const cmd = walkConfiguredNodes(after.root).find(
      (n) => n.kind === 'command' && n.name === 'unknowncmd'
    )!;
    expect(cmd).toBeDefined();
    const cmdArgs = argsOf(cmd);
    expect(cmdArgs).toHaveLength(3);
    expect(cmdArgs.map((a) => [a.argKind, a.slot])).toEqual([
      ['optional', 0],
      ['mandatory', 1],
      ['mandatory', 2],
    ]);
  });

  it('allows customCommands to override built-in or inferred signatures and rejects invalid specs', () => {
    const snap = snapshot('\\newcommand{\\foo}[1]{#1}\\foo[opt]{x}{y}');
    const overridden = resolveProjectView(snap, {
      entryPath: 'main.tex',
      customCommands: [{ name: 'foo', optionalArgs: 1, mandatoryArgs: 2 }],
    });
    ready(overridden);
    const foo = walkConfiguredNodes(overridden.root).find(
      (n) => n.kind === 'command' && n.name === 'foo'
    )!;
    expect(argsOf(foo)).toHaveLength(3);

    expect(() =>
      resolveProjectView(snap, {
        entryPath: 'main.tex',
        customCommands: [{ name: 'bad}name', mandatoryArgs: 1 }],
      })
    ).toThrow();
    expect(() =>
      resolveProjectView(snap, {
        entryPath: 'main.tex',
        customCommands: [{ name: 'foo', mandatoryArgs: -1 }],
      })
    ).toThrow();
  });
});
