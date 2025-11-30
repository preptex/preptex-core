import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CoreOptions } from '../options';

export async function readMainFile(entryPath: string, _options: CoreOptions): Promise<string> {
  const full = resolve(entryPath);
  const content = await readFile(full, 'utf-8');
  return content;
}
