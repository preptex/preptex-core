import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { TransformCliOptions } from './args.js';
import type { SourceFile, TransformedFile } from '@preptex/core';

export async function readAllTexFiles(baseDir: string, excludeDir?: string): Promise<SourceFile[]> {
  const fs = await import('node:fs/promises');
  const out: SourceFile[] = [];

  const toKey = (absPath: string) =>
    path.relative(baseDir, absPath).replace(/\\/g, '/').replace(/^\.\//, '');

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') {
          continue;
        }
        if (excludeDir && normalizeForCompare(abs) === normalizeForCompare(excludeDir)) {
          continue;
        }
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.tex')) continue;
      const key = toKey(abs);
      out.push({
        path: key,
        source: await fs.readFile(abs, 'utf8'),
        version: 1,
      });
    }
  };

  await walk(baseDir);
  return out;
}

export function makeReader(baseDir: string): (filename: string) => string {
  const reader = (filename: string) => {
    const target = path.isAbsolute(filename) ? filename : path.resolve(baseDir, filename);
    return readFileSync(target, 'utf8');
  };
  return reader;
}

export async function writeOutputsRecursive(
  outputs: readonly TransformedFile[],
  opts: TransformCliOptions
): Promise<void> {
  const { entryPath, baseDir, outDir, outName } = resolvePaths({
    input: opts.input,
    ...(opts.workDir === undefined ? {} : { workDir: opts.workDir }),
    ...(opts.outDir === undefined ? {} : { outDir: opts.outDir }),
    ...(opts.output === undefined ? {} : { output: opts.output }),
  });
  const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');

  if (opts.verbose) {
    process.stderr.write(
      `[verbose] writing ${outputs.length} output(s) to ${outDir} (recursive)\n`
    );
  }

  await mkdir(outDir, { recursive: true });
  for (const output of outputs) {
    const fileName = output.path === entryKey ? outName : output.path;
    const outPath = path.join(outDir, fileName);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output.source, 'utf8');

    if (opts.verbose) {
      process.stderr.write(`[verbose] wrote ${fileName}\n`);
    }
  }
}

export function normalizeForCompare(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

export type ResolvedPaths = {
  baseDir: string;
  entryPath: string;
  outDir: string;
  outName: string;
};

export function resolvePaths(opts: {
  input: string;
  output?: string;
  workDir?: string;
  outDir?: string;
}): ResolvedPaths {
  const { input, workDir, outDir } = opts;
  const base = workDir ? path.resolve(workDir) : undefined;
  const entryPath = base ? path.resolve(base, input) : path.resolve(input);
  const baseDir = base ?? path.dirname(entryPath);
  const resolvedOutDir = outDir ? path.resolve(outDir) : path.resolve(baseDir, 'transform');
  const inputName = path.basename(entryPath);
  const outputName = opts.output ? opts.output : inputName;
  if (normalizeForCompare(baseDir) === normalizeForCompare(resolvedOutDir)) {
    throw new Error('Input directory and output directory must not match');
  }
  return { baseDir, entryPath, outDir: resolvedOutDir, outName: outputName };
}
