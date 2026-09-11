// facts-check.mjs — sanity check for worker/src/facts.js against the real deck.
// Run with: node tools/sim/facts-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { computeFacts, flagOf } from '../../worker/src/facts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staysPath = path.resolve(__dirname, '../../src/stays.js');
const src = fs.readFileSync(staysPath, 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);

const stays = sandbox.window.STAYS;
if (!Array.isArray(stays)) {
  throw new Error('window.STAYS was not populated as an array');
}

const withFacts = computeFacts(stays);

let flagged = 0;
const histogram = new Map();
for (const s of withFacts) {
  const flag = flagOf(s.facts);
  if (flag) flagged++;
  const count = s.facts.length;
  histogram.set(count, (histogram.get(count) || 0) + 1);
}

console.log(`Total stays: ${withFacts.length}`);
console.log(`Stays with a flag (w>=4): ${flagged}`);
console.log('');
console.log('Histogram of fact counts per stay:');
const keys = [...histogram.keys()].sort((a, b) => a - b);
for (const k of keys) {
  console.log(`  ${k} facts: ${histogram.get(k)} stays`);
}

console.log('');
console.log('First 6 stays:');
for (const s of withFacts.slice(0, 6)) {
  console.log(`- ${s.place}`);
  for (const f of s.facts) {
    console.log(`    ${f.k}: ${f.v} (${f.w})`);
  }
}
