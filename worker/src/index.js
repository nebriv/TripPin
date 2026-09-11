/* ===========================================================================
   TripPin on Cloudflare Workers.

   Serves dist/ and holds the pooled stays in KV.

   ---------------------------------------------------------------------------
   WHAT THIS PROTECTS, AND WHAT IT DOES NOT

   The data here is a travel history: towns, coordinates, dates, who went with
   whom, and photos of the insides of places people slept. Treat it as personal.

   Protection is one shared word (ENTRY_KEY), required on every API call
   including reads. That is enough to stop crawlers, search engines and anyone
   who stumbles on the URL. It is NOT authentication:

     * the word is in the page source, because the page has to know it
     * so anyone you send the link to can read it out and keep it forever

   Two secrets sit above it:

     ADMIN_KEY  - yours alone. Resets a claim, edits the roster, reads the
                  summary. Without it any friend could reset someone else's
                  claim and take their name, which would make claims pointless.
     a passcode - each player's own, set on first use. Gates reading and
                  writing THAT PLAYER'S stays (/api/mine, POST /api/stays).

   What a passcode does NOT do is hide a stay from the group, because the game
   deals from the whole pool and every player's browser therefore fetches it.
   GET /api/stays is the deck. A friend with the word and the devtools console
   can read all of it. The passcode stops casual reading through the import
   page and stops anyone writing to a name that is not theirs; it is not
   confidentiality. If you need that, you need Access and a per-person deck.

   If that is not good enough — and if this ends up holding four people's
   complete travel histories, it probably is not — put Cloudflare Access in
   front of the Worker. It is free for up to 50 users, takes about five
   minutes, and gives you real per-person email auth with revocation:

     Zero Trust -> Access -> Applications -> Add self-hosted
     domain: trippin.<subdomain>.workers.dev
     policy: Emails -> the five of you

   With Access on, this key becomes a second, redundant lock, which is fine.
   =========================================================================== */

import Host from '../../src/host.js';
import CITIES from './cities.js';
import { computeFacts, flagOf } from './facts.js';
import { quip } from './quips.js';

const KEY = 'stays:v1';
const BACKUP_KEY = 'stays:v1:previous';
const MAX_STAYS = 2000;
const MAX_BODY = 20 * 1024 * 1024;   // KV tops out at 25 MB per value

// Burst limiting, per isolate. Deliberately not KV-backed: the free tier
// allows 1000 KV writes a day and a write-per-request limiter would eat them.
// This catches hammering, not a determined attacker — Access is for that.
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

const SECURITY_HEADERS = {
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Never let a shared cache or a proxy hold someone's travel history.
      'cache-control': 'private, no-store, max-age=0',
      ...SECURITY_HEADERS,
    },
  });

// Compare without leaking length or position through timing.
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// The key travels in a header or a JSON body, never in the query string —
// query strings end up in access logs, browser history and Referer headers.
function authorised(request, env, body) {
  if (isAdmin(request, env, body)) return true;
  const want = env.ENTRY_KEY;
  if (!want) return true;                       // unset: open, for local dev
  const given = request.headers.get('x-trippin-key') || (body && body.key);
  return sameSecret(given || '', want);
}

// The admin word. Until ADMIN_KEY is set this falls back to the group word,
// so nothing breaks before you configure it — but then resetting a claim is
// something any friend can do, which is worth fixing:
//   npx wrangler secret put ADMIN_KEY
function isAdmin(request, env, body) {
  const want = env.ADMIN_KEY;
  const given = request.headers.get('x-trippin-admin') || (body && body.admin);
  if (!want) {
    if (!env.ENTRY_KEY) return true;            // local dev, both unset
    return sameSecret(
      request.headers.get('x-trippin-key') || (body && body.key) || '',
      env.ENTRY_KEY,
    );
  }
  return sameSecret(given || '', want);
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

function rateLimited(request) {
  const ip = clientIp(request);
  const now = Date.now();
  const seen = HITS.get(ip);
  if (!seen || now - seen.start > WINDOW_MS) {
    HITS.set(ip, { start: now, n: 1 });
    if (HITS.size > 5000) HITS.clear();         // crude, bounded
    return false;
  }
  seen.n += 1;
  return seen.n > MAX_PER_WINDOW;
}

/* ---------------------------------------------------------------------------
   WRONG GUESSES

   The limiter above counts requests. This one counts only the ones that got a
   secret wrong, which is the number that actually matters: a friend playing
   the game makes hundreds of requests and zero wrong guesses, and somebody
   working through a wordlist makes nothing but wrong guesses.

   Two layers, because neither is sufficient alone:

     AUTH_LIMIT  Cloudflare's rate limiting binding. Survives isolate churn
                 and is shared across every request in a colo, which is what
                 makes it worth having. It is per-colo, not global, so a
                 distributed attacker multiplies the allowance by however many
                 colos they can reach.
     LOCKOUTS    an in-memory shutter. Once the binding says an address is
                 over, that address gets a flat 429 from this isolate for the
                 next stretch without any comparison being run at all.

   Neither is a substitute for the secrets having enough entropy that a
   wordlist is hopeless. They buy time; the entropy is what does the work.
   --------------------------------------------------------------------------- */

// Two counters, not one. Getting the group word right must not clear failures
// racked up against somebody's passcode: everyone here has the group word, so
// a single counter would let a friend guess a passcode nine times, make one
// ordinary request to prove the word, and start again for free.
//
//   word:  the group word and the admin word — secrets you either have or don't
//   id:    a per-player passcode — the thing worth grinding at
//
// WHERE THE COUNTERS LIVE, AND WHY NOT IN KV
//
// They used to live in KV, which was a denial-of-service hole rather than a
// defence. The free tier allows 1000 KV writes and 100k reads a day, and a
// wrong guess cost up to three reads and a write — so roughly a thousand
// junk requests would exhaust the write quota and stop friends submitting,
// and about thirty thousand would exhaust the reads and stop the game loading
// for everybody. An attacker got to take the site down for the price of a
// short script, and the thing they broke first was the limiter meant to stop
// them.
//
// The Cache API has none of that: no quota, no billing, per-colo (which is
// exactly where the traffic being counted is), and it outlives the isolate.
// Confirmed working on this workers.dev hostname before being relied on —
// put then match round-trips a value — because Cloudflare's own rate limiting
// binding silently did nothing here and this is not a thing to assume.
//
// The upshot that matters: an unauthenticated request now touches KV zero
// times. Somebody hammering the door cannot spend the quota the game needs.
const MAX_FAILS = 10;                           // per address, per window
const LOCKOUT_S = 15 * 60;
const FAIL_DELAY_MS = 400;
const LIMIT_BASE = 'https://trippin.invalid/limit/';

// Only reached when the Cache API itself misbehaves. Per-isolate and therefore
// leaky, which is why it is the fallback and not the primary.
const MEM_FAILS = new Map();                    // ip|scope -> {n, until}

// WHY THERE ARE TWO KINDS OF COUNTER
//
// The lockout is keyed on the address, which is right for somebody hammering
// the group word from outside and wrong for everything else. Five friends on
// one sofa share a home address: one person fat-fingering their passcode ten
// times locks the other four out of the game, while an attacker with a phone,
// a laptop and a hotspot simply spends three allowances instead of one.
//
// So passcode failures are ALSO counted against the account being guessed,
// wherever they come from — and that counter slows rather than blocks. A hard
// lockout on the account would hand anybody a way to shut a specific friend
// out of the game by failing on purpose, which is a worse bug than the one it
// fixes. Guessing gets geometrically slower; the owner who knows their own
// code waits a couple of seconds and gets in.
const ACCOUNT_DELAY_MS = 400;
// The animal half of a passcode is public by design (it is the player's
// mark), so a guesser inside the group has twelve homes to try. Sixty
// seconds a try at the cap makes that a quarter of an hour of waiting, and
// every attempt shows on /admin. The address is still never locked.
const ACCOUNT_DELAY_CAP = 60_000;

function memBump(ip, scope) {
  const k = ip + '|' + scope;
  const now = Date.now();
  const seen = MEM_FAILS.get(k);
  const n = (seen && now < seen.until ? seen.n : 0) + 1;
  if (MEM_FAILS.size > 5000) MEM_FAILS.clear();
  MEM_FAILS.set(k, { n, until: now + LOCKOUT_S * 1000 });
  return n;
}

function memCount(ip, scope) {
  const seen = MEM_FAILS.get(ip + '|' + scope);
  return seen && Date.now() < seen.until ? seen.n : 0;
}

// A counter is a cached response body holding a number. The key is a synthetic
// URL that is never fetched — it only has to be unique and a GET.
// A ten-second lock in the edge cache. Returns false if it is already held.
async function takeLock(name, seconds) {
  const key = new Request(LIMIT_BASE + 'lock/' + encodeURIComponent(name));
  try {
    if (await caches.default.match(key)) return false;
    await caches.default.put(key, new Response('1', {
      headers: { 'cache-control': 'max-age=' + (seconds || 10), 'content-type': 'text/plain' },
    }));
    return true;
  } catch { return true; }                     // no cache: fail open, as before
}

function limitKey(ip, scope) {
  return new Request(LIMIT_BASE + scope + '/' + encodeURIComponent(ip));
}

// The same counter, addressed by something other than an address — used to
// count wrong guesses against the ACCOUNT they were aimed at.
//
// This started life as an in-memory map and did nothing at all: a Worker
// spreads requests over isolates, so seven guesses in a row were counted by
// seven different copies and the delay never grew. Measured flat at 0.6s
// across seven attempts, which is how it was caught. The edge cache is shared
// across the colo, which is the whole reason the lockout lives there too.
function namedKey(name) {
  return new Request(LIMIT_BASE + 'acct/' + encodeURIComponent(name));
}

async function namedCount(name) {
  try {
    const hit = await caches.default.match(namedKey(name));
    return hit ? (parseInt(await hit.text(), 10) || 0) : 0;
  } catch { return 0; }
}

async function namedBump(name) {
  const n = (await namedCount(name)) + 1;
  try {
    await caches.default.put(namedKey(name), new Response(String(n), {
      headers: { 'cache-control': 'max-age=' + LOCKOUT_S, 'content-type': 'text/plain' },
    }));
  } catch { /* best effort */ }
  return n;
}

async function namedClear(name) {
  try { await caches.default.delete(namedKey(name)); } catch { /* fine */ }
}

async function failCount(ip, scope) {
  try {
    const hit = await caches.default.match(limitKey(ip, scope));
    if (!hit) return memCount(ip, scope);
    return parseInt(await hit.text(), 10) || 0;
  } catch {
    return memCount(ip, scope);
  }
}

async function failBump(ip, scope) {
  const n = (await failCount(ip, scope)) + 1;
  try {
    await caches.default.put(limitKey(ip, scope), new Response(String(n), {
      headers: {
        'cache-control': 'max-age=' + LOCKOUT_S,
        'content-type': 'text/plain',
      },
    }));
    memBump(ip, scope);                         // keep the fallback warm
    return n;
  } catch {
    return memBump(ip, scope);
  }
}

async function failClear(ip, scope) {
  MEM_FAILS.delete(ip + '|' + scope);
  try { await caches.default.delete(limitKey(ip, scope)); } catch { /* fine */ }
}

async function lockedOut(request, env) {
  const ip = clientIp(request);
  // Only the group word can shut an address out. See deny() for why a wrong
  // passcode must never do so.
  return (await failCount(ip, 'word')) >= MAX_FAILS;
}

async function deny(request, env, message, status = 401, scope = 'word', owner = '') {
  const ip = clientIp(request);

  // Only a 401 is somebody getting a secret wrong. A 409 means the name has
  // not been claimed yet — a state of the world, not a guess — and counting
  // it would let an ordinary publish run lock its own operator out.
  if (status !== 401) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return json({ error: message }, status);
  }

  // A wrong passcode counts against the name it was aimed at as well as the
  // address it came from, so switching networks buys nothing.
  // THE TWO SECRETS GET DIFFERENT TREATMENT, ON PURPOSE.
  //
  // The group word faces the open internet, so guessing it earns a hard
  // fifteen-minute lockout on the address it came from.
  //
  // A passcode does not. You need the group word before you can even try one,
  // so a guesser is already inside the group — and locking the address would
  // punish the wrong people entirely: five friends on one sofa share a home
  // address, so one person fumbling their emoji shuts the whole house out of
  // the day's game. That happened during testing, to the actual owner, which
  // is how it was found.
  //
  // So a wrong passcode slows down the NAME it was aimed at, wherever it came
  // from. Switching networks buys nothing, the household is not punished for
  // somebody else's typing, and nobody can lock a friend out on purpose.
  if (scope === 'id' && owner) {
    const tries = await namedBump(owner);
    await new Promise((r) => setTimeout(r, Math.min(ACCOUNT_DELAY_CAP,
      ACCOUNT_DELAY_MS * Math.pow(2, tries / 3))));
    return json({ error: message }, status);
  }

  const n = await failBump(ip, scope);
  if (n >= MAX_FAILS) {
    return json({ error: 'Too many wrong guesses. Try again later.' }, 429);
  }
  await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
  return json({ error: message }, status);
}

// Getting in clears the slate, so a friend who fat-fingers it twice and then
// succeeds is not one typo away from being shut out later in the day.
//
// Only the scope you actually proved. Proving the group word says nothing
// about whether you know anyone's passcode, so it must not wipe the counter
// guarding them — that would make the passcode lockout free to reset.
async function forgive(request, env, scope, owner) {
  await failClear(clientIp(request), scope);
  if (owner) await namedClear(owner);
}


// A submitted stay is data from a friend's browser, not something to trust
// verbatim — take the fields we know and drop everything else.
function cleanStay(raw, owner) {
  if (!raw || typeof raw !== 'object') return null;

  const str = (v, max) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const photo = (v) => {
    const s = str(v, 8 * 1024 * 1024);
    return s && /^(https:\/\/|data:image\/)/i.test(s) ? s : null;
  };

  const lat = num(raw.lat, -90, 90);
  const lng = num(raw.lng, -180, 180);
  const place = str(raw.place, 120);
  if (lat === null || lng === null || !place) return null;

  return {
    id: str(raw.id, 80) || `${owner}-${crypto.randomUUID().slice(0, 8)}`,
    owner,
    booker: owner,
    // The owner is always on their own stay, whatever the submission says.
    //
    // Crew lists are self-reported and crew membership is what turns a card
    // into a host round, so leaving yourself off your own trips was a way to
    // never host — which meant always getting the question you already knew
    // the answer to. Worth about fifteen hundred points a day to whoever
    // contributed most of the deck, and impossible to disprove, because
    // nobody can show you were somewhere. Closed by construction: you booked
    // it, you were there.
    crew: (() => {
      const given = Array.isArray(raw.crew)
        ? raw.crew.filter((c) => typeof c === 'string').slice(0, 12)
        : [];
      return given.indexOf(owner) === -1 ? [owner].concat(given) : given;
    })(),
    others: num(raw.others, 0, 999) ?? 0,
    title: str(raw.title, 200),
    type: str(raw.type, 60),
    guests: num(raw.guests, 0, 99),
    bedrooms: num(raw.bedrooms, 0, 99),
    beds: num(raw.beds, 0, 99),
    baths: num(raw.baths, 0, 99),
    amenities: Array.isArray(raw.amenities)
      ? raw.amenities.filter((a) => typeof a === 'string')
          .slice(0, 8).map((a) => a.slice(0, 60))
      : [],
    price: num(raw.price, 0, 100000),
    rating: num(raw.rating, 0, 5),
    reviews: num(raw.reviews, 0, 1e6),
    quote: str(raw.quote, 400),
    quoteBy: str(raw.quoteBy, 80),
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    place,
    when: str(raw.when, 60),
    nights: num(raw.nights, 0, 400),
    // One line means one line. The page caps at 140; this is the ceiling.
    story: str(raw.story, 200),
    facts: Array.isArray(raw.facts) ? raw.facts.slice(0, 8) : [],
    photo: photo(raw.photo),
    photos: Array.isArray(raw.photos)
      ? raw.photos.map(photo).filter(Boolean).slice(0, 6)
      : [],
  };
}

function cleanPerson(raw) {
  if (!raw || typeof raw.id !== 'string') return null;
  const id = raw.id.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (!id) return null;
  return {
    id,
    name: (typeof raw.name === 'string' && raw.name.trim() ? raw.name : id).slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(raw.color || '') ? raw.color : '#6b6b6b',
    tell: (typeof raw.tell === 'string' ? raw.tell : '').slice(0, 240),
  };
}

// --------------------------------------------------------------- per person --
//
// The shared word proves you are in the group. It does not prove you are Ben.
// Without something per-person, anyone holding the word could read Ben's stays
// or overwrite them by posting as him. So each player claims their own name
// once and sets a passcode; after that only that passcode can read or write
// their stays.
//
// Trust-on-first-use: the first person to claim a name gets it. Among five
// friends that is proportionate, and the admin page can reset a claim.

const AUTH_PREFIX = 'auth:';

async function hashPass(pass, salt) {
  const data = new TextEncoder().encode(salt + ':' + pass);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function codePoints(s) {
  return Array.from(String(s)).length;
}

function ownerId(raw) {
  return typeof raw === 'string'
    ? raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
    : '';
}

async function claimOf(env, owner) {
  return env.TRIPPIN.get(AUTH_PREFIX + owner, 'json');
}

// The first code point of the passcode is the animal, and the animal is the
// player's mark: on the tiles, beside their score, on the cards they put in.
// It is kept in the clear on purpose — everyone in the group knows whose bear
// that is, and the home stays secret. The answer to a stolen passcode is
// visibility on /admin, not more bits.
function animalOf(pass) {
  return Array.from(String(pass || ''))[0] || null;
}

async function setClaim(env, owner, pass) {
  const salt = crypto.randomUUID();
  await env.TRIPPIN.put(AUTH_PREFIX + owner, JSON.stringify({
    salt,
    hash: await hashPass(pass, salt),
    animal: animalOf(pass),
    claimed: new Date().toISOString(),
  }));
}

// Claims made before the animal was recorded get it filled in on the next
// successful sign-in. One write, once.
async function backfillAnimal(env, owner, pass) {
  const rec = await claimOf(env, owner);
  if (!rec || rec.animal) return;
  rec.animal = animalOf(pass);
  await env.TRIPPIN.put(AUTH_PREFIX + owner, JSON.stringify(rec));
}

// 'ok' | 'unclaimed' | 'needed' | 'bad'
async function checkOwner(env, owner, pass) {
  const rec = await claimOf(env, owner);
  if (!rec) return 'unclaimed';
  if (!pass) return 'needed';
  return sameSecret(await hashPass(pass, rec.salt), rec.hash) ? 'ok' : 'bad';
}

function passOf(request, body) {
  // Header values are Latin-1 by spec, and a passcode here is normally a
  // single emoji — the browser refuses to send it raw and throws before the
  // request leaves. So clients percent-encode this one header and it is
  // decoded here. A body carries JSON and needs none of that.
  const raw = request.headers.get('x-trippin-pass');
  if (raw) {
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return (body && body.pass) || '';
}

const DENY = {
  unclaimed: ['That name has not been claimed yet. Claim it first.', 409],
  needed: ['That name is claimed. Enter its passcode.', 401],
  bad: ['Wrong passcode for that name.', 401],
};

// The deck is read on every game load and rewritten a handful of times a
// year, so almost every KV read this Worker does is the same bytes again.
// Holding it briefly per isolate keeps a normal day's play well clear of the
// read quota. Short enough that a friend's submission shows up while they are
// still looking at the page, and the isolate that writes drops it immediately.
let poolCache = null;                           // {pool, until}
const POOL_TTL_MS = 20_000;

function dropPoolCache() { poolCache = null; }

/* ---------------------------------------------------------------------------
   THE DEAL LEDGER

   Which three stays a given day shows used to be derived on the fly from a
   seeded shuffle of the deck. That worked until the deck changed: every time
   somebody imported their trips the shuffle reordered, so a stay dealt last
   Tuesday could come back on Thursday while others had never appeared, and two
   friends opening the game either side of an import saw different puzzles.

   So the deal is decided once, here, and written down. First player of the day
   causes it to be computed; everybody else reads the same answer. The ledger
   also carries the set of stays already spent, so the deck is exhausted before
   anything repeats, and a per-owner tally so the rota below can keep the deck
   from being dominated by whoever imported the most.

   The computation is deterministic given (ledger, pool, day), so two players
   racing on a brand new day compute the same three stays and it does not
   matter who writes first.
   --------------------------------------------------------------------------- */

const DEALS_KEY = 'deals:v1';
const ROUNDS = 3;
const MAX_LEDGER_DAYS = 400;

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

async function readDeals(env) {
  const raw = await env.TRIPPIN.get(DEALS_KEY, 'json');
  return (raw && raw.days) ? raw : { days: {}, used: [], owners: {} };
}

// WHAT "FAIR ROTATION" CAN AND CANNOT MEAN
//
// It cannot mean equal airtime per owner. Holding "nothing repeats until the
// deck is spent" fixes each owner's share of the puzzles to their share of the
// deck — the arithmetic leaves no room. If one person supplied three quarters
// of the stays then three quarters of the places are theirs, and the only ways
// round it are to bin their surplus or to show everyone else's twice.
//
// What it can mean, and what actually matters, is this: no one player should
// spend the whole day on host rounds. A stay you were on stops being the game
// and becomes a puzzle about the group, so a day where all three are yours is
// a day you never once guess a location. So the deal is chosen to spread the
// hosting — greedily, picking the stay that leaves the worst-off player least
// burdened, then preferring an owner who has not been dealt lately.
//
// On a deck that is nearly all one person's this cannot save them, and it does
// not pretend to. It just stops the clumping the moment there is anything to
// spread.
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

  // Among stays that spread the hosting equally, the one dealt longest ago
  // goes first. This is what keeps a stay from coming back a day or two
  // after a cycle turns over: the top-up on a reset day, and the leftovers
  // that opened the new cycle, all land as late in the next cycle as the
  // arithmetic allows. A stay never dealt at all comes first of all.
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
   SCORING LIVES HERE, NOT IN THE BROWSER

   It used to live in the page, which meant the page had to be told the
   answers: GET /api/stays handed every client all forty-one stays with exact
   coordinates and crew lists, because that is what the deck was built from.
   Anyone who opened the network tab — or just looked at a variable — could pin
   every card to the metre and tick every crew exactly. Three thousand out of
   three thousand, every day, undetectable if you had the sense to miss by ten
   miles on purpose. There was no version of client-side scoring that did not
   have this hole, because scoring requires the answer.

   So the browser now gets a CARD and a QUESTION, and nothing that answers
   either. It sends back a pin and a set of names; the Worker scores them and
   sends the truth back with the result. The answer arrives after the guess is
   committed, which is the only ordering that works.

   A second thing falls out of this for free: the Worker writes down what you
   answered. Clearing local storage and replaying the day used to be a way to
   grind a frozen puzzle until it came out perfect. Now the first answer is the
   answer.
   --------------------------------------------------------------------------- */

const PLAY_PREFIX = 'play:';

/* ---------------------------------------------------------------------------
   THE RECORD

   One document, rewritten on every guess: what each player did each day, and
   what every stay has done to the group. It is what the day reveal, the stats
   page, the standing and the trap notices are built from, so none of them
   have to read five play records a day going back a season.

   Best effort: two guesses landing in the same second can lose one update
   here. The play record stays the truth for scoring; this is the ledger the
   fun is built on, and a lost row is a lost joke, not a lost point.
   --------------------------------------------------------------------------- */

const STATS_KEY = 'stats:v1';
const KEEP_DAYS = 120;
const NEAR_MILES = 500;

async function readStats(env) {
  const raw = await env.TRIPPIN.get(STATS_KEY, 'json');
  return raw && typeof raw === 'object' ? raw : { players: {}, stays: {}, days: {} };
}

async function writeStats(env, st) {
  await env.TRIPPIN.put(STATS_KEY, JSON.stringify(st));
}

function playerRec(st, owner) {
  return st.players[owner] || (st.players[owner] = { days: {}, quips: [] });
}

function dayRec(st, day) {
  return st.days[day] || (st.days[day] = { calls: {}, reacts: [] });
}

function pruneStats(st, today) {
  const floor = today - KEEP_DAYS;
  for (const p of Object.values(st.players)) {
    for (const d of Object.keys(p.days)) if (Number(d) < floor) delete p.days[d];
    p.quips = (p.quips || []).filter((q) => q.d >= today - 14);
  }
  for (const d of Object.keys(st.days)) if (Number(d) < floor) delete st.days[d];
}

// Fold one scored round into the record.
function recordRound(st, owner, day, round, stay, result, at, line) {
  const p = playerRec(st, owner);
  const dr = p.days[day] || (p.days[day] = { p: 0, r: [] });
  const row = {
    s: stay.id, o: stay.owner, pl: stay.place,
    d: typeof result.dist === 'number' ? Math.round(result.dist) : null,
    w: !!result.whoCorrect, wp: result.whoPts || 0, xp: result.wherePts || 0,
    pts: result.pts, h: !!result.host, f: result.fmt || null, l: result.label || null,
    la: at ? Math.round(at.lat * 100) / 100 : null,
    ln: at ? Math.round(at.lng * 100) / 100 : null,
    who: result.who || [],
    reg: at ? Host._internals.regionOf(at) : null,
  };
  dr.r[round] = row;
  dr.p = dr.r.filter(Boolean).reduce((a, r) => a + (r.pts || 0), 0);

  // The stay's own record: only normal rounds, only other people. A host
  // round pins a constructed target and says nothing about the place.
  if (!result.host && typeof result.dist === 'number') {
    const sr = st.stays[stay.id] || (st.stays[stay.id] = {
      o: stay.owner, plays: 0, sum: 0, best: null, near: 0, catches: [],
    });
    sr.o = stay.owner;
    sr.plays += 1;
    sr.sum += result.dist;
    sr.best = sr.best == null ? result.dist : Math.min(sr.best, result.dist);
    if (result.dist <= NEAR_MILES) sr.near += 1;
    if (result.dist > 1500) {
      sr.catches.push({ v: owner, m: Math.round(result.dist), d: day });
      sr.catches = sr.catches.slice(-20);
    }
  }
  if (line) {
    p.quips = (p.quips || []).concat([{ d: day, id: line.id, h: line.hash }]).slice(-60);
  }
}

// The player's recent rounds, flattened, oldest first — what the callback
// strategy reads patterns from.
function recentRounds(st, owner, today, days) {
  const p = st.players[owner];
  if (!p) return [];
  const out = [];
  for (let d = today - days; d <= today; d++) {
    const dr = p.days[d];
    if (!dr) continue;
    dr.r.forEach((r) => {
      if (!r) return;
      out.push({ day: d, host: r.h, region: r.reg, blamed: r.who, dist: r.d });
    });
  }
  return out;
}

// Who is expected to play: claimed AND in the deck. Somebody who has not
// set up, or has sent nothing in, cannot play and must not hold the day open.
async function activePlayers(env, pool) {
  const owned = {};
  for (const s of pool.stays) owned[s.owner] = 1;
  const out = [];
  for (const p of pool.crew) {
    if (!owned[p.id]) continue;
    if (await claimOf(env, p.id)) out.push(p.id);
  }
  return out;
}

async function playedCount(env, day, players) {
  let n = 0;
  const played = {};
  for (const id of players) {
    const rec = await readPlay(env, day, id);
    const done = [0, 1, 2].every((i) => rec[i]);
    played[id] = done;
    if (done) n += 1;
  }
  return { n, played };
}

// Take one player's day out of the record, subtracting what their pins did
// to each stay's aggregate. `best` cannot be un-minimised exactly, so it is
// recomputed as unknown when it was theirs.
function purgeDay(st, owner, day) {
  const p = st.players[owner];
  if (!p || !p.days[day]) return;
  (p.days[day].r || []).forEach((r) => {
    if (!r || r.h || typeof r.d !== 'number') return;
    const sr = st.stays[r.s];
    if (!sr) return;
    sr.plays = Math.max(0, sr.plays - 1);
    sr.sum = Math.max(0, sr.sum - r.d);
    if (r.d <= NEAR_MILES) sr.near = Math.max(0, sr.near - 1);
    if (sr.best === r.d) sr.best = null;
    sr.catches = (sr.catches || []).filter((c) => !(c.v === owner && c.d === day));
    if (!sr.plays) delete st.stays[r.s];
  });
  delete p.days[day];
  const dr = st.days[day];
  if (dr) {
    Object.keys(dr.calls || {}).forEach((k) => { if (k.split('|')[0] === owner) delete dr.calls[k]; });
    dr.reacts = (dr.reacts || []).filter((x) => x.from !== owner && x.to !== owner);
  }
}

function purgePlayer(st, owner) {
  const p = st.players[owner];
  if (p) Object.keys(p.days).forEach((d) => purgeDay(st, owner, Number(d)));
  delete st.players[owner];
  Object.keys(st.stays).forEach((id) => { if (st.stays[id].o === owner) delete st.stays[id]; });
  Object.values(st.days).forEach((dr) => {
    Object.keys(dr.calls || {}).forEach((k) => { if (k.split('|')[0] === owner) delete dr.calls[k]; });
    dr.reacts = (dr.reacts || []).filter((x) => x.from !== owner && x.to !== owner);
  });
}

function stayStats(sr) {
  if (!sr || !sr.plays) return null;
  return { plays: sr.plays, avg: sr.sum / sr.plays, best: sr.best, near500: sr.near };
}

// Everything the card needs to be drawn, and nothing that gives it away.
// Place, coordinates, crew, month, title and story are all answers.
// No id: ids are made from the place name ("troms-2025-2"), so the id is
// the answer. The truth carries it after the guess is recorded.
const CARD_FIELDS = [
  'photo', 'photos', 'type', 'guests', 'bedrooms', 'beds', 'baths',
  'amenities', 'nights', 'others', 'rating', 'reviews',
];

function cardOf(stay) {
  const out = {};
  for (const f of CARD_FIELDS) if (stay[f] != null) out[f] = stay[f];
  return out;
}

// The question, minus its answer. `options` keep their labels but lose the
// coordinates they are graded against; `answer`, `target` and `targetFor`
// never leave the Worker.
function askOf(spec) {
  if (!spec) return null;
  return {
    fmt: spec.fmt,
    kind: spec.kind,
    label: spec.label,
    prompt: spec.prompt,
    how: spec.how,
    people: spec.people || null,
    options: (spec.options || []).map((o) => ({ key: o.key, label: o.label })),
    allowEmpty: !!spec.allowEmpty,
  };
}

/* ---------------------------------------------------------------------------
   YOU BRING STAYS OR YOU DO NOT PLAY

   The deck was one person's forty-one stays, which made them host every single
   round for ever while the other four hosted almost none. Measured: 100%, 41%,
   27%, 7%, 5%. The person who supplied the whole game had never once played the
   actual game.

   No dealing rule can fix that — there is nothing else to deal. But the game
   does not have to pretend it is fine either. Contributing is the price of
   entry, which makes the imbalance self-correcting instead of permanent: every
   new player is also new content, and the more people play the flatter the
   host rate gets on its own.

   The bar is deliberately one stay, not eight. Someone who has genuinely only
   ever booked three places should not be locked out of their friends' game,
   and a bar high enough to guarantee balance is also high enough to lose
   people at the door. One stay is the honest ask: you are in the deck, or you
   are watching.
   --------------------------------------------------------------------------- */

const MIN_STAYS_TO_PLAY = 1;

async function contributes(env, owner) {
  const pool = await readPool(env);
  return pool.stays.filter((s) => s.owner === owner).length >= MIN_STAYS_TO_PLAY;
}

async function readPlay(env, day, owner) {
  const raw = await env.TRIPPIN.get(PLAY_PREFIX + day + ':' + owner, 'json');
  return raw && typeof raw === 'object' ? raw : {};
}

function specFor(pool, stay, owner, day, round, seen) {
  return Host.challenge(stay, {
    me: owner,
    crew: pool.crew,
    stays: pool.stays,
    cities: CITIES,             // the `level` format picks its four from these
    seen,
    dayIndex: day,
    round,
  });
}

// Today, counted from the same epoch the client uses, in UTC.
//
// The five players are all in the Americas, where UTC is ahead of local time,
// so the deal for their local day is always already computable. Somebody east
// of UTC would wait a few hours past their midnight — a trade worth making for
// what it closes below.
const EPOCH_UTC = Date.UTC(2026, 8, 10);
const utcToday = () => Math.floor((Date.now() - EPOCH_UTC) / 86400000);

async function dealFor(env, day) {
  const ledger = await readDeals(env);

  // Refuse a future day even if one is already written down. Anything ahead of
  // today in the ledger is residue from before this check existed, and serving
  // it would defeat the point of having the check.
  if (day > utcToday()) return { ids: [], ledger, fresh: false };

  const have = ledger.days[String(day)];
  if (have && have.length) return { ids: have, ledger, fresh: false };

  // Never compute a deal for a day that has not arrived.
  //
  // This endpoint used to take any integer, so `?day=400` answered with the
  // stays for day 400 — and combined with the deck endpoint, which hands over
  // every coordinate, that is every answer for every future day. It is a URL,
  // not an exploit: the kind of thing a curious friend types once and can
  // never un-know. It also wrote what it computed, so reading ahead quietly
  // spent those stays and corrupted the rotation for everyone else.
  //
  // Past days stay readable — backfilling a missed day is a feature — but only
  // if they were actually dealt at the time. A past day with no entry is not
  // computed now, because doing so would consume stays out of order.
  //
  // A day's grace either side of UTC, because the client counts days from its
  // own local midnight and the Worker counts from UTC. In the Americas the
  // client is always a day behind or level, so an exact match refused every
  // request until UTC caught up — which is how this was found. Refusing
  // anything AHEAD of UTC is what closes the lookahead; refusing ancient days
  // is what stops somebody burning the deck by dealing day minus five hundred.
  const t = utcToday();
  if (day > t || day < t - 1) return { ids: [], ledger, fresh: false };

  const pool = await readPool(env);
  if (!pool.stays.length) return { ids: [], ledger, fresh: false };

  const got = computeDeal(pool, ledger, day);
  ledger.days[String(day)] = got.ids;
  ledger.used = got.reset ? got.fresh.slice() : (ledger.used || []).concat(got.ids);
  ledger.owners = ledger.owners || {};
  for (const o of got.owners) ledger.owners[o] = (ledger.owners[o] || 0) + 1;

  // Keep the ledger bounded. Old days are history nobody replays.
  const keys = Object.keys(ledger.days).map(Number).sort((a, b) => a - b);
  while (keys.length > MAX_LEDGER_DAYS) delete ledger.days[String(keys.shift())];

  await env.TRIPPIN.put(DEALS_KEY, JSON.stringify(ledger));
  return { ids: got.ids, ledger, fresh: true };
}

async function readPool(env) {
  if (poolCache && Date.now() < poolCache.until) return poolCache.pool;
  const raw = await env.TRIPPIN.get(KEY, 'json');
  const pool = raw && Array.isArray(raw.stays)
    ? raw
    : { crew: [], stays: [], updated: null };
  poolCache = { pool, until: Date.now() + POOL_TTL_MS };
  return pool;
}

async function handlePost(request, env) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return json({ error: 'Too big. Use photo links rather than embedding them.' }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  if (!authorised(request, env, body)) return deny(request, env, 'Wrong word.');

  const owner = ownerId(body.owner);
  if (!owner) return json({ error: 'Say who these belong to.' }, 400);

  // Only the person who claimed this name may write to it.
  const verdict = await checkOwner(env, owner, passOf(request, body));
  if (verdict !== 'ok') {
    return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', owner);
  }
  if (!Array.isArray(body.stays)) return json({ error: 'No stays in there.' }, 400);

  const incoming = body.stays.map((s) => cleanStay(s, owner)).filter(Boolean);
  if (!incoming.length) {
    return json({ error: 'None of those had a place and coordinates.' }, 400);
  }

  const pool = await readPool(env);

  // A submission is the complete truth for that person: replace their stays
  // rather than appending, so re-importing does not double everything up.
  const kept = pool.stays.filter((s) => s.owner !== owner);
  // Superlatives and oddities across the whole pool, written onto each stay
  // now so the game reads and never calculates.
  const stays = computeFacts(kept.concat(incoming).slice(0, MAX_STAYS));

  // The roster comes along because /import has to be able to add a player who
  // wasn't on the list. But it is everyone's roster, and the tells are half the
  // game — so a submission may add someone new or edit its own entry, and may
  // not touch anybody else's. Rewriting other people's names and tells is an
  // admin job: POST /api/crew.
  const crew = new Map(pool.crew.map((p) => [p.id, p]));
  for (const raw of Array.isArray(body.crew) ? body.crew : []) {
    const p = cleanPerson(raw);
    if (!p) continue;
    if (crew.has(p.id) && p.id !== owner) continue;
    crew.set(p.id, { ...(crew.get(p.id) || {}), ...p });
  }
  if (!crew.has(owner)) crew.set(owner, cleanPerson({ id: owner, name: owner }));

  // Who rewrote what, kept where the admin page can see it. A passcode is two
  // tiles by design, so the answer to a stolen one is not a longer passcode —
  // it is that the damage is scoped to that person's own stays, reversible
  // from the backup below, and never silent.
  const log = (pool.writes || []).slice(-19);
  log.push({
    owner,
    at: new Date().toISOString(),
    was: pool.stays.filter((s) => s.owner === owner).length,
    now: incoming.length,
  });

  const next = {
    crew: [...crew.values()], stays, writes: log,
    updated: new Date().toISOString(),
  };

  // Keep one generation back, so a bad publish is recoverable.
  if (pool.stays.length) {
    await env.TRIPPIN.put(BACKUP_KEY, JSON.stringify(pool));
  }
  await env.TRIPPIN.put(KEY, JSON.stringify(next));
  dropPoolCache();

  return json({
    ok: true,
    owner,
    added: incoming.length,
    replaced: pool.stays.length - kept.length,
    total: stays.length,
    crew: next.crew.map((p) => p.id),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (rateLimited(request)) {
      return json({ error: 'Slow down.' }, 429);
    }

    // Somebody who has already burned through their wrong guesses gets
    // nothing further compared against anything.
    //
    // The admin word is the exception, and has to be: the lockout lives in the
    // edge cache with a fifteen-minute life and nothing can reach in to lift
    // it, so without this the person who runs the game could shut himself out
    // of the admin page with no way back. Checking it costs one constant-time
    // comparison and no storage, and getting it wrong still counts as a guess
    // further down.
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health'
        && !isAdmin(request, env, null)
        && await lockedOut(request, env)) {
      return json({ error: 'Too many wrong guesses. Try again later.' }, 429);
    }

    // Belt and braces with the X-Robots-Tag header below.
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'content-type': 'text/plain', ...SECURITY_HEADERS },
      });
    }

    if (url.pathname === '/api/health') {
      // Deliberately says nothing about whether there is data or who is in it.
      return json({ ok: true, service: 'trippin' });
    }

    // Just the roster: names and colours, no stays. The import page needs
    // this to match "Andrew" on a facepile to a player, and nothing more —
    // it must never receive anybody's travel history.
    if (url.pathname === '/api/crew') {
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      if (request.method === 'GET') {
        const pool = await readPool(env);
        // Whether each name has been claimed, so the sign-in screen can say
        // "not set up yet" before somebody taps it and hits a dead end.
        // Within the group this is not sensitive — it is the same thing you
        // learn by trying the name.
        const claimed = {};
        const animals = {};
        for (const p of pool.crew) {
          const rec = await claimOf(env, p.id);
          claimed[p.id] = !!rec;
          animals[p.id] = (rec && rec.animal) || null;
        }
        const owned = {};
        for (const st of pool.stays) owned[st.owner] = (owned[st.owner] || 0) + 1;
        return json({
          crew: pool.crew.map((p) => ({
            id: p.id, name: p.name, color: p.color, tell: p.tell,
            claimed: !!claimed[p.id],
            animal: animals[p.id],
            // How many they have put in. The sign-in screen needs this to tell
            // somebody they are one import away from playing, and the reveal
            // needs it to show the group how lopsided the deck still is.
            stays: owned[p.id] || 0,
          })),
          deck: pool.stays.length,
        });
      }
      // Editing the roster — names, colours and the "tell" lines. Touches no
      // stays, so it is safe to do from the admin page without spoiling anything.
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
        if (!isAdmin(request, env, body)) {
          return deny(request, env, 'Admin word needed.', 401, 'id');
        }
        if (!Array.isArray(body.crew)) return json({ error: 'No crew in there.' }, 400);
        const pool = await readPool(env);
        const crew = new Map(pool.crew.map((p) => [p.id, p]));
        let changed = 0;
        for (const raw of body.crew) {
          const p = cleanPerson(raw);
          if (!p) continue;
          crew.set(p.id, { ...(crew.get(p.id) || {}), ...p });
          changed += 1;
        }
        pool.crew = [...crew.values()];
        pool.updated = new Date().toISOString();
        await env.TRIPPIN.put(KEY, JSON.stringify(pool));
  dropPoolCache();
        return json({ ok: true, updated: changed });
      }
      return json({ error: 'GET or POST.' }, 405);
    }

    // Claiming a name. GET says whether it is taken; POST takes it.
    if (url.pathname === '/api/claim') {
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');

      if (request.method === 'GET') {
        const who = ownerId(url.searchParams.get('owner'));
        if (!who) return json({ error: 'Which owner?' }, 400);
        const rec = await claimOf(env, who);
        // Deliberately says only whether it is claimed, never anything about
        // the passcode itself.
        return json({ owner: who, claimed: !!rec });
      }

      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
        const who = ownerId(body.owner);
        const pass = typeof body.pass === 'string' ? body.pass : '';
        if (!who) return json({ error: 'Which owner?' }, 400);
        // Two tiles — an animal and where it lives — is the whole passcode.
        // The group word does the authenticating (fifty bits, checked on every
        // request); this only says which of five friends you are. Measured in
        // code points rather than UTF-16 units, because every tile is a
        // surrogate pair and String.length would call two tiles four.
        if (!codePoints(pass)) {
          return json({ error: 'Pick something.' }, 400);
        }

        const rec = await claimOf(env, who);
        if (rec) return json({ error: 'That name is already claimed.' }, 409);
        await setClaim(env, who, pass);
        return json({ ok: true, owner: who });
      }

      return json({ error: 'GET or POST.' }, 405);
    }

    // Resetting a claim, for when somebody forgets. Guarded by the admin word,
    // which for now is the same group word — see the note at the top.
    if (url.pathname === '/api/unclaim') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      // Admin only. With the group word alone, any friend could reset your
      // claim, take your name and write over your stays.
      if (!isAdmin(request, env, body)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const who = ownerId(body.owner);
      if (!who) return json({ error: 'Which owner?' }, 400);
      await env.TRIPPIN.delete(AUTH_PREFIX + who);
      return json({ ok: true, owner: who });
    }

    // Taking somebody out of the pool: their stays, their claim, everything.
    // Admin only, because it is the one operation in here that destroys data
    // somebody else put in. The two callers are a friend who leaves the group
    // and a throwaway account used to test the setup journey — without this,
    // testing the friend journey meant permanently adding junk to the deck.
    //
    // The backup generation is written first, exactly as a normal submission
    // does, so this is recoverable for one step.
    if (url.pathname === '/api/forget') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!isAdmin(request, env, body)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const who = ownerId(body.owner);
      if (!who) return json({ error: 'Which owner?' }, 400);

      const pool = await readPool(env);
      const had = pool.stays.filter((s) => s.owner === who).length;
      const stays = pool.stays.filter((s) => s.owner !== who);
      const crew = (pool.crew || []).filter((p) => p.id !== who);

      const log = (pool.writes || []).slice(-19);
      log.push({ owner: who, at: new Date().toISOString(), was: had, now: 0, forgot: true });

      if (pool.stays.length) {
        await env.TRIPPIN.put(BACKUP_KEY, JSON.stringify(pool));
      }
      await env.TRIPPIN.put(KEY, JSON.stringify({
        crew, stays, writes: log, updated: new Date().toISOString(),
      }));
      dropPoolCache();
      await env.TRIPPIN.delete(AUTH_PREFIX + who);

      // Their rows come out of the record too, and what they did to other
      // people's stays is subtracted, so a test account leaves no trace.
      const stats = await readStats(env);
      purgePlayer(stats, who);
      await writeStats(env, stats);

      return json({ ok: true, owner: who, removed: had, total: stays.length });
    }

    // Recompute the facts on every stay in place. Facts are written at
    // submission time; this is for a pool that predates them.
    if (url.pathname === '/api/refacts') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { body = {}; }
      if (!isAdmin(request, env, body)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const pool = await readPool(env);
      pool.stays = computeFacts(pool.stays);
      pool.updated = new Date().toISOString();
      await env.TRIPPIN.put(KEY, JSON.stringify(pool));
      dropPoolCache();
      const flagged = pool.stays.filter((s) => flagOf(s.facts || [])).length;
      return json({ ok: true, stays: pool.stays.length, flagged });
    }

    // Wiping one player's answers for one day, so they can play it again.
    // Admin only: this is the one thing that lets a puzzle be replayed, and
    // replaying a frozen puzzle is exactly the grind the play record closes.
    if (url.pathname === '/api/replay') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!isAdmin(request, env, body)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const who = ownerId(body.owner);
      const day = parseInt(body.day, 10);
      if (!who || !Number.isFinite(day)) return json({ error: 'Which day?' }, 400);
      await env.TRIPPIN.delete(PLAY_PREFIX + day + ':' + who);
      const stats = await readStats(env);
      purgeDay(stats, who, day);
      await writeStats(env, stats);
      return json({ ok: true, owner: who, day });
    }

    // Today's three stays, decided once and remembered, so the whole group
    // plays the same puzzle and nothing repeats until the deck is spent.
    // Admin only, since 2026-09-11. Stay ids are built from the place name,
    // so handing today's ids to anyone with the group word was handing them
    // today's three towns before they had played. The game never needed
    // this route — it asks /api/round for one card at a time.
    if (url.pathname === '/api/deal') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!isAdmin(request, env, null)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const day = parseInt(url.searchParams.get('day'), 10);
      if (!Number.isFinite(day)) return json({ error: 'Which day?' }, 400);
      const out = await dealFor(env, day);
      // `seen` is every stay the group has been dealt. host.js uses it to keep
      // a host round from answering with a card nobody has played yet.
      return json({ day, stays: out.ids, seen: out.ledger.used || [] });
    }

    // Today's card and today's question, with every answer stripped out.
    if (url.pathname === '/api/round') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      const day = parseInt(url.searchParams.get('day'), 10);
      const round = parseInt(url.searchParams.get('round'), 10);
      const who = ownerId(url.searchParams.get('owner'));
      if (!Number.isFinite(day) || !Number.isFinite(round)) {
        return json({ error: 'Which round?' }, 400);
      }
      if (!who) return json({ error: 'Which owner?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, null));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);

      if (!(await contributes(env, who))) {
        return json({
          error: 'Add your stays first — the deck is what everyone plays.',
          needStays: true,
        }, 402);
      }

      const got = await dealFor(env, day);
      const id = got.ids[round];
      if (!id) return json({ error: 'No such round.' }, 404);
      const pool = await readPool(env);
      const stay = pool.stays.filter((x) => x.id === id)[0];
      if (!stay) return json({ error: 'That stay is gone.' }, 404);

      const spec = specFor(pool, stay, who, day, round, got.ledger.used || []);
      const played = await readPlay(env, day, who);

      // A host round is a card you slept in, so its location is not a secret
      // from you — and "pin the far side of the planet from here" cannot be
      // answered without it. Only ever sent when the Worker itself decided
      // this player is on the crew, so it cannot be asked for.
      const card = cardOf(stay);
      if (spec) {
        card.place = stay.place;
        card.lat = stay.lat;
        card.lng = stay.lng;
      }

      return json({
        day,
        round,
        card,
        ask: askOf(spec),
        // A round already answered comes back with its result rather than a
        // fresh question, so a reload picks up where it left off.
        done: played[round] || null,
        rounds: got.ids.length,
      });
    }

    // A guess, scored here, answered with the truth.
    if (url.pathname === '/api/guess') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!authorised(request, env, body)) return deny(request, env, 'Wrong word.');
      const who = ownerId(body.owner);
      const day = parseInt(body.day, 10);
      const round = parseInt(body.round, 10);
      if (!who || !Number.isFinite(day) || !Number.isFinite(round)) {
        return json({ error: 'Which round?' }, 400);
      }
      const verdict = await checkOwner(env, who, passOf(request, body));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);

      if (!(await contributes(env, who))) {
        return json({
          error: 'Add your stays first — the deck is what everyone plays.',
          needStays: true,
        }, 402);
      }

      const played = await readPlay(env, day, who);
      // One answer per round. This is what stops the deck being ground down by
      // clearing local storage and replaying a puzzle that never changes.
      if (played[round]) return json({ error: 'Already answered.', result: played[round] }, 409);
      // Two guesses fired at once used to both get scored, with whichever
      // wrote last winning. The first to take this lock is the answer.
      if (!(await takeLock('guess/' + day + '/' + who + '/' + round))) {
        return json({ error: 'Already answering.' }, 409);
      }

      const got = await dealFor(env, day);
      const id = got.ids[round];
      if (!id) return json({ error: 'No such round.' }, 404);
      const pool = await readPool(env);
      const stay = pool.stays.filter((x) => x.id === id)[0];
      if (!stay) return json({ error: 'That stay is gone.' }, 404);

      const at = body.at && typeof body.at.lat === 'number' && typeof body.at.lng === 'number'
        ? { lat: body.at.lat, lng: body.at.lng } : null;
      const picks = Array.isArray(body.who)
        ? body.who.map(ownerId).filter(Boolean).slice(0, 12) : [];
      const keyPick = typeof body.key === 'string' ? body.key.slice(0, 120) : null;
      // The nearest named place to the pin, looked up in the browser where
      // the 6,776-city list lives. Only the name and a distance travel.
      // Letters, spaces and the punctuation a town name can carry — nothing
      // else gets echoed back, even though the line only ever reaches the
      // player who sent it.
      const near = body.near && typeof body.near.name === 'string' && typeof body.near.miles === 'number'
        && /^[\p{L}\p{M}][\p{L}\p{M} .'’()-]{0,39}$/u.test(body.near.name)
        ? { name: body.near.name, miles: Math.max(0, Math.round(body.near.miles)) } : null;

      const spec = specFor(pool, stay, who, day, round, got.ledger.used || []);
      let result;
      if (spec) {
        const sc = Host.score(spec, {
          person: picks[0] || null, people: picks, at, key: keyPick,
        });
        result = {
          host: true, fmt: spec.fmt, kind: spec.kind, label: spec.label,
          who: picks, key: keyPick,
          whoCorrect: sc.correct, whoPts: sc.whoPts || 0,
          wherePts: sc.pinPts || 0, dist: sc.dist, pts: sc.pts,
          truth: {
            id: stay.id, owner: stay.owner,
            place: stay.place, lat: stay.lat, lng: stay.lng, when: stay.when,
            nights: stay.nights || null,
            title: stay.title || null, story: stay.story || null,
            crew: partyOfStay(stay), others: stay.others || 0,
            answer: spec.answers || spec.answer,
            target: spec.target || null, targetName: spec.targetName || null,
            note: spec.note || null,
          },
        };
      } else {
        const party = partyOfStay(stay);
        const d = at ? Host._internals.hav(at.lat, at.lng, stay.lat, stay.lng) : null;
        const wp = d == null ? 0 : (d <= 50 ? 800 : Math.round(800 * Math.exp(-d / 600)));
        const want = party.slice().sort();
        const gotp = picks.slice().sort();
        const union = {};
        want.concat(gotp).forEach((x) => { union[x] = 1; });
        const hits = gotp.filter((x) => want.indexOf(x) !== -1).length;
        const exact = hits === want.length && gotp.length === want.length;
        const wpt = want.length ? Math.round(200 * (hits / Object.keys(union).length)) : 0;
        result = {
          host: false, who: picks, whoCorrect: exact, whoHits: hits,
          whoPts: wpt, wherePts: wp, dist: d, pts: wp + wpt,
          truth: {
            id: stay.id, owner: stay.owner,
            place: stay.place, lat: stay.lat, lng: stay.lng, when: stay.when,
            nights: stay.nights || null,
            title: stay.title || null, story: stay.story || null,
            crew: party, others: stay.others || 0,
            facts: stay.facts || [], flag: flagOf(stay.facts || []),
          },
        };
      }
      if (at) { result.lat = at.lat; result.lng = at.lng; }

      // A stay you have been dealt before comes back with what you did last
      // time, so a repeat is a personal record attempt rather than a memory
      // test with the punchline already told.
      const stats0 = await readStats(env);
      const prev = (() => {
        const me = stats0.players[who];
        if (!me) return null;
        let best = null;
        Object.keys(me.days).forEach((d) => {
          if (Number(d) >= day) return;
          (me.days[d].r || []).forEach((r) => {
            if (r && r.s === stay.id && !r.h) best = { day: Number(d), dist: r.d, pts: r.pts };
          });
        });
        return best;
      })();
      if (prev) result.truth.last = prev;

      // The line, if this round earned one. Chosen here because it may name
      // the place they pinned, the friend they blamed or the owner's story —
      // none of which the page could carry without spoiling something.
      const stats = stats0;
      const names = {};
      for (const p of pool.crew) names[p.id] = p.name;
      const qs = playerRec(stats, who).quips || [];
      const recentIds = qs.filter((q) => q.d >= day - 4).map((q) => q.id);
      const recentHashes = qs.filter((q) => q.d >= day - 14 && q.h != null).map((q) => q.h);
      let line = null;
      try {
        line = quip({
          result, stay, card: cardOf(stay), pool, me: who, names, near, at,
          seen: got.ledger.used || [], history: recentRounds(stats, who, day, 30),
          day, round,
        }, recentIds, recentHashes);
      } catch { line = null; }
      if (line) result.line = line.text;

      played[round] = result;
      await env.TRIPPIN.put(PLAY_PREFIX + day + ':' + who, JSON.stringify(played), {
        expirationTtl: 60 * 60 * 24 * 120,
      });

      recordRound(stats, who, day, round, stay, result, at, line);
      pruneStats(stats, utcToday());
      await writeStats(env, stats);

      // How many friends have finished today, so the summary can say so.
      const players = await activePlayers(env, pool);
      const count = await playedCount(env, day, players);
      result.played = count.n;
      result.total = players.length;
      result.waiting = pool.crew.length - players.length;   // named, not set up
      return json({ result });
    }

    /* ---------------------------------------------------------------------
       STORIES, CALLS, REACTIONS

       The line on the back of the print. One sentence, on your own stay,
       written after the score rather than before it. Never required, never
       worth points. A skipped prompt costs exactly nothing, for ever.
       --------------------------------------------------------------------- */

    if (url.pathname === '/api/story' || url.pathname === '/api/stories') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!authorised(request, env, body)) return deny(request, env, 'Wrong word.');
      const who = ownerId(body.owner);
      if (!who) return json({ error: 'Which owner?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, body));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);

      // Every story write rewrites the pool, and the pool is a KV write out
      // of a thousand a day. One per person per five seconds is plenty for
      // a human and enough to stop a loop.
      if (!(await takeLock('story/' + who, 5))) return json({ error: 'Slow down.' }, 429);

      const edits = {};
      if (url.pathname === '/api/story') {
        edits[String(body.id || '')] = body.story;
      } else if (body.stories && typeof body.stories === 'object') {
        for (const k of Object.keys(body.stories).slice(0, 400)) edits[k] = body.stories[k];
      }
      const pool = await readPool(env);
      let changed = 0;
      for (const s of pool.stays) {
        if (s.owner !== who || !(s.id in edits)) continue;   // only your own
        const raw = edits[s.id];
        const text = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
        const next = text || null;
        if ((s.story || null) !== next) { s.story = next; changed += 1; }
      }
      if (changed) {
        pool.updated = new Date().toISOString();
        await env.TRIPPIN.put(KEY, JSON.stringify(pool));
        dropPoolCache();
      }
      return json({ ok: true, changed });
    }

    // Checking your own trap is a move: will anybody get within 500 miles of
    // this one? Placed today, settled when the last of them has played.
    if (url.pathname === '/api/call') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!authorised(request, env, body)) return deny(request, env, 'Wrong word.');
      const who = ownerId(body.owner);
      const day = parseInt(body.day, 10);
      const id = String(body.id || '').slice(0, 80);
      const call = body.call === 'wont' ? 'wont' : body.call === 'will' ? 'will' : null;
      if (!who || !Number.isFinite(day) || !id || !call) return json({ error: 'Which call?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, body));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);
      const got = await dealFor(env, day);
      if (got.ids.indexOf(id) === -1) return json({ error: 'Not in today.' }, 400);
      const pool = await readPool(env);
      const stay = pool.stays.filter((x) => x.id === id)[0];
      // Only on a card that is yours. Anyone else calling it would be
      // predicting a friend's round with the answer in hand.
      if (!stay || partyOfStay(stay).indexOf(who) === -1) return json({ error: 'Not yours.' }, 403);
      // And only once you have answered that round yourself: the call is
      // placed on the reveal, looking at the card, not fired blind.
      const mine = await readPlay(env, day, who);
      if (!mine[got.ids.indexOf(id)]) return json({ error: 'Answer it first.' }, 403);
      const stats = await readStats(env);
      const dr = dayRec(stats, day);
      if (dr.calls[who + '|' + id]) return json({ ok: true, held: dr.calls[who + '|' + id] });
      dr.calls[who + '|' + id] = call;                 // first call stands, and only it writes
      await writeStats(env, stats);
      return json({ ok: true });
    }

    // One tap on a friend's worst pin. They see it next time they open it.
    if (url.pathname === '/api/react') {
      if (request.method !== 'POST') return json({ error: 'POST only.' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Expected JSON.' }, 400); }
      if (!authorised(request, env, body)) return deny(request, env, 'Wrong word.');
      const who = ownerId(body.owner);
      const target = ownerId(body.target);
      const day = parseInt(body.day, 10);
      const round = parseInt(body.round, 10);
      if (!who || !target || who === target || !Number.isFinite(day) || !Number.isFinite(round)) {
        return json({ error: 'Which one?' }, 400);
      }
      const verdict = await checkOwner(env, who, passOf(request, body));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);
      const stats = await readStats(env);
      const dr = dayRec(stats, day);
      if (!dr.reacts.some((r) => r.from === who && r.to === target && r.round === round)) {
        dr.reacts.push({ from: who, to: target, round });
        dr.reacts = dr.reacts.slice(-40);
        await writeStats(env, stats);
      }
      return json({ ok: true });
    }

    /* ---------------------------------------------------------------------
       THE DAY, WITH THE SPOILERS IN

       Everything the share grid must not carry lives here: place names, who
       was actually there, who hosted which round, how everyone scored, the
       best and worst pins. Gated honestly — you see it once you have played
       it, and reading the chat first is not worth points because your three
       are already recorded.
       --------------------------------------------------------------------- */

    if (url.pathname === '/api/day') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      const day = parseInt(url.searchParams.get('day'), 10);
      const who = ownerId(url.searchParams.get('owner'));
      if (!Number.isFinite(day) || !who) return json({ error: 'Which day?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, null));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);

      const got = await dealFor(env, day);
      if (!got.ids.length) return json({ error: 'No such day.', allowed: false }, 404);
      const mine = await readPlay(env, day, who);
      const finished = got.ids.every((_, i) => mine[i]);
      const over = day < utcToday() - 1;
      if (!finished && !over) {
        return json({ allowed: false, error: 'Play your three first. The day opens after the last one.' }, 403);
      }

      const pool = await readPool(env);
      const stats = await readStats(env);
      const players = await activePlayers(env, pool);
      const count = await playedCount(env, day, players);
      const everyone = count.n >= players.length;
      const names = {};
      for (const p of pool.crew) names[p.id] = p.name;

      const stays = got.ids.map((id) => {
        const s = pool.stays.filter((x) => x.id === id)[0];
        if (!s) return { id, place: '(gone)', crew: [] };
        return {
          id, place: s.place, lat: s.lat, lng: s.lng, when: s.when, crew: partyOfStay(s),
          owner: s.owner, story: s.story || null, photo: s.photo || null, others: s.others || 0,
          flag: flagOf(s.facts || []), facts: s.facts || [], stats: stayStats(stats.stays[id]),
        };
      });

      const rows = [];
      for (const id of players) {
        const rec = await readPlay(env, day, id);
        const results = got.ids.map((_, i) => {
          const r = rec[i];
          if (!r) return null;
          return {
            pts: r.pts, dist: typeof r.dist === 'number' ? Math.round(r.dist) : null,
            lat: r.lat ?? null, lng: r.lng ?? null, who: r.who || [], whoCorrect: !!r.whoCorrect,
            whoPts: r.whoPts || 0, wherePts: r.wherePts || 0, host: !!r.host,
            fmt: r.fmt || null, label: r.label || null,
          };
        });
        rows.push({
          id, played: count.played[id], results,
          total: results.filter(Boolean).reduce((a, r) => a + r.pts, 0),
        });
      }

      // A call settles when everyone eligible has played — or, once the day
      // is over, against whoever did play. It never settles instantly,
      // because the people who would prove it right have not played yet.
      const dr = stats.days[day] || { calls: {}, reacts: [] };
      const settled = everyone || over;
      const calls = Object.keys(dr.calls).map((k) => {
        const [owner, id] = k.split('|');
        const call = dr.calls[k];
        let result = null, by = null, m = null;
        if (settled) {
          const i = got.ids.indexOf(id);
          let closest = null;
          rows.forEach((p) => {
            const r = p.results[i];
            if (p.id === owner || !r || r.host || r.dist == null) return;
            if (!closest || r.dist < closest.dist) closest = { id: p.id, dist: r.dist };
          });
          const someone = !!(closest && closest.dist <= NEAR_MILES);
          result = (call === 'will') === someone ? 'held' : 'broke';
          if (closest) { by = closest.id; m = closest.dist; }
        }
        return { owner, id, call, result, by, miles: m };
      });

      // Notices for this player: traps of theirs that caught somebody, eyes
      // on their worst pin, calls that settled. A trap notice names one of
      // the owner's own cards, so it waits until the owner has finished the
      // day — which this route already requires — and no longer than that.
      // The owner has seen all three cards by then; making them wait for
      // the slowest friend only made the payoff land stale.
      const notices = [];
      const settledDays = [];
      for (let d = day - 3; d <= day; d++) {
        if (d < 0) continue;
        const dealt = (await dealFor(env, d)).ids;
        if (!dealt.length) continue;
        let ok = true;
        if (d !== day) {
          const rec = await readPlay(env, d, who);
          ok = dealt.every((_, i) => rec[i]) || d < utcToday() - 1;
        }
        if (ok) settledDays.push({ d, ids: dealt });
      }
      for (const sd of settledDays) {
        sd.ids.forEach((id) => {
          const sr = stats.stays[id];
          const s = pool.stays.filter((x) => x.id === id)[0];
          if (!sr || !s || s.owner !== who) return;
          (sr.catches || []).filter((c) => c.d === sd.d && c.v !== who).forEach((c) => {
            notices.push({
              key: 'catch|' + sd.d + '|' + id + '|' + c.v, k: 'Your trap',
              t: 'Your ' + String(s.place).split(',')[0] + ' caught ' + (names[c.v] || c.v) + ' by ' + Math.round(c.m).toLocaleString('en-US') + ' miles.',
            });
          });
        });
        const ddr = stats.days[sd.d];
        if (!ddr) continue;
        (ddr.reacts || []).filter((r) => r.to === who).forEach((r) => {
          const s = pool.stays.filter((x) => x.id === sd.ids[r.round])[0];
          notices.push({
            key: 'react|' + sd.d + '|' + r.from + '|' + r.round, k: 'Seen',
            t: (names[r.from] || r.from) + ' saw your pin on ' + (s ? String(s.place).split(',')[0] : 'stay ' + (r.round + 1)) + '. Just saying.',
          });
        });
      }
      if (settled) {
        calls.filter((c) => c.owner === who && c.result).forEach((c) => {
          const s = pool.stays.filter((x) => x.id === c.id)[0];
          notices.push({
            key: 'call|' + day + '|' + c.id, k: 'Your call',
            t: (c.result === 'held' ? 'Right. ' : 'Wrong. ') +
              (c.by ? (names[c.by] || c.by) + ' got ' + Math.round(c.miles).toLocaleString('en-US') + ' miles from ' + String((s || {}).place || 'it').split(',')[0] + '.' : 'Nobody else pinned it.'),
          });
        });
      }

      return json({
        day, allowed: true, everyone, played: count.n, total: players.length,
        waiting: pool.crew.length - players.length,
        stays, players: rows, calls, reactions: dr.reacts || [], notices,
        goal: {
          deck: pool.stays.length, target: 60,
          stories: pool.stays.filter((s) => s.story).length,
        },
      });
    }

    /* ---------------------------------------------------------------------
       THE RECORD — one player's history, the deck's oddities, the standing.
       Funny first, accurate second. Nothing here can spoil an undealt card:
       places are only named for stays this player has already been dealt.
       --------------------------------------------------------------------- */

    if (url.pathname === '/api/history') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      const who = ownerId(url.searchParams.get('owner'));
      if (!who) return json({ error: 'Which owner?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, null));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);

      const pool = await readPool(env);
      const stats = await readStats(env);
      const me = stats.players[who] || { days: {} };
      const names = {};
      for (const p of pool.crew) names[p.id] = p.name;

      const days = Object.keys(me.days).map(Number).sort((a, b) => a - b).map((d) => ({
        day: d, pts: me.days[d].p,
        rounds: (me.days[d].r || []).filter(Boolean).map((r) => ({
          stayId: r.s, owner: r.o, place: r.pl, dist: r.d, whoCorrect: r.w, whoPts: r.wp,
          wherePts: r.xp, pts: r.pts, host: r.h, fmt: r.f, lat: r.la, lng: r.ln, who: r.who,
        })),
      }));
      const normal = [];
      days.forEach((d) => d.rounds.forEach((r) => { if (!r.host && typeof r.dist === 'number' && typeof r.lat === 'number') normal.push(r); }));

      // Centre of gravity: where you think everything is.
      let centre = null;
      if (normal.length >= 3) {
        const c = Host._internals.centroid(normal.map((r) => ({ lat: r.lat, lng: r.lng })));
        let best = null;
        for (const row of CITIES) {
          const d = Host._internals.hav(c.lat, c.lng, row[2], row[1]);
          if (!best || d < best.miles) best = { name: row[0], miles: d };
        }
        centre = { lat: c.lat, lng: c.lng, name: best && best.miles < 1500 ? best.name : null, miles: best ? best.miles : null };
      }

      // Who you blame most, wrongly.
      const blame = {};
      const stayById = {};
      for (const s of pool.stays) stayById[s.id] = s;
      normal.forEach((r) => {
        const crew = stayById[r.stayId] ? partyOfStay(stayById[r.stayId]) : [];
        (r.who || []).forEach((id) => { if (crew.length && crew.indexOf(id) === -1) blame[id] = (blame[id] || 0) + 1; });
      });
      const blamed = Object.keys(blame).map((id) => ({ id, n: blame[id] })).sort((a, b) => b.n - a.n).slice(0, 3);

      // Days you beat each friend, on days you both finished.
      const beat = {};
      for (const other of Object.keys(stats.players)) {
        if (other === who) continue;
        let n = 0;
        for (const d of Object.keys(me.days)) {
          const theirs = stats.players[other].days[d];
          const mine = me.days[d];
          if (!theirs || !mine) continue;
          if ((mine.r || []).filter(Boolean).length < 3 || (theirs.r || []).filter(Boolean).length < 3) continue;
          if (mine.p > theirs.p) n += 1;
        }
        beat[other] = n;
      }

      // Passport: stays you have been within fifty miles of.
      const been = new Set();
      normal.forEach((r) => { if (r.dist <= 50) been.add(r.stayId); });
      const passport = { count: been.size, deck: pool.stays.length };

      // The standing: resistance summed over every card you contributed, so
      // more stays always beats fewer. Never touches the daily score.
      const cur = {};
      for (const s of pool.stays) {
        const c = cur[s.owner] || (cur[s.owner] = { owner: s.owner, cards: 0, plays: 0, sum: 0, resistance: 0 });
        c.cards += 1;
        const sr = stats.stays[s.id];
        // A stay earns its ten once it has been dealt and guessed at — not
        // for being typed in. Padding the deck with filler earns nothing
        // until the filler comes round, and then only what it resists.
        if (sr && sr.plays) {
          c.plays += sr.plays;
          c.sum += sr.sum;
          c.playedCards = (c.playedCards || 0) + 1;
          c.resistance += 10 + (sr.sum / sr.plays) / 100 * Math.min(sr.plays, 5);
        }
      }
      // Two readings of the same table: the sum, which rewards putting stays
      // in, and the per-stay figure, which somebody with three stays can top.
      const curators = Object.values(cur).map((c) => ({
        owner: c.owner, cards: c.cards, plays: c.plays, avg: c.plays ? c.sum / c.plays : 0,
        resistance: c.resistance, perStay: c.playedCards ? c.resistance / c.playedCards : 0,
      })).sort((a, b) => b.resistance - a.resistance);

      // Titles: dry, specific, never explained, never on a list to complete.
      const titles = [];
      const water = normal.filter((r) => /Ocean|Pacific|Atlantic/.test(Host._internals.regionOf({ lat: r.lat, lng: r.lng }))).length;
      if (water >= 3) titles.push('Certified Atlantic Enjoyer');
      const neverBlamed = pool.crew.filter((p) => p.id !== who && !blame[p.id]);
      if (normal.length >= 9 && neverBlamed.length === 1) titles.push('Has Never Once Suspected ' + names[neverBlamed[0].id]);
      const bulls = normal.filter((r) => r.dist <= 50).length;
      if (bulls >= 3) titles.push('Suspiciously Well Informed');
      const perfectWho = days.filter((d) => d.rounds.length === 3 && d.rounds.every((r) => r.host || r.whoCorrect)).length;
      if (perfectWho >= 3) titles.push('Knows Exactly Who Books What');
      if (normal.length >= 6 && normal.every((r) => r.lat > 0)) titles.push('Northern Hemisphere Loyalist');
      const far = normal.filter((r) => r.dist > 4000).length;
      if (far >= 3) titles.push('Wrong Ocean Specialist');
      const hosted = [];
      days.forEach((d) => d.rounds.forEach((r) => { if (r.host) hosted.push(r); }));
      if (hosted.length >= 4 && hosted.every((r) => r.pts >= 800)) titles.push('Cannot Be Fooled About Their Own Bed');
      if (hosted.length >= 3 && hosted.filter((r) => r.pts < 300).length >= 2) titles.push('Was There. Cannot Prove It.');

      // The deck's own oddities, only over stays this player has been dealt.
      const dealtIds = new Set();
      days.forEach((d) => d.rounds.forEach((r) => dealtIds.add(r.stayId)));
      const records = [];
      pool.stays.filter((s) => dealtIds.has(s.id)).forEach((s) => {
        const f = flagOf(s.facts || []);
        if (f) records.push({ k: String(s.place).split(',')[0], v: f.v });
      });

      return json({
        owner: who, days, centre, blamed, beat, passport, curators, titles,
        records: records.slice(0, 12),
      });
    }

    // "Am I who I say I am?" — the game asks this on sign-in. Deliberately
    // separate from /api/mine, which answers the same auth question but hands
    // back every stay and every base64 photo with it: megabytes to learn one
    // bit. Returns nothing but the name.
    if (url.pathname === '/api/me') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      const who = ownerId(url.searchParams.get('owner'));
      if (!who) return json({ error: 'Which owner?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, null));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);
      await backfillAnimal(env, who, passOf(request, null));
      return json({ ok: true, owner: who });
    }

    // One person's own stays. Friends edit their own entries through this,
    // so nobody has to be handed the whole pool to fix their own typo.
    if (url.pathname === '/api/mine') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!authorised(request, env, null)) return deny(request, env, 'Wrong word.');
      const who = ownerId(url.searchParams.get('owner'));
      if (!who) return json({ error: 'Which owner?' }, 400);
      const verdict = await checkOwner(env, who, passOf(request, null));
      if (verdict !== 'ok') {
        return deny(request, env, DENY[verdict][0], DENY[verdict][1], 'id', who);
      }
      await forgive(request, env, 'id', who);
      const pool = await readPool(env);
      return json({ owner: who, stays: pool.stays.filter((s) => s.owner === who) });
    }

    // Deliberately spoiler-free: counts and health, never a place name or a
    // photo. The person running the game still has to play it.
    if (url.pathname === '/api/summary') {
      if (request.method !== 'GET') return json({ error: 'GET only.' }, 405);
      if (!isAdmin(request, env, null)) {
        return deny(request, env, 'Admin word needed.', 401, 'id');
      }
      const pool = await readPool(env);
      const per = {};
      for (const s of pool.stays) {
        const o = s.owner || 'unknown';
        const p = per[o] || (per[o] = {
          owner: o, total: 0, noPhoto: 0, noStory: 0, thin: 0, solo: 0,
        });
        p.total += 1;
        if (!s.photo) p.noPhoto += 1;
        if (!s.story) p.noStory += 1;
        // "Thin" = nothing but a town: no amenities and no property type, so
        // the card has almost nothing for a player to reason from.
        if (!(s.amenities && s.amenities.length) && !s.type) p.thin += 1;
        if (!s.crew || s.crew.length <= 1) p.solo += 1;
      }
      const claims = {};
      for (const p of pool.crew) claims[p.id] = !!(await claimOf(env, p.id));
      return json({
        updated: pool.updated,
        // The last twenty deck rewrites, so a passcode that walked off is
        // something Ben can see rather than something he finds out about.
        writes: (pool.writes || []).slice(-20).reverse(),
        // So the admin page can say out loud when the second lock is missing.
        adminLock: !!env.ADMIN_KEY,
        crew: pool.crew.map((p) => ({
          id: p.id, name: p.name, tell: p.tell || '', claimed: !!claims[p.id],
        })),
        totals: {
          stays: pool.stays.length,
          players: Object.keys(per).length,
          withPhoto: pool.stays.filter((s) => s.photo).length,
          withStory: pool.stays.filter((s) => s.story).length,
        },
        perPlayer: Object.values(per).sort((a, b) => b.total - a.total),
      });
    }

    if (url.pathname === '/api/stays') {
      if (request.method === 'GET') {
        // The whole deck, coordinates and all, is the answer key. It is served
        // only to the admin word now — the tooling needs it, players do not.
        // The game asks /api/round for one card at a time.
        if (!isAdmin(request, env, null)) {
          return deny(request, env, 'Admin word needed.', 401, 'id');
        }
        await forgive(request, env, 'word');
        return json(await readPool(env));
      }
      if (request.method === 'POST') return handlePost(request, env);
      return json({ error: 'GET or POST.' }, 405);
    }

    // /import is the page friends get: it ships no stays at all.
    // The full editor is deliberately NOT deployed — it embeds the library,
    // so it stays on the one machine that owns the data.
    const PAGES = { '/import': '/import.html', '/admin': '/admin.html' };
    const path = PAGES[url.pathname] || url.pathname;
    const assetReq = new Request(new URL(path, url), request);
    const res = await env.ASSETS.fetch(assetReq);

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
