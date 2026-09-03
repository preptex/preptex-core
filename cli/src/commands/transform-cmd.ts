import {
  parseProject,
  transformProject,
  InputHandlingMode,
  type ParsedProject,
  type TransformOptions,
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

  let project: ParsedProject;

  const coreOptions: TransformOptions = {
    suppressComments: options.suppressComments,
    ...(options.inputHandling === undefined ? {} : { inputHandling: options.inputHandling }),
    ...(options.enabledConditions === undefined
      ? {}
      : { enabledConditions: options.enabledConditions }),
  };

  try {
    vlog('resolving paths');
    const { entryPath, baseDir, outDir, outName } = resolvePaths({
      input: options.input,
      ...(options.workDir === undefined ? {} : { workDir: options.workDir }),
      ...(options.outDir === undefined ? {} : { outDir: options.outDir }),
      ...(options.output === undefined ? {} : { output: options.output }),
    });

    vlog(`baseDir: ${baseDir}`);
    vlog(`entryPath: ${entryPath}`);

    // Load every .tex file in the working directory; core handles parsing.
    vlog('reading .tex files');
    const files = await readAllTexFiles(baseDir, outDir);
    vlog(`discovered ${files.length} .tex file(s)`);
    const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');

    if (!files.some((file) => file.path === entryKey)) {
      throw new Error(`Entry file not found under work directory: ${entryKey}`);
    }

    vlog(`entryKey: ${entryKey}`);

    vlog('processing project');
    project = parseProject(files);
    for (const diagnostic of project.diagnostics) {
      process.stderr.write(
        `[${diagnostic.path}:${diagnostic.range.line}] ${diagnostic.code}: ${diagnostic.message}\n`
      );
    }

    vlog('transforming');
    const outputs = transformProject(entryKey, project, coreOptions);
    vlog(`generated ${outputs.files.length} output(s)`);

    if (options.inputHandling === InputHandlingMode.Separate) {
      vlog('writing outputs recursively');
      await writeOutputsRecursive(outputs.files, { ...options });
      return;
    }

    vlog(`outDir: ${outDir}`);
    vlog(`outName: ${outName}`);

    const single = outputs.files[0]?.source;
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
