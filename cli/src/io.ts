import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TransformCliOptions } from './args.js';
import type { VersionedTextFile } from '@preptex/core';

export async function readAllTexFiles(baseDir: string): Promise<Record<string, VersionedTextFile>> {
  const fs = await import('node:fs/promises');
  const out: Record<string, VersionedTextFile> = {};

  const toKey = (absPath: string) =>
    path.relative(baseDir, absPath).replace(/\\/g, '/').replace(/^\.\//, '');

  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.tex')) continue;
      const key = toKey(abs);
      out[key] = {
        text: await fs.readFile(abs, 'utf8'),
        version: 1,
      };
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
  outputs: Record<string, string>,
  opts: TransformCliOptions
): Promise<void> {
  const { entryPath, baseDir, outDir, outName } = resolvePaths({
    input: opts.input!,
    workDir: opts.workDir,
    outDir: opts.outDir,
    output: opts.output,
  });
  const entryKey = path.relative(baseDir, entryPath).replace(/\\/g, '/').replace(/^\.\//, '');
  await mkdir(outDir, { recursive: true });
  for (const [file, text] of Object.entries(outputs)) {
    let base = path.basename(file);
    const fileName = file === entryKey ? outName : base;
    const outPath = path.join(outDir, fileName);
    await writeFile(outPath, String(text), 'utf8');
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
