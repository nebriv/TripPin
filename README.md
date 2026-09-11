# TripPin

A daily guessing game in the spirit of [MapTap.gg](https://maptap.gg), built out of
places you and your friends have actually stayed.

Three stays a day. For each one:

1. **Name everyone who was there.** Multi-select, partial credit. The photos and the
   amenities are the whole clue — no title, no date.
2. **Find it on the map.** Drop a pin. The closer you land, the more you score.

Everyone gets the same three until local midnight. Results share as an emoji grid.

> **This repo is the code, not the deck.** `src/stays.js` — the stays, the
> photos and the crew — is deliberately not checked in. The live game keeps its
> stays in the Worker's KV namespace and the deployed page reads them from the
> gated API, so nothing here needs them. Bring your own `src/stays.js` (start
> from `data/stays-template.csv`) to run it against your own trips.

```
TripPin #1  2,524/3,000
✅ 🟩🟩🟩🟩🟩  12 mi
✅ 🟨🟨🟨🟨⬜  178 mi
✅ 🟨🟨🟨⬜⬜  382 mi
🎯 best 12 mi · 🌍 572 mi off
```

Five squares per round for how close the pin was, a tick/diamond/cross for the
people, and the two numbers worth arguing about. Nothing in it gives away where
anything is, so it is safe to post before your friends have played.

## The idea

Every stay belongs to whoever's Airbnb account it came off. That's the trick: once
all five of you have imported your history, "who was there?" is a real question with
a real answer, and the photo is the only evidence.

Right now the deck holds Ben's 41 trips, so the WHO half is a freebie until the
others land.

## Live

Deployed at `https://trippin.<subdomain>.workers.dev`.

| | |
|---|---|
| `/` | the game |
| `/import` | friends add and fix their own stays |
| `/admin` | counts and health, deliberately spoiler-free |
| `GET /api/crew` | the roster — names only, no stays |
| `POST /api/crew` | edit names and tells; touches no stays · **admin** |
| `GET /api/claim?owner=` | whether a name is taken. Says nothing else |
| `POST /api/claim` | take a name and set its passcode |
| `POST /api/unclaim` | reset someone's passcode · **admin** |
| `GET /api/mine?owner=` | one person's own stays · **passcode** |
| `GET /api/summary` | counts and health, no place names · **admin** |
| `GET /api/stays` | the whole pooled deck |
| `POST /api/stays` | one person's stays, replacing what they sent before · **passcode** |
| `GET /api/round?day&round&owner` | today's card and its question. No id, no place, no coordinates, no crew — just what a photo and an amenity list can tell you · **passcode** |
| `POST /api/guess` | scores a pin and a set of names, then hands back `truth` (place, coordinates, crew, story), `line` if this round earned one, and `played`/`total` — how many friends have finished today · **passcode** |
| `POST /api/story` / `POST /api/stories` | one line on one of your own stays, or a batch of them at once · **passcode** |
| `POST /api/call` | before you've seen the answer: will anybody land within 500 miles of your own stay. Only on your own card, and only after you've answered it yourself · **passcode** |
| `POST /api/react` | one tap on a friend's worst pin this round · **passcode** |
| `GET /api/day?day&owner` | the day with the spoilers in — place names, who hosted, everyone's scores — unlocked only once you've finished playing it · **passcode** |
| `GET /api/history?owner=` | your own record: the deck's oddities, where the group stands, your titles · **passcode** |
| `GET /api/deal?day=` | today's three stay ids, decided once and remembered. Admin only since stay ids are built from the place name, and handing them out would hand out today's towns before anyone had played · **admin** |
| `POST /api/refacts` | recomputes the "did you know" facts on every stay in the pool · **admin** |
| `POST /api/replay` | wipes one player's answers for one day, so they can play it again · **admin** |

Every API route needs the group word, reads included. Three secrets, in order of
who holds them:

| | who has it | what it opens |
|---|---|---|
| `ENTRY_KEY` | the five of you | everything below the other two |
| | | *the suffix carries ~50 bits, so a wordlist is hopeless even before the lockout* |
| a passcode | one player each | reading and writing **that player's** stays |
| `ADMIN_KEY` | you | resetting a claim, the roster, the summary, dealing a day early, recomputing facts, replaying a day |

A player claims their name the first time they open `/import` and picks their
passcode then — first come, first served, which among five friends is
proportionate. The passcode is two tiles, not typed text: an animal and where it
lives. The animal is kept in the clear on the claim and doubles as that player's
mark, shown beside their score and on the cards they put in — everyone in the
group knows whose bear that is. Only the home stays secret. Forgot it? Reset the
claim from `/admin` and they set a new one.

`ADMIN_KEY` matters more than it looks: without it, resetting a claim would be
something anyone with the group word could do, which would make passcodes
decorative. Until you set it the Worker falls back to the group word and `/admin`
says so out loud.

### The three pages, and why they are separate

**`/import`** is what you send friends. It ships with no stays in it at all — it
asks the server only for the roster. Once they pick their name it loads *their own*
stays and nothing else, so they can fix a wrong town or add a story without being
handed everybody's travel history.

**`/admin`** is for whoever runs the game, who also has to play it. So it shows
counts and health and never a place name, a coordinate or a photo. It flags which
players haven't sent theirs in, how many stays are "thin" (nothing but a town), how
many lack a story, and how many are solo. The one thing that would spoil you — the
full data dump — is behind a button that says so.

**`editor.html`** is the full editor with the map picker and the photo box. It
embeds the library, so it is **never deployed**. Run it locally.

Locally, just open `index.html`. No build, no server, no dependencies.

## Getting stays in

### Your friends: `/import`

Send them `https://trippin.<subdomain>.workers.dev/import?k=<word>`. They pick
their name, open [airbnb.com/trips](https://www.airbnb.com/trips), scroll to the
bottom, and run the console snippet the page gives them — it finds the element
holding every trip and copies it. Paste, geocode, send.

**That page contains nobody's stays.** It asks the server only for the roster, so a
friend opening it learns five names and nothing else. This matters: `editor.html`
embeds the whole library, which is exactly why it is **not deployed**. Keep it on
the machine that owns the data.

Parsing looks at no Airbnb class names — they're generated and change without
warning. It anchors on `/trips/<id>` links, `muscache.com` image URLs, and a line
that parses as a date range. Cards missing a photo or a date still come through.

Only people already on the roster get named on a stay. Everyone else becomes a head
count — "+12 not playing" — because your friends travel with their own friends.

### You: the command line

```bash
python tools/import_trips.py --html andrew.html --owner andrew --photos --write
python tools/enrich_stays.py --write
```

The first turns a saved trips page into stays and embeds the photos. The second is
the good one — see below.

### Other routes

| | |
|---|---|
| `tools/enrich_stays.py` | listing detail: type, guests, bedrooms, beds, baths, rating, amenities, extra photos, **real coordinates** |
| `tools/import_url.py` | one listing URL. `--serve` powers the editor's URL box |
| `tools/import_csv.py` | a spreadsheet, or Airbnb's own data export |
| `editor.html` | by hand, with a map picker and a photo box that takes a pasted screenshot |

## Enrichment, and why it matters

An Airbnb trip card gives you a town name and nothing else. Towns repeat — there's a
Whitehall in New York and one in Montana — so geocoding a bare name is a coin flip.

But the listing id is usually recoverable from the photo URL
(`.../Hosting-27974739/...`, or base64 of `StaySupplyListing:<id>`), and the listing
page publishes real coordinates plus "Kerhonkson, **New York**, United States".

Of Ben's 41, twenty had a recoverable id. It corrected two outright:

```
Morris     -> Pennsylvania, not New York   (3.1 deg out)
Stamford   -> New York, not Connecticut    (2.5 deg out)
```

It also brings back the amenities, which are the fun part — the card ranks them by
how much they narrow a place down and leads with the oddest:

> ♨️ Private hot tub - available all year, open 24 hours

"29 inch TV with standard cable" tells you something. "Wifi" does not.

The other 21 stays have no recoverable id, so their coordinates are still geocoded
from the town name. Check those in `editor.html`.

### Being decent about it

`tools/netpolite.py` does the fetching: robots-checked, permanently disk-cached, one
request at a time with a randomised gap, backing off on 429 and stopping outright on
403. Re-running enrichment costs zero requests.

`/rooms/<id>` is allowed by Airbnb's robots.txt; `/rooms/*/reviews`, `/photos`,
`/amenities` and `/location` are not, and aren't touched — everything comes from the
main page's own embedded JSON.

There is deliberately no user-agent rotation and no TLS fingerprint forgery. Those
defeat bot detection rather than reduce load, they aren't needed on an allowed path
that answers a plain request with a 200, and a tool that hides from rate limits is
how you get an IP banned. If you ever need bulk data properly, Airbnb will hand you
your own: Account → Privacy → Request your personal data, then `import_csv.py`.

## Deploying

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create TRIPPIN    # id -> worker/wrangler.toml
npx wrangler secret put ENTRY_KEY             # same word as SETTINGS.key
npx wrangler secret put ADMIN_KEY             # yours alone — not the group word
python ../tools/build_single.py
npx wrangler deploy
```

Needs Node 22+. `dist/` holds only `index.html` and `import.html`; the editor is
excluded on purpose.

## Security

The data is a travel history: towns, coordinates, dates, who went with whom, and
photos of the insides of places people slept. Treat it as personal.

What's in place:

- every API route requires the group word, **reads included** — without that, anyone
  who found the hostname would get everyone's history as JSON
- a per-player passcode on top, so picking a name from a dropdown no longer hands
  you that person's list, and nobody can write over a name that isn't theirs
- a separate admin word for resetting a claim, the roster, the summary, and the
  admin-only routes that touch the whole pool: dealing a day early, recomputing
  facts, replaying a day
- the word travels in a header, never a query string, so it stays out of logs,
  history and `Referer`
- constant-time comparison; submissions are validated field by field
- **the word is not in the deployed page.** `tools/build_single.py` strips it out
  of the build, so view-source on the live URL gives nothing and the gate is the
  server's decision, not a comparison the page makes against its own copy of the
  answer. `src/stays.js` keeps a copy so the offline file still opens
- **wrong guesses are counted and shut off.** Ten wrong secrets from one address
  buys a fifteen-minute lockout, counted in KV so it survives isolate churn;
  every failure also costs the guesser 400ms of wall clock. Getting in clears the
  count, so a typo costs a friend nothing. Cloudflare's own `[[ratelimits]]`
  binding was tried first and did not enforce on this account — forty calls
  against a twelve-per-minute limit, every one of them `success: true`
- a passcode is two tiles, not typed text, so there's no length to enforce —
  the lockout above is what keeps a pair of tiles from being worth guessing
- `noindex` + `robots.txt` + `X-Frame-Options` + `no-store` on every response
- burst rate limiting, and one generation of backup in KV so a bad publish is undoable
- the editor, which embeds the library, is never deployed

**What it is not: confidentiality inside the group.** Anyone you send the link to
has the word and can keep it, and there is no way to take it back from one person
without changing it for everyone.

More to the point, **the game deals from the whole pool**, so every player's browser
fetches `GET /api/stays` — all of it. A friend with the word and the devtools
console can read every stay whenever they like. The passcode stops casual reading
through `/import` and stops anyone writing to a name that isn't theirs. It does not
and cannot hide a stay from someone determined, because the game has to show them
that stay eventually anyway.

There is also no way to revoke one friend: take the word away and you take it away
from everyone.

If that's not good enough — and for five people's complete travel histories it
probably isn't — put **Cloudflare Access** in front of the Worker. Free up to 50
users, five minutes to set up, real per-person email auth with revocation:

> Zero Trust → Access → Applications → Add self-hosted → your workers.dev domain →
> policy: Emails → the five of you

## Scoring

| | |
|---|---|
| **Where** | 0–800, `800 · e^(−miles/600)`. Within 15 miles is full marks. |
| **Who** | 0–200, by overlap. Naming the whole party exactly is 200; naming some of it earns a share; naming people who weren't there costs you. |
| **A day** | 3,000. |

100 miles out still earns 675. A thousand miles earns 149. Tuning is at the top of
`src/game.js` — `CFG.ROUNDS` changes how many stays a day, and the help screen
figures follow it automatically.

## What is recorded

Every guess rewrites one KV document, `stats:v1`. It holds, per player per day,
every round they've played; per stay, how many times it's been dealt, the
average miles everyone's missed it by, the best pin anyone's landed on it, and
who it's caught out; and per day, the calls players have placed on their own
stays and the reactions they've thrown at each other's pins. `/api/history`,
the day reveal, and the standing are all built from this one document rather
than each re-reading a season of play records.

It's best effort under concurrency — two guesses landing in the same second
can lose one of these updates, though the play record that actually decides
scoring never does — and it's pruned to the last 120 days.

## The map

No tiles, no network — geometry is baked into `src/worldmap.js` (446 KB: coastlines
and borders, every US state and Canadian province, 6,776 city labels that fade in as
you zoom). Rebuild with `python tools/build_map.py`.

Two projections, on the globe button:

- **Equal Earth** (default) — genuinely equal-area, so Africa is fourteen Greenlands
  the way it is in life. The price is squashed poles.
- **Mercator** — lies about Africa, makes Longyearbyen easy to hit.

Scoring is great-circle miles either way, so the projection changes how it looks,
never what it's worth.

## The look

The front end follows the design in
`design/game-screen-recreation-project/project/` — "The Board": square corners,
hairline rules, nothing floating that isn't pinned to something. Archivo for
anything a person wrote — names, tells, stories; Space Mono for anything
counted — scores, distances, coordinates; Caveat for the story itself, in a
hand rather than a font built for counting. `src/style.css` carries that
folder's `tokens.css` verbatim as its token block. Both a light and a dark
version ship, and there's no toggle between them — the page follows whatever
the browser's own colour scheme already says.

## Making it yours

`src/stays.js` holds everything. The bit that matters most:

```js
{ id: 'maddie', name: 'Maddie', color: '#b07c2e',
  tell: 'Trailheads and hot tubs. If the road needs clearance, she booked it.' }
```

The `tell` shows on the How to Play screen and is how people learn to read a photo.
Write them once all five lists are in, from what the data actually shows — that's
where the WHO half of the game comes from. Four of the five still say TODO.

The other high-value field is `story`: what you'd actually say out loud about that
trip. It's the payoff after the guess, and the reason anyone plays a second day.

### The story pipeline

A story is one line, 140 characters, per stay. The game asks for it in three
places: in the carousel when you add the stay at import, on the reveal of a
round you hosted, and again at the end of the day for any of your stays that
went unanswered. It shows up on the reveal, right after the score, as the
punchline — never before, never as part of the question. It's never required
and it never earns a point; it's there because the score isn't the interesting
part of a stay you actually remember.

## tools/sim

Offline simulators and checks, plain `node`, no dependencies beyond the repo
itself:

| | |
|---|---|
| `balance.js` | simulates three player archetypes — blind, average, sharp — against the normal round and every host-round format in `src/host.js`, and reports each format's mean and standard deviation per archetype |
| `cycle.js` | replays the Worker's deal ledger over many synthetic days and checks its promise: no repeats within a cycle, no stay skipped, a minimum gap held between two deals of the same stay |
| `share.js` | throws a large seeded batch of round results at the real share-grid code and checks the grids never reveal which of the three rounds were host rounds, and that the tail's numbers are exactly what the rows say |
| `quips.mjs` | deals and scores a synthetic season and calls the line generator on every result, writing what it says to `quips-season.txt` so a season of lines can be read at once |
| `facts-check.mjs` | runs the "did you know" fact generator over the real deck and reports how many stays got flagged |

## Files

```
index.html              the game
import.html             what friends get — contains no stays
editor.html             full editor. NOT deployed; embeds the library
src/stays.js            YOUR DATA — the only file you need to edit
src/game.js             rounds, scoring, streaks, sharing, the gate
src/map.js              projections, pan/zoom, pin placement
src/listing.js          the card: photo strip, amenity ranking, redaction
src/trips.js            reads an Airbnb trips page. DOM-based, class-agnostic
src/import.js           the friend-facing import flow
src/worldmap.js         generated map geometry — don't hand-edit
tools/jsdata.py         reads/writes stays.js without executing it
tools/netpolite.py      the polite fetcher
tools/enrich_stays.py   listing detail and real coordinates
tools/import_trips.py   an Airbnb trips page -> stays, tagged with an owner
tools/build_map.py      rebuild worldmap.js from Natural Earth
tools/build_single.py   inline everything into dist/
worker/                 Cloudflare Worker: serves dist/, pools stays in KV
data/name-candidates.md how this ended up called TripPin
```

Vanilla JS and standard-library Python. No npm and no build step for the game
itself; wrangler is only needed to deploy.

## Notes

- Progress and streaks live in `localStorage`; the editor's working library lives in
  IndexedDB because photos are far too big for `localStorage`.
- Puzzle #1 is 10 September 2026. Change `CFG.EPOCH` in `src/game.js` to renumber.
- 41 stays at three a day runs a fortnight before anything repeats.
- Map data is [Natural Earth](https://www.naturalearthdata.com/), public domain.
  Geocoding is [Nominatim](https://nominatim.org/), one request per second.
- Photos are Airbnb's own listing images from your own trip history. Fine for a
  private game among five people; don't put this on the open web.
