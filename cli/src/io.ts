import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import type { GeneratedArtifact, SourceFile } from '@preptex/core';

export async function readAllTexFiles(baseDir: string, excludeDir?: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];

  const toKey = (absPath: string) =>
    path.relative(baseDir, absPath).replace(/\\/g, '/').replace(/^\.\//, '');

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
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
        source: await readFile(abs, 'utf8'),
        version: 1,
      });
    }
  };

  await walk(baseDir);
  return out;
}

export async function writeArtifacts(
  outDir: string,
  artifacts: readonly Pick<GeneratedArtifact, 'path' | 'source'>[],
  options?: {
    readonly entryKey?: string;
    readonly outName?: string;
    readonly verbose?: boolean;
    readonly label?: string;
  }
): Promise<void> {
  const resolvedRoot = path.resolve(outDir);
  const rootPrefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (options?.verbose) {
    const suffix = options.label ? ` (${options.label})` : '';
    process.stderr.write(`[verbose] writing ${artifacts.length} output(s) to ${outDir}${suffix}\n`);
  }

  await mkdir(resolvedRoot, { recursive: true });
  for (const artifact of artifacts) {
    const fileName =
      options?.entryKey !== undefined &&
      options?.outName !== undefined &&
      artifact.path === options.entryKey
        ? options.outName
        : artifact.path;
    const targetPath = path.resolve(resolvedRoot, fileName);
    if (targetPath !== resolvedRoot && !targetPath.startsWith(rootPrefix)) {
      throw new Error(`Unsafe output path escapes output directory: ${fileName}`);
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, artifact.source, 'utf8');

    if (options?.verbose) {
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
