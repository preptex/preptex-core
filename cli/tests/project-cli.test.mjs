import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
async function fixture(context, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'preptex-inspect-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), source, 'utf8');
  }
  return root;
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function failure(result, code = 'invalid-argument') {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, code);
  assert.equal('stack' in error, false);
  return error;
}

test('inventory requires no entry or output and retains inactive and body facts', async (context) => {
  const root = await fixture(context, {
    'main.tex': String.raw`\ifunknown\label{a}\else\label{b}\fi\def\stored{\label{body}}`,
    'broken.tex': '\\begin{itemize}',
  });
  const before = await readdir(root);
  const result = success(run('inventory', '--work-dir', root, '--kinds', 'label'));
  assert.deepEqual(
    result.facts.map((fact) => fact.key.value),
    ['a', 'b', 'body']
  );
  assert.equal(result.facts[2].context.definitionBodies.length, 1);
  assert.deepEqual(await readdir(root), before);
  assert.equal(
    success(run('inventory', '--work-dir', root, '--files', 'broken.tex', '--kinds', 'label')).facts
      .length,
    0
  );
});

test('configured CLI reference analysis follows input order and explicit overrides', async (context) => {
  const root = await fixture(context, {
    'main.tex': String.raw`\newif\ifdraft\ref{x}\input{sub/part}`,
    'sub/part.tex': String.raw`\drafttrue\ifdraft\label{x}\else\label{other}\fi`,
  });
  const source = success(run('analyze', '--work-dir', root, '--entry', 'main.tex'));
  assert.equal(source.references[0].status, 'matched');
  assert.equal(source.references[0].forward, true);
  assert.equal(source.references[0].targets[0].path, 'sub/part.tex');
  const forced = success(
    run(
      'analyze',
      '--work-dir',
      root,
      '--entry',
      'main.tex',
      '--condition-mode',
      'source-with-overrides',
      '--condition',
      'draft=false'
    )
  );
  assert.equal(forced.references[0].status, 'missing');
  assert.notEqual(source.resultId, forced.resultId);
});

test('source-only command candidates and scoped analysis need no configured entry', async (context) => {
  const root = await fixture(context, {
    'main.tex': String.raw`\def\used{}\used`,
    'other.tex': String.raw`\def\unused{}`,
  });
  const result = success(
    run('analyze', '--work-dir', root, '--analysis', 'unused-commands', '--files', 'other.tex')
  );
  assert.equal(result.commands[0].name, 'unused');
  assert.equal(result.commands[0].definition.occurrenceId, null);
  assert.equal(result.provenance.viewId, null);
});

test('incomplete analysis requires opt-in and preserves structured coverage/failure', async (context) => {
  const root = await fixture(context, { 'main.tex': String.raw`\ref{x}\ifunknown\label{x}\fi` });
  const error = failure(
    run('analyze', '--work-dir', root, '--entry', 'main.tex'),
    'operation-unavailable'
  );
  assert.equal(error.viewIssue.code, 'unknown-condition');
  const partial = success(
    run('analyze', '--work-dir', root, '--entry', 'main.tex', '--allow-incomplete')
  );
  assert.equal(partial.references[0].status, 'unknown-coverage');
  assert.equal(partial.coverage.status, 'partial');
});

test('new CLI options reject mixed policies, invalid scopes and output destinations', async (context) => {
  const root = await fixture(context, { 'main.tex': 'A' });
  const cases = [
    ['inventory', '--output', 'out.tex'],
    ['inventory', '--kinds', 'invented'],
    ['inventory', '--files', '../outside.tex'],
    ['inventory', '--files', 'absent.tex'],
    ['analyze'],
    ['analyze', '--entry', 'main.tex', '--files', 'main.tex'],
    ['analyze', '--entry', '../outside.tex'],
    ['analyze', '--entry', 'main.tex', '--condition', 'draft=true'],
    ['analyze', '--entry', 'main.tex', '--condition-mode', 'manual', '--initial', 'draft=true'],
    ['analyze', '--entry', 'main.tex', '--condition-mode', 'manual', '--condition', 'draft=maybe'],
    [
      'analyze',
      '--entry',
      'main.tex',
      '--condition-mode',
      'manual',
      '--condition',
      'draft=true',
      '--condition',
      'draft=false',
    ],
    ['analyze', '--entry', 'main.tex', '--if-branches', 'draft'],
  ];
  for (const args of cases) failure(run(args[0], '--work-dir', root, ...args.slice(1)));
  const legacy = run(
    'transform',
    '--work-dir',
    root,
    '--input',
    'main.tex',
    '--condition-mode',
    'source'
  );
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /cannot use --condition-mode/);
});

test('CLI help needs no project files and I/O failures do not expose stacks', async () => {
  for (const command of ['inventory', 'analyze']) assert.equal(run(command, '--help').status, 0);
  failure(
    run('inventory', '--work-dir', path.join(tmpdir(), 'preptex-does-not-exist-root')),
    'cli-error'
  );
});

test('inventory skips symlinked directories outside the selected root', async (context) => {
  const root = await fixture(context, { 'main.tex': String.raw`\label{inside}` });
  const outside = await fixture(context, { 'secret.tex': String.raw`\label{outside}` });
  await symlink(
    outside,
    path.join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const result = success(run('inventory', '--work-dir', root, '--kinds', 'label'));
  assert.deepEqual(
    result.facts.map((fact) => fact.key.value),
    ['inside']
  );
});
