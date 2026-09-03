import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from '@preptex/core';
import { parseAstArgs, printAstHelp } from '../args.js';

export async function handleAst(args: string[]): Promise<void> {
  let options;
  try {
    options = parseAstArgs(args);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    printAstHelp();
    return;
  }

  if (options.help) {
    printAstHelp();
    return;
  }
  if (!options.input) {
    process.stderr.write('Missing required --input argument.\n');
    process.exitCode = 1;
    printAstHelp();
    return;
  }

  const baseDirectory = options.workDir ? path.resolve(options.workDir) : process.cwd();
  const inputPath = options.workDir
    ? path.resolve(baseDirectory, options.input)
    : path.resolve(options.input);
  const relativePath = path.relative(baseDirectory, inputPath).replace(/\\/g, '/');
  const sourcePath =
    !relativePath || relativePath === '..' || relativePath.startsWith('../')
      ? path.basename(inputPath)
      : relativePath;
  const source = await readFile(inputPath, 'utf8');
  const result = parseDocument(source, { sourcePath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
