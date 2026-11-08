'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  listTests,
  resolveTestTarget,
  TestCatalogError,
  _discoverTestsAtRoot,
  _resolveTestTargetAtRoot,
} = require('../../src/core/test-catalog');
const { TestDescriptorSchema } = require('../../src/core/execution-contract');

async function createTempRoot(t) {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-test-catalog-'));
  const repositoryRoot = path.join(tempDirectory, 'repository');
  const root = path.join(repositoryRoot, 'tests', 'e2e');
  await fs.mkdir(root, { recursive: true });
  t.after(async () => fs.rm(tempDirectory, { recursive: true, force: true }));
  return { tempDirectory, repositoryRoot, root };
}

async function writeFileAt(root, relativePath, content = '// deterministic test fixture\n') {
  const targetPath = path.join(root, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf8');
  return targetPath;
}

async function expectCatalogError(promise, code) {
  await assert.rejects(promise, error =>
    error instanceof TestCatalogError &&
    error.code === code &&
    error.message === code);
}

function trustedRootFor(rootPath) {
  return path.dirname(path.dirname(rootPath));
}

function discoverAtRoot(rootPath) {
  return _discoverTestsAtRoot(rootPath, trustedRootFor(rootPath));
}

function resolveAtRoot(target, rootPath) {
  return _resolveTestTargetAtRoot(target, rootPath, trustedRootFor(rootPath));
}

test('repository catalogue discovers only the three tracked E2E specs with stable POSIX IDs', async () => {
  const catalog = await listTests();
  assert.deepEqual(catalog.tests.map(item => item.id), [
    'spec:auth/login.spec.js',
    'spec:cart/add-to-cart.spec.js',
    'spec:cart/remove-from-cart.spec.js',
  ]);
  assert.deepEqual(catalog.tests.map(item => item.relativePath), [
    'auth/login.spec.js',
    'cart/add-to-cart.spec.js',
    'cart/remove-from-cart.spec.js',
  ]);
});

test('catalogue recursively discovers only .spec.js and .test.js files in deterministic order', async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'zeta/z-last.test.js');
  await writeFileAt(root, 'alpha/a-first.spec.js');
  await writeFileAt(root, 'alpha/ignored.js');
  await writeFileAt(root, 'ignored.spec.ts');
  await writeFileAt(root, 'ignored.test.jsx');
  await writeFileAt(root, '.gitkeep');

  const catalog = await discoverAtRoot(root);
  assert.deepEqual(catalog.tests, [
    { id: 'spec:alpha/a-first.spec.js', relativePath: 'alpha/a-first.spec.js' },
    { id: 'spec:zeta/z-last.test.js', relativePath: 'zeta/z-last.test.js' },
  ]);
});

test('catalogue preserves valid spaces and nested relative paths', async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'checkout flow/add item.spec.js');

  const catalog = await discoverAtRoot(root);
  assert.deepEqual(catalog.tests, [
    { id: 'spec:checkout flow/add item.spec.js', relativePath: 'checkout flow/add item.spec.js' },
  ]);
});

test('empty catalogue is represented as an empty list, never as an implicit test', async t => {
  const { root } = await createTempRoot(t);
  assert.deepEqual(await discoverAtRoot(root), { tests: [] });
  assert.deepEqual(await resolveAtRoot('suite:all', root), {
    target: 'suite:all',
    tests: [],
  });
});

test('root path must be absolute, existing, and a real directory', async t => {
  const { tempDirectory, root } = await createTempRoot(t);
  await expectCatalogError(discoverAtRoot('relative/tests/e2e'), 'CATALOG_INVALID');
  await expectCatalogError(
    discoverAtRoot(path.join(tempDirectory, 'missing')),
    'CATALOG_UNAVAILABLE',
  );
  const filePath = path.join(tempDirectory, 'not-a-directory');
  await fs.writeFile(filePath, 'not a directory');
  await expectCatalogError(discoverAtRoot(filePath), 'CATALOG_INVALID');
  assert.equal((await fs.stat(root)).isDirectory(), true);
});

test('catalogue fails closed when a spec symlink points outside the root', async t => {
  const { tempDirectory, root } = await createTempRoot(t);
  const outside = path.join(tempDirectory, 'outside');
  await fs.mkdir(outside);
  await writeFileAt(outside, 'escape.spec.js');
  const linkPath = path.join(root, 'external');
  await fs.symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  await expectCatalogError(discoverAtRoot(root), 'CATALOG_INVALID');
});

test('catalogue fails closed when the tests parent directory is a symlink outside the repository', async t => {
  const { tempDirectory, root } = await createTempRoot(t);
  const testsDirectory = path.dirname(root);
  const outsideTestsDirectory = path.join(tempDirectory, 'outside-tests');
  const outsideRoot = path.join(outsideTestsDirectory, 'e2e');
  await fs.mkdir(outsideRoot, { recursive: true });
  await writeFileAt(outsideRoot, 'escape.spec.js');

  await fs.rm(testsDirectory, { recursive: true, force: true });
  await fs.symlink(
    outsideTestsDirectory,
    testsDirectory,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await expectCatalogError(discoverAtRoot(root), 'CATALOG_INVALID');
});

test('catalogue fails closed when the tests/e2e root itself is a symlink', async t => {
  const { tempDirectory, root } = await createTempRoot(t);
  const outside = path.join(tempDirectory, 'outside-root');
  await fs.mkdir(outside);
  await fs.rm(root, { recursive: true, force: true });
  await fs.symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
  await expectCatalogError(discoverAtRoot(root), 'CATALOG_INVALID');
});

test('catalogue fails closed for invalid spec path segments', { skip: process.platform === 'win32' }, async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'invalid:name.spec.js');
  await expectCatalogError(discoverAtRoot(root), 'CATALOG_INVALID');
});

test('test descriptor schema rejects invalid POSIX path segments on every platform', () => {
  assert.equal(TestDescriptorSchema.safeParse({
    id: 'spec:invalid:name.spec.js',
    relativePath: 'invalid:name.spec.js',
  }).success, false);
  assert.equal(TestDescriptorSchema.safeParse({
    id: 'spec:auth/login.spec.js',
    relativePath: 'auth/login.spec.js',
  }).success, true);
});

test('resolveTestTarget returns only a catalogue member for a specific ID', async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'auth/login.spec.js');
  assert.deepEqual(await resolveAtRoot('spec:auth/login.spec.js', root), {
    target: 'spec:auth/login.spec.js',
    tests: [{ id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' }],
  });
});

test('resolveTestTarget returns all catalogue members for suite:all', async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'auth/login.spec.js');
  await writeFileAt(root, 'cart/add.test.js');
  const result = await resolveAtRoot('suite:all', root);
  assert.equal(result.target, 'suite:all');
  assert.deepEqual(result.tests.map(item => item.id), [
    'spec:auth/login.spec.js',
    'spec:cart/add.test.js',
  ]);
});

test('unknown but well-formed spec IDs return TEST_NOT_FOUND', async t => {
  const { root } = await createTempRoot(t);
  await writeFileAt(root, 'auth/login.spec.js');
  await expectCatalogError(
    resolveAtRoot('spec:auth/missing.spec.js', root),
    'TEST_NOT_FOUND',
  );
});

test('unsafe targets return INVALID_TARGET before filesystem discovery', async () => {
  await expectCatalogError(
    resolveAtRoot('spec:../outside.spec.js', path.join(os.tmpdir(), 'does-not-exist')),
    'INVALID_TARGET',
  );
});

test('public resolveTestTarget uses the fixed repository catalogue', async () => {
  const result = await resolveTestTarget('spec:auth/login.spec.js');
  assert.equal(result.target, 'spec:auth/login.spec.js');
  assert.deepEqual(result.tests, [
    { id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' },
  ]);
  await expectCatalogError(resolveTestTarget('spec:auth/not-present.spec.js'), 'TEST_NOT_FOUND');
});

test('listTests rejects caller-supplied root or unexpected options', async () => {
  await assert.rejects(listTests({ rootPath: os.tmpdir() }), error =>
    error instanceof TestCatalogError && error.code === 'INVALID_INPUT');
});
