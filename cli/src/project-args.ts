import {
  PrepTexError,
  PrepTexErrorCode,
  type AnalysisRequest,
  type ConditionPolicy,
  type InventoryRequest,
  type SourceScope,
  type SyntaxFact,
  type ViewConfiguration,
} from '@preptex/core';

export type ProjectCommand = 'inventory' | 'analyze';
type Common = { readonly help: boolean; readonly workDir: string };
export type ProjectCliOptions = Common &
  (
    | {
        readonly command: 'inventory';
        readonly mode: 'facts';
        readonly request: InventoryRequest;
      }
    | {
        readonly command: 'inventory';
        readonly mode: 'environments';
        readonly scope?: SourceScope;
      }
    | {
        readonly command: 'analyze';
        readonly request: AnalysisRequest;
        readonly configuration: ViewConfiguration | null;
      }
  );

const factKinds: readonly SyntaxFact['kind'][] = [
  'definition',
  'command-use',
  'label',
  'reference',
  'input',
  'condition-declaration',
  'condition-assignment',
  'condition-test',
  'condition-delimiter',
  'opaque',
];

function bad(message: string): never {
  throw new PrepTexError(message, PrepTexErrorCode.InvalidArgument);
}

export interface ConditionFlagAccumulator {
  mode: ConditionPolicy['mode'];
  hasMode: boolean;
  traversal: 'project' | 'file-only' | undefined;
  readonly values: Map<string, boolean>;
  readonly initial: Map<string, boolean>;
}

export function createConditionFlagAccumulator(): ConditionFlagAccumulator {
  return {
    mode: 'source',
    hasMode: false,
    traversal: undefined,
    values: new Map<string, boolean>(),
    initial: new Map<string, boolean>(),
  };
}

export function assignBooleanFlag(map: Map<string, boolean>, value: string): void {
  const match = /^([A-Za-z]+)=(true|false)$/.exec(value);
  if (!match) bad('Boolean values must use name=true or name=false.');
  const name = match[1]!;
  if (map.has(name)) bad(`Duplicate boolean value for ${name}.`);
  map.set(name, match[2] === 'true');
}

export function consumeConditionFlag(
  state: ConditionFlagAccumulator,
  flag: string,
  nextValue: () => string
): boolean {
  switch (flag) {
    case '--condition-mode': {
      const name = nextValue();
      if (
        name !== 'source' &&
        name !== 'manual' &&
        name !== 'source-with-overrides' &&
        name !== 'none'
      ) {
        bad('Unknown condition mode.');
      }
      state.mode = name;
      state.hasMode = true;
      return true;
    }
    case '--condition':
      assignBooleanFlag(state.values, nextValue());
      return true;
    case '--initial':
      assignBooleanFlag(state.initial, nextValue());
      return true;
    case '--traversal': {
      const name = nextValue();
      if (name !== 'project' && name !== 'file-only') {
        bad('Traversal must be project or file-only.');
      }
      state.traversal = name;
      return true;
    }
    default:
      return false;
  }
}

export function finalizeConditionPolicy(
  state: ConditionFlagAccumulator,
  options?: { readonly allowNone?: boolean }
): ConditionPolicy {
  const { mode, values, initial } = state;
  if (options?.allowNone === false && mode === 'none') {
    bad('none condition mode is not valid for condition realization.');
  }
  if ((mode === 'source' || mode === 'none') && values.size) {
    bad('--condition requires manual or source-with-overrides mode; --initial seeds source mode.');
  }
  if ((mode === 'manual' || mode === 'none') && initial.size) {
    bad(`${mode} conditions cannot take --initial source seeds.`);
  }
  const seeds = initial.size ? { initialValues: Object.fromEntries(initial) } : {};
  if (mode === 'manual') {
    return { mode, values: Object.fromEntries(values) };
  }
  if (mode === 'source-with-overrides') {
    return { mode, overrides: Object.fromEntries(values), ...seeds };
  }
  if (mode === 'none') {
    return { mode };
  }
  return { mode, ...seeds };
}

export function parseProjectArgs(
  command: ProjectCommand,
  argv: readonly string[]
): ProjectCliOptions {
  let workDir = process.cwd();
  let entry: string | undefined;
  let help = false;
  let operation: AnalysisRequest['operation'] = 'references';
  let allowIncomplete = false;
  let environments = false;
  let paths: string[] | undefined;
  let kinds: SyntaxFact['kind'][] | undefined;
  const conditionState = createConditionFlagAccumulator();

  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!;
    const value = (): string => {
      const next = argv[++index];
      if (!next || next.startsWith('-')) bad(`${flag} requires a value.`);
      return next;
    };
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--work-dir') {
      workDir = value();
      continue;
    }
    if (flag === '--files') {
      paths = value()
        .split(',')
        .map((p) => p.trim());
      if (paths.some((p) => !p)) bad('File scopes must contain nonempty paths.');
      continue;
    }
    if (command === 'inventory') {
      if (flag === '--environments') {
        environments = true;
        continue;
      }
      if (flag !== '--kinds') bad(`Unknown inventory option: ${flag}`);
      kinds = value()
        .split(',')
        .map((name) => {
          const found = factKinds.find((kind) => kind === name.trim());
          if (!found) bad(`Unknown source fact kind: ${name}`);
          return found;
        });
      continue;
    }
    if (consumeConditionFlag(conditionState, flag, value)) {
      continue;
    }
    switch (flag) {
      case '--entry':
      case '--input':
      case '-i':
        entry = value();
        break;
      case '--analysis': {
        const name = value();
        if (name !== 'references' && name !== 'unused-commands')
          bad('Analysis must be references or unused-commands.');
        operation = name;
        break;
      }
      case '--allow-incomplete':
        allowIncomplete = true;
        break;
      default:
        bad(`Unknown analyze option: ${flag}`);
    }
  }
  const scope = paths ? { kind: 'files' as const, paths } : undefined;
  if (command === 'inventory') {
    if (environments && kinds) {
      bad('--environments cannot be combined with --kinds.');
    }
    if (environments) {
      return {
        command,
        mode: 'environments',
        workDir,
        help,
        ...(scope ? { scope } : {}),
      };
    }
    return {
      command,
      mode: 'facts',
      workDir,
      help,
      request: { ...(scope ? { scope } : {}), ...(kinds ? { kinds } : {}) },
    };
  }
  if (scope)
    bad('Configured analysis uses the reached project scope; --files is for inventory only.');
  if (!help && !entry) bad('This analysis requires --entry.');
  const conditions = finalizeConditionPolicy(conditionState);
  const traversal = conditionState.traversal ?? 'project';
  return {
    command,
    workDir,
    help,
    request: { operation, options: { allowIncomplete } },
    configuration: entry ? { entryPath: entry, conditions, traversal } : null,
  };
}

export function printProjectHelp(command: ProjectCommand): void {
  const lines =
    command === 'inventory'
      ? [
          'Usage: preptex inventory [--work-dir <dir>] [--files <paths>] [--kinds <kinds> | --environments]',
          'Print source facts or environment inventories as JSON without an entry or output destination.',
          `Kinds (comma separated): ${factKinds.join(', ')}`,
          '  --environments  Inspect literal \\begin/\\end environments instead of syntax facts',
        ]
      : [
          'Usage: preptex analyze [--work-dir <dir>] --entry <path> [--analysis references|unused-commands]',
          'Print analysis JSON for a configured project view.',
          '  --condition-mode <mode>      source (default), manual, source-with-overrides, none',
          '  --condition <name=true|false> Repeat to force named booleans in manual/override mode',
          '  --initial <name=true|false>   Repeat to seed source-mode booleans',
          '  --traversal project|file-only Default project; file-only does not follow input effects',
          '  --allow-incomplete           Opt in to explicitly partial analysis',
        ];
  process.stdout.write(
    `${lines.join('\n')}\nBoth commands read .tex files under the working directory (default current directory).\n-h, --help shows this help.\n`
  );
}
