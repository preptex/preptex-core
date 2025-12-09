import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TransformCliOptions } from './args.js';
import { resolvePaths } from './utils.js';

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
  const { outDir } = resolvePaths({
    input: opts.input!,
    workDir: opts.workDir,
    outDir: opts.outDir,
  });
  await mkdir(outDir, { recursive: true });
  for (const [file, text] of Object.entries(outputs)) {
    const base = path.basename(file);
    const outPath = path.join(outDir, base);
    await writeFile(outPath, String(text), 'utf8');
  }
}
