import { InputHandlingMode, isInputHandlingMode } from '@preptex/core';
import path from 'node:path';
import process from 'node:process';

/*
  Minimal CLI parsing for the `transform` command.
  Keep only essentials: long forms (--input, --out-dir, etc.) and short fallbacks
  (-i, -o, -h, -s, -f). Behavior is intentionally small and explicit.
*/

export interface BaseCliOptions {
  input: string;
  output?: string;
  help: boolean;
}

export interface TransformCliOptions extends BaseCliOptions {
  suppressComments: boolean;
  verbose?: boolean;
  inputHandling?: InputHandlingMode;
  workDir?: string;
  outDir?: string;
  output?: string;
  enabledConditions?: readonly string[];
}

export interface AstCliOptions {
  input: string;
  help: boolean;
  workDir?: string;
}

export type Command = 'transform' | 'ast';

export function printGlobalHelp(): void {
  const lines = [
    'Usage: preptex <command> [options]',
    '',
    'Commands:',
    '  transform   Parse and rewrite LaTeX input using the transformer pipeline',
    '  ast         Parse and print the AST as JSON',
    '',
    'Run `preptex <command> --help` to see command-specific options.',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function parseCommand(argv: string[]): { command: Command; rest: string[] } | null {
  if (argv.length === 0) return null;
  const [first, ...rest] = argv;
  if (first === 'transform' || first === 'ast') {
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
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;

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
      case '--input': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--input requires a value');
        opts.input = v;
        break;
      }
      case '-o':
      case '--output': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--output requires a value');
        opts.output = v;
        break;
      }
      case '--out-dir': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--out-dir requires a value');
        opts.outDir = v;
        break;
      }
      case '--work-dir': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--work-dir requires a value');
        opts.workDir = v;
        break;
      }
      case '-s':
      case '--suppress-comments':
        opts.suppressComments = true;
        break;
      case '--flatten':
        opts.inputHandling = InputHandlingMode.Flatten;
        break;
      case '--recursive':
        opts.inputHandling = InputHandlingMode.Separate;
        break;
      case '-f':
      case '--if-branches': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--if-branches requires a value');
        const cs = String(v)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (cs.length) opts.enabledConditions = cs;
        break;
      }
      case '--handle-input-cmd': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--handle-input-cmd requires a value');
        if (!isInputHandlingMode(v)) {
          throw new Error(`Invalid value for --handle-input-cmd: ${v}`);
        }
        opts.inputHandling = v;
        break;
      }
      default:
        // ignore unknown tokens here; transform handler will validate required fields
        break;
    }
  }

  // Basic validation: output must be filename only if provided
  if (opts.output) {
    if (
      path.isAbsolute(opts.output) ||
      opts.output.includes(path.sep) ||
      opts.output.includes('/')
    ) {
      throw new Error('--output must be a filename (no path)');
    }
  }

  // If work-dir used, input must be a filename
  if (opts.workDir && opts.input) {
    if (path.isAbsolute(opts.input) || opts.input.includes(path.sep) || opts.input.includes('/')) {
      throw new Error('--input must be a filename (no path) when --work-dir is provided');
    }
  }

  return opts;
}

export function parseAstArgs(argv: string[]): AstCliOptions {
  const options: AstCliOptions = { input: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-i':
      case '--input': {
        const value = argv[++index];
        if (!value || value.startsWith('-')) throw new Error('--input requires a value');
        options.input = value;
        break;
      }
      case '--work-dir': {
        const value = argv[++index];
        if (!value || value.startsWith('-')) throw new Error('--work-dir requires a value');
        options.workDir = value;
        break;
      }
      default:
        throw new Error(`Unknown ast option: ${String(argument)}`);
    }
  }
  return options;
}

export function printTransformHelp(): void {
  const lines = [
    'Usage: preptex transform --input <file> [--work-dir <dir>] [--out-dir <dir>] [--output <file>] [--suppress-comments] [--flatten|--recursive] [--verbose]',
    '',
    'Options:',
    '  -i, --input <file>       Main input file (path or filename if --work-dir used)',
    '  -o, --output <file>      Output filename (defaults to the input filename)',
    '      --out-dir <dir>      Output directory (defaults to <input-dir>/transform)',
    '      --suppress-comments  Remove comments before emitting output',
    '      --flatten            Inline \\input files during transform (use with --work-dir to flatten files inside directory)',
    '      --recursive          Transform each discovered file separately and emit multiple outputs',
    '      --work-dir <dir>     Treat --input as a filename inside this directory (do not provide a path in --input)',
    '      --if-branches <list> Keep comma-separated condition IF branches',
    '      --handle-input-cmd <preserve|flatten|separate>',
    '  -v, --verbose            Print step-by-step progress logs to stderr',
    '  -h, --help               Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function printAstHelp(): void {
  const lines = [
    'Usage: preptex ast --input <file> [--work-dir <dir>]',
    '',
    'Options:',
    '  -i, --input <file>   LaTeX file to parse',
    '      --work-dir <dir> Resolve a filename relative to this directory',
    '  -h, --help           Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
