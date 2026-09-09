import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Install real tarballs outside the monorepo so workspace resolution cannot hide
// packaging mistakes. Run through npm to reuse its cross-platform CLI entry.
const root = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run consumer:check.');
assert.ok(
  process.argv.slice(2).every((arg) => arg === '--registry'),
  'Only --registry is supported.'
);
const fromRegistry = process.argv.includes('--registry');
const registry = '--registry=https://registry.npmjs.org/';
const release = path.join(root, 'examples/build/release');
await mkdir(release, { recursive: true });
const reportPath = path.join(
  release,
  fromRegistry ? 'registry-verification.json' : 'verification.json'
);
await rm(reportPath, { force: true });

function run(args, cwd = root, capture = false) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Command failed: ${args.join(' ')}`);
  return result.stdout;
}
const npm = (args, cwd, capture) => run([npmCli, ...args], cwd, capture);
const json = async (filename) => JSON.parse(await readFile(filename, 'utf8'));
const writeJson = (filename, data) => writeFile(filename, `${JSON.stringify(data, null, 2)}\n`);
const packages = [];
for (const workspace of ['core', 'cli']) {
  const manifest = await json(path.join(root, workspace, 'package.json'));
  assert.equal(manifest.version, '0.3.0', 'All stages share the 0.3.0 release.');
  npm(['run', 'prepack', `--workspace=${manifest.name}`]);
  const [packed] = JSON.parse(
    npm(
      [
        'pack',
        `--workspace=${manifest.name}`,
        '--ignore-scripts',
        '--pack-destination',
        release,
        '--json',
      ],
      root,
      true
    )
  );
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  const names = new Set(packed.files.map((file) => file.path));
  const required = ['package.json', 'README.md', 'LICENSE', 'dist/index.js'];
  if (workspace === 'core')
    required.push(
      'dist/index.d.ts',
      'dist/project-types.d.ts',
      'dist/docs/api/README.md',
      'dist/docs/integration.md',
      'dist/docs/architecture.md',
      'dist/docs/project-model.md',
      'dist/docs/migration-0.3.md',
      'dist/docs/website-handoff.md'
    );
  for (const name of required) assert.ok(names.has(name), `Missing package file: ${name}`);
  for (const name of names)
    assert.ok(
      !/^(src|tests|type-tests|node_modules|\.git)(\/|$)|(^|\/)\.env($|\.)/.test(name),
      `Unexpected package file: ${name}`
    );
  const archive = path.join(release, packed.filename);
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(archive))
    .digest('base64')}`;
  assert.equal(integrity, packed.integrity);
  packages.push({
    name: packed.name,
    version: packed.version,
    filename: packed.filename,
    integrity,
  });
}
if (fromRegistry) {
  for (const pkg of packages) {
    const publishedIntegrity = JSON.parse(
      npm(['view', `${pkg.name}@${pkg.version}`, 'dist.integrity', registry, '--json'], root, true)
    );
    assert.equal(publishedIntegrity, pkg.integrity, `Published contents differ for ${pkg.name}.`);
  }
}

const tempBase = path.resolve(tmpdir());
const consumer = await mkdtemp(path.join(tempBase, 'preptex-consumer-'));
try {
  await writeJson(path.join(consumer, 'package.json'), {
    name: 'preptex-isolated-consumer',
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(
      packages.map((pkg) => [
        pkg.name,
        fromRegistry
          ? pkg.version
          : `file:${path.join(release, pkg.filename).replaceAll('\\', '/')}`,
      ])
    ),
    devDependencies: { typescript: '4.9.5', vitest: '2.1.9' },
  });
  npm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', registry],
    consumer
  );
  assert.equal(
    (await json(path.join(consumer, 'node_modules/typescript/package.json'))).version,
    '4.9.5'
  );
  const installed = await json(path.join(consumer, 'node_modules/@preptex/core/package.json'));
  assert.deepEqual(Object.keys(installed.exports), ['.']);
  assert.equal(installed.exports['.'].types, './dist/index.d.ts');
  assert.equal(installed.exports['.'].import, './dist/index.js');
  assert.equal(installed.exports['.'].browser, './dist/index.js');
  assert.equal(installed.version, '0.3.0');
  assert.equal(
    (await json(path.join(consumer, 'node_modules/@preptex/cli/package.json'))).dependencies[
      '@preptex/core'
    ],
    '0.3.0'
  );
  await cp(path.join(root, 'core/type-tests'), path.join(consumer, 'type-tests'), {
    recursive: true,
  });
  await writeJson(path.join(consumer, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'node',
      lib: ['ES2020'],
      types: [],
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: false,
      noEmit: true,
    },
    include: ['type-tests/*.ts'],
  });
  run([path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer);
  await mkdir(path.join(consumer, 'acceptance'), { recursive: true });
  const suites = ['project-model', 'project-operations', 'project-pipeline'];
  for (const name of suites) {
    const source = await readFile(path.join(root, `core/tests/${name}.test.ts`), 'utf8');
    const publicSource = source.replaceAll("'../src/index.js'", "'@preptex/core'");
    assert.notEqual(source, publicSource, `Missing public import in ${name}`);
    assert.ok(
      !publicSource.includes('../src/'),
      'Acceptance suites must use the package boundary.'
    );
    await writeFile(path.join(consumer, `acceptance/${name}.test.ts`), publicSource);
  }
  await cp(path.join(root, 'core/tests/fixtures'), path.join(consumer, 'acceptance/fixtures'), {
    recursive: true,
  });
  await writeFile(
    path.join(consumer, 'vitest.config.mjs'),
    "export default { test: { include: ['acceptance/*.test.ts'], coverage: { enabled: false } } };\n"
  );
  run([path.join(consumer, 'node_modules/vitest/vitest.mjs'), 'run'], consumer);
  await cp(path.join(root, 'examples/project-model.mjs'), path.join(consumer, 'example.mjs'));
  run(['example.mjs'], consumer);
  await writeFile(
    path.join(consumer, 'exports.mjs'),
    [
      "import assert from 'node:assert/strict';",
      "import { createProjectSnapshot, runProjectPipeline } from '@preptex/core';",
      "assert.equal(createProjectSnapshot([]).coreVersion, '0.3.0');",
      "assert.equal(typeof runProjectPipeline, 'function');",
      "await assert.rejects(import('@preptex/core/dist/lib/core.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });",
    ].join('\n')
  );
  run(['exports.mjs'], consumer);
  await mkdir(path.join(consumer, 'cli-acceptance'));
  const cliSuites = ['transform-cli', 'project-cli'];
  for (const name of cliSuites) {
    const source = await readFile(path.join(root, `cli/tests/${name}.test.mjs`), 'utf8');
    const packedSource = source.replaceAll(
      "'../dist/index.js'",
      "'../node_modules/@preptex/cli/dist/index.js'"
    );
    assert.notEqual(source, packedSource, `Missing CLI entry in ${name}`);
    await writeFile(path.join(consumer, `cli-acceptance/${name}.test.mjs`), packedSource);
  }
  run(['--test', ...cliSuites.map((name) => `cli-acceptance/${name}.test.mjs`)], consumer);
  await writeJson(reportPath, {
    status: 'passed',
    source: fromRegistry ? 'registry' : 'local-tarballs',
    registryPublicationVerified: fromRegistry,
    typescript: '4.9.5',
    target: 'ES2020',
    packages,
    acceptanceSuites: suites,
    cliSuites,
  });
  console.log(`Package consumer checks passed. Tarballs and evidence: ${release}`);
} finally {
  // Verify the exact mkdtemp directory before recursive cleanup on Windows.
  const relative = path.relative(tempBase, path.resolve(consumer));
  assert.ok(
    relative.startsWith('preptex-consumer-') &&
      !relative.includes(path.sep) &&
      !path.isAbsolute(relative)
  );
  await rm(consumer, { recursive: true, force: true });
}
