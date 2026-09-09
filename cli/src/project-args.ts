import {
  PrepTexError,
  PrepTexErrorCode,
  type AnalysisRequest,
  type ConditionPolicy,
  type InventoryRequest,
  type SyntaxFact,
  type ViewConfiguration,
} from '@preptex/core';

export type ProjectCommand = 'inventory' | 'analyze';
type Common = { readonly help: boolean; readonly workDir: string };
export type ProjectCliOptions = Common &
  (
    | { readonly command: 'inventory'; readonly request: InventoryRequest }
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

export function parseProjectArgs(
  command: ProjectCommand,
  argv: readonly string[]
): ProjectCliOptions {
  let workDir = process.cwd();
  let entry: string | undefined;
  let help = false;
  let operation: AnalysisRequest['operation'] = 'references';
  let mode: ConditionPolicy['mode'] = 'source';
  let traversal: ViewConfiguration['traversal'] = 'project';
  let allowIncomplete = false;
  let paths: string[] | undefined;
  let kinds: SyntaxFact['kind'][] | undefined;
  const values = new Map<string, boolean>();
  const initial = new Map<string, boolean>();
  let configuredOptions = false;
  const assign = (map: Map<string, boolean>, value: string): void => {
    const match = /^([A-Za-z]+)=(true|false)$/.exec(value);
    if (!match) bad('Boolean values must use name=true or name=false.');
    const name = match[1]!;
    if (map.has(name)) bad(`Duplicate boolean value for ${name}.`);
    map.set(name, match[2] === 'true');
  };
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
      case '--condition-mode': {
        const name = value();
        if (name !== 'source' && name !== 'manual' && name !== 'source-with-overrides')
          bad('Unknown condition mode.');
        mode = name;
        configuredOptions = true;
        break;
      }
      case '--condition':
        assign(values, value());
        configuredOptions = true;
        break;
      case '--initial':
        assign(initial, value());
        configuredOptions = true;
        break;
      case '--traversal': {
        const name = value();
        if (name !== 'project' && name !== 'file-only')
          bad('Traversal must be project or file-only.');
        traversal = name;
        configuredOptions = true;
        break;
      }
      case '--allow-incomplete':
        allowIncomplete = true;
        configuredOptions = true;
        break;
      default:
        bad(`Unknown analyze option: ${flag}`);
    }
  }
  const scope = paths ? { kind: 'files' as const, paths } : undefined;
  if (command === 'inventory')
    return {
      command,
      workDir,
      help,
      request: { ...(scope ? { scope } : {}), ...(kinds ? { kinds } : {}) },
    };
  if (!help && !entry && (operation === 'references' || configuredOptions))
    bad('This analysis requires --entry; source unused-commands analysis may omit it.');
  if (entry && scope)
    bad('Configured analysis uses the reached project scope; --files is for source analysis only.');
  if (mode === 'source' && values.size)
    bad('--condition requires manual or source-with-overrides mode; --initial seeds source mode.');
  if (mode === 'manual' && initial.size)
    bad('Manual conditions cannot take --initial source seeds.');
  const seeds = initial.size ? { initialValues: Object.fromEntries(initial) } : {};
  const conditions: ConditionPolicy =
    mode === 'manual'
      ? { mode, values: Object.fromEntries(values) }
      : mode === 'source-with-overrides'
        ? { mode, overrides: Object.fromEntries(values), ...seeds }
        : { mode, ...seeds };
  return {
    command,
    workDir,
    help,
    request: { operation, options: { allowIncomplete, ...(scope ? { scope } : {}) } },
    configuration: entry ? { entryPath: entry, conditions, traversal } : null,
  };
}

export function printProjectHelp(command: ProjectCommand): void {
  const lines =
    command === 'inventory'
      ? [
          'Usage: preptex inventory [--work-dir <dir>] [--files <paths>] [--kinds <kinds>]',
          'Print source facts as JSON without an entry or output destination.',
          `Kinds (comma separated): ${factKinds.join(', ')}`,
        ]
      : [
          'Usage: preptex analyze [--work-dir <dir>] [--entry <path>] [--analysis references|unused-commands]',
          'Print analysis JSON; references require an entry. Without an entry, unused-commands inspects source.',
          '  --files <paths>              Comma-separated paths for source-only analysis',
          '  --condition-mode <mode>      source (default), manual, source-with-overrides',
          '  --condition <name=true|false> Repeat to force named booleans in manual/override mode',
          '  --initial <name=true|false>   Repeat to seed source-mode booleans',
          '  --traversal project|file-only Default project; file-only does not follow input effects',
          '  --allow-incomplete           Opt in to explicitly partial analysis',
        ];
  process.stdout.write(
    `${lines.join('\n')}\nBoth commands read .tex files under the working directory (default current directory).\n-h, --help shows this help.\n`
  );
}
