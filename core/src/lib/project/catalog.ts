import type { SourceRange } from '../../api-types.js';
import type {
  AnalysisLocation,
  CatalogCitationEntry,
  CatalogCommandEntry,
  CatalogConditionEntry,
  CatalogEnvironmentEntry,
  CatalogLabelEntry,
  CommandDefinitionItem,
  CommandOccurrenceItem,
  ConditionDecision,
  ConfiguredNode,
  CustomCommandSignature,
  EnvironmentDefinitionItem,
  EnvironmentOccurrenceItem,
  ProjectCatalog,
  ProjectSnapshot,
  ProjectView,
  SourceScope,
  SyntaxFact,
} from '../../project-types.js';
import type { NodeSelection } from '../../node-types.js';
import { walkConfiguredNodes } from '../../project-types.js';
import {
  customSignatureToCommandSignature,
  getCommandSignature,
  inferDefinitionSignature,
} from './commands.js';
import { normalizeCustomCommands } from './configuration.js';
import { sourceEnvironments } from './environments.js';
import { DEFINITIONS, ENV_DEFINITIONS, UNSUPPORTED_DEFINITIONS } from './scan.js';
import { freeze, identity, invalid, record, testKind } from './shared.js';
import { normalizeScope, validateSnapshot } from './snapshot.js';
import { validateView } from './view.js';

const STANDARD_ENVIRONMENTS = new Set([
  'document',
  'abstract',
  'figure',
  'figure*',
  'table',
  'table*',
  'tabular',
  'tabular*',
  'array',
  'itemize',
  'enumerate',
  'description',
  'quote',
  'quotation',
  'verse',
  'center',
  'flushleft',
  'flushright',
  'minipage',
  'verbatim',
  'verbatim*',
  'comment',
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'split',
  'cases',
  'matrix',
  'pmatrix',
  'bmatrix',
  'vmatrix',
  'thebibliography',
  'titlepage',
  'proof',
  'frame',
  'lstlisting',
  'multicols',
]);

const STRUCTURAL_KEYWORDS = new Set(['begin', 'end', 'newif', 'else', 'fi', 'global', 'verb']);

interface LocatedFact {
  readonly fact: SyntaxFact;
  readonly location: AnalysisLocation;
}

function collectViewFacts(view: ProjectView): LocatedFact[] {
  const source = view.snapshot;
  const located: LocatedFact[] = view.reachedFacts.map((e) => ({
    fact: e.fact,
    location: e.origin,
  }));

  for (const reached of view.reachedFacts) {
    if (reached.fact.kind === 'definition' && reached.fact.body) {
      const def = reached.fact;
      const file = source.files.find((f) => f.path === def.path);
      if (!file) continue;
      for (const fact of file.facts) {
        if (
          fact.context.definitionBodies.some(
            (r) => r.start === def.body!.start && r.end === def.body!.end
          )
        ) {
          located.push({ fact, location: { ...reached.origin, range: fact.range } });
        }
      }
    } else if (reached.fact.kind === 'environment-definition') {
      const envDef = reached.fact;
      const file = source.files.find((f) => f.path === envDef.path);
      if (!file) continue;
      const bodies = [envDef.beginBody, envDef.endBody].filter((b): b is SourceRange => b !== null);
      if (bodies.length === 0) continue;
      for (const fact of file.facts) {
        if (
          fact.context.definitionBodies.some((r) =>
            bodies.some((b) => r.start === b.start && r.end === b.end)
          )
        ) {
          located.push({ fact, location: { ...reached.origin, range: fact.range } });
        }
      }
    }
  }

  const opaqueByPath = new Map<string, (typeof view.selectedTokens)[number][]>();
  for (const token of view.selectedTokens) {
    if (token.interpretation !== 'opaque') continue;
    const bucket = opaqueByPath.get(token.origin.path) ?? [];
    bucket.push(token);
    opaqueByPath.set(token.origin.path, bucket);
  }
  for (const [path, opaqueTokens] of opaqueByPath) {
    const file = source.files.find((f) => f.path === path);
    if (!file) continue;
    for (const fact of file.facts) {
      if (
        fact.kind !== 'command-use' ||
        fact.context.opaqueArguments.length === 0 ||
        fact.context.definitionBodies.length > 0
      ) {
        continue;
      }
      for (const tok of opaqueTokens) {
        if (
          tok.origin.range.start <= fact.range.start &&
          tok.origin.range.end >= fact.range.start
        ) {
          located.push({ fact, location: { ...tok.origin, range: fact.range } });
        }
      }
    }
  }

  return [
    ...new Map(
      located.map((entry) => [
        `${entry.fact.path}:${entry.fact.range.start}:${entry.fact.kind}:${entry.location.occurrenceId ?? ''}`,
        entry,
      ])
    ).values(),
  ];
}

function nodeIndexKey(path: string, occurrenceId: string | null, start: number): string {
  return `${path}:${occurrenceId ?? ''}:${start}`;
}

/**
 * Inspect all introduced (defined/declared) and used commands, environments, conditions,
 * labels/references, and citations across a {@link ProjectSnapshot} or {@link ProjectView},
 * maintaining an ordered list of all occurrences for each symbol.
 *
 * @param model - Source snapshot or configured view.
 * @param options - Optional file scope (for snapshots) and custom command signatures.
 * @returns Frozen {@link ProjectCatalog} with grouped symbol inventories and occurrence lists.
 * @throws {@link PrepTexError} with `InvalidArgument` for invalid models or options.
 */
export function inspectProjectCatalog(
  model: ProjectSnapshot | ProjectView,
  options: {
    readonly scope?: SourceScope;
    readonly customCommands?: readonly CustomCommandSignature[];
  } = {}
): ProjectCatalog {
  const rawModel = record(model, 'catalog model');
  const normalized =
    rawModel['kind'] === 'snapshot' ? validateSnapshot(model) : validateView(model);
  const rawOptions = record(options, 'catalog options');
  const scope = normalizeScope(rawOptions['scope']);
  const extraCustom = normalizeCustomCommands(rawOptions['customCommands']);

  const snapshot = normalized.kind === 'snapshot' ? normalized : normalized.snapshot;
  const view = normalized.kind === 'view' ? normalized : null;

  if (
    scope.kind === 'files' &&
    scope.paths.some((p) => !snapshot.files.some((f) => f.path === p))
  ) {
    invalid('Catalog scope contains an absent source file.');
  }

  const allowedPaths = new Set(
    scope.kind === 'files' ? scope.paths : snapshot.files.map((f) => f.path)
  );
  const filesByPath = new Map(snapshot.files.map((f) => [f.path, f]));

  const locatedFacts: LocatedFact[] = view
    ? collectViewFacts(view).filter((e) => allowedPaths.has(e.fact.path))
    : snapshot.files
        .filter((f) => allowedPaths.has(f.path))
        .flatMap((file) =>
          file.facts.map((fact) => ({
            fact,
            location: {
              snapshotId: snapshot.id,
              occurrenceId: null,
              path: file.path,
              range: fact.range,
            },
          }))
        );

  // Build node selection lookup when a ready ProjectView is supplied
  const commandNodesByKey = new Map<
    string,
    {
      readonly selection: NodeSelection;
      readonly fullRange: SourceRange;
      readonly starred: boolean;
      readonly argumentRanges: readonly SourceRange[];
    }
  >();
  const envNodesByKey = new Map<
    string,
    {
      readonly selection: NodeSelection;
      readonly openingNameRange: SourceRange | null;
      readonly closingNameRange: SourceRange | null;
      readonly hasArguments: boolean;
    }
  >();

  if (view && view.status === 'ready') {
    for (const node of walkConfiguredNodes(view.root)) {
      const sel: NodeSelection = {
        kind: 'node',
        snapshotId: snapshot.id,
        viewId: view.id,
        nodeKey: node.occurrenceKey,
      };
      if (node.kind === 'command' || node.kind === 'section') {
        const firstTok = node.children[0];
        if (firstTok?.kind === 'token' && firstTok.location.primary) {
          const p = firstTok.location.primary;
          const argRanges: SourceRange[] = [];
          for (const arg of node.arguments) {
            if (arg.location.primary) argRanges.push(arg.location.primary.range);
          }
          const fullRange = node.location.primary?.range ?? p.range;
          commandNodesByKey.set(nodeIndexKey(p.path, p.occurrenceId, p.range.start), {
            selection: sel,
            fullRange,
            starred: node.starred,
            argumentRanges: argRanges,
          });
        }
      } else if (node.kind === 'token' && node.token.kind === 'command' && node.location.primary) {
        const p = node.location.primary;
        if (!commandNodesByKey.has(nodeIndexKey(p.path, p.occurrenceId, p.range.start))) {
          commandNodesByKey.set(nodeIndexKey(p.path, p.occurrenceId, p.range.start), {
            selection: sel,
            fullRange: p.range,
            starred: false,
            argumentRanges: [],
          });
        }
      } else if (node.kind === 'environment' && node.syntax.opening) {
        const op = node.syntax.opening;
        envNodesByKey.set(nodeIndexKey(op.path, op.origin.occurrenceId, op.range.start), {
          selection: sel,
          openingNameRange: op.nameRange,
          closingNameRange: node.syntax.closing?.nameRange ?? null,
          hasArguments: node.syntax.hasArguments,
        });
      }
    }
  }

  // Declared condition names across facts
  const declaredConditions = new Set<string>();
  for (const entry of locatedFacts) {
    if (entry.fact.kind === 'condition-declaration' && entry.fact.name) {
      declaredConditions.add(entry.fact.name);
    }
  }
  const isConditionSetter = (name: string): boolean => {
    const match = /^([A-Za-z]+)(true|false)$/.exec(name);
    return Boolean(match && declaredConditions.has(match[1]!));
  };

  // Custom command override map (view config + explicit options)
  const customMap = new Map<string, CustomCommandSignature>();
  if (view) {
    for (const c of view.configuration.customCommands) customMap.set(c.name, c);
  }
  for (const c of extraCustom) customMap.set(c.name, c);

  // 1. Commands
  const commandDefs = new Map<string, CommandDefinitionItem[]>();
  const commandUses = new Map<string, CommandOccurrenceItem[]>();

  for (const entry of locatedFacts) {
    const fact = entry.fact;
    if (fact.kind === 'definition' && fact.name) {
      const file = filesByPath.get(fact.path);
      const bodySource =
        file && fact.body ? file.source.slice(fact.body.start, fact.body.end + 1) : null;
      const list = commandDefs.get(fact.name) ?? [];
      list.push({
        id: fact.id,
        name: fact.name,
        form: fact.form,
        starred: fact.starred,
        numArgs: fact.numArgs,
        defaultArg: fact.defaultArg,
        location: entry.location,
        nameRange: fact.nameRange,
        arguments: fact.arguments,
        bodyRange: fact.body,
        bodySource,
      });
      commandDefs.set(fact.name, list);
    } else if (fact.kind === 'command-use') {
      if (
        STRUCTURAL_KEYWORDS.has(fact.name) ||
        DEFINITIONS.has(fact.name) ||
        ENV_DEFINITIONS.has(fact.name) ||
        UNSUPPORTED_DEFINITIONS.has(fact.name) ||
        testKind(fact.name) !== null ||
        isConditionSetter(fact.name)
      ) {
        continue;
      }
      const nodeInfo = commandNodesByKey.get(
        nodeIndexKey(fact.path, entry.location.occurrenceId, fact.range.start)
      );
      const list = commandUses.get(fact.name) ?? [];
      list.push({
        location: entry.location,
        commandTokenRange: fact.range,
        fullRange: nodeInfo?.fullRange ?? fact.range,
        selection: nodeInfo?.selection ?? null,
        starred: nodeInfo?.starred ?? false,
        argumentRanges: nodeInfo?.argumentRanges ?? [],
        inDefinitionBody: fact.context.definitionBodies.length > 0,
        inOpaqueArgument: fact.context.opaqueArguments.length > 0,
      });
      commandUses.set(fact.name, list);
    }
  }

  const allCommandNames = [...new Set([...commandDefs.keys(), ...commandUses.keys()])].sort();
  const commands: CatalogCommandEntry[] = allCommandNames.map((name) => {
    const defs = commandDefs.get(name) ?? [];
    const uses = commandUses.get(name) ?? [];
    const customSig = customMap.get(name);
    const builtinSig = getCommandSignature(name);
    const isControlWord = /^[A-Za-z@]+$/.test(name);

    let signature: CatalogCommandEntry['signature'];
    if (customSig) {
      const converted = customSignatureToCommandSignature(customSig);
      signature = {
        source: 'user-override',
        mandatoryArgs: converted.params.filter((p) => p.kind === 'mandatory').length,
        optionalArgs: converted.params.filter((p) => p.kind === 'optional').length,
        allowStar: converted.allowStar,
      };
    } else if (defs.length > 0) {
      const lastDef = defs[defs.length - 1]!;
      const inferred = inferDefinitionSignature(
        snapshot,
        lastDef.location.path,
        lastDef.form,
        name,
        lastDef.starred,
        lastDef.arguments
      );
      if (inferred) {
        signature = {
          source: 'inferred-definition',
          mandatoryArgs: inferred.params.filter((p) => p.kind === 'mandatory').length,
          optionalArgs: inferred.params.filter((p) => p.kind === 'optional').length,
          allowStar: inferred.allowStar,
        };
      } else {
        signature = { source: 'none', mandatoryArgs: 0, optionalArgs: 0, allowStar: true };
      }
    } else if (builtinSig) {
      signature = {
        source: 'builtin',
        mandatoryArgs: builtinSig.params.filter((p) => p.kind === 'mandatory').length,
        optionalArgs: builtinSig.params.filter((p) => p.kind === 'optional').length,
        allowStar: builtinSig.allowStar,
      };
    } else {
      signature = { source: 'none', mandatoryArgs: 0, optionalArgs: 0, allowStar: true };
    }

    const category: CatalogCommandEntry['category'] =
      defs.length > 0
        ? uses.length > 0
          ? 'introduced-used'
          : 'introduced-unused'
        : builtinSig || !isControlWord
          ? 'used-builtin'
          : 'used-undefined';

    const canRenameGlobally =
      isControlWord &&
      (defs.length > 0 || uses.length > 0) &&
      defs.every((d) => d.nameRange !== null && DEFINITIONS.has(d.form));

    return {
      name,
      category,
      signature,
      definitions: defs,
      occurrences: uses,
      canRenameGlobally,
    };
  });

  // 2. Environments
  const envDefs = new Map<string, EnvironmentDefinitionItem[]>();
  const envUses = new Map<string, EnvironmentOccurrenceItem[]>();

  for (const entry of locatedFacts) {
    const fact = entry.fact;
    if (fact.kind === 'environment-definition' && fact.name) {
      const list = envDefs.get(fact.name) ?? [];
      list.push({
        id: fact.id,
        name: fact.name,
        form: fact.form,
        starred: fact.starred,
        numArgs: fact.numArgs,
        defaultArg: fact.defaultArg,
        location: entry.location,
        nameRange: fact.nameRange,
        beginBodyRange: fact.beginBody,
        endBodyRange: fact.endBody,
      });
      envDefs.set(fact.name, list);
    }
  }

  if (view && view.status === 'ready') {
    const sourceEnvByStart = new Map(
      sourceEnvironments(snapshot).map((e) => [`${e.path}:${e.range.start}`, e])
    );
    for (const node of walkConfiguredNodes(view.root)) {
      if (node.kind !== 'environment') continue;
      const op = node.syntax.opening;
      const cl = node.syntax.closing;
      const primary = node.location.primary;
      if (!primary) continue;
      const srcEnv = op ? sourceEnvByStart.get(`${op.path}:${op.range.start}`) : undefined;
      const list = envUses.get(node.name) ?? [];
      list.push({
        location: {
          snapshotId: snapshot.id,
          occurrenceId: primary.occurrenceId,
          path: primary.path,
          range: primary.range,
        },
        selection: {
          kind: 'node',
          snapshotId: snapshot.id,
          viewId: view.id,
          nodeKey: node.occurrenceKey,
        },
        environmentSelection: srcEnv
          ? {
              kind: 'source-environment',
              snapshotId: snapshot.id,
              path: srcEnv.path,
              version: srcEnv.version,
              environmentId: srcEnv.id,
            }
          : null,
        openingNameRange: op?.nameRange ?? null,
        closingNameRange: cl?.nameRange ?? null,
        hasArguments: node.syntax.hasArguments,
        status: op && cl ? 'matched' : 'candidate',
      });
      envUses.set(node.name, list);
    }
  } else {
    for (const env of sourceEnvironments(snapshot)) {
      if (!allowedPaths.has(env.path) || !env.name) continue;
      if (view && !view.occurrences.some((o) => o.path === env.path)) continue;
      const list = envUses.get(env.name) ?? [];
      list.push({
        location: {
          snapshotId: snapshot.id,
          occurrenceId: null,
          path: env.path,
          range: env.range,
        },
        selection: null,
        environmentSelection: {
          kind: 'source-environment',
          snapshotId: snapshot.id,
          path: env.path,
          version: env.version,
          environmentId: env.id,
        },
        openingNameRange: env.opening?.nameRange ?? null,
        closingNameRange: env.closing?.nameRange ?? null,
        hasArguments: false,
        status: env.status,
      });
      envUses.set(env.name, list);
    }
  }

  const allEnvNames = [...new Set([...envDefs.keys(), ...envUses.keys()])].sort();
  const environments: CatalogEnvironmentEntry[] = allEnvNames.map((name) => {
    const defs = envDefs.get(name) ?? [];
    const uses = envUses.get(name) ?? [];
    const category: CatalogEnvironmentEntry['category'] =
      defs.length > 0
        ? uses.length > 0
          ? 'introduced-used'
          : 'introduced-unused'
        : STANDARD_ENVIRONMENTS.has(name)
          ? 'used-standard'
          : 'used-undefined';
    const canRenameGlobally =
      (defs.length > 0 || uses.length > 0) &&
      defs.every((d) => d.nameRange !== null) &&
      uses.every(
        (u) => u.status === 'matched' && u.openingNameRange !== null && u.closingNameRange !== null
      );
    return {
      name,
      category,
      definitions: defs,
      occurrences: uses,
      canRenameGlobally,
    };
  });

  // 3. Conditions
  const decisionsByKey = new Map<string, ConditionDecision['outcome']>();
  if (view) {
    for (const d of view.decisions) {
      decisionsByKey.set(
        nodeIndexKey(d.origin.path, d.origin.occurrenceId, d.origin.range.start),
        d.outcome
      );
    }
  }
  interface ConditionAccum {
    declarations: { location: AnalysisLocation; targetNameRange: SourceRange }[];
    tests: {
      location: AnalysisLocation;
      commandRange: SourceRange;
      outcome: ConditionDecision['outcome'] | null;
    }[];
    setters: { location: AnalysisLocation; commandRange: SourceRange; value: boolean }[];
    testKind: 'named-candidate' | 'primitive' | 'literal';
  }
  const condMap = new Map<string, ConditionAccum>();
  const ensureCond = (
    name: string,
    kind: ConditionAccum['testKind'] = 'named-candidate'
  ): ConditionAccum => {
    let entry = condMap.get(name);
    if (!entry) {
      entry = { declarations: [], tests: [], setters: [], testKind: kind };
      condMap.set(name, entry);
    }
    return entry;
  };

  for (const entry of locatedFacts) {
    const fact = entry.fact;
    if (fact.kind === 'condition-declaration' && fact.name) {
      const targetLen = fact.name.length + 2; // if<name>
      const targetStart = fact.range.end - targetLen + 1;
      ensureCond(fact.name, 'named-candidate').declarations.push({
        location: entry.location,
        targetNameRange: {
          start: targetStart,
          end: fact.range.end,
          line: fact.range.line,
        },
      });
    } else if (fact.kind === 'condition-test') {
      const condName =
        fact.testKind === 'named-candidate' && fact.command.startsWith('if')
          ? fact.command.slice(2)
          : fact.command;
      const outcome =
        decisionsByKey.get(
          nodeIndexKey(fact.path, entry.location.occurrenceId, fact.range.start)
        ) ?? null;
      ensureCond(condName, fact.testKind).tests.push({
        location: entry.location,
        commandRange: fact.range,
        outcome,
      });
    } else if (fact.kind === 'condition-assignment' && declaredConditions.has(fact.name)) {
      ensureCond(fact.name, 'named-candidate').setters.push({
        location: entry.location,
        commandRange: fact.range,
        value: fact.value,
      });
    }
  }

  const conditions: CatalogConditionEntry[] = [...condMap.keys()].sort().map((name) => {
    const c = condMap.get(name)!;
    const category: CatalogConditionEntry['category'] =
      c.testKind === 'primitive'
        ? 'primitive'
        : c.testKind === 'literal'
          ? 'literal'
          : c.declarations.length > 0
            ? c.tests.length > 0 || c.setters.length > 0
              ? 'introduced-used'
              : 'introduced-unused'
            : 'used-undeclared';
    return {
      name,
      category,
      declarations: c.declarations,
      tests: c.tests,
      setters: c.setters,
      canRenameGlobally:
        c.testKind === 'named-candidate' &&
        (c.declarations.length > 0 || c.tests.length > 0 || c.setters.length > 0),
    };
  });

  // 4. Labels & References
  const labelDecls = new Map<
    string,
    { location: AnalysisLocation; keyRange: SourceRange; selection: NodeSelection | null }[]
  >();
  const labelUses = new Map<
    string,
    {
      command: string;
      location: AnalysisLocation;
      keyRange: SourceRange;
      selection: NodeSelection | null;
    }[]
  >();

  for (const entry of locatedFacts) {
    const fact = entry.fact;
    if (fact.kind === 'label' && fact.key.kind === 'literal') {
      const nodeInfo = commandNodesByKey.get(
        nodeIndexKey(fact.path, entry.location.occurrenceId, fact.range.start)
      );
      const list = labelDecls.get(fact.key.value) ?? [];
      list.push({
        location: entry.location,
        keyRange: fact.key.range,
        selection: nodeInfo?.selection ?? null,
      });
      labelDecls.set(fact.key.value, list);
    } else if (fact.kind === 'reference') {
      const nodeInfo = commandNodesByKey.get(
        nodeIndexKey(fact.path, entry.location.occurrenceId, fact.range.start)
      );
      for (const k of fact.keys) {
        if (k.kind !== 'literal') continue;
        const list = labelUses.get(k.value) ?? [];
        list.push({
          command: fact.command,
          location: entry.location,
          keyRange: k.range,
          selection: nodeInfo?.selection ?? null,
        });
        labelUses.set(k.value, list);
      }
    }
  }

  const labels: CatalogLabelEntry[] = [...new Set([...labelDecls.keys(), ...labelUses.keys()])]
    .sort()
    .map((key) => {
      const declarations = labelDecls.get(key) ?? [];
      const occurrences = labelUses.get(key) ?? [];
      const category: CatalogLabelEntry['category'] =
        declarations.length > 0
          ? occurrences.length > 0
            ? 'introduced-used'
            : 'introduced-unused'
          : 'used-undefined';
      return {
        key,
        category,
        declarations,
        occurrences,
        canRenameGlobally: declarations.length > 0 || occurrences.length > 0,
      };
    });

  // 5. Citations & Bibitems
  const citeDefs = new Map<string, { location: AnalysisLocation; keyRange: SourceRange }[]>();
  const citeUses = new Map<
    string,
    {
      command: string;
      location: AnalysisLocation;
      keyRange: SourceRange;
      selection: NodeSelection | null;
    }[]
  >();

  for (const entry of locatedFacts) {
    const fact = entry.fact;
    if (fact.kind === 'bibitem' && fact.key.kind === 'literal') {
      const list = citeDefs.get(fact.key.value) ?? [];
      list.push({ location: entry.location, keyRange: fact.key.range });
      citeDefs.set(fact.key.value, list);
    } else if (fact.kind === 'citation') {
      const nodeInfo = commandNodesByKey.get(
        nodeIndexKey(fact.path, entry.location.occurrenceId, fact.range.start)
      );
      for (const k of fact.keys) {
        if (k.kind !== 'literal') continue;
        const list = citeUses.get(k.value) ?? [];
        list.push({
          command: fact.command,
          location: entry.location,
          keyRange: k.range,
          selection: nodeInfo?.selection ?? null,
        });
        citeUses.set(k.value, list);
      }
    }
  }

  const citations: CatalogCitationEntry[] = [...new Set([...citeDefs.keys(), ...citeUses.keys()])]
    .sort()
    .map((key) => {
      const definitions = citeDefs.get(key) ?? [];
      const occurrences = citeUses.get(key) ?? [];
      const category: CatalogCitationEntry['category'] =
        definitions.length > 0
          ? occurrences.length > 0
            ? 'introduced-used'
            : 'introduced-unused'
          : 'used-external';
      return {
        key,
        category,
        definitions,
        occurrences,
        canRenameGlobally: definitions.length > 0 || occurrences.length > 0,
      };
    });

  return freeze({
    kind: 'catalog',
    snapshotId: snapshot.id,
    viewId: view ? view.id : null,
    resultId: identity('catalog', [snapshot.id, view?.id ?? null, scope, extraCustom, 1]),
    commands,
    introducedCommands: commands.filter(
      (c) => c.category === 'introduced-used' || c.category === 'introduced-unused'
    ),
    usedCommands: commands.filter((c) => c.occurrences.length > 0),
    usedUndefinedCommands: commands.filter((c) => c.category === 'used-undefined'),
    environments,
    introducedEnvironments: environments.filter(
      (e) => e.category === 'introduced-used' || e.category === 'introduced-unused'
    ),
    usedEnvironments: environments.filter((e) => e.occurrences.length > 0),
    conditions,
    introducedConditions: conditions.filter(
      (c) => c.category === 'introduced-used' || c.category === 'introduced-unused'
    ),
    usedConditions: conditions.filter((c) => c.tests.length > 0 || c.setters.length > 0),
    labels,
    introducedLabels: labels.filter(
      (l) => l.category === 'introduced-used' || l.category === 'introduced-unused'
    ),
    usedLabels: labels.filter((l) => l.occurrences.length > 0),
    usedUndefinedLabels: labels.filter((l) => l.category === 'used-undefined'),
    citations,
    introducedCitations: citations.filter(
      (c) => c.category === 'introduced-used' || c.category === 'introduced-unused'
    ),
    usedCitations: citations.filter((c) => c.occurrences.length > 0),
  });
}
