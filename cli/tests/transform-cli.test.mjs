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

test('CLI preserve, flatten, separate and AST commands operate on realized project views', async (context) => {
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
  assert.equal(
    await readFile(path.join(workspace, 'transform', 'main.tex'), 'utf8'),
    String.raw`B\input{part}`
  );
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
  assert.equal(await readFile(path.join(workspace, 'transform', 'main.tex'), 'utf8'), 'APART');
  run('transform', '--work-dir', workspace, '--input', 'main.tex', '--recursive');
  assert.equal(await readFile(path.join(workspace, 'transform', 'unused.tex'), 'utf8'), 'UNUSED');
  const ast = run('ast', '--work-dir', workspace, '--input', 'main.tex');
  const parsed = JSON.parse(ast.stdout);
  assert.equal(parsed.configuration.entryPath, 'main.tex');
  assert.equal(parsed.status, 'ready');
  assert.equal(parsed.root.kind, 'root');
});

test('transform supports condition policies, comment environments, and recursive suppression', async (context) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'preptex-cli-040-'));
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  await writeFile(
    path.join(workspace, 'main.tex'),
    String.raw`\newif\ifdraft\drafttrue\ifdraft A\else B\fi\begin{comment}C\end{comment}% tail` +
      '\n\\input{part}',
    'utf8'
  );
  await writeFile(path.join(workspace, 'part.tex'), 'P% comment\nQ', 'utf8');

  const run = (...args) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };

  run(
    'transform',
    '--work-dir',
    workspace,
    '--input',
    'main.tex',
    '--condition-mode',
    'manual',
    '--condition',
    'draft=false',
    '--suppress-comments',
    '--suppress-comment-environments'
  );
  assert.equal(
    await readFile(path.join(workspace, 'transform', 'main.tex'), 'utf8'),
    String.raw`B\input{part}`
  );
  assert.equal(await readFile(path.join(workspace, 'transform', 'part.tex'), 'utf8'), 'PQ');

  run(
    'transform',
    '--work-dir',
    workspace,
    '--input',
    'main.tex',
    '--recursive',
    '--suppress-comments',
    '--out-dir',
    path.join(workspace, 'rec-out')
  );
  assert.equal(await readFile(path.join(workspace, 'rec-out', 'part.tex'), 'utf8'), 'PQ');

  const astNone = run(
    'ast',
    '--work-dir',
    workspace,
    '--input',
    'main.tex',
    '--condition-mode',
    'none'
  );
  const parsedNone = JSON.parse(astNone.stdout);
  assert.equal(parsedNone.status, 'blocked');
  assert.equal(parsedNone.reason.code, 'unrealized-condition');
});

test('realize realizes conditions independently of AST balance (Pipeline B)', async (context) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'preptex-cli-realize-'));
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  await writeFile(
    path.join(workspace, 'main.tex'),
    String.raw`\newif\ifok\oktrue\ifok {unbalanced \begin{a}\end{b} \input{sub}\fi`,
    'utf8'
  );
  await writeFile(path.join(workspace, 'sub.tex'), String.raw`\ifok sub-ok\fi`, 'utf8');

  const jsonResult = spawnSync(
    process.execPath,
    [cliPath, 'realize', '--work-dir', workspace, '--input', 'main.tex', '--flatten', '--json'],
    { encoding: 'utf8' }
  );
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const parsed = JSON.parse(jsonResult.stdout);
  assert.equal(parsed.kind, 'condition-realization');
  assert.equal(parsed.status, 'ready');
  assert.equal(parsed.artifacts[0].source, String.raw`{unbalanced \begin{a}\end{b} sub-ok`);

  const writeResult = spawnSync(
    process.execPath,
    [
      cliPath,
      'realize',
      '--work-dir',
      workspace,
      '--input',
      'main.tex',
      '--flatten',
      '--out-dir',
      path.join(workspace, 'out'),
      '--output',
      'realized.tex',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(writeResult.status, 0, writeResult.stderr);
  assert.equal(
    await readFile(path.join(workspace, 'out', 'realized.tex'), 'utf8'),
    String.raw`{unbalanced \begin{a}\end{b} sub-ok`
  );
});
