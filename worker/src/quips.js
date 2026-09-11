/* ===========================================================================
   quips.js — the lines only this game can say.

   Runs in the Worker, after a guess is scored, with everything the page is
   never given: the whole pool, the roster, the player's history. The line it
   hands back can therefore name the place they pinned, the person they
   blamed, an amenity off the card, or a story off the back of the print —
   none of which a bank shipped in the page source could carry without
   spoiling an undealt card.

   THE ONE TEST EVERY LINE HAS TO PASS

   Would it work on any map game? If yes, it is not written yet. "Forty miles,
   you could have walked that" is somebody else's game wearing our hat. This
   file knows who booked it. It knows this was a bed, that it had a private
   sauna, who else was on the trip, that somebody wrote a sentence about it.
   That is the material.

   HOW A STRATEGY FIRES

   Each one has an eligibility condition drawn from what actually happened —
   not a die roll — and returns nothing when the round was not interesting in
   its particular way. Most rounds are not interesting. If nothing fires the
   page falls back to its own short bank, which is a different, quieter voice.
   Roughly one round in three should get a line from here.

   Punch at the guess, never at the person, never at the place. No
   exclamation marks. Nothing about walking, driving or flying the distance.
   =========================================================================== */

import Host from '../../src/host.js';

const hav = Host._internals.hav;
const regionOf = Host._internals.regionOf;

const WATER = /Ocean|Pacific|Atlantic/;

function seeded(n) {
  let a = (n * 2654435761) | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return h >>> 0;
}

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const miles = (n) => Math.round(n).toLocaleString('en-US');
const town = (place) => String(place || '').split(',')[0].trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------------------------------------------------------------------
   ctx:
     result   the scored result (host, dist, wherePts, whoPts, whoCorrect, who, pts)
     stay     the truth: place, lat, lng, crew, owner, story, amenities...
     card     what the player saw (amenities etc.)
     pool     { crew, stays }
     me       the player's id
     names    id -> display name
     near     { name, miles } nearest city to the pin, from the browser, or null
     at       the pin, or null
     seen     ids the group has already been dealt
     history  recent rounds for this player: [{ day, region, blamed:[], ... }]
     day, round
   --------------------------------------------------------------------------- */

const STRATEGIES = [

  // 6. The deadpan. A fumbled host round. No joke; the refusal is the joke.
  {
    id: 'deadpan',
    when: (c) => c.result.host && c.result.pts <= 300,
    say: (c) => `You were there. You got ${c.result.pts}.`,
  },

  // 8. The blurb as the sting. The owner's own line, deployed against the
  // person who just missed it.
  {
    id: 'blurb',
    when: (c) => !c.result.host && c.stay.story && c.stay.story.length <= 70
      && typeof c.result.dist === 'number' && c.result.dist > 700 && c.stay.owner !== c.me,
    say: (c) => {
      const who = c.names[c.stay.owner] || c.stay.owner;
      const q = c.stay.story.replace(/[.!?]+$/, '');
      return pick(c.rnd, [
        `${who} wrote “${q}”. You have put that ${miles(c.result.dist)} miles from where it happened.`,
        `According to ${who}, “${q}”. That was not ${miles(c.result.dist)} miles from here.`,
      ]);
    },
  },

  // 2. The accusation. They blamed the wrong friend, and that friend is
  // provably innocent: never been within a long way of this place.
  {
    id: 'accusation',
    when: (c) => !c.result.host && c.wrongNames.length > 0 && c.innocent.length > 0,
    say: (c) => {
      const inn = c.innocent[0];
      const name = c.names[inn.id] || inn.id;
      if (inn.none) {
        return pick(c.rnd, [
          `You said ${name}. ${name} has not sent a single stay in yet.`,
          `${name} is not in the deck. You have put ${name} in it anyway.`,
        ]);
      }
      if (inn.dist > 3000) {
        return pick(c.rnd, [
          `You said ${name}. ${name} has never been to this continent.`,
          `${name}, you said. The closest ${name} has ever been to this is ${miles(inn.dist)} miles.`,
        ]);
      }
      return pick(c.rnd, [
        `You said ${name}. ${name} has never once been within ${miles(inn.dist)} miles of this place.`,
        `${name} was not there. ${name} has never been within ${miles(inn.dist)} miles of there.`,
      ]);
    },
  },

  // 7. The callback. Only when a pattern genuinely exists.
  {
    id: 'callback',
    when: (c) => c.streakRegion >= 4 || c.blameStreak >= 3,
    say: (c) => {
      if (c.blameStreak >= 3) {
        const name = c.names[c.blameWho] || c.blameWho;
        return `${ordinal(c.blameStreak)} day running you have blamed ${name}.`;
      }
      return `${cap(ordinal(c.streakRegion))} pin in a row in ${c.region}.`;
    },
  },

  // 3. The amenity. A real detail off the card, and the miss hung on it.
  {
    id: 'amenity',
    when: (c) => !c.result.host && c.odd && typeof c.result.dist === 'number'
      && c.result.dist > 400 && c.whereName,
    say: (c) => pick(c.rnd, [
      `It had ${lower(c.odd)}. You put it in ${c.whereName}.`,
      `${cap(c.odd)}, the listing said. ${cap(c.whereName)}, you said.`,
    ]),
  },

  // 5. The witness. Somebody in the chat was on that trip and did not get
  // named.
  {
    id: 'witness',
    when: (c) => !c.result.host && c.missedNames.length > 0 && c.rnd() < 0.6,
    say: (c) => {
      const name = c.missedNames[0];
      return pick(c.rnd, [
        `${name} was there. ${name} is in this group chat.`,
        `${name} slept there. ${name} will have opinions about being left off.`,
        `You left ${name} out. ${name} has the photos.`,
      ]);
    },
  },

  // 1. The listing. Describe the place they pinned as though it were the
  // rental. Open water and empty desert are the best cases.
  {
    id: 'listing',
    when: (c) => !c.result.host && typeof c.result.dist === 'number' && c.result.dist > 300
      && c.at && (c.water || (c.near && c.near.miles <= 40) || (c.near && c.near.miles > 250)),
    say: (c) => {
      if (c.water) {
        const w = c.region;
        return pick(c.rnd, [
          `You have pinned ${w}. No bedrooms, no baths, and the host has never responded.`,
          `${cap(w)}. Sleeps nobody. Not yet reviewed.`,
          `That pin is in ${w}. Check-in is whenever you surface.`,
        ]);
      }
      if (c.near && c.near.miles <= 40) {
        const city = c.near.name;
        return pick(c.rnd, [
          `You have put them in ${city}. Nobody in this group has ever booked ${city}.`,
          `${city}. Entire place, presumably. No photos were provided.`,
          `${city}, according to your thumb. The listing disagrees.`,
        ]);
      }
      return pick(c.rnd, [
        `The nearest anything to that pin is ${c.near.name}, ${miles(c.near.miles)} miles off. No listings out there either.`,
        `${miles(c.near.miles)} miles from ${c.near.name} and nothing else. Self check-in, one assumes.`,
      ]);
    },
  },

  // 4. The deck yardstick. The error measured against two places in this
  // game, never against the world's.
  {
    id: 'yardstick',
    when: (c) => !c.result.host && typeof c.result.dist === 'number' && c.result.dist > 900
      && c.yard && c.rnd() < 0.7,
    say: (c) => pick(c.rnd, [
      `You missed by further than ${c.yard.a} is from ${c.yard.b}. Both of those are in this game.`,
      `That is more than the whole way from ${c.yard.a} to ${c.yard.b}, and somebody here has slept in both.`,
    ]),
  },
];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  const word = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth',
    7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth' }[n];
  return word || (n + (s[(v - 20) % 10] || s[v] || s[0]));
}

function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

// The odd amenity, ranked the same way the card ranks it. Kept in step with
// listing.js by hand; the two lists are the product's personality.
const DULL = /^(wifi|kitchen|essentials|tv|hdtv|washer|dryer|heating|air conditioning|free parking on premises|hot water|hangers|iron|shampoo|smoke alarm|carbon monoxide alarm|self check-?in|bed linens|cooking basics|dishes and silverware|refrigerator|microwave|coffee maker|long term stays allowed|dedicated workspace|pets allowed)$/i;
const JUICY = /sauna|hot tub|fire ?pit|fireplace|wood stove|pool|outdoor shower|piano|kayak|canoe|boat|bikes?|ski|beach|waterfront|lake|river|ocean|pond|barn|hammock|telescope|arcade|pool table|sound system|ev charger|outhouse|composting|generator|well water|no wifi|rifle|aurora|hot spring|onsen|treehouse|dock|trail|crib/i;
function amenityScore(name) {
  let s = 0;
  if (DULL.test(name.trim())) s -= 4;
  if (JUICY.test(name)) s += 4;
  if (/\d/.test(name)) s += 2;
  if (/[-–—]/.test(name)) s += 2;
  if (/private|shared|only|not |no /i.test(name)) s += 1;
  s += Math.min(2, Math.floor(name.length / 18));
  return s;
}
function oddOf(stay) {
  const ranked = (stay.amenities || []).map((a) => ({ a, s: amenityScore(a) }))
    .sort((x, y) => y.s - x.s);
  // The card shows anything scoring over 2; a line needs something stranger
  // than a washer with a dash in its name.
  return ranked.length && ranked[0].s >= 5 ? ranked[0].a : null;
}

export function redact(text, place) {
  if (!text || !place) return text || '';
  let out = text;
  place.split(/[,/]/).forEach((part) => {
    const w = part.trim();
    if (w.length < 4) return;
    out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '•••');
  });
  return out;
}

// Build the derived facts every strategy reads, once.
function enrich(ctx) {
  const c = { ...ctx };
  c.rnd = seeded(hashStr(`${ctx.day}|${ctx.round}|${ctx.stay.id}|${ctx.me}`));
  const crew = ctx.stay.crew || [];
  const picks = ctx.result.who || [];
  const names = ctx.names;

  c.wrongNames = picks.filter((id) => crew.indexOf(id) === -1);
  c.missedNames = crew.filter((id) => picks.indexOf(id) === -1 && id !== ctx.stay.owner && names[id])
    .map((id) => names[id]);

  // Innocence: how close the blamed person has ever been to this place.
  c.innocent = c.wrongNames.map((id) => {
    const theirs = ctx.pool.stays.filter((s) => (s.crew || []).indexOf(id) !== -1 && s.id !== ctx.stay.id);
    if (!theirs.length) return { id, none: true, dist: Infinity };
    const d = Math.min(...theirs.map((s) => hav(s.lat, s.lng, ctx.stay.lat, ctx.stay.lng)));
    return { id, none: false, dist: d };
  }).filter((x) => x.none || x.dist > 1000).sort((a, b) => b.dist - a.dist);

  c.region = ctx.at ? regionOf(ctx.at) : null;
  c.water = !!(c.region && WATER.test(c.region) && (!ctx.near || ctx.near.miles > 120));
  c.whereName = c.water ? c.region : (ctx.near && ctx.near.miles <= 60 ? ctx.near.name : null);
  c.odd = ctx.card ? redact(oddOf(ctx.card) || '', ctx.stay.place) : null;
  if (c.odd && /•••/.test(c.odd)) c.odd = null;

  // Yardstick: two dealt stays whose separation is the largest one still
  // under the error, so the comparison is true and the places are known.
  c.yard = null;
  if (typeof ctx.result.dist === 'number' && ctx.result.dist > 900) {
    const seen = new Set(ctx.seen || []);
    const played = ctx.pool.stays.filter((s) => seen.has(s.id) && s.id !== ctx.stay.id);
    let best = null;
    for (let i = 0; i < played.length; i++) {
      for (let j = i + 1; j < played.length; j++) {
        const a = played[i], b = played[j];
        if (town(a.place) === town(b.place)) continue;
        const d = hav(a.lat, a.lng, b.lat, b.lng);
        if (d < ctx.result.dist && d > 400 && (!best || d > best.d)) best = { d, a: town(a.place), b: town(b.place) };
      }
    }
    c.yard = best;
  }

  // Patterns in history.
  const hist = ctx.history || [];
  c.streakRegion = 0;
  if (c.region && !ctx.result.host) {
    c.streakRegion = 1;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].host || !hist[i].region) break;
      if (hist[i].region !== c.region) break;
      c.streakRegion++;
    }
  }
  c.blameStreak = 0;
  c.blameWho = null;
  if (c.wrongNames.length) {
    const days = {};
    hist.forEach((h) => { (h.blamed || []).forEach((id) => { (days[id] = days[id] || new Set()).add(h.day); }); });
    c.wrongNames.forEach((id) => {
      const ds = days[id] ? [...days[id]].sort((a, b) => b - a) : [];
      let n = 1;
      let want = ctx.day - 1;
      for (const d of ds) { if (d === want) { n++; want--; } else if (d < want) break; }
      if (n > c.blameStreak) { c.blameStreak = n; c.blameWho = id; }
    });
  }
  return c;
}

// Returns { id, text, hash } or null. `recentIds` is the strategy ids this
// player has seen in the last few days (a shape they just saw is skipped);
// `recentHashes` is every line they have read in the last fortnight, so the
// same sentence never comes back inside it even from a different round.
export function quip(ctx, recentIds, recentHashes) {
  const c = enrich(ctx);
  const skip = new Set(recentIds || []);
  const seen = new Set(recentHashes || []);
  for (const s of STRATEGIES) {
    if (skip.has(s.id)) continue;
    let ok = false;
    try { ok = s.when(c); } catch { ok = false; }
    if (!ok) continue;
    const text = s.say(c);
    if (!text) continue;
    const hash = hashStr(text);
    if (seen.has(hash)) continue;
    return { id: s.id, text, hash };
  }
  return null;
}

export const _internals = { enrich, STRATEGIES, oddOf, regionOf };
