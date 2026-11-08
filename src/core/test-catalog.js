'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  ListTestsInputSchema,
  ListTestsResultSchema,
  ResolvedTestTargetSchema,
  TestDescriptorSchema,
  validateTestTarget,
} = require('./execution-contract');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const TESTS_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'e2e');
const SPEC_FILE_PATTERN = /(?:\.spec|\.test)\.js$/;

class TestCatalogError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TestCatalogError';
    this.code = code;
  }
}

function isPathWithin(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith('..' + path.sep));
}

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isMissingOrUnavailable(error) {
  return Boolean(error && ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR'].includes(error.code));
}

async function walkDirectory(directoryPath, relativeDirectory, realRootPath, tests) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => compareNames(left.name, right.name));

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const entryStat = await fs.lstat(entryPath);

    // Fail closed on all symlinks. This prevents directory traversal outside the
    // catalogue root and avoids aliases/cycles from links that point back inside it.
    if (entryStat.isSymbolicLink()) {
      throw new TestCatalogError('CATALOG_INVALID');
    }

    const realEntryPath = await fs.realpath(entryPath);
    if (!isPathWithin(realRootPath, realEntryPath)) {
      throw new TestCatalogError('CATALOG_INVALID');
    }

    const relativePath = relativeDirectory
      ? path.join(relativeDirectory, entry.name)
      : entry.name;

    if (entryStat.isDirectory()) {
      await walkDirectory(entryPath, relativePath, realRootPath, tests);
      continue;
    }

    if (!entryStat.isFile() || !SPEC_FILE_PATTERN.test(entry.name)) {
      continue;
    }

    const posixRelativePath = toPosixPath(relativePath);
    const descriptor = {
      id: 'spec:' + posixRelativePath,
      relativePath: posixRelativePath,
    };
    if (!TestDescriptorSchema.safeParse(descriptor).success) {
      throw new TestCatalogError('CATALOG_INVALID');
    }
    tests.push(descriptor);
  }
}

async function resolveRealCatalogueRoot(rootPath, trustedRootPath) {
  if (
    typeof rootPath !== 'string' ||
    typeof trustedRootPath !== 'string' ||
    !path.isAbsolute(rootPath) ||
    !path.isAbsolute(trustedRootPath) ||
    path.resolve(rootPath) !== rootPath ||
    path.resolve(trustedRootPath) !== trustedRootPath ||
    rootPath === trustedRootPath ||
    !isPathWithin(trustedRootPath, rootPath)
  ) {
    throw new TestCatalogError('CATALOG_INVALID');
  }

  const trustedRootStat = await fs.lstat(trustedRootPath);
  if (trustedRootStat.isSymbolicLink() || !trustedRootStat.isDirectory()) {
    throw new TestCatalogError('CATALOG_INVALID');
  }

  const realTrustedRootPath = await fs.realpath(trustedRootPath);
  const relativeRootPath = path.relative(trustedRootPath, rootPath);
  const pathSegments = relativeRootPath.split(path.sep);
  let currentPath = trustedRootPath;
  let realRootPath = realTrustedRootPath;

  // Check every component below the trusted repository root. Checking only
  // tests/e2e misses a symlink in its parent (for example, tests -> /external/tests).
  for (const segment of pathSegments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new TestCatalogError('CATALOG_INVALID');
    }

    currentPath = path.join(currentPath, segment);
    const currentStat = await fs.lstat(currentPath);
    if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) {
      throw new TestCatalogError('CATALOG_INVALID');
    }

    realRootPath = await fs.realpath(currentPath);
    if (!isPathWithin(realTrustedRootPath, realRootPath)) {
      throw new TestCatalogError('CATALOG_INVALID');
    }
  }

  return realRootPath;
}

async function discoverTestsAtRoot(rootPath, trustedRootPath) {
  try {
    const realRootPath = await resolveRealCatalogueRoot(rootPath, trustedRootPath);
    const tests = [];
    await walkDirectory(realRootPath, '', realRootPath, tests);
    tests.sort((left, right) => compareNames(left.relativePath, right.relativePath));

    const parsed = ListTestsResultSchema.safeParse({ tests });
    if (!parsed.success) {
      throw new TestCatalogError('CATALOG_INVALID');
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof TestCatalogError) throw error;
    if (isMissingOrUnavailable(error)) {
      throw new TestCatalogError('CATALOG_UNAVAILABLE');
    }
    throw new TestCatalogError('CATALOG_INVALID');
  }
}

async function resolveTestTargetAtRoot(target, rootPath, trustedRootPath) {
  const validatedTarget = validateTestTarget(target);
  if (!validatedTarget.ok) {
    throw new TestCatalogError('INVALID_TARGET');
  }

  const catalog = await discoverTestsAtRoot(rootPath, trustedRootPath);
  let resolvedTests;

  if (validatedTarget.value === 'suite:all') {
    resolvedTests = catalog.tests;
  } else {
    const descriptor = catalog.tests.find(testDescriptor =>
      testDescriptor.id === validatedTarget.value);
    if (!descriptor) {
      throw new TestCatalogError('TEST_NOT_FOUND');
    }
    resolvedTests = [descriptor];
  }

  const resolved = {
    target: validatedTarget.value,
    tests: resolvedTests,
  };
  const parsed = ResolvedTestTargetSchema.safeParse(resolved);
  if (!parsed.success) {
    throw new TestCatalogError('CATALOG_INVALID');
  }
  return parsed.data;
}

async function listTests(input = {}) {
  if (!ListTestsInputSchema.safeParse(input).success) {
    throw new TestCatalogError('INVALID_INPUT');
  }
  return discoverTestsAtRoot(TESTS_ROOT, REPOSITORY_ROOT);
}

async function resolveTestTarget(target) {
  return resolveTestTargetAtRoot(target, TESTS_ROOT, REPOSITORY_ROOT);
}

module.exports = {
  listTests,
  resolveTestTarget,
  TestCatalogError,
  // Internal root-injection seams are exported only for deterministic filesystem tests.
  _discoverTestsAtRoot: discoverTestsAtRoot,
  _resolveTestTargetAtRoot: resolveTestTargetAtRoot,
};
