import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function readMainFile(entryPath: string): Promise<string> {
  const full = resolve(entryPath);
  const content = await readFile(full, 'utf-8');
  return content;
}
