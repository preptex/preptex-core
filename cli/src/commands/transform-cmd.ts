import {
  createProjectSnapshot,
  planTransformation,
  realizeProjectConditions,
  resolveProjectView,
  type ConditionPolicy,
} from '@preptex/core';
import { parseTransformArgs, printTransformHelp } from '../args.js';
import path from 'node:path';
import { resolvePaths, readAllTexFiles, writeOutputsRecursive } from '../io.js';
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

  const conditions: Exclude<ConditionPolicy, { readonly mode: 'none' }> = options.enabledConditions
    ? {
        mode: 'source-with-overrides',
        overrides: Object.fromEntries(options.enabledConditions.map((name) => [name, true])),
      }
    : { mode: 'source' };

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

    vlog('reading .tex files');
    const files = await readAllTexFiles(baseDir, outDir);
    vlog(`discovered ${files.length} .tex file(s)`);
    const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');

    if (!files.some((file) => file.path === entryKey)) {
      throw new Error(`Entry file not found under work directory: ${entryKey}`);
    }

    vlog(`entryKey: ${entryKey}`);
    vlog('processing project');
    const snapshot = createProjectSnapshot(files);

    if (options.inputHandling === 'separate') {
      const realized = realizeProjectConditions(snapshot, {
        traversal: 'file-only',
        conditions,
      });
      if (realized.status !== 'ready') {
        throw new Error(realized.reason?.message ?? 'Condition realization failed.');
      }
      vlog(`generated ${realized.artifacts.length} output(s)`);
      vlog('writing outputs recursively');
      await writeOutputsRecursive(realized.artifacts, { ...options });
      return;
    }

    vlog('transforming');
    const view = resolveProjectView(snapshot, {
      entryPath: entryKey,
      traversal: 'project',
      conditions,
    });
    const transformed = planTransformation(view, {
      operation: 'export-project',
      options: {
        inputs: options.inputHandling === 'flatten' ? 'inline' : 'preserve',
        suppressComments: options.suppressComments,
      },
    });
    vlog(`generated ${transformed.artifacts.length} output(s)`);

    vlog(`outDir: ${outDir}`);
    vlog(`outName: ${outName}`);

    const single =
      transformed.artifacts.find((a) => a.path === entryKey) ?? transformed.artifacts[0];
    if (!single) {
      throw new Error('No output generated from transformation.');
    }

    const outPath = path.join(outDir, outName);
    vlog(`writing output to ${outPath}`);
    await (await import('node:fs/promises')).mkdir(outDir, { recursive: true });
    await (await import('node:fs/promises')).writeFile(outPath, single.source, 'utf8');
    vlog('done');
    return;
  } catch (err) {
    process.stderr.write(
      `Failed to transform ${options.input}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
