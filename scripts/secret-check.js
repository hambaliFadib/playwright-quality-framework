const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const deniedPaths = [/^\.env$/, /^\.auth\//, /storageState\.json$/, /^playwright-report\//, /^test-results\//, /^artifacts\/(?!\.gitkeep$).+/];
const secretPatterns = [/AI_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{20,}/, /(api[_-]?key|access[_-]?token|password)\s*[:=]\s*['"][^'"]{12,}['"]/i, /sk-[A-Za-z0-9]{20,}/];

function filesToScan() {
  try {
    return {
      tracked: true,
      files: execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter(Boolean),
    };
  } catch {
    const found = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'playwright-report', 'test-results', 'artifacts'].includes(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(root, absolute).replace(/\\/g, '/');
        if (entry.isDirectory()) walk(absolute);
        else found.push(relative);
      }
    }
    walk(root);
    return { tracked: false, files: found };
  }
}

const failures = [];
const scan = filesToScan();
for (const file of scan.files) {
  if (scan.tracked && deniedPaths.some(pattern => pattern.test(file))) failures.push(`${file}: runtime or secret artifact must not be tracked`);
  if (!fs.existsSync(path.join(root, file))) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) failures.push(`${file}: possible hardcoded secret`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('No tracked secret or runtime artifact patterns detected.');
