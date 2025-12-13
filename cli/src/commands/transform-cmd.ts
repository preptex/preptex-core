import {
  process as processProject,
  transform as transformProject,
  CoreOptions,
  InputCmdHandling,
} from '@preptex/core';
import { parseTransformArgs, printTransformHelp } from '../args.js';
import path from 'node:path';
import { resolvePaths } from '../io.js';
import { makeReader, writeOutputsRecursive } from '../io.js';
import type { TransformCliOptions } from '../args.js';

export async function handleTransform(args: string[]): Promise<void> {
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

  let project: ReturnType<typeof processProject>;

  const coreOptions: CoreOptions = {
    suppressComments: options.suppressComments,
    handleInputCmd: options.handleInputCmd,
    ifDecisions: options.ifDecisions,
  } as CoreOptions;

  try {
    const { entryPath, baseDir } = resolvePaths({
      input: options.input,
      workDir: options.workDir,
      outDir: options.outDir,
      output: options.output,
    });
    const reader = makeReader(baseDir);
    project = processProject(entryPath, reader, coreOptions);
    const outputs = transformProject(project, coreOptions) as Record<string, string>;

    if (options.handleInputCmd === InputCmdHandling.RECURSIVE) {
      await writeOutputsRecursive(outputs, { ...options });
      return;
    }

    // Always write to resolved outDir (defaulted in resolvePaths)
    const { outDir, outName } = resolvePaths({
      input: options.input,
      output: options.output,
      workDir: options.workDir,
      outDir: options.outDir,
    });

    const single = outputs[project.entry] ?? Object.values(outputs)[0];
    if (!single) {
      throw new Error('No output generated from transformation.');
    }

    const outPath = path.join(outDir, outName);
    await (await import('node:fs/promises')).mkdir(outDir, { recursive: true });
    await (await import('node:fs/promises')).writeFile(outPath, single, 'utf8');
    return;
  } catch (err) {
    process.stderr.write(
      `Failed to transform ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
