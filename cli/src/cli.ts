import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
  transformCode,
  CoreOptions,
  InputCmdHandling,
  INPUT_CMD_HANDLING_VALUES,
} from '@preptex/core';

interface BaseCliOptions {
  input: string;
  output?: string;
  help: boolean;
}

interface TransformCliOptions extends BaseCliOptions {
  suppressComments: boolean;
  handleInputCmd?: CoreOptions['handleInputCmd'];
  ifDecisions?: CoreOptions['ifDecisions'];
}

// interface AstCliOptions extends BaseCliOptions {
//   pretty: boolean;
//   skipTokens: string[];
// }

type Command = 'transform' | 'ast';

function printGlobalHelp(): void {
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

function parseCommand(argv: string[]): { command: Command; rest: string[] } | null {
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

function parseTransformArgs(argv: string[]): TransformCliOptions {
  const opts: TransformCliOptions = {
    input: '',
    help: false,
    suppressComments: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--input' || arg === '-i') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --input');
      opts.input = value;
      i += 1;
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --output');
      opts.output = value;
      i += 1;
      continue;
    }
    if (arg === '--suppress-comments') {
      opts.suppressComments = true;
      continue;
    }
    if (arg === '--handle-input-cmd') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --handle-input-cmd');
      if (!INPUT_CMD_HANDLING_VALUES.has(value)) {
        throw new Error(`Invalid value for --handle-input-cmd: ${value}`);
      }
      opts.handleInputCmd = value as CoreOptions['handleInputCmd'];
      i += 1;
      continue;
    }
    if (arg === '--if-branches') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --if-branches');
      const conditions = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      opts.ifDecisions = new Set(conditions);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

// function parseAstArgs(argv: string[]): AstCliOptions {
//   const opts: AstCliOptions = {
//     input: '',
//     help: false,
//     pretty: true,
//     skipTokens: [],
//   };
//   for (let i = 0; i < argv.length; i += 1) {
//     const arg = argv[i];
//     if (arg === '--help' || arg === '-h') {
//       opts.help = true;
//       continue;
//     }
//     if (arg === '--input' || arg === '-i') {
//       const value = argv[i + 1];
//       if (!value) throw new Error('Missing value after --input');
//       opts.input = value;
//       i += 1;
//       continue;
//     }
//     if (arg === '--output' || arg === '-o') {
//       const value = argv[i + 1];
//       if (!value) throw new Error('Missing value after --output');
//       opts.output = value;
//       i += 1;
//       continue;
//     }
//     if (arg === '--compact') {
//       opts.pretty = false;
//       continue;
//     }
//     if (arg === '--pretty') {
//       opts.pretty = true;
//       continue;
//     }
//     if (arg === '--skip-token') {
//       const value = argv[i + 1];
//       if (!value) throw new Error('Missing value after --skip-token');
//       opts.skipTokens.push(resolveTokenType(value));
//       i += 1;
//       continue;
//     }
//     throw new Error(`Unknown argument: ${arg}`);
//   }
//   return opts;
// }

// function resolveTokenType(name: string): TokenType {
//   const lower = name.toLowerCase();
//   for (const token of Object.values(TokenType) as TokenType[]) {
//     if (token.toLowerCase() === lower) return token;
//   }
//   throw new Error(`Unknown token type: ${name}`);
// }

function printTransformHelp(): void {
  const lines = [
    'Usage: preptex transform --input <file> [--output <file>] [--suppress-comments]',
    '',
    'Options:',
    '  -i, --input <file>       Path to the source LaTeX file (required)',
    '  -o, --output <file>      Where to write the transformed output (stdout if omitted)',
    '      --suppress-comments  Remove comments before emitting output',
    '      --if-branches        Remove comments before emitting output',
    '  -h, --help               Show this message',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

// function printAstHelp(): void {
//   const lines = [
//     'Usage: preptex ast --input <file> [--output <file>] [--pretty|--compact] [--skip-token <type>]',
//     '',
//     'Options:',
//     '  -i, --input <file>   Path to the source LaTeX file (required)',
//     '  -o, --output <file>  Where to write the JSON output (stdout if omitted)',
//     '      --pretty         Pretty-print JSON (default)',
//     '      --compact        Emit compact JSON',
//     '      --skip-token <type>  Skip nodes produced by the given token type',
//     '  -h, --help           Show this message',
//   ];
//   process.stdout.write(`${lines.join('\n')}\n`);
// }

export async function runPreptexCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCommand(argv);
  if (!parsed) {
    printGlobalHelp();
    return;
  }

  const { command, rest } = parsed;
  if (command === 'transform') {
    await handleTransform(rest);
    return;
  }

  if (command === 'ast') {
    throw new Error('AST command not implemented yet');
    // await handleAst(rest);
  }
}

async function handleTransform(args: string[]): Promise<void> {
  let options: TransformCliOptions;
  try {
    options = parseTransformArgs(args);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    printTransformHelp();
    return;
  }

  if (options.help) {
    printTransformHelp();
    return;
  }

  if (!options.input) {
    process.stderr.write('Missing required --input argument.\n');
    process.exitCode = 1;
    printTransformHelp();
    return;
  }

  let source: string;
  try {
    source = await readFile(options.input, 'utf8');
  } catch (err) {
    process.stderr.write(
      `Failed to read ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  let output: string = '';
  try {
    output = transformCode(source, {
      suppressComments: options.suppressComments,
      handleInputCmd: options.handleInputCmd,
      ifDecisions: options.ifDecisions,
    });
  } catch (err) {
    process.stderr.write(
      `Failed to transform ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  if (options.output) {
    try {
      await writeFile(options.output, output, 'utf8');
    } catch (err) {
      process.stderr.write(
        `Failed to write ${options.output}: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }

  process.stdout.write(output);
}

// async function handleAst(args: string[]): Promise<void> {
//   let options: AstCliOptions;
//   try {
//     options = parseAstArgs(args);
//   } catch (err) {
//     process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
//     process.exitCode = 1;
//     printAstHelp();
//     return;
//   }

//   if (options.help) {
//     printAstHelp();
//     return;
//   }

//   if (!options.input) {
//     process.stderr.write('Missing required --input argument.\n');
//     process.exitCode = 1;
//     printAstHelp();
//     return;
//   }

//   let source: string;
//   try {
//     source = await readFile(options.input, 'utf8');
//   } catch (err) {
//     process.stderr.write(
//       `Failed to read ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
//     );
//     process.exit(1);
//   }

//   let artifact;
//   try {
//     artifact = exportAST(source, {
//       skipTokens: options.skipTokens,
//       pretty: options.pretty,
//     });
//   } catch (err) {
//     process.stderr.write(
//       `Failed to export AST for ${options.input}: ${
//         err instanceof Error ? err.message : String(err)
//       }\n`
//     );
//     process.exit(1);
//   }

//   const payload = artifact.content ?? '';

//   if (options.output) {
//     try {
//       await writeFile(options.output, payload, 'utf8');
//     } catch (err) {
//       process.stderr.write(
//         `Failed to write ${options.output}: ${err instanceof Error ? err.message : String(err)}\n`
//       );
//       process.exit(1);
//     }
//     return;
//   }

//   process.stdout.write(payload);
// }

runPreptexCli().catch((err) => {
  process.stderr.write(`preptex failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
