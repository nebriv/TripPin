/* ===========================================================================
   balance.js — offline balance simulator for TripPin's host-round formats.

   Simulates three player archetypes (blind / average / sharp) against the
   normal round and each of the eight host formats from src/host.js, using a
   synthetic, evenly-owned deck built from the real 41 stays (coordinates and
   `coast` fields kept, owner/crew reassigned round-robin across the five
   players so the host-round rate is not skewed by ben owning every stay).

   Usage:  node tools/sim/balance.js [--days N] [--seed N]
   =========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const Host = require('../../src/host.js');
const HAV = Host._internals.hav;
const MI_PER_RAD = 3958.7613;

const PLAYERS = ['ben', 'benjamin', 'andrew', 'maddie', 'anna'];

// The four formats whose "target" is a constructed point (an antipode, a
// latitude-matched city, a penguin colony, a coastline point) rather than a
// place someone actually stayed. Only their `average` numbers are meaningful
// against the normal round's geography-driven curve, so the ship gate is
// applied to `average` only for these.
const TARGET_IS_CONSTRUCTED = new Set(['coast', 'level', 'antipode', 'penguin']);

/* ------------------------------------------------------------------ CLI -- */

function parseArgs(argv) {
  const out = { days: 60, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') out.days = parseInt(argv[++i], 10);
    else if (argv[i] === '--seed') out.seed = parseInt(argv[++i], 10);
  }
  return out;
}

/* ------------------------------------------------------------------ PRNG -- */

// Same generator host.js uses, so behaviour here is reproducible the same way.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

/* --------------------------------------------------------- data loading -- */

function loadRealDeck() {
  const src = fs.readFileSync(path.join(__dirname, '../../src/stays.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'stays.js' });
  return { crew: sandbox.window.CREW, stays: sandbox.window.STAYS };
}

// The file is `export default [ [name,lng,lat], ... ].map(...)`. We only want
// the array literal, so find it by bracket-matching rather than assuming the
// trailing `.map` isn't there (it is, in the shipped file).
function loadCities() {
  const text = fs.readFileSync(path.join(__dirname, '../../worker/src/cities.js'), 'utf8');
  const from = text.indexOf('export default');
  const start = text.indexOf('[', from);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const rows = JSON.parse(text.slice(start, end + 1));
  return rows.map(function (r) { return { name: r[0], lng: r[1], lat: r[2], rank: 0 }; });
}

// Only `ben` owns any real stay, so a straight replay would host-round ben
// four-fifths of the time and nobody else almost never. Reassign owner/crew
// round-robin across the five players, keeping real coordinates, `coast`
// fields, and the real crew-size distribution (16 solo / 17 pairs / 8 trios),
// so every player ends up hosting roughly a fifth of the deck.
function buildSyntheticDeck(realStays, rnd) {
  const order = shuffleInPlace(realStays.slice(), rnd);
  return order.map(function (s, i) {
    const owner = PLAYERS[i % PLAYERS.length];
    const size = (s.crew && s.crew.length) || 1;
    const others = shuffleInPlace(PLAYERS.filter(function (p) { return p !== owner; }), rnd)
      .slice(0, size - 1);
    return Object.assign({}, s, { booker: owner, crew: [owner].concat(others) });
  });
}

function partyOf(stay) { return (stay.crew && stay.crew.length) ? stay.crew : [stay.booker]; }

/* ------------------------------------------------------------- geometry -- */

function destPoint(lat, lng, bearingDeg, distMiles) {
  const d2r = Math.PI / 180, r2d = 180 / Math.PI;
  const brng = bearingDeg * d2r;
  const ang = distMiles / MI_PER_RAD;
  const lat1 = lat * d2r, lng1 = lng * d2r;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
    Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2)
  );
  const lngDeg = ((lng2 * r2d + 540) % 360) - 180;
  return { lat: lat2 * r2d, lng: lngDeg };
}

function randomPointOnSphere(rnd) {
  const u = rnd(), v = rnd();
  return { lat: Math.asin(2 * u - 1) * 180 / Math.PI, lng: v * 360 - 180 };
}

function logNormalMiles(rnd, medianMiles, sigma) {
  let u1 = rnd();
  if (u1 <= 1e-12) u1 = 1e-12;
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // Box-Muller
  return medianMiles * Math.exp(sigma * z);
}

/* -------------------------------------------------------- archetypes -- */

// Pin half, identical machinery for the normal round and every host format.
function archetypePin(archetype, target, rnd) {
  if (archetype === 'blind') return randomPointOnSphere(rnd);
  const median = archetype === 'average' ? 300 : 40;
  const sigma = archetype === 'average' ? 1.0 : 0.8;
  const dist = logNormalMiles(rnd, median, sigma);
  const bearing = rnd() * 360;
  return destPoint(target.lat, target.lng, bearing, dist);
}

// Set-valued judgement: normal round's "who was there", and peoplepin's tick
// list. `allowEmpty` governs whether blind's random subset may come up empty.
function archetypeSet(archetype, candidates, trueSet, rnd, allowEmpty) {
  if (archetype === 'blind') {
    let out;
    do {
      out = candidates.filter(function () { return rnd() < 0.5; });
    } while (!allowEmpty && out.length === 0);
    return out;
  }
  const exactP = archetype === 'sharp' ? 0.90 : 0.55;
  if (rnd() < exactP) return trueSet.slice();
  const toggled = trueSet.slice();
  const who = pick(candidates, rnd);
  const idx = toggled.indexOf(who);
  if (idx === -1) toggled.push(who); else toggled.splice(idx, 1);
  return toggled;
}

// Single-valued judgement: personpin's "who", and choicepin's four-way pick.
function archetypeChoice(archetype, candidates, accepted, rnd) {
  if (archetype === 'blind') return pick(candidates, rnd);
  const rightP = archetype === 'sharp' ? 0.85 : 0.55;
  if (rnd() < rightP) {
    const acc = accepted.filter(function (c) { return candidates.indexOf(c) !== -1; });
    return pick(acc.length ? acc : candidates, rnd);
  }
  const wrong = candidates.filter(function (c) { return accepted.indexOf(c) === -1; });
  return pick(wrong.length ? wrong : candidates, rnd);
}

/* --------------------------------------------------------- host rounds -- */

function buildGuess(spec, archetype, rnd) {
  const guess = {};
  if (spec.kind === 'personpin') {
    const candidates = spec.people || [];
    const accepted = (spec.answers && spec.answers.length) ? spec.answers : [spec.answer];
    guess.person = archetypeChoice(archetype, candidates, accepted, rnd);
    const tgt = (spec.targetFor && spec.targetFor[guess.person]) || spec.target;
    guess.at = archetypePin(archetype, tgt, rnd);
  } else if (spec.kind === 'peoplepin') {
    const candidates = spec.people || [];
    const trueSet = spec.answer || [];
    guess.people = archetypeSet(archetype, candidates, trueSet, rnd, true);
    guess.at = archetypePin(archetype, spec.target, rnd);
  } else if (spec.kind === 'choicepin') {
    const candidates = (spec.options || []).map(function (o) { return o.key; });
    guess.key = archetypeChoice(archetype, candidates, [spec.answer], rnd);
    guess.at = archetypePin(archetype, spec.target, rnd);
  } else if (spec.kind === 'pin') {
    guess.at = archetypePin(archetype, spec.target, rnd);
  }
  return guess;
}

// Build the (player, stay) pairs a format could ever be dealt for, i.e. the
// player is on the crew and the format's own `available` gate passes.
function eligiblePairs(fmtDef, ctx0, deck) {
  const pairs = [];
  PLAYERS.forEach(function (player) {
    deck.forEach(function (stay) {
      if (partyOf(stay).indexOf(player) === -1) return;
      const ctx = Object.assign({}, ctx0, { me: player });
      if (fmtDef.available(ctx, stay)) pairs.push({ player: player, stay: stay });
    });
  });
  return pairs;
}

function sampleHostFormat(fmt, archetype, ctx0, deck, rnd, minSamples) {
  const fmtDef = Host.byId[fmt];
  const pairs = eligiblePairs(fmtDef, ctx0, deck);
  const points = [];
  if (!pairs.length) return points;
  let guard = 0;
  const guardMax = minSamples * 50;
  while (points.length < minSamples && guard < guardMax) {
    guard++;
    const pr = pick(pairs, rnd);
    const ctx = Object.assign({}, ctx0, { me: pr.player });
    const spec = fmtDef.build(ctx, pr.stay, rnd);
    spec.fmt = fmt;
    spec.kind = fmtDef.kind;
    const guess = buildGuess(spec, archetype, rnd);
    const result = Host.score(spec, guess);
    points.push(result.pts);
  }
  return points;
}

/* ------------------------------------------------------------- normal -- */

function sampleNormal(archetype, deck, rnd, minSamples) {
  const pairs = [];
  PLAYERS.forEach(function (player) {
    deck.forEach(function (stay) {
      if (partyOf(stay).indexOf(player) !== -1) return; // host rounds excluded
      pairs.push({ player: player, stay: stay });
    });
  });
  const points = [];
  if (!pairs.length) return points;
  let guard = 0;
  const guardMax = minSamples * 50;
  while (points.length < minSamples && guard < guardMax) {
    guard++;
    const pr = pick(pairs, rnd);
    const stay = pr.stay;
    const trueSet = partyOf(stay);
    const who = archetypeSet(archetype, PLAYERS, trueSet, rnd, false);
    const at = archetypePin(archetype, { lat: stay.lat, lng: stay.lng }, rnd);
    const dist = HAV(at.lat, at.lng, stay.lat, stay.lng);
    const wherePts = dist <= 50 ? 800 : Math.round(800 * Math.exp(-dist / 600));
    const union = {};
    trueSet.concat(who).forEach(function (id) { union[id] = 1; });
    const hits = who.filter(function (id) { return trueSet.indexOf(id) !== -1; }).length;
    const unionSize = Object.keys(union).length;
    const whoPts = unionSize ? Math.round(200 * hits / unionSize) : 0;
    points.push(wherePts + whoPts);
  }
  return points;
}

/* --------------------------------------------------------------- stats -- */

function meanSd(arr) {
  const n = arr.length;
  if (!n) return { mean: NaN, sd: NaN, n: 0 };
  const mean = arr.reduce(function (a, b) { return a + b; }, 0) / n;
  const variance = arr.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / n;
  return { mean: mean, sd: Math.sqrt(variance), n: n };
}

function fmt1(x) { return Number.isFinite(x) ? x.toFixed(1) : 'n/a'; }

/* ---------------------------------------------------------------- main -- */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rnd = mulberry32(args.seed);

  const real = loadRealDeck();
  const cities = loadCities();
  const deck = buildSyntheticDeck(real.stays, rnd);
  const allIds = deck.map(function (s) { return s.id; });

  const ctx0 = {
    crew: real.crew,
    stays: deck,
    cities: cities,
    seen: allIds,
    dayIndex: 0,
    round: 0,
    used: [],
  };

  const minSamples = Math.max(2000, args.days * 3 * PLAYERS.length);
  const archetypes = ['blind', 'average', 'sharp'];
  const formatIds = Host.FORMATS.map(function (f) { return f.id; });

  const results = { normal: {} };
  archetypes.forEach(function (arch) {
    results.normal[arch] = meanSd(sampleNormal(arch, deck, rnd, minSamples));
  });

  formatIds.forEach(function (fmt) {
    results[fmt] = {};
    archetypes.forEach(function (arch) {
      results[fmt][arch] = meanSd(sampleHostFormat(fmt, arch, ctx0, deck, rnd, minSamples));
    });
  });

  // ------------------------------------------------------------- report --

  const rows = [['normal'].concat(formatIds)];
  const header = '| format | blind mean | blind sd | average mean | average sd | sharp mean | sharp sd | mean vs normal (avg) | sd ratio (avg) |';
  const sep = '|---|---|---|---|---|---|---|---|---|';
  const lines = [header, sep];

  ['normal'].concat(formatIds).forEach(function (fmt) {
    const r = results[fmt];
    const norm = results.normal.average;
    const meanDiff = fmt === 'normal' ? 0 : r.average.mean - norm.mean;
    const sdRatio = fmt === 'normal' ? 1 : (norm.sd ? r.average.sd / norm.sd : NaN);
    lines.push(
      '| ' + fmt +
      ' | ' + fmt1(r.blind.mean) + ' | ' + fmt1(r.blind.sd) +
      ' | ' + fmt1(r.average.mean) + ' | ' + fmt1(r.average.sd) +
      ' | ' + fmt1(r.sharp.mean) + ' | ' + fmt1(r.sharp.sd) +
      ' | ' + (fmt === 'normal' ? '-' : (meanDiff >= 0 ? '+' : '') + fmt1(meanDiff)) +
      ' | ' + (fmt === 'normal' ? '-' : fmt1(sdRatio)) +
      ' |'
    );
  });

  console.log(lines.join('\n'));
  console.log('');

  formatIds.forEach(function (fmt) {
    const restrictToAverage = TARGET_IS_CONSTRUCTED.has(fmt);
    const archsToCheck = restrictToAverage ? ['average'] : archetypes;
    let pass = true;
    const reasons = [];
    archsToCheck.forEach(function (arch) {
      const norm = results.normal[arch];
      const f = results[fmt][arch];
      const meanDiff = Math.abs(f.mean - norm.mean);
      const sdRatio = norm.sd ? f.sd / norm.sd : NaN;
      const meanOk = meanDiff <= 50;
      const sdOk = Number.isFinite(sdRatio) && sdRatio >= 0.8 && sdRatio <= 1.2;
      if (!meanOk) reasons.push(arch + ': mean off by ' + fmt1(meanDiff));
      if (!sdOk) reasons.push(arch + ': sd ratio ' + fmt1(sdRatio));
      if (!meanOk || !sdOk) pass = false;
    });
    const gateNote = restrictToAverage ? ' (gated on average only — constructed target)' : '';
    console.log(
      fmt + ': ' + (pass ? 'PASS' : 'FAIL') + gateNote +
      (reasons.length ? ' — ' + reasons.join('; ') : '')
    );
  });
}

main();
