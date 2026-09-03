import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDirectory, '../dist/index.js');

test('transform writes a valid empty output file', async (context) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'preptex-cli-'));
  context.after(async () => rm(workspace, { recursive: true, force: true }));

  const inputPath = path.join(workspace, 'empty.tex');
  await writeFile(inputPath, '', 'utf8');

  const result = spawnSync(process.execPath, [cliPath, 'transform', '--input', inputPath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(workspace, 'transform', 'empty.tex'), 'utf8'), '');
});
