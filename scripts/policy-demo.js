const { spawnSync } = require('child_process');

const cases = [
  { file: 'examples/policy-violations/raw-locator.spec.js', text: 'Raw locator usage is prohibited' },
  { file: 'examples/policy-violations/wait-timeout.spec.js', text: 'no-wait-for-timeout' },
  { file: 'examples/policy-violations/swallowed-assertion.spec.js', text: 'Assertions must not be swallowed' },
];

let failed = false;
for (const item of cases) {
  const result = spawnSync('npx.cmd', ['eslint', item.file], { encoding: 'utf8', shell: process.platform === 'win32' });
  const output = `${result.stdout}\n${result.stderr}`;
  const rejected = result.status !== 0 && output.includes(item.text);
  console.log(`${rejected ? 'POLICY REJECTED' : 'POLICY DEMO FAILED'}: ${item.file}`);
  if (!rejected) {
    console.log(output);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('All policy violation examples were mechanically rejected.');
