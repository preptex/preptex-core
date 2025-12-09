import { InputCmdHandling, INPUT_CMD_HANDLING_VALUES } from '@preptex/core';
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
  handleInputCmd?: InputCmdHandling;
  workDir?: string;
  outDir?: string;
  output?: string;
  ifDecisions?: Set<string> | undefined;
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
  } as TransformCliOptions;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;

    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
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
        opts.handleInputCmd = InputCmdHandling.FLATTEN;
        break;
      case '--recursive':
        opts.handleInputCmd = InputCmdHandling.RECURSIVE;
        break;
      case '-f':
      case '--if-branches': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--if-branches requires a value');
        const cs = String(v)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (cs.length) opts.ifDecisions = new Set(cs);
        break;
      }
      case '--handle-input-cmd': {
        const v = argv[++i];
        if (!v || v.startsWith('-')) throw new Error('--handle-input-cmd requires a value');
        if (!INPUT_CMD_HANDLING_VALUES.has(v)) {
          throw new Error(`Invalid value for --handle-input-cmd: ${v}`);
        }
        opts.handleInputCmd = v as InputCmdHandling;
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

export function printTransformHelp(): void {
  const lines = [
    'Usage: preptex transform --input <file> [--work-dir <dir>] [--output <file|dir>] [--suppress-comments] [--flatten|--recursive]',
    '',
    'Options:',
    '  -i, --input <file>       Main input file (path or filename if --work-dir used)',
    '  -o, --output <file>      Where to write the transformed output (stdout if omitted)',
    '      --suppress-comments  Remove comments before emitting output',
    '      --flatten            Inline \input files during transform (use with --work-dir to flatten files inside directory)',
    '      --recursive          Transform each discovered file separately and emit multiple outputs',
    '      --work-dir <dir>     Treat --input as a filename inside this directory (do not provide a path in --input)',
    '      --if-branches        Remove comments before emitting output',
    '  -h, --help               Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
