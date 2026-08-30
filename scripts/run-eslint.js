const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['tests', 'src', 'scripts'];
const fixedFiles = ['playwright.config.js', 'eslint.config.js'];
const eslintFiles = [];

function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(absolute);
    if (entry.isFile() && entry.name.endsWith('.js')) eslintFiles.push(path.relative(process.cwd(), absolute));
  }
}

for (const root of roots) collectJsFiles(root);
for (const file of fixedFiles) {
  if (fs.existsSync(file)) eslintFiles.push(file);
}

if (!eslintFiles.length) {
  console.log('No JavaScript files found for ESLint.');
  process.exit(0);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npxCommand, ['eslint', ...eslintFiles], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
