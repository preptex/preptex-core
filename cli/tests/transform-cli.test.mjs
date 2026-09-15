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

test('legacy CLI preserve, flatten, separate and AST commands retain their public behavior', async (context) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'preptex-cli-project-'));
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const source = String.raw`\newif\ifdraft\ifdraft A\else B\fi\input{part}`;
  await writeFile(path.join(workspace, 'main.tex'), source, 'utf8');
  await writeFile(path.join(workspace, 'part.tex'), 'PART', 'utf8');
  await writeFile(path.join(workspace, 'unused.tex'), 'UNUSED', 'utf8');
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  run('transform', '--work-dir', workspace, '--input', 'main.tex');
  assert.equal(await readFile(path.join(workspace, 'transform', 'main.tex'), 'utf8'), source);
  run(
    'transform',
    '--work-dir',
    workspace,
    '--input',
    'main.tex',
    '--flatten',
    '--if-branches',
    'draft'
  );
  assert.equal(await readFile(path.join(workspace, 'transform', 'main.tex'), 'utf8'), ' APART');
  run('transform', '--work-dir', workspace, '--input', 'main.tex', '--recursive');
  assert.equal(await readFile(path.join(workspace, 'transform', 'unused.tex'), 'utf8'), 'UNUSED');
  const ast = run('ast', '--work-dir', workspace, '--input', 'main.tex');
  const parsed = JSON.parse(ast.stdout);
  assert.equal(parsed.path, 'main.tex');
  assert.deepEqual(parsed.declaredConditions, ['draft']);
  assert.equal(parsed.root.type, 'Root');
});
