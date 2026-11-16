import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createProjectSnapshot, resolveProjectView } from '@preptex/core';
import { parseAstArgs, printAstHelp, type AstCliOptions } from '../args.js';
import { readAllTexFiles } from '../io.js';

export async function handleAst(args: string[]): Promise<void> {
  let options: AstCliOptions;
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

  const baseDirectory = options.workDir
    ? path.resolve(options.workDir)
    : path.dirname(path.resolve(options.input));
  const inputPath = options.workDir
    ? path.resolve(baseDirectory, options.input)
    : path.resolve(options.input);
  const relativePath = path.relative(baseDirectory, inputPath).replace(/\\/g, '/');
  const sourcePath =
    !relativePath || relativePath === '..' || relativePath.startsWith('../')
      ? path.basename(inputPath)
      : relativePath;
  const source = await readFile(inputPath, 'utf8');
  const discovered = options.workDir
    ? await readAllTexFiles(baseDirectory)
    : [{ path: sourcePath, source, version: 1 }];
  const files = discovered.some((f) => f.path === sourcePath)
    ? discovered
    : [...discovered, { path: sourcePath, source, version: 1 }];
  const snapshot = createProjectSnapshot(files);
  const view = resolveProjectView(snapshot, {
    entryPath: sourcePath,
    conditions: options.conditions,
    traversal: options.traversal,
  });
  process.stdout.write(`${JSON.stringify(view, null, 2)}\n`);
}
