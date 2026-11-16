import path from 'node:path';
import process from 'node:process';
import type { ConditionPolicy } from '@preptex/core';
import {
  consumeConditionFlag,
  createConditionFlagAccumulator,
  finalizeConditionPolicy,
} from './project-args.js';

export type CliInputHandlingMode = 'preserve' | 'flatten' | 'separate';

function isCliInputHandlingMode(value: string): value is CliInputHandlingMode {
  return value === 'preserve' || value === 'flatten' || value === 'separate';
}

function validateFilenameOnly(value: string, flag: string, context = ''): void {
  if (path.isAbsolute(value) || value.includes(path.sep) || value.includes('/')) {
    throw new Error(`${flag} must be a filename (no path)${context}`);
  }
}

export interface BaseCliOptions {
  input: string;
  output?: string;
  help: boolean;
}

export interface TransformCliOptions extends BaseCliOptions {
  suppressComments: boolean;
  suppressCommentEnvironments: boolean;
  verbose: boolean;
  inputHandling?: CliInputHandlingMode;
  workDir?: string;
  outDir?: string;
  enabledConditions?: readonly string[];
  conditions?: ConditionPolicy;
  traversal?: 'project' | 'file-only';
}

export interface RealizeCliOptions {
  input?: string;
  output?: string;
  workDir?: string;
  outDir?: string;
  inputs: 'preserve' | 'inline';
  traversal?: 'project' | 'file-only';
  stripDeclarationsAndSetters: boolean;
  conditions: Exclude<ConditionPolicy, { readonly mode: 'none' }>;
  json: boolean;
  verbose: boolean;
  help: boolean;
}

export interface AstCliOptions {
  input: string;
  help: boolean;
  workDir?: string;
  conditions: ConditionPolicy;
  traversal: 'project' | 'file-only';
}

export type Command = 'transform' | 'realize' | 'ast' | 'inventory' | 'analyze';

export function printGlobalHelp(): void {
  const lines = [
    'Usage: preptex <command> [options]',
    '',
    'Commands:',
    '  transform   Resolve conditions, build the AST, and emit transformed files',
    '  realize     Realize conditions without building a structural AST (Pipeline B)',
    '  ast         Resolve and print the condition-free structural AST view as JSON',
    '  inventory   Inspect source facts or environments without configuration',
    '  analyze     Analyze references or conservative command-use evidence as JSON',
    '',
    'Run `preptex <command> --help` to see command-specific options.',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function parseCommand(argv: string[]): { command: Command; rest: string[] } | null {
  if (argv.length === 0) return null;
  const [first, ...rest] = argv;
  if (
    first === 'transform' ||
    first === 'realize' ||
    first === 'ast' ||
    first === 'inventory' ||
    first === 'analyze'
  ) {
    return { command: first, rest };
  }
  if (first === '--help' || first === '-h') {
    return null;
  }
  process.stderr.write(`Unknown command: ${first}\n\n`);
  printGlobalHelp();
  process.exitCode = 1;
  return null;
}

export function parseTransformArgs(argv: string[]): TransformCliOptions {
  const opts: TransformCliOptions = {
    input: '',
    help: false,
    suppressComments: false,
    suppressCommentEnvironments: false,
    verbose: false,
  };
  const conditionState = createConditionFlagAccumulator();

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;

    const nextValue = (): string => {
      const v = argv[++i];
      if (!v || v.startsWith('-')) throw new Error(`${a} requires a value`);
      return v;
    };

    if (consumeConditionFlag(conditionState, a, nextValue)) {
      continue;
    }

    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--verbose':
        opts.verbose = true;
        break;
      case '-i':
      case '--input':
        opts.input = nextValue();
        break;
      case '-o':
      case '--output':
        opts.output = nextValue();
        break;
      case '--out-dir':
        opts.outDir = nextValue();
        break;
      case '--work-dir':
        opts.workDir = nextValue();
        break;
      case '-s':
      case '--suppress-comments':
        opts.suppressComments = true;
        break;
      case '--suppress-comment-environments':
        opts.suppressCommentEnvironments = true;
        break;
      case '--flatten':
        opts.inputHandling = 'flatten';
        break;
      case '--recursive':
        opts.inputHandling = 'separate';
        break;
      case '-f':
      case '--if-branches': {
        const v = nextValue();
        const cs = v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (cs.length) opts.enabledConditions = cs;
        break;
      }
      case '--handle-input-cmd': {
        const v = nextValue();
        if (!isCliInputHandlingMode(v)) {
          throw new Error(`Invalid value for --handle-input-cmd: ${v}`);
        }
        opts.inputHandling = v;
        break;
      }
      default:
        if (
          [
            '--entry',
            '--analysis',
            '--allow-incomplete',
            '--files',
            '--kinds',
            '--environments',
          ].includes(a)
        ) {
          throw new Error(`transform cannot use ${a}; use inventory or analyze instead.`);
        }
        throw new Error(`Unknown transform option: ${a}`);
    }
  }

  if (
    opts.enabledConditions &&
    (conditionState.hasMode || conditionState.values.size > 0 || conditionState.initial.size > 0)
  ) {
    throw new Error('Cannot mix --if-branches with --condition-mode, --condition, or --initial.');
  }

  opts.conditions = finalizeConditionPolicy(conditionState);
  if (conditionState.traversal !== undefined) {
    opts.traversal = conditionState.traversal;
  }

  if (opts.output) {
    validateFilenameOnly(opts.output, '--output');
  }

  if (opts.workDir && opts.input) {
    validateFilenameOnly(opts.input, '--input', ' when --work-dir is provided');
  }

  return opts;
}

export function parseRealizeArgs(argv: string[]): RealizeCliOptions {
  let input: string | undefined;
  let output: string | undefined;
  let workDir: string | undefined;
  let outDir: string | undefined;
  let inputs: 'preserve' | 'inline' = 'preserve';
  let stripDeclarationsAndSetters = true;
  let json = false;
  let verbose = false;
  let help = false;
  const conditionState = createConditionFlagAccumulator();

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;

    const nextValue = (): string => {
      const v = argv[++i];
      if (!v || v.startsWith('-')) throw new Error(`${a} requires a value`);
      return v;
    };

    if (consumeConditionFlag(conditionState, a, nextValue)) {
      continue;
    }

    switch (a) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '-v':
      case '--verbose':
        verbose = true;
        break;
      case '-i':
      case '--input':
      case '--entry':
        input = nextValue();
        break;
      case '-o':
      case '--output':
        output = nextValue();
        break;
      case '--work-dir':
        workDir = nextValue();
        break;
      case '--out-dir':
        outDir = nextValue();
        break;
      case '--flatten':
        inputs = 'inline';
        break;
      case '--inputs': {
        const mode = nextValue();
        if (mode !== 'preserve' && mode !== 'inline') {
          throw new Error('--inputs must be preserve or inline');
        }
        inputs = mode;
        break;
      }
      case '--keep-declarations':
        stripDeclarationsAndSetters = false;
        break;
      case '--json':
        json = true;
        break;
      default:
        throw new Error(`Unknown realize option: ${a}`);
    }
  }

  const conditions = finalizeConditionPolicy(conditionState, { allowNone: false }) as Exclude<
    ConditionPolicy,
    { readonly mode: 'none' }
  >;

  if (output) {
    validateFilenameOnly(output, '--output');
  }
  if (workDir && input) {
    validateFilenameOnly(input, '--input', ' when --work-dir is provided');
  }

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(workDir !== undefined ? { workDir } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
    inputs,
    ...(conditionState.traversal !== undefined ? { traversal: conditionState.traversal } : {}),
    stripDeclarationsAndSetters,
    conditions,
    json,
    verbose,
    help,
  };
}

export function parseAstArgs(argv: string[]): AstCliOptions {
  let input = '';
  let help = false;
  let workDir: string | undefined;
  const conditionState = createConditionFlagAccumulator();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const nextValue = (): string => {
      const value = argv[++index];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a value`);
      return value;
    };

    if (consumeConditionFlag(conditionState, argument, nextValue)) {
      continue;
    }

    switch (argument) {
      case '-h':
      case '--help':
        help = true;
        break;
      case '-i':
      case '--input':
        input = nextValue();
        break;
      case '--work-dir':
        workDir = nextValue();
        break;
      default:
        throw new Error(`Unknown ast option: ${argument}`);
    }
  }

  const conditions = finalizeConditionPolicy(conditionState);
  if (workDir && input) {
    validateFilenameOnly(input, '--input', ' when --work-dir is provided');
  }

  return {
    input,
    help,
    ...(workDir !== undefined ? { workDir } : {}),
    conditions,
    traversal: conditionState.traversal ?? 'project',
  };
}

export function printTransformHelp(): void {
  const lines = [
    'Usage: preptex transform --input <file> [--work-dir <dir>] [--out-dir <dir>] [--output <file>] [options]',
    '',
    'Options:',
    '  -i, --input <file>                 Main input file (path or filename if --work-dir used)',
    '  -o, --output <file>                Output filename (defaults to the input filename)',
    '      --out-dir <dir>                Output directory (defaults to <input-dir>/transform)',
    '  -s, --suppress-comments            Remove percent comments before emitting output',
    '      --suppress-comment-environments Remove \\begin{comment}...\\end{comment} environments',
    '      --flatten                      Inline \\input files during transform',
    '      --recursive                    Transform each discovered file separately (file-only)',
    '      --work-dir <dir>               Treat --input as a filename inside this directory',
    '  -f, --if-branches <list>           Force comma-separated condition names true',
    '      --condition-mode <mode>        source (default), manual, source-with-overrides, none',
    '      --condition <name=true|false>  Repeat to force named booleans in manual/override mode',
    '      --initial <name=true|false>    Repeat to seed source-mode booleans',
    '      --traversal <project|file-only> Control \\input traversal scope',
    '      --handle-input-cmd <preserve|flatten|separate>',
    '  -v, --verbose                      Print step-by-step progress logs to stderr',
    '  -h, --help                         Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function printRealizeHelp(): void {
  const lines = [
    'Usage: preptex realize [--input <file>] [--work-dir <dir>] [--out-dir <dir>] [options]',
    'Realize LaTeX boolean conditions independently of structural AST parsing (Pipeline B).',
    '',
    'Options:',
    '  -i, --input <file>                 Entry file (optional with --traversal file-only)',
    '  -o, --output <file>                Output filename override for the entry file',
    '      --out-dir <dir>                Output directory (defaults to <input-dir>/transform)',
    '      --work-dir <dir>               Working directory containing .tex files',
    '      --flatten                      Inline active \\input files into entry artifact',
    '      --inputs <preserve|inline>     Preserve \\input commands or inline them (default preserve)',
    '      --traversal <project|file-only> Follow \\input edges or evaluate files independently',
    '      --keep-declarations            Keep \\newif and setter commands in realized output',
    '      --condition-mode <mode>        source (default), manual, source-with-overrides',
    '      --condition <name=true|false>  Repeat to force named booleans in manual/override mode',
    '      --initial <name=true|false>    Repeat to seed source-mode booleans',
    '      --json                         Emit full ConditionRealizationResult JSON to stdout',
    '  -v, --verbose                      Print step-by-step progress logs to stderr',
    '  -h, --help                         Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function printAstHelp(): void {
  const lines = [
    'Usage: preptex ast --input <file> [--work-dir <dir>] [options]',
    '',
    'Options:',
    '  -i, --input <file>                 LaTeX file to parse',
    '      --work-dir <dir>               Resolve a filename relative to this directory',
    '      --condition-mode <mode>        source (default), manual, source-with-overrides, none',
    '      --condition <name=true|false>  Repeat to force named booleans in manual/override mode',
    '      --initial <name=true|false>    Repeat to seed source-mode booleans',
    '      --traversal <project|file-only> Control \\input traversal scope',
    '  -h, --help                         Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
