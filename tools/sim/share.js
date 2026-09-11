'use strict';
/* ===========================================================================
   share.js — checks that the TripPin share grid never leaks which of the
   three rounds were host rounds.

   Loads the real src/game.js in a vm context (boot() never runs because
   document.readyState stays 'loading'), pulls T.gridText / T.fmtMiles /
   T.proximityBar off window.TripPin, and throws a large seeded batch of
   synthetic round results at it: every host/normal pattern across the three
   rounds, every host "kind", and three skill archetypes (plus every mixed
   combination of those archetypes across the rounds).

   For every generated grid we check:
     1. every row starts with the same glyph (📌), never a house glyph, a
        format name, or any extra token — host or not.
     2. the row vocabulary (mark, bar squares, distance text) is identical
        whether the row came from a host round or a normal round.
     3. the tail's "best" and "off" numbers are exactly the min and sum of
        the row distances, formatted with the game's own fmtMiles.
   Then, as a statistical fingerprint check, we pool all rows by host/normal
   and compare the distribution of (bar fill count, mark) between the pools.
   =========================================================================== */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// --------------------------------------------------------------------------
// 1. Load the real game.js into a vm context without letting boot() run.
// --------------------------------------------------------------------------

const GAME_PATH = path.join(__dirname, '..', '..', 'src', 'game.js');
const src = fs.readFileSync(GAME_PATH, 'utf8');

const STUBS_ADDED = [];

const window = {
  SETTINGS: {},
  CREW: [],
  STAYS: [],
  matchMedia: () => ({ matches: false }),
};
// game.js reads `window.Listing.render` / `.avatar` at module top level
// (it destructures the shared listing-card renderer out of a sibling
// script). Nothing else in this file touches it, so a pair of no-op stubs
// is enough to let the module finish loading.
window.Listing = { render() {}, avatar() {} };
STUBS_ADDED.push('window.Listing = { render(){}, avatar(){} } (game.js reads window.Listing.render/.avatar at top level)');

// NOT a stub: the real module. game.js builds CFG out of Host.SCORE and
// scores the pin half with Host.wherePoints, so the grid this file audits
// is graded by the same constants the Worker uses.
window.Host = require(path.join(__dirname, '..', '..', 'src', 'host.js'));

const document = {
  readyState: 'loading',
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
const localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
const ctx = {
  window, document, localStorage,
  location: { protocol: 'https:', search: '', origin: 'https://x', pathname: '/' },
  navigator: {},
  console,
  URLSearchParams, URL,
  history: { replaceState() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (f) => f(),
  AbortController,
  fetch: () => Promise.reject(new Error('no')),
  Math, Date, JSON, Object, Array, String, Number, Promise, Error,
};
ctx.window.window = ctx.window;
vm.createContext(ctx);

try {
  vm.runInContext(src, ctx, { filename: GAME_PATH });
} catch (e) {
  console.error('Failed to load game.js into vm context: ' + e.stack);
  process.exit(1);
}

const T = ctx.window.TripPin;
if (!T || typeof T.gridText !== 'function' || typeof T.fmtMiles !== 'function') {
  console.error('window.TripPin did not come out of game.js with the expected shape.');
  process.exit(1);
}

// --------------------------------------------------------------------------
// 2. Seeded PRNG (mulberry32) — deterministic, dependency-free.
// --------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260911);
function range(lo, hi) { return lo + rng() * (hi - lo); }

// --------------------------------------------------------------------------
// 3. Round generation: every host/normal pattern, every kind, three skill
//    archetypes plus every mixed permutation of them across the rounds.
// --------------------------------------------------------------------------

const KINDS = ['pin', 'personpin', 'peoplepin', 'choicepin', 'people'];
const ARCHETYPES = ['sharp', 'average', 'blind'];

function distFor(archetype) {
  if (archetype === 'sharp') return range(5, 80);
  if (archetype === 'average') return range(80, 1200);
  return range(2000, 9000); // blind
}
function tierFor(archetype) {
  if (archetype === 'sharp') return 'hit';
  if (archetype === 'average') return 'mid';
  return 'miss';
}

// One result object per round.
//
// THE JUDGEMENT HALF IS SCORED THE WAY EACH KIND ACTUALLY SCORES IT.
//
// This used to synthesise whoPts from the archetype tier for host and normal
// rounds alike, which made the two pools identical by construction and meant
// the audit below could not fail. It duly passed while six of the seven host
// formats were incapable of rendering a cross at all.
function hostWhoPts(kind, tier) {
  if (tier === 'hit') return 200;
  // Wrong, but every host format except `near` floors its near-miss credit
  // well above zero: gradeChoice bottoms out near 14 and personpin's rank
  // credit near 18. Nothing here may return a clean 0 for those.
  if (kind === 'personpin') return tier === 'mid' ? 90 : 18;
  if (kind === 'choicepin') return tier === 'mid' ? 82 : 14;
  return tier === 'mid' ? 100 : 0;              // peoplepin can be a clean miss
}

function buildResult(isHost, kind, archetype) {
  const dist = distFor(archetype);
  const tier = tierFor(archetype);

  if (isHost && kind === 'pin') {
    let wherePts;
    if (tier === 'hit') wherePts = Math.round(range(680, 1000));
    else if (tier === 'mid') wherePts = Math.round(range(250, 679));
    else wherePts = Math.round(range(0, 249));
    return { host: true, kind: 'pin', dist, wherePts, whoPts: 0, whoCorrect: false, pts: wherePts };
  }

  let whoPts, whoCorrect;
  if (isHost) {
    whoPts = hostWhoPts(kind, tier);
    whoCorrect = tier === 'hit';
  } else if (tier === 'hit') { whoCorrect = true; whoPts = 200; }
  else if (tier === 'mid') { whoCorrect = false; whoPts = 100; }
  else { whoCorrect = false; whoPts = 0; }

  const wherePts = T.wherePoints(dist); // the real 0-800 decay curve
  const pts = wherePts + whoPts;
  const result = { host: !!isHost, dist, wherePts, whoPts, whoCorrect, pts };
  if (isHost) result.kind = kind;
  return result;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    permutations(rest).forEach((p) => out.push([arr[i]].concat(p)));
  }
  return out;
}

const ARCHETYPE_SCHEMES = [
  ['sharp', 'sharp', 'sharp'],
  ['average', 'average', 'average'],
  ['blind', 'blind', 'blind'],
].concat(permutations(ARCHETYPES)); // + all 6 mixed permutations = 9 schemes

const PATTERNS = [];
for (let a = 0; a < 2; a++) {
  for (let b = 0; b < 2; b++) {
    for (let c = 0; c < 2; c++) {
      PATTERNS.push([!!a, !!b, !!c]);
    }
  }
}

const grids = [];
for (const pattern of PATTERNS) {
  const hostCount = pattern.filter(Boolean).length;
  const kindRotations = hostCount > 0 ? [0, 1, 2, 3, 4] : [null];
  for (const k of kindRotations) {
    const kinds = pattern.map((isHost, idx) => (isHost ? KINDS[(k + idx) % 5] : undefined));
    for (const scheme of ARCHETYPE_SCHEMES) {
      const results = pattern.map((isHost, idx) => buildResult(isHost, kinds[idx], scheme[idx]));
      const text = T.gridText(results, 0, 0);
      grids.push({ pattern, kinds, scheme, results, text });
    }
  }
}

// --------------------------------------------------------------------------
// 4. Parse + assert every grid.
// --------------------------------------------------------------------------

const ROW_RE = /^📌 ([🟩🟨🟧🟦⬜]{5}) (.+) ([✔~✘])$/u;
const BAR_RE = /^[🟩🟨🟧🟦⬜]{5}$/u;
const DIST_NUM_RE = /^[\d,]+(\.\d+)? mi$/;
const FILL_RE = /[🟩🟨🟧🟦]/gu;

function parseGrid(text) {
  const lines = text.split('\n');
  const rows = lines.slice(1, 4);
  const tailLine = lines[4];
  return { rows, tailLine };
}

function parseRow(line) {
  const m = ROW_RE.exec(line || '');
  if (!m) return null;
  return { bar: m[1], distText: m[2], mark: m[3] };
}

let gridsGenerated = 0;
let assertionsPassed = 0;
let assertionsFailed = 0;
let firstFailure = null;

const hostPool = [];
const normalPool = [];

function fail(grid, message) {
  assertionsFailed++;
  if (!firstFailure) {
    firstFailure = { message, grid: grid.text, pattern: grid.pattern, kinds: grid.kinds, scheme: grid.scheme };
  }
}

for (const grid of grids) {
  gridsGenerated++;
  const { rows, tailLine } = parseGrid(grid.text);
  const parsedRows = rows.map(parseRow);
  let rowsOk = true;

  parsedRows.forEach((pr, idx) => {
    if (!pr) {
      fail(grid, 'Row ' + (idx + 1) + ' did not match the expected "📌 <bar> <dist> <mark>" shape: ' + JSON.stringify(rows[idx]));
      rowsOk = false;
      return;
    }
    if (!BAR_RE.test(pr.bar)) {
      fail(grid, 'Row ' + (idx + 1) + ' bar used a glyph outside 🟩🟨🟧🟦⬜: ' + pr.bar);
      rowsOk = false;
    }
    if (pr.mark !== '✔' && pr.mark !== '~' && pr.mark !== '✘') {
      fail(grid, 'Row ' + (idx + 1) + ' mark was not one of ✔ ~ ✘: ' + pr.mark);
      rowsOk = false;
    }
    const distOk = pr.distText === 'right on it' || pr.distText === '—' || DIST_NUM_RE.test(pr.distText);
    if (!distOk) {
      fail(grid, 'Row ' + (idx + 1) + ' distance text was not "N mi" / "right on it" / "—": ' + JSON.stringify(pr.distText));
      rowsOk = false;
    }
  });

  // Tail: best = min(dist), off = sum(dist), both via the game's own fmtMiles.
  const dists = grid.results.map((r) => r.dist).filter((d) => typeof d === 'number');
  if (dists.length) {
    const best = Math.min.apply(null, dists);
    const off = dists.reduce((a, b) => a + b, 0);
    const expectedTail = '🧭 best ' + T.fmtMiles(best) + ' · ' + T.fmtMiles(off) + ' off';
    if (tailLine !== expectedTail) {
      fail(grid, 'Tail mismatch — got ' + JSON.stringify(tailLine) + ', expected ' + JSON.stringify(expectedTail));
      rowsOk = false;
    }
  }

  if (rowsOk) {
    assertionsPassed++;
    grid.results.forEach((r, idx) => {
      const pr = parsedRows[idx];
      const fillCount = (pr.bar.match(FILL_RE) || []).length;
      const entry = { fillCount, mark: pr.mark };
      (r.host ? hostPool : normalPool).push(entry);
    });
  }
}

// --------------------------------------------------------------------------
// 5. Statistical fingerprint check: (bar fill count, mark) distribution,
//    host rounds vs normal rounds, same archetype mix.
// --------------------------------------------------------------------------

function distribution(pool) {
  const counts = {};
  pool.forEach(({ fillCount, mark }) => {
    const key = fillCount + '|' + mark;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

const hostDist = distribution(hostPool);
const normalDist = distribution(normalPool);
const allKeys = Array.from(new Set(Object.keys(hostDist).concat(Object.keys(normalDist))))
  .sort((a, b) => {
    const [af, am] = a.split('|');
    const [bf, bm] = b.split('|');
    if (af !== bf) return Number(bf) - Number(af);
    return am.localeCompare(bm);
  });

const MARK_ORDER = { '✔': 0, '~': 1, '✘': 2 };
allKeys.sort((a, b) => {
  const [af, am] = a.split('|');
  const [bf, bm] = b.split('|');
  if (af !== bf) return Number(bf) - Number(af);
  return MARK_ORDER[am] - MARK_ORDER[bm];
});

const hostTotal = hostPool.length;
const normalTotal = normalPool.length;

function pct(n, total) { return total ? ((n / total) * 100).toFixed(1) + '%' : '0.0%'; }

const distLines = [];
distLines.push('fill  mark  | host rows          | normal rows');
distLines.push('----- ----- | ------------------ | ------------------');
let anomalies = [];
allKeys.forEach((key) => {
  const [fill, mark] = key.split('|');
  const h = hostDist[key] || 0;
  const n = normalDist[key] || 0;
  distLines.push(
    '  ' + fill + '    ' + mark + '   | ' + String(h).padStart(5) + ' (' + pct(h, hostTotal).padStart(6) + ')  | ' +
    String(n).padStart(5) + ' (' + pct(n, normalTotal).padStart(6) + ')'
  );
  const hp = hostTotal ? h / hostTotal : 0;
  const np = normalTotal ? n / normalTotal : 0;
  if (Math.abs(hp - np) > 0.05) {
    anomalies.push(key + ': host ' + pct(h, hostTotal) + ' vs normal ' + pct(n, normalTotal));
  }
});

// --------------------------------------------------------------------------
// 6. Write 12 sample grids covering all 8 host/normal patterns.
// --------------------------------------------------------------------------

function labelFor(pattern, kinds) {
  const hostRounds = [];
  pattern.forEach((isHost, idx) => {
    if (isHost) hostRounds.push((idx + 1) + ' (' + kinds[idx] + ')');
  });
  return hostRounds.length ? 'Host rounds: ' + hostRounds.join(', ') : 'Host rounds: none';
}

function findGrid(pattern, kindRotation, schemeIdx) {
  return grids.find((g) =>
    g.pattern.every((v, i) => v === pattern[i]) &&
    (kindRotation === null
      ? g.kinds.every((k) => k === undefined)
      : g.kinds.every((k, i) => k === (pattern[i] ? KINDS[(kindRotation + i) % 5] : undefined))) &&
    g.scheme.join(',') === ARCHETYPE_SCHEMES[schemeIdx].join(',')
  );
}

const sampleSpecs = [];
// One of each of the 8 patterns, rotation 0 (or null when no host rounds), scheme 0.
PATTERNS.forEach((pattern) => {
  const hostCount = pattern.filter(Boolean).length;
  sampleSpecs.push({ pattern, rotation: hostCount > 0 ? 0 : null, schemeIdx: 0 });
});
// 4 more, showing different kinds / archetype mixes for the patterns that have host rounds.
const extra = PATTERNS.filter((p) => p.some(Boolean)).slice(0, 4);
extra.forEach((pattern) => {
  sampleSpecs.push({ pattern, rotation: 2, schemeIdx: 4 });
});

const sampleLines = [];
sampleSpecs.forEach((spec, i) => {
  const g = findGrid(spec.pattern, spec.rotation, spec.schemeIdx);
  if (!g) return;
  sampleLines.push('=== Sample ' + (i + 1) + ' — ' + labelFor(g.pattern, g.kinds) + ' ===');
  sampleLines.push(g.text);
  sampleLines.push('');
});

const SAMPLES_PATH = path.join(__dirname, 'share-samples.txt');
fs.writeFileSync(SAMPLES_PATH, sampleLines.join('\n'), 'utf8');

// --------------------------------------------------------------------------
// 7. Print summary.
// --------------------------------------------------------------------------

console.log('TripPin share.js grid audit');
console.log('============================');
console.log('Grids generated: ' + gridsGenerated);
console.log('Assertions passed: ' + assertionsPassed);
console.log('Assertions failed: ' + assertionsFailed);
if (firstFailure) {
  console.log('');
  console.log('First failing example:');
  console.log('  message: ' + firstFailure.message);
  console.log('  pattern (host/normal per round): ' + JSON.stringify(firstFailure.pattern));
  console.log('  kinds: ' + JSON.stringify(firstFailure.kinds));
  console.log('  archetype scheme: ' + JSON.stringify(firstFailure.scheme));
  console.log('  grid text:');
  firstFailure.grid.split('\n').forEach((l) => console.log('    ' + l));
}
console.log('');
console.log('Distribution of (bar fill count, mark) — host rounds vs normal rounds:');
console.log('  host rows: ' + hostTotal + ', normal rows: ' + normalTotal);
distLines.forEach((l) => console.log(l));
console.log('');
if (anomalies.length) {
  console.log('Possible fingerprint (>5 pt gap not explained by archetype mix):');
  anomalies.forEach((a) => console.log('  ' + a));
} else {
  console.log('No fingerprint found: host and normal row distributions match within 5 points at every (fill, mark) cell.');
}
console.log('');
console.log('Sample grids written to: ' + SAMPLES_PATH);

process.exit(assertionsFailed > 0 ? 1 : 0);
