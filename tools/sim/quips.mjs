/* ===========================================================================
   tools/sim/quips.mjs — a season-long dry run of worker/src/quips.js.

   Builds a synthetic-but-realistic deck out of the real 41 stays, deals a
   day's worth of cards to five players for 60 days x 3 rounds, simulates a
   plausible scored result per round with a seeded PRNG, and calls quip() on
   every one of them. Writes every line to quips-season.txt and prints a
   summary of how often the game actually has something to say.

   No dependencies. Node >= 18 (uses top-level await). Run with:
     node tools/sim/quips.mjs
   =========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const toURL = (p) => pathToFileURL(p).href;

/* ---------------------------------------------------------------------------
   Load the code under test.
   --------------------------------------------------------------------------- */

let quipMod = null;
let quipImportError = null;
try {
  quipMod = await import(toURL(path.join(ROOT, 'worker', 'src', 'quips.js')));
} catch (e) {
  quipImportError = e;
}

if (quipImportError) {
  console.log('Could not import worker/src/quips.js:');
  console.log(quipImportError && quipImportError.stack ? quipImportError.stack : quipImportError);
  console.log(
    'This is likely the ../../src/host.js interop the task warned about ' +
    '(a UMD module whose default ESM import can come back empty). ' +
    'Not editing quips.js to work around it, per instructions.'
  );
  process.exit(1);
}

const { quip, _internals: quipInternals } = quipMod;

// host.js is a plain UMD file with no package.json marking it ESM, so it is
// CommonJS by Node's rules; require() it directly rather than relying on the
// default-import interop (quips.js itself gets away with `import Host from
// '../../src/host.js'` for the same reason: Node's CJS/ESM interop binds a
// CJS module's default export to the whole of module.exports).
const Host = require(path.join(ROOT, 'src', 'host.js'));
const hav = Host._internals.hav;
const regionOf = Host._internals.regionOf;
const REGIONS = Host._internals.REGIONS;

const citiesMod = await import(toURL(path.join(ROOT, 'worker', 'src', 'cities.js')));
const CITIES = citiesMod.default; // [{ name, lng, lat, rank }, ...]

/* ---------------------------------------------------------------------------
   Seeded PRNG (mulberry32, same shape as the one in quips.js / host.js).
   --------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x54524950; // 'TRIP'
const rnd = mulberry32(SEED);

function randInt(lo, hi) { return Math.floor(rnd() * (hi - lo + 1)) + lo; }
function randFloat(lo, hi) { return rnd() * (hi - lo) + lo; }
function pick(list) { return list[Math.floor(rnd() * list.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------------------------------------------------------------------
   Load the real stays.js (assigns window.CREW / window.STAYS).
   --------------------------------------------------------------------------- */

const staysSrc = fs.readFileSync(path.join(ROOT, 'src', 'stays.js'), 'utf8');
const staysSandbox = { window: {} };
vm.runInNewContext(staysSrc, staysSandbox);
const REAL_STAYS = staysSandbox.window.STAYS;

const PLAYERS = ['player1', 'player2', 'player3', 'player4', 'player5'];
const NAMES = {
  player1: 'Player 1', player2: 'Player 2', player3: 'Player 3',
  player4: 'Player 4', player5: 'Player 5',
};

/* ---------------------------------------------------------------------------
   Build the synthetic, balanced deck: real coordinates/place/amenities/
   nights, round-robin owner, crew of the owner plus 0-2 others, and a story
   on about a third of the deck.
   --------------------------------------------------------------------------- */

const STORY_BANK = [
  'the shower was a hose bolted to the garden wall',
  'the wifi worked but only if you stood on a chair',
  'a rooster started at four and never really stopped',
  'the fridge hummed loud enough to hear from the road',
  'the front door needed a shoulder, not a key',
  'the hot tub was cold and the pool was a puddle',
  'the mattress had a valley you both rolled into',
  'the host left a single roll of paper towels, total',
  'the view was incredible if you leaned out the window',
  'the driveway ate two rental cars that same week',
  'the kitchen had every spice except the one we needed',
  'the sauna smelled faintly of the previous guests',
  'the lake was closer than the map made it look',
  'the fireplace worked once and then never again',
  'the balcony had a view worth the missing railing',
];

const DECK = REAL_STAYS.map((s, i) => {
  const owner = PLAYERS[i % PLAYERS.length];
  const others = PLAYERS.filter((p) => p !== owner);
  const extraCount = randInt(0, 2);
  const crew = [owner, ...shuffle(others).slice(0, extraCount)];
  return {
    id: s.id,
    place: s.place,
    lat: s.lat,
    lng: s.lng,
    amenities: s.amenities || [],
    nights: s.nights,
    owner,
    crew,
    story: null,
  };
});

// About a third of the deck gets a story.
const storyTargets = shuffle(DECK.map((_, i) => i)).slice(0, Math.round(DECK.length / 3));
storyTargets.forEach((i, k) => { DECK[i].story = STORY_BANK[k % STORY_BANK.length]; });

const POOL = { crew: PLAYERS.slice(), stays: DECK };

/* ---------------------------------------------------------------------------
   Dealing: cycle through a seeded shuffle of the deck, three a day, no
   repeats within a cycle (a fresh shuffle starts once the deck is exhausted).
   --------------------------------------------------------------------------- */

let cycle = shuffle(DECK);
let cyclePos = 0;
function dealOne() {
  if (cyclePos >= cycle.length) { cycle = shuffle(DECK); cyclePos = 0; }
  return cycle[cyclePos++];
}

/* ---------------------------------------------------------------------------
   Geometry helpers: destination point at a distance/bearing, nearest city.
   --------------------------------------------------------------------------- */

const EARTH_R = 3958.7613;

function destinationPoint(lat, lng, distMiles, bearingRad) {
  const p = Math.PI / 180;
  const lat1 = lat * p, lng1 = lng * p;
  const dR = distMiles / EARTH_R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(bearingRad)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(dR) * Math.cos(lat1),
    Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: lat2 / p, lng: ((lng2 / p + 540) % 360) - 180 };
}

function nearestCity(pt) {
  let best = null;
  for (const c of CITIES) {
    const d = hav(pt.lat, pt.lng, c.lat, c.lng);
    if (!best || d < best.miles) best = { name: c.name, miles: d };
  }
  best.miles = Math.round(best.miles);
  return best;
}

/* ---------------------------------------------------------------------------
   Archetypes.
   --------------------------------------------------------------------------- */

const ARCHETYPES = ['sharp', 'average', 'blind'];
const NORMAL_DIST_RANGE = { sharp: [5, 80], average: [80, 1500], blind: [1500, 9000] };
const WHO_MISS_PROB = { sharp: 0.10, average: 0.45, blind: 0.80 };
const HOST_PTS_RANGE = { sharp: [700, 1000], average: [350, 800], blind: [0, 400] };

function archetypeFor(playerIndex, day) {
  return ARCHETYPES[(day + playerIndex) % 3];
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 1 : inter / union;
}

function wherePtsFor(dist) {
  if (dist <= 50) return 800;
  return Math.round(800 * Math.exp(-dist / 600));
}

/* ---------------------------------------------------------------------------
   Simulate one round's scored result for one player against one stay.
   --------------------------------------------------------------------------- */

function simulateResult(stay, isHost, archetype) {
  let dist, who, whoCorrect, whoPts, wherePts, pts, host;

  if (isHost) {
    host = true;
    const [lo, hi] = HOST_PTS_RANGE[archetype];
    pts = Math.round(randFloat(lo, hi));
    dist = randFloat(100, 5000);
    who = [];
    whoCorrect = false;
    whoPts = 0;
    wherePts = null;
  } else {
    host = false;
    const [lo, hi] = NORMAL_DIST_RANGE[archetype];
    dist = randFloat(lo, hi);

    const crew = stay.crew.slice();
    let guessed = crew.slice();
    if (rnd() < WHO_MISS_PROB[archetype]) {
      if (rnd() < 0.5 && guessed.length > 0) {
        // Miss: drop one true crew member.
        guessed.splice(randInt(0, guessed.length - 1), 1);
      } else {
        // Swap: replace one true crew member with somebody not on the trip.
        const candidates = PLAYERS.filter((p) => crew.indexOf(p) === -1);
        if (candidates.length && guessed.length) {
          guessed[randInt(0, guessed.length - 1)] = pick(candidates);
        }
      }
    }
    who = guessed;
    whoCorrect = jaccard(who, crew) === 1;
    whoPts = Math.round(jaccard(who, crew) * 200);
    wherePts = wherePtsFor(dist);
    pts = whoPts + wherePts;
  }

  const bearing = randFloat(0, 2 * Math.PI);
  const at = destinationPoint(stay.lat, stay.lng, dist, bearing);
  const near = nearestCity(at);

  return { host, dist, who, whoCorrect, whoPts, wherePts, pts, at, near };
}

/* ---------------------------------------------------------------------------
   Season loop.
   --------------------------------------------------------------------------- */

const DAYS = 60;
const ROUNDS_PER_DAY = 3;

const seenIds = [];
const playerHistory = Object.fromEntries(PLAYERS.map((p) => [p, []])); // {day, host, region, blamed, dist}
const playerRecentLog = Object.fromEntries(PLAYERS.map((p) => [p, []])); // {day, id}

const rows = []; // { day, player, round, strategy, line }
let firstException = null;

for (let day = 1; day <= DAYS; day++) {
  const daysStays = [dealOne(), dealOne(), dealOne()];

  for (let round = 1; round <= ROUNDS_PER_DAY; round++) {
    const stay = daysStays[round - 1];
    seenIds.push(stay.id);
    const seenSnapshot = seenIds.slice();

    for (let pIdx = 0; pIdx < PLAYERS.length; pIdx++) {
      const me = PLAYERS[pIdx];
      const isHost = stay.crew.indexOf(me) !== -1;
      const archetype = archetypeFor(pIdx, day);
      const result = simulateResult(stay, isHost, archetype);

      const card = { ...stay };
      delete card.place; delete card.lat; delete card.lng; delete card.crew; delete card.story;

      // Same shape skipped for four days; same sentence skipped for fourteen.
      const recent = [...new Set(
        playerRecentLog[me].filter((r) => r.day > day - 4).map((r) => r.id)
      )];
      const recentHashes = playerRecentLog[me].filter((r) => r.day > day - 14 && r.h != null).map((r) => r.h);

      const ctx = {
        result,
        stay,
        card,
        pool: POOL,
        me,
        names: NAMES,
        near: result.near,
        at: result.at,
        seen: seenSnapshot,
        history: playerHistory[me],
        day,
        round,
      };

      let outcome = null;
      try {
        outcome = quip(ctx, recent, recentHashes);
      } catch (e) {
        if (!firstException) {
          firstException = {
            error: e,
            ctxSummary: {
              day, round, player: me,
              stayId: stay.id, stayPlace: stay.place,
              host: result.host, dist: result.dist,
              who: result.who, at: result.at, near: result.near,
              seenCount: seenSnapshot.length,
              historyLen: playerHistory[me].length,
              recent,
            },
          };
        }
        outcome = null;
      }

      rows.push({
        day, player: me, round,
        strategy: outcome ? outcome.id : null,
        line: outcome ? outcome.text : '(silence)',
      });

      if (outcome) playerRecentLog[me].push({ day, id: outcome.id, h: outcome.hash });

      const crew = stay.crew;
      const picks = result.who || [];
      const blamed = picks.filter((id) => crew.indexOf(id) === -1);
      const region = result.at ? regionOf(result.at) : null;
      playerHistory[me].push({ day, host: result.host, region, blamed, dist: result.dist });
    }
  }
}

/* ---------------------------------------------------------------------------
   Write the season transcript.
   --------------------------------------------------------------------------- */

const outLines = [];
for (let day = 1; day <= DAYS; day++) {
  outLines.push(`-- Day ${day} --`);
  const dayRows = rows.filter((r) => r.day === day);
  for (const r of dayRows) {
    if (r.strategy) {
      outLines.push(`${r.day} ${r.player} ${r.round} ${r.strategy} | ${r.line}`);
    } else {
      outLines.push(`${r.day} ${r.player} ${r.round} — | (silence)`);
    }
  }
  outLines.push('');
}
fs.writeFileSync(path.join(__dirname, 'quips-season.txt'), outLines.join('\n'), 'utf8');

/* ---------------------------------------------------------------------------
   Summary.
   --------------------------------------------------------------------------- */

const totalRounds = rows.length;
const withLine = rows.filter((r) => r.strategy).length;
const pct = (n, d) => (d === 0 ? '0.0' : ((n / d) * 100).toFixed(1));

const strategyCounts = {};
for (const r of rows) {
  const key = r.strategy || '(silence)';
  strategyCounts[key] = (strategyCounts[key] || 0) + 1;
}
const strategyIds = Object.keys(strategyCounts).sort((a, b) => strategyCounts[b] - strategyCounts[a]);

// Longest run of consecutive rounds with the same fired strategy, per player.
// Silence breaks a run (it is the absence of a strategy, not one).
const longestRun = {};
for (const p of PLAYERS) {
  const seq = rows.filter((r) => r.player === p)
    .sort((a, b) => (a.day - b.day) || (a.round - b.round))
    .map((r) => r.strategy);
  let best = 0, cur = 0, prev = null;
  for (const s of seq) {
    if (s && s === prev) cur += 1;
    else cur = s ? 1 : 0;
    if (cur > best) best = cur;
    prev = s;
  }
  longestRun[p] = best;
}

// Exact duplicate lines (extra copies beyond the first occurrence).
const textCounts = {};
for (const r of rows) {
  if (!r.strategy) continue;
  textCounts[r.line] = (textCounts[r.line] || 0) + 1;
}
let duplicateCount = 0;
for (const t of Object.keys(textCounts)) {
  if (textCounts[t] > 1) duplicateCount += textCounts[t] - 1;
}

// Line shapes: digits -> #, names -> NAME, quoted text -> "...".
const NAME_LIST = shuffle(Object.values(NAMES)).sort((a, b) => b.length - a.length);
const PLACE_NAMES = [...CITIES.map((c) => c.name), ...REGIONS.map((r) => r.name)]
  .sort((a, b) => b.length - a.length);

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function shapeOf(line) {
  let out = line;
  out = out.replace(/[“"][^”"]*[”"]/g, '"…"');
  for (const n of NAME_LIST) out = out.replace(new RegExp(`\\b${escapeRe(n)}\\b`, 'g'), 'NAME');
  for (const n of PLACE_NAMES) out = out.replace(new RegExp(escapeRe(n), 'g'), 'NAME');
  out = out.replace(/\d[\d,]*/g, '#');
  return out;
}

const shapeCounts = {};
for (const r of rows) {
  if (!r.strategy) continue;
  const shape = shapeOf(r.line);
  shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
}
const topShapes = Object.entries(shapeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

/* ---------------------------------------------------------------------------
   Print.
   --------------------------------------------------------------------------- */

console.log(`Total rounds: ${totalRounds}`);
console.log(`Rounds with a line: ${withLine} (${pct(withLine, totalRounds)}%)`);
console.log('');
console.log('Strategy counts (share of all rounds):');
for (const id of strategyIds) {
  console.log(`  ${id}: ${strategyCounts[id]} (${pct(strategyCounts[id], totalRounds)}%)`);
}
console.log('');
console.log('Longest run of consecutive rounds with the same strategy, per player:');
for (const p of PLAYERS) {
  console.log(`  ${p}: ${longestRun[p]}`);
}
console.log('');
console.log(`Exact duplicate lines (extra copies of a line already seen): ${duplicateCount}`);
console.log('');
console.log('Top 10 line shapes:');
for (const [shape, count] of topShapes) {
  console.log(`  ${count}x  ${shape}`);
}

if (firstException) {
  console.log('');
  console.log('First exception thrown by quip():');
  console.log(firstException.error && firstException.error.stack ? firstException.error.stack : firstException.error);
  console.log('ctx summary:', JSON.stringify(firstException.ctxSummary));
}
