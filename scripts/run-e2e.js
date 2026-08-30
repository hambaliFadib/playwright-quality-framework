const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(process.cwd(), 'tests', 'e2e');
const specPattern = /\.(spec|test)\.js$/;

function hasSpec(dir) {
  if (!fs.existsSync(dir)) return false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory() && hasSpec(absolute)) return true;
    if (entry.isFile() && specPattern.test(entry.name)) return true;
  }
  return false;
}

if (!hasSpec(testDir)) {
  console.log('No application E2E tests configured yet; skipping AUT execution.');
  process.exit(0);
}

const playwrightCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(playwrightCommand, ['playwright', 'test'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status === null ? 1 : result.status);
