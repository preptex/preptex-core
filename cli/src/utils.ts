import path from 'node:path';

export function normalizeForCompare(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

export type ResolvedPaths = {
  baseDir: string;
  entryPath: string;
  outDir: string;
};

// Centralize path rules:
// - If workDir provided, input is a filename inside it; else input can be path.
// - If outDir missing, default to baseDir/transform.
// - Throw error if baseDir and outDir resolve to the same location.
export function resolvePaths(opts: {
  input: string;
  workDir?: string;
  outDir?: string;
}): ResolvedPaths {
  const { input, workDir, outDir } = opts;
  const base = workDir ? path.resolve(workDir) : undefined;
  const entryPath = base ? path.resolve(base, input) : path.resolve(input);
  const baseDir = base ?? path.dirname(entryPath);
  const resolvedOutDir = outDir ? path.resolve(outDir) : path.resolve(baseDir, 'transform');
  if (normalizeForCompare(baseDir) === normalizeForCompare(resolvedOutDir)) {
    throw new Error('Input directory and output directory must not match');
  }
  return { baseDir, entryPath, outDir: resolvedOutDir };
}
