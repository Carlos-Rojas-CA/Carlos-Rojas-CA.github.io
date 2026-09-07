import { summary } from './test-harness.js';
import './game.test.js';
import './storage.test.js';

const { results, pass, fail } = summary();
let lastSection = null;
for (const r of results) {
  if (r.section !== lastSection) {
    console.log(`\n${r.section}`);
    lastSection = r.section;
  }
  if (r.ok) console.log(`  PASS  ${r.name}`);
  else console.log(`  FAIL  ${r.name} -- ${r.message}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
