/* ===========================================================================
   facts.js — turns the pool of stays into little "did you know" style facts
   about each one, relative to the rest of the deck. Runs in the Worker every
   time somebody submits stays, so it stays O(n^2) at worst (fine for a few
   hundred stays) and never assumes a field beyond id/owner/lat/lng/place is
   present.
   =========================================================================== */

const EARTH_RADIUS_MI = 3958.7613;

export function hav(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MI * c;
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
// A count of zero is a missing count, not a record: nobody stayed zero
// nights and nobody's listing sleeps zero guests.
const isCount = (x) => isNum(x) && x > 0;

function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function townOf(place) {
  if (typeof place !== 'string' || !place) return '';
  const idx = place.indexOf(',');
  if (idx === -1) return place.trim();
  const town = place.slice(0, idx).trim();
  return town.length < 3 ? place.trim() : town;
}

function fmtMiles(d) {
  const n = d < 10 ? Math.round(d * 10) / 10 : Math.round(d);
  return `${n} mi`;
}

function latLabel(lat) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}

function lngLabel(lng) {
  return `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseWhen(when) {
  if (typeof when !== 'string') return null;
  const m = when.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const year = Number(m[2]);
  let monthIndex = MONTH_NAMES.findIndex((n) => n.toLowerCase() === word);
  if (monthIndex === -1) {
    monthIndex = MONTH_ABBR[word] !== undefined ? MONTH_ABBR[word] : MONTH_ABBR[word.slice(0, 3)];
  }
  if (monthIndex === undefined || monthIndex === -1 || monthIndex === undefined) return null;
  if (!isNum(monthIndex)) return null;
  return { monthIndex, year, monthName: MONTH_NAMES[monthIndex] };
}

function push(bucket, i, fact) {
  bucket[i].push(fact);
}

export function computeFacts(stays) {
  const n = Array.isArray(stays) ? stays.length : 0;
  // A zero count is a missing count: nobody stayed zero nights.
  const out = stays.map((s) => {
    const c = { ...s };
    ['nights', 'guests', 'beds', 'bedrooms', 'baths', 'reviews'].forEach((k) => {
      if (typeof c[k] === 'number' && !(c[k] > 0)) c[k] = null;
    });
    return c;
  });
  if (n === 0) return out;

  const bucket = out.map(() => []);

  // ---- distances -----------------------------------------------------
  if (n >= 2) {
    const dist = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = hav(out[i].lat, out[i].lng, out[j].lat, out[j].lng);
        dist[i][j] = d;
        dist[j][i] = d;
      }
    }

    for (let i = 0; i < n; i++) {
      let nearestIdx = -1;
      let nearestDist = Infinity;
      let within30 = 0;
      let within100 = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const d = dist[i][j];
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = j;
        }
        if (d <= 30) within30++;
        if (d <= 100) within100++;
      }

      if (nearestIdx !== -1) {
        if (nearestDist > 1500) {
          push(bucket, i, { k: 'ISOLATED', v: `nearest other stay ${fmtMiles(nearestDist)}`, w: 4 });
        } else {
          const town = townOf(out[nearestIdx].place);
          push(bucket, i, { k: 'NEAREST', v: `${town} · ${fmtMiles(nearestDist)}`, w: 2 });
        }
      }

      const others = n - 1;
      if (within30 >= 1) {
        if (within30 >= 2) {
          push(bucket, i, { k: 'CLUSTER', v: `${within30} of ${others}`, w: 4 });
        } else {
          push(bucket, i, { k: 'WITHIN 30 MI', v: `${within30} of ${others}`, w: 2 });
        }
      }
      if (within100 >= 1) {
        push(bucket, i, { k: 'WITHIN 100 MI', v: `${within100} of ${others}`, w: 2 });
      }
    }
  }

  // ---- lat/lng extremes ------------------------------------------------
  if (n >= 4) {
    const withLat = out.map((s, i) => ({ i, v: s.lat })).filter((x) => isNum(x.v));
    const withLng = out.map((s, i) => ({ i, v: s.lng })).filter((x) => isNum(x.v));

    const extreme = (arr, pickMax, dirKey, dirWord, label) => {
      if (arr.length < 4) return;
      const sorted = [...arr].sort((a, b) => (pickMax ? b.v - a.v : a.v - b.v));
      const topVal = sorted[0].v;
      const topGroup = sorted.filter((x) => x.v === topVal);
      for (const x of topGroup) {
        push(bucket, x.i, { k: dirKey, v: `${label(x.v)} of ${n}`, w: 5 });
      }
      const rest = sorted.filter((x) => x.v !== topVal);
      if (rest.length) {
        const secondVal = rest[0].v;
        const secondGroup = rest.filter((x) => x.v === secondVal);
        const lk = dirKey === 'NORTHERNMOST' || dirKey === 'SOUTHERNMOST' ? 'LATITUDE' : 'LONGITUDE';
        for (const x of secondGroup) {
          push(bucket, x.i, { k: lk, v: `2nd ${dirWord} of ${n}`, w: 3 });
        }
      }
    };

    extreme(withLat, true, 'NORTHERNMOST', 'northernmost', latLabel);
    extreme(withLat, false, 'SOUTHERNMOST', 'southernmost', latLabel);
    extreme(withLng, true, 'EASTERNMOST', 'easternmost', lngLabel);
    extreme(withLng, false, 'WESTERNMOST', 'westernmost', lngLabel);
  }

  // ---- hemisphere --------------------------------------------------------
  if (n >= 3) {
    const southIdx = [];
    const northIdx = [];
    for (let i = 0; i < n; i++) {
      if (isNum(out[i].lat)) {
        if (out[i].lat < 0) southIdx.push(i);
        else northIdx.push(i);
      }
    }
    if (southIdx.length === 1 && northIdx.length === n - 1) {
      push(bucket, southIdx[0], { k: 'HEMISPHERE', v: 'the only one south of the equator', w: 5 });
    }
    if (northIdx.length === 1 && southIdx.length === n - 1) {
      push(bucket, northIdx[0], { k: 'HEMISPHERE', v: 'the only one north of the equator', w: 5 });
    }
  }

  // ---- nights: longest / shortest ---------------------------------------
  const nightsFired = new Array(n).fill(false);
  {
    const withNights = out.map((s, i) => ({ i, v: s.nights })).filter((x) => isNum(x.v));
    if (withNights.length >= 4) {
      const max = Math.max(...withNights.map((x) => x.v));
      const min = Math.min(...withNights.map((x) => x.v));
      const maxGroup = withNights.filter((x) => x.v === max);
      const minGroup = withNights.filter((x) => x.v === min);
      const joint = (grp) => grp.length > 1;
      for (const x of maxGroup) {
        push(bucket, x.i, { k: 'LONGEST', v: `${joint(maxGroup) ? 'joint longest' : 'longest'} · ${x.v} nights`, w: 5 });
        nightsFired[x.i] = true;
      }
      if (max !== min) {
        for (const x of minGroup) {
          push(bucket, x.i, { k: 'SHORTEST', v: `${joint(minGroup) ? 'joint shortest' : 'shortest'} · ${x.v} nights`, w: 5 });
          nightsFired[x.i] = true;
        }
      }
    }
  }

  // ---- guests / beds superlatives ----------------------------------------
  const guestsFired = new Array(n).fill(false);
  const bedsFired = new Array(n).fill(false);
  const superlativeField = (field, kLabel, wordLabel, fired) => {
    const withField = out.map((s, i) => ({ i, v: s[field] })).filter((x) => isNum(x.v));
    if (withField.length < 2) return;
    const max = Math.max(...withField.map((x) => x.v));
    const group = withField.filter((x) => x.v === max);
    const joint = group.length > 1;
    for (const x of group) {
      push(bucket, x.i, { k: kLabel, v: `${joint ? `joint most ${wordLabel}` : `most ${wordLabel}`} · ${x.v}`, w: 5 });
      fired[x.i] = true;
    }
  };
  superlativeField('guests', 'MOST GUESTS', 'guests', guestsFired);
  superlativeField('beds', 'MOST BEDS', 'beds', bedsFired);

  // ---- rating / reviews ----------------------------------------------------
  {
    const withRating = out.map((s, i) => ({ i, v: s.rating, r: s.reviews })).filter((x) => isNum(x.v));
    if (withRating.length >= 4) {
      const total = withRating.length;
      for (const x of withRating) {
        const greater = withRating.filter((y) => y.v > x.v).length;
        const rank = greater + 1;
        const tieCount = withRating.filter((y) => y.v === x.v).length;
        const joint = tieCount > 1;
        const ratingPart = isNum(x.r) ? `${x.v} (${x.r})` : `${x.v}`;
        const v = `${ratingPart} · ${joint ? 'joint ' : ''}${ordinal(rank)} of ${total}`;
        if (rank === 1) {
          push(bucket, x.i, { k: 'TOP RATED', v, w: 5 });
        } else {
          push(bucket, x.i, { k: 'RATED', v, w: 3 });
        }
      }
    }
  }

  {
    const withReviews = out.map((s, i) => ({ i, v: s.reviews })).filter((x) => isNum(x.v));
    if (withReviews.length >= 2) {
      const max = Math.max(...withReviews.map((x) => x.v));
      const group = withReviews.filter((x) => x.v === max);
      const joint = group.length > 1;
      for (const x of group) {
        push(bucket, x.i, { k: 'REVIEWED', v: `${joint ? 'joint most reviewed' : 'most reviewed'} · ${x.v}`, w: 5 });
      }
    }
  }

  // ---- same town -----------------------------------------------------------
  {
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const p = out[i].place;
      if (typeof p !== 'string' || !p) continue;
      const key = p.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (const idxs of groups.values()) {
      if (idxs.length >= 2) {
        for (const i of idxs) {
          push(bucket, i, { k: 'SAME TOWN', v: `${idxs.length} stays here`, w: 4 });
        }
      }
    }
  }

  // ---- month + earliest/latest ---------------------------------------------
  {
    const parsed = out.map((s, i) => ({ i, p: parseWhen(s.when) }));
    const withMonth = parsed.filter((x) => x.p);
    const totalWithMonth = withMonth.length;

    if (totalWithMonth >= 1) {
      const byMonth = new Map();
      for (const x of withMonth) {
        const key = x.p.monthIndex;
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(x.i);
      }
      for (const [monthIndex, idxs] of byMonth.entries()) {
        if (idxs.length >= 2) {
          for (const i of idxs) {
            push(bucket, i, {
              k: 'MONTH',
              v: `${MONTH_NAMES[monthIndex]} · ${idxs.length} of ${totalWithMonth}`,
              w: 2,
            });
          }
        }
      }
    }

    if (withMonth.length >= 2) {
      const dated = withMonth.map((x) => ({ i: x.i, val: x.p.year * 12 + x.p.monthIndex, label: `${x.p.monthName} ${x.p.year}` }));
      const minVal = Math.min(...dated.map((x) => x.val));
      const maxVal = Math.max(...dated.map((x) => x.val));
      const earliest = dated.filter((x) => x.val === minVal);
      const latest = dated.filter((x) => x.val === maxVal);
      for (const x of earliest) {
        push(bucket, x.i, { k: 'EARLIEST', v: `${x.label} · ${earliest.length > 1 ? 'joint first' : 'first'} in the deck`, w: 5 });
      }
      if (maxVal !== minVal) {
        for (const x of latest) {
          push(bucket, x.i, { k: 'LATEST', v: `${x.label} · ${latest.length > 1 ? 'joint last' : 'last'} in the deck`, w: 5 });
        }
      }
    }
  }

  // ---- party / solo ----------------------------------------------------------
  {
    const soloIdxs = [];
    for (let i = 0; i < n; i++) {
      if (Array.isArray(out[i].crew)) {
        if (out[i].crew.length === 1) soloIdxs.push(i);
      }
    }
    for (let i = 0; i < n; i++) {
      const crew = out[i].crew;
      if (!Array.isArray(crew)) continue;
      if (crew.length >= 2) {
        push(bucket, i, { k: 'PARTY', v: `${crew.length} of us`, w: 1 });
      }
    }
    if (soloIdxs.length >= 1) {
      for (const i of soloIdxs) {
        push(bucket, i, { k: 'SOLO', v: `alone · ${soloIdxs.length} of ${n}`, w: 2 });
      }
    }
  }

  // ---- flat fallback fields: nights / guests --------------------------------
  for (let i = 0; i < n; i++) {
    if (isCount(out[i].nights) && !nightsFired[i]) {
      push(bucket, i, { k: 'NIGHTS', v: `${out[i].nights}`, w: 1 });
    }
    if (isCount(out[i].guests) && !guestsFired[i]) {
      push(bucket, i, { k: 'GUESTS', v: `${out[i].guests}`, w: 1 });
    }
  }

  // ---- finalize: sort desc by w, then by k, cap at 8 -------------------------
  for (let i = 0; i < n; i++) {
    bucket[i].sort((a, b) => (b.w - a.w) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    out[i].facts = bucket[i].slice(0, 8);
  }

  return out;
}

export function flagOf(facts) {
  if (!Array.isArray(facts) || facts.length === 0) return null;
  return facts[0].w >= 4 ? facts[0] : null;
}
