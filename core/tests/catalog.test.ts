import { describe, expect, it } from 'vitest';
import {
  createProjectSnapshot,
  inspectProject,
  inspectProjectCatalog,
  resolveProjectView,
  type ProjectView,
} from '../src/index.js';

const file = (source: string, path = 'main.tex', version = 1) => ({ path, source, version });
const snapshot = (source: string) => createProjectSnapshot([file(source)]);

function ready(value: ProjectView): asserts value is ProjectView & { status: 'ready' } {
  expect(value.status, value.status === 'ready' ? '' : JSON.stringify(value.reason)).toBe('ready');
}

describe('Phase C3: Project Symbol & Construct Catalog (inspectProjectCatalog)', () => {
  it('scans environment-definition, bibitem, citation, and extended reference facts', () => {
    const src = [
      '\\newcommand{\\mycmd}[2][def]{#1-#2}',
      '\\newenvironment{myenv}[1]{\\begin{quote}\\textbf{#1}}{\\end{quote}}',
      '\\newtheorem{lemma}{Lemma}',
      '\\label{sec:intro}\\cref{sec:intro,sec:missing}\\autoref{sec:intro}',
      '\\cite[p.2]{knuth84, lamport94}',
      '\\bibitem{knuth84} Knuth',
    ].join('\n');

    const snap = snapshot(src);
    const inv = inspectProject(snap);

    const defFact = inv.facts.find((f) => f.kind === 'definition')!;
    expect(defFact.kind).toBe('definition');
    if (defFact.kind === 'definition') {
      expect(defFact.name).toBe('mycmd');
      expect(defFact.numArgs).toBe(2);
      expect(defFact.defaultArg).toBe('def');
      expect(src.slice(defFact.nameRange!.start, defFact.nameRange!.end + 1)).toBe('mycmd');
    }

    const envDefs = inv.facts.filter((f) => f.kind === 'environment-definition');
    expect(envDefs).toHaveLength(2);
    if (envDefs[0]!.kind === 'environment-definition') {
      expect(envDefs[0]!.name).toBe('myenv');
      expect(envDefs[0]!.numArgs).toBe(1);
      expect(src.slice(envDefs[0]!.nameRange!.start, envDefs[0]!.nameRange!.end + 1)).toBe('myenv');
    }

    const refs = inv.facts.filter((f) => f.kind === 'reference');
    expect(refs).toHaveLength(2);
    if (refs[0]!.kind === 'reference') {
      expect(refs[0]!.command).toBe('cref');
      expect(refs[0]!.keys.map((k) => (k.kind === 'literal' ? k.value : ''))).toEqual([
        'sec:intro',
        'sec:missing',
      ]);
    }

    const citations = inv.facts.filter((f) => f.kind === 'citation');
    expect(citations).toHaveLength(1);
    if (citations[0]!.kind === 'citation') {
      expect(citations[0]!.keys.map((k) => (k.kind === 'literal' ? k.value : ''))).toEqual([
        'knuth84',
        'lamport94',
      ]);
    }

    const bibitems = inv.facts.filter((f) => f.kind === 'bibitem');
    expect(bibitems).toHaveLength(1);
  });

  it('catalogs introduced vs used commands, environments, conditions, labels, and citations with occurrence lists', () => {
    const src = [
      '\\newif\\ifdraft\\drafttrue',
      '\\newif\\ifunusedflag',
      '\\newcommand{\\usedCmd}[1]{(#1)}',
      '\\newcommand{\\unusedCmd}{unused}',
      '\\newenvironment{usedEnv}{\\begin{center}}{\\end{center}}',
      '\\newenvironment{unusedEnv}{\\begin{quote}}{\\end{quote}}',
      '\\ifdraft\\usedCmd{hi}\\fi',
      '\\unknownA{x}\\unknownA{y}',
      '\\begin{usedEnv}Body\\end{usedEnv}',
      '\\begin{unknownEnv}X\\end{unknownEnv}',
      '\\section{Intro}\\label{sec:one}\\label{sec:unused}',
      'See \\ref{sec:one} and \\cref{sec:one,sec:missing} and \\cite{key1, key2}.',
      '\\bibitem{key1} Ref 1',
    ].join('\n');

    const snap = snapshot(src);
    const view = resolveProjectView(snap, {
      entryPath: 'main.tex',
      customCommands: [{ name: 'unknownA', mandatoryArgs: 1 }],
    });
    ready(view);

    const catalog = inspectProjectCatalog(view);
    expect(catalog.kind).toBe('catalog');
    expect(Object.isFrozen(catalog)).toBe(true);

    // Commands
    expect(catalog.introducedCommands.map((c) => [c.name, c.category])).toEqual([
      ['unusedCmd', 'introduced-unused'],
      ['usedCmd', 'introduced-used'],
    ]);
    expect(catalog.usedUndefinedCommands.map((c) => c.name)).toEqual(['unknownA']);
    const unknownA = catalog.usedUndefinedCommands[0]!;
    expect(unknownA.occurrences).toHaveLength(2);
    expect(unknownA.occurrences.every((o) => o.selection !== null)).toBe(true);
    expect(unknownA.signature).toEqual({
      source: 'user-override',
      mandatoryArgs: 1,
      optionalArgs: 0,
      allowStar: true,
    });

    const usedCmd = catalog.introducedCommands.find((c) => c.name === 'usedCmd')!;
    expect(usedCmd.definitions).toHaveLength(1);
    expect(usedCmd.occurrences).toHaveLength(1);
    expect(usedCmd.signature.source).toBe('inferred-definition');
    expect(usedCmd.signature.mandatoryArgs).toBe(1);

    // Environments
    expect(catalog.introducedEnvironments.map((e) => [e.name, e.category])).toEqual([
      ['unusedEnv', 'introduced-unused'],
      ['usedEnv', 'introduced-used'],
    ]);
    const unknownEnv = catalog.environments.find((e) => e.name === 'unknownEnv')!;
    expect(unknownEnv.category).toBe('used-undefined');
    expect(unknownEnv.occurrences).toHaveLength(1);
    expect(unknownEnv.occurrences[0]!.selection).not.toBeNull();

    // Conditions
    expect(catalog.introducedConditions.map((c) => [c.name, c.category])).toEqual([
      ['draft', 'introduced-used'],
      ['unusedflag', 'introduced-unused'],
    ]);
    const draftCond = catalog.conditions.find((c) => c.name === 'draft')!;
    expect(draftCond.declarations).toHaveLength(1);
    expect(draftCond.tests).toHaveLength(1);
    expect(draftCond.tests[0]!.outcome).toBe('true');
    expect(draftCond.setters).toHaveLength(1);

    // Labels
    expect(catalog.introducedLabels.map((l) => [l.key, l.category])).toEqual([
      ['sec:one', 'introduced-used'],
      ['sec:unused', 'introduced-unused'],
    ]);
    expect(catalog.usedUndefinedLabels.map((l) => l.key)).toEqual(['sec:missing']);
    const secOne = catalog.labels.find((l) => l.key === 'sec:one')!;
    expect(secOne.declarations).toHaveLength(1);
    expect(secOne.occurrences).toHaveLength(2);

    // Citations
    expect(catalog.introducedCitations.map((c) => c.key)).toEqual(['key1']);
    expect(catalog.usedCitations.map((c) => [c.key, c.category])).toEqual([
      ['key1', 'introduced-used'],
      ['key2', 'used-external'],
    ]);
  });

  it('works directly on a ProjectSnapshot even when structural view is blocked', () => {
    const snap = snapshot('\\newcommand{\\a}{x}\\a\\undef{\\begin{unclosed}');
    const catalog = inspectProjectCatalog(snap);
    expect(catalog.viewId).toBeNull();
    expect(catalog.introducedCommands.map((c) => c.name)).toEqual(['a']);
    expect(catalog.usedUndefinedCommands.map((c) => c.name)).toEqual(['undef']);
  });
});
