import {
  process as processProject,
  transform as transformProject,
  CoreOptions,
  InputCmdHandling,
} from '@preptex/core';
import { parseTransformArgs, printTransformHelp } from '../args.js';
import path from 'node:path';
import { resolvePaths } from '../io.js';
import { readAllTexFiles, writeOutputsRecursive } from '../io.js';
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

  const vlog = (msg: string): void => {
    if (!options.verbose) return;
    process.stderr.write(`[verbose] ${msg}\n`);
  };

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
    vlog('resolving paths');
    const { entryPath, baseDir } = resolvePaths({
      input: options.input,
      workDir: options.workDir,
      outDir: options.outDir,
      output: options.output,
    });

    vlog(`baseDir: ${baseDir}`);
    vlog(`entryPath: ${entryPath}`);

    // Load every .tex file in the working directory; core handles parsing.
    vlog('reading .tex files');
    const files = await readAllTexFiles(baseDir);
    vlog(`discovered ${Object.keys(files).length} .tex file(s)`);
    const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');

    if (!files[entryKey]) {
      throw new Error(`Entry file not found under work directory: ${entryKey}`);
    }

    vlog(`entryKey: ${entryKey}`);

    vlog('processing project');
    project = processProject(files);
    for (const [file, projectFile] of Object.entries(project.getFiles())) {
      const notes = (projectFile as { notes?: ReadonlyArray<string> }).notes ?? [];
      for (const note of notes) {
        process.stderr.write(`[${file}] ${note}\n`);
      }
    }

    vlog('transforming');
    const outputs = transformProject(entryKey, project, coreOptions) as Record<string, string>;
    vlog(`generated ${Object.keys(outputs).length} output(s)`);

    if (options.handleInputCmd === InputCmdHandling.RECURSIVE) {
      vlog('writing outputs recursively');
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

    vlog(`outDir: ${outDir}`);
    vlog(`outName: ${outName}`);

    const single = outputs[entryKey] ?? Object.values(outputs)[0];
    if (!single) {
      throw new Error('No output generated from transformation.');
    }

    const outPath = path.join(outDir, outName);
    vlog(`writing output to ${outPath}`);
    await (await import('node:fs/promises')).mkdir(outDir, { recursive: true });
    await (await import('node:fs/promises')).writeFile(outPath, single, 'utf8');
    vlog('done');
    return;
  } catch (err) {
    process.stderr.write(
      `Failed to transform ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
