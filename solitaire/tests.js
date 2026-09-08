import { summary } from './test-harness.js';
import './game.test.js';
import './storage.test.js';

const { results, pass, fail } = summary();
const out = document.getElementById('out');
let html = '';
let lastSection = null;
for (const r of results) {
  if (r.section !== lastSection) {
    html += `<h2>${r.section}</h2>`;
    lastSection = r.section;
  }
  if (r.ok) html += `<div class="pass">&#10003; ${r.name}</div>`;
  else html += `<div class="fail">&#10007; ${r.name} &mdash; ${r.message}</div>`;
}
out.innerHTML =
  `<h1 class="${fail === 0 ? 'pass' : 'fail'}">${fail === 0 ? 'ALL PASS' : 'FAILURES'} ` +
  `&mdash; ${pass} passed, ${fail} failed</h1>` + html;
document.title = `${fail === 0 ? 'PASS' : 'FAIL'} - solitaire tests`;
