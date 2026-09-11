'use strict';

/* ===========================================================================
   tools/sim/cycle.js

   Standalone simulator for the Worker's deal ledger (worker/src/index.js,
   section "THE DEAL LEDGER"). Builds a synthetic deck, deals many days in a
   row exactly the way the Worker does, and checks the promise the ledger is
   supposed to keep: (a) between two resets every stay is dealt exactly once
   and none twice, (b) no day deals the same id twice, (c) on a reset day the
   leftover stays are dealt before anything from the fresh deck, and (d) a
   stay dealt longer ago is now preferred as a tiebreak on EVERY day (not
   only reset days) once the load — how heavily a candidate would burden its
   host(s) — is equal, so the minimum gap, in days, between any two deals of
   the same stay anywhere in the run should not collapse below roughly one
   cycle length.

   Node 24, CommonJS, no dependencies.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Copied VERBATIM from worker/src/index.js as it stood on 2026-09-11
   (second copy): seeded, hashId, cmpKey, partyOfStay, stayOwner, computeDeal.
   Do not "fix" anything in here even if the checks below find a bug — file
   it against the Worker instead. ROUNDS mirrors the Worker's own constant.
   --------------------------------------------------------------------------- */

const ROUNDS = 3;

function seeded(n) {
  let a = (n * 2654435761) | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stayOwner = (s) => s.owner || s.booker || 'unknown';

function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
}

const partyOfStay = (s) => (s.crew && s.crew.length ? s.crew : [stayOwner(s)]);

function computeDeal(pool, ledger, day) {
  const used = new Set(ledger.used || []);
  let field = pool.stays.filter((s) => !used.has(s.id));
  const want = Math.min(ROUNDS, pool.stays.length);

  // The deck rarely divides by three. Forty-one stays is thirteen days and a
  // remainder of two, and simply resetting on that short day threw the last
  // two away unseen and re-dealt three that everyone had already played —
  // nine repeats a cycle, and the no-repeat promise broken every fortnight.
  // So the tail of the old cycle is spent first and the day is topped up from
  // a fresh deck.
  const reset = field.length < want;
  const leftovers = reset ? field.slice() : [];
  if (reset) {
    const held = {};
    leftovers.forEach((s) => { held[s.id] = 1; });
    field = leftovers.concat(pool.stays.filter((s) => !held[s.id]));
  }

  const tally = ledger.owners || {};
  const hosts = {};                    // player -> rounds of today they are on
  const out = [];
  const taken = new Set();

  // The deck rarely divides by three. Forty-one stays is thirteen days and a
  // remainder of two, and simply resetting on that short day threw the last
  // two away unseen and re-dealt three that everyone had already played —
  // nine repeats a cycle, and the no-repeat promise broken every fortnight.
  // So the tail of the old cycle is spent first and the day is topped up from
  // a fresh deck.
  const lastDealt = {};
  Object.keys(ledger.days || {}).forEach((d) => {
    (ledger.days[d] || []).forEach((id) => {
      lastDealt[id] = Math.max(lastDealt[id] ?? -1, Number(d));
    });
  });

  // Whatever is left of the old cycle goes in before anything else.
  for (const s of leftovers) {
    if (out.length >= want) break;
    taken.add(s.id);
    out.push(s);
    partyOfStay(s).forEach((p) => { hosts[p] = (hosts[p] || 0) + 1; });
  }

  while (out.length < want) {
    let best = null;
    for (const s of field) {
      if (taken.has(s.id)) continue;
      // The cost of adding this stay: how heavily it loads whoever it would
      // make host, then whether it doubles up an owner, then how much that
      // owner has been dealt already. Ties broken by a stable hash so two
      // players racing on a fresh day reach the same answer.
      const load = Math.max.apply(null, partyOfStay(s).map((p) => (hosts[p] || 0) + 1));
      const dup = out.filter((x) => stayOwner(x) === stayOwner(s)).length;
      const dealt = tally[stayOwner(s)] || 0;
      const age = lastDealt[s.id] ?? -1;
      // Never let somebody host all three; after that, the stay dealt longest
      // ago; only then the softer spreading. Putting load first made a stay
      // come back seven days after its last appearance whenever its crew
      // happened to suit the spread, which reads as a memory test.
      const triple = load >= ROUNDS ? 1 : 0;
      const key = [triple, age, load, dup, dealt, hashId(day + '|' + s.id)];
      if (!best || cmpKey(key, best.key) < 0) best = { s: s, key: key };
    }
    if (!best) break;
    taken.add(best.s.id);
    out.push(best.s);
    partyOfStay(best.s).forEach((p) => { hosts[p] = (hosts[p] || 0) + 1; });
  }

  // The leftovers belong to the cycle that just ended. Only the fresh stays
  // start the new cycle's used list — otherwise the leftovers sit in it for
  // a whole cycle and are dealt half as often as everything else.
  const held = {};
  leftovers.forEach((s) => { held[s.id] = 1; });
  return {
    ids: out.map((s) => s.id),
    fresh: out.filter((s) => !held[s.id]).map((s) => s.id),
    owners: out.map(stayOwner),
    hosts: hosts,
    reset: reset,
  };
}

function cmpKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/* ---------------------------------------------------------------------------
   End of verbatim copy.
   --------------------------------------------------------------------------- */

// The ledger update dealFor() performs after computeDeal, copied verbatim
// (minus the KV write and the MAX_LEDGER_DAYS trim, which don't affect the
// invariants below).
function applyDeal(ledger, day, got) {
  ledger.days[String(day)] = got.ids;
  ledger.used = got.reset ? got.fresh.slice() : (ledger.used || []).concat(got.ids);
  ledger.owners = ledger.owners || {};
  for (const o of got.owners) ledger.owners[o] = (ledger.owners[o] || 0) + 1;
}

// --------------------------------------------------------------------------
// The synthetic deck. N stays, ids s1..sN, owners round-robin over five
// players. Each stay's crew is [owner] plus 0-2 random other players, chosen
// with a seeded mulberry32 PRNG so the deck is reproducible.
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

const PLAYERS = ['player1', 'player2', 'player3', 'player4', 'player5'];

function buildPool(n, seed) {
  const rng = mulberry32(seed);
  const stays = [];
  for (let i = 1; i <= n; i++) {
    const owner = PLAYERS[(i - 1) % PLAYERS.length];
    const others = PLAYERS.filter((p) => p !== owner);
    // Fisher-Yates shuffle of the other four, seeded.
    for (let k = others.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const tmp = others[k]; others[k] = others[j]; others[j] = tmp;
    }
    const extraCount = Math.floor(rng() * 3); // 0, 1 or 2
    const crew = [owner].concat(others.slice(0, extraCount));
    stays.push({ id: 's' + i, owner, booker: owner, crew });
  }
  return { crew: PLAYERS.map((p) => ({ id: p, name: p })), stays };
}

// --------------------------------------------------------------------------
// Simulation + checks
// --------------------------------------------------------------------------

function runSim(n, days, seed) {
  const pool = buildPool(n, seed);
  const allIds = pool.stays.map((s) => s.id);
  const allIdSet = new Set(allIds);
  const want = Math.min(ROUNDS, pool.stays.length);
  const cycleLen = Math.ceil(n / ROUNDS);

  const ledger = { days: {}, used: [], owners: {} };

  const dealt = [];          // dealt[day] = { ids, reset, leftoverIds, topUpIds }
  const sameDayDupes = [];   // { day, id }
  const leftoverMismatches = []; // { day, expected, got }
  let maxHostedOneDay = 0;
  const hostedDist = {};     // maxToday -> count of days

  // For check (d): every time a stay is dealt again, how many days since it
  // was last dealt. The age tiebreak now runs on every day (not only reset
  // days), once load is equal, so it is no longer only the fresh top-up
  // picks on a reset day that are governed by it — any repeat, anywhere in
  // the run, should reflect it. lastDealtDay tracks the most recent day per
  // id so far, for computing each gap as it occurs.
  const lastDealtDay = {};
  const gaps = [];           // { id, gap, firstDay, secondDay }, every repeat deal

  for (let day = 0; day < days; day++) {
    const usedSet = new Set(ledger.used || []);
    const fieldBefore = pool.stays.filter((s) => !usedSet.has(s.id));
    const willReset = fieldBefore.length < want;
    const leftoverIds = willReset ? fieldBefore.map((s) => s.id) : [];

    const got = computeDeal(pool, ledger, day);
    applyDeal(ledger, day, got);

    // Check (b): no day deals the same id twice.
    const daySet = new Set();
    for (const id of got.ids) {
      if (daySet.has(id)) sameDayDupes.push({ day, id });
      daySet.add(id);
    }

    // Sanity: the reset flag we predicted matches what computeDeal reports.
    if (got.reset !== willReset) {
      leftoverMismatches.push({
        day, kind: 'reset-flag-mismatch', expectedReset: willReset, gotReset: got.reset,
      });
    }
    // Check (c): on a reset day the leftovers are dealt first, then the
    // remaining slots are topped up from the fresh deck. `got.fresh` is
    // exactly that top-up portion (computeDeal now returns it directly).
    const topUpIds = got.reset ? got.fresh : [];
    if (got.reset) {
      const dealtLeftovers = got.ids.slice(0, leftoverIds.length);
      const leftoverSet = new Set(leftoverIds);
      const matches = dealtLeftovers.length === leftoverIds.length
        && dealtLeftovers.every((id) => leftoverSet.has(id));
      if (!matches) {
        leftoverMismatches.push({
          day, kind: 'leftover-mismatch', expected: leftoverIds, got: dealtLeftovers,
        });
      }
    }

    dealt.push({ ids: got.ids, reset: got.reset, leftoverIds, topUpIds });

    // Check (d): for every id dealt today, how many days since it was last
    // dealt (skipped the first time any id is ever dealt — no prior gap).
    // Generalised to all of today's picks, not just a reset day's top-up,
    // because the age tiebreak in computeDeal now applies on every day.
    for (const id of got.ids) {
      if (Object.prototype.hasOwnProperty.call(lastDealtDay, id)) {
        gaps.push({ id, gap: day - lastDealtDay[id], firstDay: lastDealtDay[id], secondDay: day });
      }
    }
    for (const id of got.ids) lastDealtDay[id] = day;

    // Check: host spread.
    let maxToday = 0;
    for (const p of Object.keys(got.hosts)) {
      if (got.hosts[p] > maxToday) maxToday = got.hosts[p];
    }
    if (maxToday > maxHostedOneDay) maxHostedOneDay = maxToday;
    hostedDist[maxToday] = (hostedDist[maxToday] || 0) + 1;
  }

  // Cycle boundaries: day 0 (the implicit start) plus every day the ledger
  // actually reset.
  const boundarySet = new Set([0]);
  dealt.forEach((d, day) => { if (d.reset) boundarySet.add(day); });
  const boundaries = [...boundarySet].sort((a, b) => a - b);

  // Check (a): between one reset and the next, every stay is dealt exactly
  // once and none twice. This is checked over the REAL boundary-to-boundary
  // span for each cycle — not an assumed fixed-length window (the old
  // check's mistake, since a short final day shifts a cycle's actual length
  // away from ceil(n/ROUNDS)) — and a reset day is split correctly instead
  // of being counted whole into both the cycle it closes and the one it
  // opens: its leftoverIds finish the closing cycle, and its topUpIds open
  // the next one. Counting the whole day into both (as the old code did by
  // walking day b..nb inclusive at each end) makes the fresh top-up pick
  // look like a same-cycle repeat of whatever it happens to match, which it
  // is not — it belongs to the cycle that is only just starting.
  const repeats = [];
  const skipped = [];
  let cyclesCompleted = 0;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const b = boundaries[i];
    const nb = boundaries[i + 1];
    if (nb > days - 1) continue; // incomplete cycle, not enough days simulated

    const seenAt = new Map(); // id -> first day seen, within this cycle
    const union = new Set();
    const addIds = (idsList, day) => {
      for (const id of idsList) {
        union.add(id);
        if (seenAt.has(id)) {
          repeats.push({ windowStart: b, windowEnd: nb, id, firstDay: seenAt.get(id), secondDay: day });
        } else {
          seenAt.set(id, day);
        }
      }
    };

    // Day b opens this cycle. Day 0 has no prior cycle to top up from, so
    // its whole deal is the opening; any later boundary's day only
    // contributes its fresh top-up there — the leftovers it also dealt that
    // day finished off the PREVIOUS cycle instead.
    addIds(b === 0 ? dealt[b].ids : dealt[b].topUpIds, b);

    // The full days strictly between the two boundaries.
    for (let day = b + 1; day < nb; day++) {
      addIds(dealt[day].ids, day);
    }

    // Day nb closes this cycle: only its leftover portion belongs here (its
    // top-up portion opens the NEXT cycle, checked in the next iteration).
    addIds(dealt[nb].leftoverIds, nb);

    const missing = allIds.filter((id) => !union.has(id));
    if (missing.length) {
      skipped.push({ from: b, to: nb, missing });
    } else {
      cyclesCompleted += 1;
    }
  }

  // Check (d), continued: across the whole run, the minimum gap in days
  // between any stay's deal and that same stay's previous deal. The age
  // tiebreak (whichever candidate was dealt longest ago wins, once load is
  // equal) now runs every day, so this minimum should not fall much below
  // one cycle length anywhere in the run, not only around reset days.
  let minGapEntry = null;
  for (const g of gaps) {
    if (!minGapEntry || g.gap < minGapEntry.gap) minGapEntry = g;
  }
  const minGap = minGapEntry ? minGapEntry.gap : Infinity;
  const minAllowedGap = Math.floor(n / ROUNDS) - 1;
  const gapTooSmall = Number.isFinite(minGap) && minGap < minAllowedGap;

  return {
    n, days, cycleLen, cyclesCompleted,
    repeats, skipped, sameDayDupes, leftoverMismatches,
    maxHostedOneDay, hostedDist,
    minGap, minGapEntry, minAllowedGap, gapTooSmall, gaps,
  };
}

// --------------------------------------------------------------------------
// Run the required configurations and print the report.
// --------------------------------------------------------------------------

function fmtDist(dist) {
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
  return keys.map((k) => `${k}/3:${dist[k]}`).join(' ');
}

// Histogram of gap sizes (in days) for a list of { gap } entries — every
// repeat deal across the run — reported separately from the pass/fail table.
function fmtGapDist(gaps) {
  if (!gaps.length) return '(no repeats observed)';
  const dist = {};
  gaps.forEach((g) => { dist[g.gap] = (dist[g.gap] || 0) + 1; });
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
  return keys.map((k) => `${k}d:${dist[k]}`).join(' ');
}

function main() {
  const configs = [];
  for (const n of [41, 42, 43, 60, 7]) {
    configs.push({ n, days: 3 * Math.ceil(n / ROUNDS) + 5 });
  }
  configs.push({ n: 41, days: 200 });

  const rows = [];
  let anyFail = false;
  const explanations = [];
  const gapReports = [];

  for (const cfg of configs) {
    const r = runSim(cfg.n, cfg.days, 12345);
    const fail = r.repeats.length > 0 || r.skipped.length > 0
      || r.sameDayDupes.length > 0 || r.leftoverMismatches.length > 0
      || r.gapTooSmall;
    if (fail) anyFail = true;

    rows.push({
      n: r.n,
      days: r.days,
      cycles: r.cyclesCompleted,
      repeats: r.repeats.length,
      skipped: r.skipped.length,
      dupes: r.sameDayDupes.length,
      minGap: Number.isFinite(r.minGap) ? r.minGap : 'n/a',
      minAllowedGap: r.minAllowedGap,
      maxHosted: r.maxHostedOneDay,
      status: fail ? 'FAIL' : 'OK',
    });

    gapReports.push(
      `N=${r.n}: repeat gap distribution: ${fmtGapDist(r.gaps)} `
      + `(${r.gaps.length} repeat deal(s) observed)`
    );

    if (r.repeats.length) {
      const first = r.repeats[0];
      explanations.push(
        `N=${r.n} (days=${r.days}): FAIL - repeat found: id ${first.id} dealt on day ${first.firstDay} `
        + `and again on day ${first.secondDay}, inside the cycle spanning days `
        + `${first.windowStart}-${first.windowEnd} (${r.repeats.length} repeat(s) total across the run).`
      );
    }
    if (r.skipped.length) {
      const first = r.skipped[0];
      explanations.push(
        `N=${r.n} (days=${r.days}): FAIL - stay(s) skipped for a full cycle (days ${first.from}-${first.to}): `
        + `missing ${JSON.stringify(first.missing)}.`
      );
    }
    if (r.sameDayDupes.length) {
      const first = r.sameDayDupes[0];
      explanations.push(`N=${r.n} (days=${r.days}): FAIL - day ${first.day} dealt id ${first.id} twice in the same day.`);
    }
    if (r.leftoverMismatches.length) {
      const first = r.leftoverMismatches[0];
      explanations.push(`N=${r.n} (days=${r.days}): FAIL - leftover mismatch on day ${first.day}: ${JSON.stringify(first)}.`);
    }
    if (r.gapTooSmall) {
      const g = r.minGapEntry;
      explanations.push(
        `N=${r.n} (days=${r.days}): FAIL - min gap ${g.gap} day(s) < required ${r.minAllowedGap}: `
        + `id ${g.id} dealt on day ${g.firstDay} and again on day ${g.secondDay}.`
      );
    }
  }

  const header = '| N | days | cycles | repeats-within-cycle | skipped | same-day dupes | min gap (days) | min allowed gap | max hosted by one player in a day | status |';
  const sep = '|---|------|--------|-----------------------|---------|-----------------|------------------|-------------------|-------------------------------------|--------|';
  const lines = [header, sep];
  for (const row of rows) {
    lines.push(`| ${row.n} | ${row.days} | ${row.cycles} | ${row.repeats} | ${row.skipped} | ${row.dupes} | ${row.minGap} | ${row.minAllowedGap} | ${row.maxHosted}/3 | ${row.status} |`);
  }

  console.log(lines.join('\n'));
  console.log('');
  if (explanations.length) {
    explanations.forEach((e) => console.log(e));
  } else {
    console.log('all OK');
  }
  console.log('');
  gapReports.forEach((g) => console.log(g));

  process.exit(anyFail ? 1 : 0);
}

main();
