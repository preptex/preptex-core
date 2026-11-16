import path from 'node:path';
import process from 'node:process';
import {
  createProjectSnapshot,
  realizeProjectConditions,
  type ConditionRealizationRequest,
  type ProjectIssue,
} from '@preptex/core';
import { parseRealizeArgs, printRealizeHelp, type RealizeCliOptions } from '../args.js';
import { normalizeForCompare, readAllTexFiles, resolvePaths, writeArtifacts } from '../io.js';

export function formatProjectIssue(
  issue: ProjectIssue | null | undefined,
  fallback: string
): string {
  if (!issue) return fallback;
  const loc = issue.location ? ` (${issue.location.path}:${issue.location.range.line})` : '';
  return `${issue.message}${loc} [${issue.code}]`;
}

export async function handleRealize(args: string[]): Promise<void> {
  let options: RealizeCliOptions;
  try {
    options = parseRealizeArgs(args);
  } catch (err: unknown) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    printRealizeHelp();
    return;
  }

  const vlog = (msg: string): void => {
    if (!options.verbose) return;
    process.stderr.write(`[verbose] ${msg}\n`);
  };

  if (options.help) {
    printRealizeHelp();
    return;
  }

  if (!options.input && !options.workDir) {
    process.stderr.write('Missing required --input or --work-dir argument.\n');
    process.exitCode = 1;
    printRealizeHelp();
    return;
  }

  try {
    let baseDir: string;
    let outDir: string;
    let outName: string | undefined;
    let entryKey: string | undefined;

    if (options.input) {
      const resolved = resolvePaths({
        input: options.input,
        ...(options.workDir === undefined ? {} : { workDir: options.workDir }),
        ...(options.outDir === undefined ? {} : { outDir: options.outDir }),
        ...(options.output === undefined ? {} : { output: options.output }),
      });
      baseDir = resolved.baseDir;
      outDir = resolved.outDir;
      outName = resolved.outName;
      entryKey = path
        .relative(baseDir, resolved.entryPath)
        .replace(/\\/g, '/')
        .replace(/^\.\//, '');
    } else {
      baseDir = path.resolve(options.workDir!);
      outDir = options.outDir ? path.resolve(options.outDir) : path.resolve(baseDir, 'transform');
      if (!options.json && normalizeForCompare(baseDir) === normalizeForCompare(outDir)) {
        throw new Error('Input directory and output directory must not match');
      }
    }

    vlog(`reading .tex files from ${baseDir}`);
    const files = await readAllTexFiles(baseDir, options.json ? undefined : outDir);
    vlog(`discovered ${files.length} .tex file(s)`);

    if (entryKey !== undefined && !files.some((file) => file.path === entryKey)) {
      throw new Error(`Entry file not found under work directory: ${entryKey}`);
    }

    const snapshot = createProjectSnapshot(files);
    const traversal = options.traversal ?? (entryKey !== undefined ? 'project' : 'file-only');
    const request: ConditionRealizationRequest = {
      ...(entryKey !== undefined ? { entryPath: entryKey } : {}),
      traversal,
      conditions: options.conditions,
      inputs: options.inputs,
      stripDeclarationsAndSetters: options.stripDeclarationsAndSetters,
    };

    vlog(`realizing conditions (traversal=${traversal}, inputs=${options.inputs})`);
    const realized = realizeProjectConditions(snapshot, request);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(realized, null, 2)}\n`);
      if (realized.status !== 'ready') {
        process.exitCode = 1;
      }
      return;
    }

    if (realized.status !== 'ready') {
      throw new Error(formatProjectIssue(realized.reason, 'Condition realization failed.'));
    }

    await writeArtifacts(outDir, realized.artifacts, {
      ...(entryKey !== undefined ? { entryKey } : {}),
      ...(outName !== undefined ? { outName } : {}),
      verbose: options.verbose,
      label: 'realize',
    });
    vlog('done');
  } catch (err: unknown) {
    process.stderr.write(
      `Failed to realize conditions: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  }
}
