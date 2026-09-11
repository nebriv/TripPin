// pool-writes.mjs - checks that two friends importing at once do not overwrite
// each other.
//
// The deck is one KV value and a submission is a read, a merge and a write, so
// the obvious implementation loses whichever friend was a second earlier and
// says nothing about it. worker/src/index.js queues writes within an isolate
// and stamps a revision; this drives that code directly, against a fake
// binding, with the calls deliberately overlapped.
//
// Run with: node tools/sim/pool-writes.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Normalised to LF so the markers below need not care that the worker source
// is CRLF.
const src = fs.readFileSync(
  path.resolve(__dirname, '../../worker/src/index.js'), 'utf8')
  .split('\r\n').join('\n');

// Pull out just the storage layer, taken from the file rather than restated
// so this cannot drift away from what actually runs. A '\n}' end marker means
// the first closing brace in column one, which is the end of the function.
function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`could not find ${from} .. ${to}`);
  return src.slice(a, b + to.length);
}

const block = [
  slice("const KEY = 'stays:v1';", "const BACKUP_KEY = 'stays:v1:previous';"),
  slice('let poolCache = null;', 'function dropPoolCache() { poolCache = null; }'),
  slice('let poolWriteQueue', '\n}'),
  slice('function revOf(pool)', '\n}'),
  slice('function readPoolFresh(env)', '\n}'),
  slice('async function writePool', '\n}'),
  slice('async function readPool(env)', '\n}'),
].join('\n');

const ctx = vm.createContext({ console, Date, Promise, Array, JSON, Object, setTimeout });
vm.runInContext(
  block + '\nglobalThis.__api = { writePool, dropPoolCache };', ctx);
const { writePool, dropPoolCache } = ctx.__api;

let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    fails++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  } else console.log(`ok   ${name}`);
};

function fakeKV(latencyMs = 2) {
  const store = new Map();
  const wait = () => new Promise((r) => setTimeout(r, latencyMs));
  return {
    store,
    get: async (k, t) => {
      await wait();
      const v = store.get(k);
      return t === 'json' && v ? JSON.parse(v) : (v === undefined ? null : v);
    },
    put: async (k, v) => { await wait(); store.set(k, v); },
  };
}

// A submission: replace this owner's stays, leave everyone else's alone - the
// same shape handlePost builds.
const submit = (owner, n) => (pool, retried) => {
  const kept = pool.stays.filter((s) => s.owner !== owner);
  const mine = Array.from({ length: n }, (_, i) => ({ owner, place: `${owner}-${i}` }));
  const entry = { owner, was: pool.stays.filter((s) => s.owner === owner).length };
  if (retried) entry.retried = retried;
  return {
    next: {
      crew: pool.crew,
      stays: kept.concat(mine),
      writes: (pool.writes || []).concat(entry),
    },
    replaced: entry.was,
    total: kept.length + n,
  };
};

// 1. two imports fired without awaiting the first - the case that loses data
const env = { TRIPPIN: fakeKV() };
dropPoolCache();
const [a, b] = await Promise.all([
  writePool(env, submit('andrew', 3)),
  writePool(env, submit('maddie', 2)),
]);
const pool = JSON.parse(env.TRIPPIN.store.get('stays:v1'));
const owners = {};
for (const s of pool.stays) owners[s.owner] = (owners[s.owner] || 0) + 1;
check('both imports survive a dead heat', owners, { andrew: 3, maddie: 2 });
check('both callers were told it worked', [!!a, !!b], [true, true]);
check('the second write saw the first', pool.writes.length, 2);
check('rev counted both writes', pool.rev, 2);
check('backup holds the generation before',
  JSON.parse(env.TRIPPIN.store.get('stays:v1:previous')).stays.length, 3);

// 2. a writer beaten to every turn is told so rather than clobbering
const env2 = { TRIPPIN: fakeKV() };
dropPoolCache();
await writePool(env2, submit('ben', 1));
const realGet = env2.TRIPPIN.get.bind(env2.TRIPPIN);
let bumped = 0;
env2.TRIPPIN.get = async (k, t) => {
  const v = await realGet(k, t);
  // Somebody else lands a write between every read and its write.
  if (k === 'stays:v1' && v) { bumped += 1; return { ...v, rev: (v.rev || 0) + bumped }; }
  return v;
};
check('a writer that never gets a clean turn returns null',
  await writePool(env2, submit('anna', 4)), null);
check('and wrote nothing',
  JSON.parse(env2.TRIPPIN.store.get('stays:v1')).stays.length, 1);

// 3. a merge that throws does not wedge the queue behind it
const env3 = { TRIPPIN: fakeKV() };
dropPoolCache();
const boom = writePool(env3, () => { throw new Error('merge blew up'); });
const after = writePool(env3, submit('ben', 2));
await boom.catch(() => {});
check('the next writer still gets its turn', (await after).total, 2);

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
