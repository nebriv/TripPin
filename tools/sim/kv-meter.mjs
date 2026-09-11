// kv-meter.mjs - checks the KV meter in worker/src/index.js.
//
// The meter is what the admin page's "KV today" line reads from, and a wrong
// number there is worse than no number: it would say there is headroom on the
// day the writes actually run out. So the arithmetic is checked here rather
// than trusted, against a fake binding that records what it was asked to do.
//
// Run with: node tools/sim/kv-meter.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, '../../worker/src/index.js');
const src = fs.readFileSync(workerPath, 'utf8');

const start = src.indexOf("const KVSTATS_KEY");
const end = src.indexOf('\n}', src.indexOf('async function kvUsage')) + 2;
const block = src.slice(start, end);

const ctx = vm.createContext({ console });
vm.runInContext(block + '\nglobalThis.__api = { meterKV, flushKV, kvUsage, kvPendingTotal, KV_LIMITS, get pending() { return kvPending; } };', ctx);
const api = ctx.__api;

// A fake KV that records what it was asked to do.
const store = new Map();
const calls = { get: 0, put: 0, delete: 0, list: 0 };
const raw = {
  get: async (k, t) => { calls.get++; const v = store.get(k); return t === 'json' && v ? JSON.parse(v) : v ?? null; },
  put: async (k, v) => { calls.put++; store.set(k, v); },
  delete: async (k) => { calls.delete++; store.delete(k); },
  list: async () => { calls.list++; return { keys: [] }; },
};

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name}`);
};

// 1. the wrapper counts each kind
const kv = api.meterKV(raw);
await kv.get('a'); await kv.get('b'); await kv.put('c', '1');
await kv.delete('d'); await kv.list();
check('counts reads/writes/deletes/lists', api.pending, { reads: 2, writes: 1, deletes: 1, lists: 1 });
check('pending total', api.kvPendingTotal(), 5);

// 2. flushing folds the tally in and charges itself
await api.flushKV(raw);
const day = new Date().toISOString().slice(0, 10);
check('folded tally includes its own get+put',
  JSON.parse(store.get('kvstats:v1')), { day, reads: 3, writes: 2, deletes: 1, lists: 1 });
check('pending cleared after flush', api.pending, { reads: 0, writes: 0, deletes: 0, lists: 0 });

// 3. a second flush accumulates rather than replacing
await kv.get('x');
await api.flushKV(raw);
check('second flush accumulates',
  JSON.parse(store.get('kvstats:v1')), { day, reads: 5, writes: 3, deletes: 1, lists: 1 });

// 4. a stored tally from another day is not carried forward
store.set('kvstats:v1', JSON.stringify({ day: '2000-01-01', reads: 999, writes: 999, deletes: 9, lists: 9 }));
await kv.put('y', '1');
await api.flushKV(raw);
check('yesterday does not leak into today',
  JSON.parse(store.get('kvstats:v1')), { day, reads: 1, writes: 2, deletes: 0, lists: 0 });

// 5. a KV failure gives the tally back instead of dropping it
await kv.get('z'); await kv.put('z', '1');
const broken = { get: async () => { throw new Error('KV down'); }, put: raw.put };
await api.flushKV(broken);
check('tally restored when the fold fails', api.pending, { reads: 2, writes: 2, deletes: 0, lists: 0 });

// 6. usage reports shared tally plus this isolate's unflushed remainder
const usage = await api.kvUsage({ TRIPPIN: kv });
check('usage adds pending to stored', [usage.reads, usage.writes], [1 + 3, 2 + 2]);
check('usage carries the limits', usage.limits, api.KV_LIMITS);

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
