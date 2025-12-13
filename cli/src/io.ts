import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TransformCliOptions } from './args.js';

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
  const { entryPath, outDir, outName } = resolvePaths({
    input: opts.input!,
    workDir: opts.workDir,
    outDir: opts.outDir,
    output: opts.output,
  });
  await mkdir(outDir, { recursive: true });
  for (const [file, text] of Object.entries(outputs)) {
    let base = path.basename(file);
    const fileName = file === entryPath ? outName : base;
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
