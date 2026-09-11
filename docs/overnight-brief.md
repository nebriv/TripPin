# TripPin — overnight brief

You have the night. The game works; it is not yet *good*. Your job is to make it
something five friends still open in March.

Read this whole file before touching anything. The last section tells you when
you are allowed to stop.

**Do these in order.** If the night runs out, this order is what makes a partial
night still worth having:

1. §1 the design rebuild, following `HANDOFF.md`'s own build order — everything
   visual sits on top of it, so anything built before it is built twice.
2. §6 the story collection and §4 the reveal — the two that make the game about
   people rather than geography.
3. §5 the quips and §3 the stats — flavour, and the game is dull without them.
4. §7 the structural work — real, but the game survives another week without it.
5. "Give them a reason to come back" — the depth and identity work. Last of the
   building, and the only section where you are invited to invent rather than
   fix. Do not skip it because it is last; a game with no reason to return is
   the failure this whole night is against.
6. §8 the writing scrub and §9 the audit — always, whatever else you did.

**"The review panel" is not on that list because it is not a phase.** Run it
when a design decision is settled, run it again on the finished build, and fix
what it finds.

**Fewer things properly beats more things thinly.** If you can build three of
these well or six of them badly, build three and say which you dropped. There is
no credit for a stats page with three numbers on it.

---

## Read this bit twice

One idea holds the awkward half of this game together. If you take nothing else
from this document, take this.

**The hardest thing in the project is not code.** It is getting four people to
enter data for a game they have not played yet. Everything downstream is
blocked on it: the deck is one person's, so they host every round and never play;
there are no stories, so the reveal is a place name and a number; the deck runs
dry in a fortnight because it is too small. Four separate design reviews all
landed on the same sentence — *get the other four to import, everything else is
downstream of that.*

You cannot fix it by asking nicely, and you definitely cannot fix it with a
progress bar labelled "profile completion".

**So do not ask them to contribute data. Invite them to load the deck against
their friends.**

A stay you add is a trap you set. Sometime in the next fortnight it comes up,
and one of them puts your Norwegian fishing village in Mali, and you find out
about it. That is the offer. It is the same ten minutes of work and a completely
different thing to be doing.

### What the frame actually changes

Not the vocabulary — the design. Take each of these seriously:

**Setting a trap is an act, so make it one.** Forty stays pasted in bulk is
data entry. The same forty dealt out one at a time, photo up, with a choice to
arm it or skip it, is forty small decisions. Same data, and only one of them is
a thing anybody wants to do.

**A trap that catches someone must tell you.** This is the reward loop and the
game has nothing like it today. *"Your Svalbard cabin caught Andrew by 4,200
miles."* That is worth opening the app for, it costs almost nothing to build,
and it makes a contribution from three weeks ago pay out today.

**Mind the timing, because this is one careless line from reopening the leak
§2 closes.** Naming the card tells the owner which stay is in today's deck, and
the owner is on that stay's crew — so if it reaches them before the others have
played, it is the WHO answer, delivered by the game, ready to be passed on. Hold
anything that names a card until everyone has played. Before that, the most it
may say is that something of yours is in play today.

**The one-line story is the bait.** This is the part worth thinking hardest
about, because it unifies two features that currently sit apart. The blurb is
not sentiment bolted onto a quiz — it is the note your victim reads *after* they
have been caught:

> *You were 3,100 miles off.*
> *Ben says: the shower was a hose in the garden.*

The line lands harder because they just failed at it, and the failure is funnier
because there is a real place behind it. Write the reveal so the story arrives
as the punchline, not as a caption. Suddenly "write one sentence about this
place" is not homework; it is loading the second barrel.

**Checking your own trap is a move.** The one-tap call before the reveal —
*will anybody get within 500 miles?* — is you looking at a trap you set and
deciding whether it will hold. That is why it is a game and not a statistic.

**The standing is whose traps catch most**, and it is the only leaderboard in
this game that somebody can top without being good at geography. In a group
where one person will win the daily every single day, that is not a nice-to-have.

### Two cautions, and the second one matters more

**Do not over-theme the words.** A UI that says "trap" eleven times is
exhausting, and the game is still called TripPin. Let the framing decide what
you *build* and what the reveal *celebrates*; let the labels stay plain. One
well-placed "set a trap" beats a vocabulary.

**The frame is competitive; the content is affectionate. Both, at once.** These
are five friends and the cards are real holidays they took together, often with
each other. The needling is the wrapper — the thing being delivered is *"here is
a place I slept and what happened there"*. If you ever find yourself choosing
between the joke and the friendship, the joke loses. Punch at the guess, never
at the person, and never at the place.

---

## The rules of the night

Nobody is awake. That cuts both ways: nothing you do tonight can be checked
with a question, and nothing you hit tonight is allowed to end the night.

**You cannot be blocked.** Not by a missing tool, not by a contradiction
between two documents, not by a checklist item that turns out to be
impossible. Every one of those has a move, and the move is never *stop*:

| what happened | what you do |
|---|---|
| a tool, skill or API is missing | do the job by hand, to a lower standard, and name the gap in the report |
| two documents disagree | use the precedence order below, pick, log the pick, keep going |
| a design decision could go either way | build the one you think is better, ship it, put the alternative in the report |
| something you built is worse than what was there | revert to the snapshot, say so, move to the next item |
| a checklist box cannot be ticked | mark it blocked *with the reason*, and go to the next box |
| you run out of ideas | you are not finished; go back to the priority list and do the next thing properly |

A report that says "I could not do 4 of the 14, here is exactly why" is a good
night. A report that says "I stopped because X was unclear" is not a night at
all.

**Precedence, when two things conflict.** In this order, no exceptions:

1. **§2 of this document.** The gameplay rules. Absolute. The design never
   overrides them and neither do you.
2. **`HANDOFF.md`.** Everything visual.
3. **The rest of this document.**
4. **The code as it stands.** Which is sometimes just the last person's guess.

Where 2 and 3 disagree in a way that is already known, the ruling is written
down in §1 — four of them, settled, do not re-open.

### Use subagents, and keep them cheap

**You may spawn subagents and you are encouraged to.** A night is long, plenty
of this work is parallel, and four well-briefed agents get through more than
one agent reading the same file twice.

**Every subagent runs the latest Sonnet.** `Agent({ model: 'sonnet', ... })`,
every time, no exceptions. You are on the expensive model and the budget has to
last until morning; a night that runs out of tokens at 03:00 is a wasted night
however good the first half was.

**Hand out bite-size, fully specified work.** A subagent has none of your
context and cannot ask you anything. It does well with a task that has a clear
input, a clear output and an obvious finish, and badly with judgement. So:

| good subagent work | keep it yourself |
|---|---|
| "Rewrite `src/admin.css` to use the tokens in `design/.../tokens.css`. Here are the token names and the mappings. Do not change any markup." | anything where you would have to decide what it should look like |
| "Write 25 lines for the `thin` + `solo` tag combination in `src/lines.js`. Here are the five rules from the file header and ten existing lines to match the voice. Output the array only." | deciding whether the bank needs those lines |
| "Run `tools/sim/balance.js` and report mean and SD per format as a markdown table." | reading that table and deciding whether a format ships |
| "Grep every player-visible string in `src/game.js` and list each with its line number." | rewriting those strings |
| "Check `/import` at 375, 768 and 1280 with `tools/layout-audit.js` and report what it prints." | fixing what it finds |

Rules that make the difference between help and a mess:

- **Say exactly what to output**, and prefer a file path or a fenced block over
  prose. "Report what you found" gets you an essay.
- **Name the files.** A subagent that has to go looking burns its budget
  looking, and often edits the wrong thing.
- **One concern each.** Do not ask one agent to restyle a page *and* audit it.
- **Never let a subagent deploy**, publish to the pool, or touch the KV store.
  You own every side effect. They read, they write files, they report.
- **Never let two of them edit the same file.** Split by file, not by feature.
- **Check their work.** A confident report is not evidence. If a subagent says
  a format is balanced, look at the numbers; if it says a page is clean, run the
  audit yourself once.
- Put what they did in the report. Work you did not verify goes in as
  unverified.

### Twenty minutes before you start

Do these first. Each one costs a couple of minutes and each one has cost a
previous session an hour.

**1. Snapshot the project. This is not optional.**

```bash
cp -r "Z:/Documents/Projects/airbnbtap" "Z:/Documents/Projects/airbnbtap-snapshot-$(date +%Y%m%d-%H%M)"
```

**There is no version control here.** `airbnbtap` is not a git repository, so
nothing you overwrite tonight comes back, and you are about to rebuild the
entire front end. If you would rather `git init` and commit as you go, do that
instead and commit before each section — it is strictly better. Either way,
have an undo before you touch `src/`.

**2. Check the toolchain actually runs**, so you find out now rather than at
06:00 with a night of undeployed work:

```bash
python --version && node --version && npx wrangler whoami
```

All three worked on 2026-09-10 (Python 3.12, Node 24, wrangler authenticated).
If `wrangler whoami` fails, **do not stop** — keep building and deploying to
`dist/` locally, open `dist/index.html` directly to test what you can, and put
the auth failure in the first line of the report.

**3. Read `HANDOFF.md` end to end** before writing any CSS. It is 26 KB and it
will save you more than it costs.

**4. Open `tools/layout-audit.js`** and read the header. It documents a bug
class that has now shipped twice and describes how to catch it. §9 tells you
when to run it.

### Time-box the sections

The failure mode of a long night is one rabbit hole eating it. Rough ceilings,
and when you hit one, ship what you have and move on:

| | ceiling | if you overrun |
|---|---|---|
| §1 the rebuild | half the night | ship the pages that are done, leave the rest on the old CSS — mixed is survivable, half-styled is not |
| §6 stories, §4 reveal | a quarter | the import carousel alone is worth the night |
| §5 quips, §3 stats | an eighth | the bank is already written; wiring it in beats writing more lines |
| §7 structural | whatever is left | the kind `402` screen is the only part that is urgent |
| depth and identity | a twelfth | one earned glyph that lands beats six half-built systems |
| §8 scrub, §9 audit | always, last | never skip these to fit something else in |

The review panel sits outside that table. Each round costs four Sonnet
subagents and maybe twenty minutes of your own reading, and it runs twice: once
when the design is settled, once on the finished build. Budget for it rather
than fitting it in — it is the cheapest thing in the night and it has already
caught two exploits that reading the code did not.

---

## 0. What you are working on

TripPin is a daily guessing game built from the Airbnb stays of five friends.
Three stays a day. For each one: **who** was there (tap faces) and **where** it
is (drop a pin on a world map). 800 for the pin on an exponential falloff, 200
for the people, 1000 a round, 3000 a day. Then an emoji grid goes in the group
chat.

When the deck deals you a place *you* slept in, you would know the answer — so
the question changes instead. Those are **host rounds**, and they are about a
third of all rounds. There are eight formats. This is the most distinctive thing
in the game and the part most worth protecting.

```
Z:\Documents\Projects\airbnbtap
```

| | |
|---|---|
| Live | https://trippin.nebriv.workers.dev |
| Group word | set as the `ENTRY_KEY` Worker secret — all five friends have it, rides in the share link as `?k=` |
| Admin word | set as the `ADMIN_KEY` Worker secret — Ben only. Gates `/admin`, the deck, claim resets |
| Ben's sign-in | set at sign-in, not written down here. Two tiles, not one (see §2) |

Build, then deploy, every time:

```bash
python tools/build_single.py && cd worker && npx wrangler deploy
```

`build_single.py` inlines every `src/*.js` and `src/*.css` referenced by the
three HTML files into `dist/`, and deliberately strips the deck and the group
word out of the deployed page. **Never deploy `editor.html`** — it embeds the
whole library.

### The shape of it

```
index.html     the game          src/game.js      rounds, scoring UI, share
import.html    friend setup      src/host.js      the eight host formats (also runs in the Worker)
admin.html     Ben's ops page    src/map.js       Equal Earth projection, pan/zoom
                                 src/emoji.js     the passcode keypad
                                 src/listing.js   the card
worker/src/index.js              the API, the scorer, the deal ledger
tools/*.py                       import, enrichment, coast, publish
```

### How to work without wrecking the live game

Every deploy goes straight to the game five people may open in the morning.

- **Deploy freely while you work** — it is the only way to test anything, and a
  broken intermediate state at 3am costs nothing. But **the last deploy of the
  night must be a working one.** Play a full day against it before you stop.
- **Never leave the deck in a test state.** If you publish junk stays to try
  something, restore from `src/stays.js` with `tools/publish.py` before you
  finish. Note it in the report either way.
- **Testing the friend journey means claiming names**, and a claimed name is one
  the real person then cannot take. Use a throwaway — "I'm not on this list" and
  a name like `testbot` — and release it with `POST /api/unclaim` (admin word)
  when you are done. If you must test as a real name, reset it afterwards and
  say so in the report, because that person will need to pick a new emoji.
- **Write your simulators into `tools/sim/`.** Previous ones lived in a
  scratchpad and are gone, which is why §2's baseline table cannot be
  re-derived. `tools/sim/` does not exist yet — create it. Anything you build to
  measure with has to still be there tomorrow, and since there is no git here,
  "still there" means *written into the project*, not left in a temp folder.

### Things that will cost you an hour if you learn them the hard way

- **The Bash tool eats one level of backslash, even inside quoted heredocs.**
  `\n` becomes a real newline and breaks your Python string. Write patch
  scripts to a file with the Write tool and run them. This has bitten every
  session.
- **Cloudflare's `[[ratelimits]]` binding does nothing on this account.** Forty
  calls against a twelve-per-minute limit all returned `success: true`. The
  Cache API *does* work on workers.dev and is what the limiter uses. Do not
  "fix" this by re-adding the binding.
- **An unauthenticated request must never touch KV.** The free tier is 1000
  writes a day; a junk script that reaches KV can take the whole game down for
  everyone. Wrong guesses are counted in the edge cache for exactly this reason.
- **Airbnb**: `/rooms/<id>` is allowed by robots.txt. `/rooms/*/reviews`,
  `/photos`, `/amenities`, `/location` are **disallowed** — do not fetch them.
  `tools/netpolite.py` handles caching, jitter and backoff. Do not add
  user-agent rotation or TLS fingerprint forgery; that is evasion, not courtesy,
  and it is how an IP gets banned.
- Only **17 of 41** stays have a recoverable Airbnb listing id, so `title`,
  `rating`, `amenities` and `type` are missing on well over half the deck.
  **Never design a card or a feature that requires them.** Present on every
  stay: photo, town, coordinates, month, crew, and now `coast`.
- **The Worker cannot name the place somebody pinned.** `src/worldmap.js` has
  6,776 cities; `worker/src/cities.js` has **68**, and it is a deliberately
  trimmed list for the `level` format only — the comment at the top says so.
  §5's best strategy needs the big list, and §1 wants the bank to run server-side.
  Those two pull against each other. Resolve it one of three ways and say which:
  extract the city array into a shared module both sides import (the 6,776 rows
  are about 200 KB, which is fine for a Worker); do the reverse lookup on the
  client, where the list already is, and send only the resulting name to the
  Worker; or drop the strategy. Do not discover this halfway through.
- **There is no `.git` here.** No branches, no `git stash`, no `git checkout
  --`. See the snapshot rule above.

---

## 1. Rebuild the front end from the design system

The design is **already in the repo** — no MCP, no auth, nothing to fetch:

```
design/game-screen-recreation-project/project/
```

The Claude Design MCP route was tried and does not work here: it needs an
authorization that only an interactive `/design-login` can establish, and
`/design-login` is not available in this environment. Do not spend time on it.
The exported bundle has everything.

**Read `HANDOFF.md` first, all of it.** It is a 26 KB build document written by
the designer and it is more specific than this brief about anything visual. It
carries its own build order, its own acceptance checklist, and nine rules it
calls "the rules that outrank everything" — take that at face value on
everything except where §2 of this document contradicts it (see below).

| file | what it is |
|---|---|
| `HANDOFF.md` | the build document. Start here. |
| `tokens.css` | the token system, both themes. Drop-in replacement for the `:root` block in `src/style.css`. |
| `TripPin Design System.dc.html` | identity, palette, type, every control state |
| `TripPin Redesign.dc.html` | **the game** — card, who-picker, reveal, summary, host rounds, mobile. Interactive; click things. |
| `TripPin Pages.dc.html` | the shell, `/import`, `/admin`, `editor.html`, modals, edge states |
| `TripPin Today.dc.html` | the current build, for before/after. Not a target. |
| `photos/`, `engine/` | real stays and a copy of the map engine so the mockups run offline |

The direction is called **The Board**: prints pinned to a board, one red thread,
everything else deadpan and monospaced. Square, hairline-ruled, mono for
anything counted. Two themes, browser-detected. No build step, vanilla ES5 and
plain CSS — the same shape as the code that is there now.

Follow `HANDOFF.md`'s build order for the rebuild itself. This document's
priority order governs what you do *after* it. Where a page is needed that
nobody has drawn, `HANDOFF.md` §12 says how to build it without inventing a
second visual language — follow that rather than improvising.

**On conflicts generally:** the rules in §2 of this document are absolute and
the design never overrides them — not the scoring, not the share grid, not the
round count. Everywhere else the design wins, and you say in the report where
you deferred to it.

### The designer's four open questions, answered

`HANDOFF.md` §14 leaves four product calls open. All four are settled, and three
of them are already done — do not re-open them.

**1. Host rounds count toward the streak, the same as any other round.** No code
change was needed; `finishDay()` banks a completed day regardless of what was in
it. Leave it that way.

**2. Practice mode is gone.** Removed, not deferred: `startPractice()`, the
"play a random set" button and the `#modeTag` markup are all deleted. A daily
game is worth playing because there is one of it, and an unlimited version
sitting next to it made the day's three rounds feel like a demo — while burning
through the one resource the game cannot make more of. Do not build it back.
Anything in the mockups showing a practice affordance is stale.

**3. The emoji tiles are chosen, and the sign-in is no longer four taps.**
`src/emoji.js` was rewritten. It is now **an animal and where it lives**: 36
animals, 12 homes, 432 combinations, entered either by dragging the animal onto
the home or by tapping one and then the other. Both paths produce the same
value, so neither is the fallback. The stored passcode is two code points —
Ben's is 🐻🗻, and it reads back as *"Your bear lives in the mountains."*

The tiles were picked for character rather than coverage, because the whole
point is that people take the same one every time and everyone knows whose it
is — Maddie is the dog, Ben is the bear. A tasteful grid of shapes would defeat
that. All single code points, no skin tones, no families, nothing that renders
as a box on somebody's phone.

This is live and verified on desktop and at 375×812, both input paths, tiles
at 45px. **`HANDOFF.md` §10 describes a different, earlier sign-in.** See the
fourth disagreement below.

**4. The line bank is written.** `src/lines.js`, 205 lines against §6's tags,
in exactly the shape §6 specifies. It is **not wired in yet** — deliberately,
because §6 places the line precisely (a tack square and one sentence above the
meter, so the taunt lands before the score finishes animating) and that is part
of the rebuild rather than something to bolt onto the old reveal.

The file's header carries the five rules it was written to: never name a place,
never congratulate, punch at the guess rather than the person, nothing about
walking or flying the distance, and no exclamation marks. **Read those before
adding any line of your own.** The bank checks clean today — no duplicates, no
exclamations — and it should still check clean when you are finished.

Coverage is 25 per band, 12 per who-bucket, 32 two-tag combinations, 26 for the
day slot and two untagged fallbacks. If you add more, the thinnest seams are
two-tag combinations involving `thin`, `solo` and `beatBest`.

### Where the two documents disagree

Three places, and here is the ruling on each so you do not have to stall.

**Prose generation.** `HANDOFF.md` rule 9 forbids runtime-composed text and
specifies a flat bank of about 210 canned lines, tagged and selected by a hash.
§5 of this document asks for a generator. **Build the design's mechanism** — a
canned bank, tags, hash-selected, last-40 skipped, no templating — and treat §5
as the brief for *what to write in it*. The six angles, the borrow test and the
silence rule are all about content, and they survive intact.

One exception, and it is new information the designer did not have. Rule 9's
stated reason is that the bank ships in the page source, so a line naming a
place would be a spoiler. **Scoring moved to the Worker tonight, so that reason
is gone** — the bank can live server-side and lines can carry a value from the
data without ever reaching a player who has not earned it. So a line may name
the place *they pinned*, or an amenity from the card, provided the selection
happens in the Worker. It may still never name an undealt stay. If you would
rather not move the bank server-side, ship it static and lose those angles; say
which you chose.

**Facts at import.** `HANDOFF.md` §6 specifies exactly this, with a weighting
scheme and a list of what to compute. It is better than §3's sketch. Use it,
and treat §3 as extra ideas for the same slot.

**Host rounds in the share.** The design marks a host round on the progress pips
with a thread ring. That is your own screen and it is fine. §2's rule is about
the *shared grid* only, and it still holds absolutely.

**The sign-in. Read this one carefully, because `HANDOFF.md` §10 is stale in
two separate ways and both look authoritative.**

*It says four taps, and "do not shorten it for layout".* The sign-in shipped as
**two** — an animal and a home. That is not a layout compromise, it is a product
decision Ben made after seeing both, and the reasoning is in §2. Build what is
in `src/emoji.js`. Keep §10's constraints that still apply: every tile a single
code point, 44px minimum, the sentence sits above the pads so a thumb never
covers what it is filling, and undo is a labelled button and never a tile in
the grid.

*It says the sign-in "replaces the shared word gate" and "the old gate markup
can go".* **It does not and it cannot.** The group word is the authentication —
fifty bits, checked on every request, and it is what keeps the internet out. The
animal is authorisation only: which of five friends you are. Two different jobs,
both needed. The word also rides in the share link as `?k=`, which is how a grid
posted in the chat opens the game for whoever taps it. Deleting that gate would
open the deck to anyone who found the URL.

If you find yourself removing the `?k=` handling, stop and re-read this.

`tokens.css` is the source of truth for colour, type and spacing; make the
existing components speak it rather than carrying their own values. The markup
is already semantic and class-based for exactly this reason.

### Dark and light, decided by the browser

**Non-negotiable, and it is a requirement rather than a nicety.** The game
follows the reader's system setting with no toggle, no prompt and no stored
preference. Somebody who opens it in bed at midnight gets the dark one; the
same person at breakfast gets the light one; neither of them ever touches a
control to make that happen.

The structure is already correct in three places and your job is to not break
it. `tokens.css` does it, `src/style.css` does it, and all four HTML files carry
`<meta name="color-scheme" content="light dark">` so the scrollbars and form
controls come along. The pattern, from `tokens.css`:

```css
:root { /* every token, light values */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* the same tokens, dark values */ }
}
[data-theme="dark"] { /* the same tokens again */ }
```

Three states, not two. An un-stamped `<html>` is the common case and it follows
the system; the `data-theme` blocks exist so a manual switch can be added later
without touching a single component rule. `src/style.css` currently has only the
media query and no `[data-theme="dark"]` block — adopting `tokens.css` fixes that.

Four rules, and they are the ones that get broken:

- **Every token is declared at bare `:root` first.** A colour whose only
  definition lives inside a media query or a `[data-theme]` block does not exist
  in the un-stamped state, which is most readers. This is the classic bug.
- **No component gets a dark-only rule.** `HANDOFF.md` rule 5 says the same
  thing: if a component needs a different value in dark, it needs a token.
  Grep for `prefers-color-scheme` when you are done — there should be exactly
  two blocks in the whole codebase, both at the token layer.
- **`body` paints an explicit token background.** Transparent borrows whatever
  is behind it.
- **The map already follows, and keep it that way.** It renders as SVG whose
  shapes take `--sea`, `--land` and `--land-line` straight from the cascade, so
  a scheme change repaints it with no JavaScript at all — verified on
  2026-09-10: at `prefers-color-scheme: dark` the ocean's computed fill is
  `rgb(14, 20, 24)`, which is `--sea` in the dark block. If you ever move the
  map to a canvas you inherit a repaint problem that does not exist today, so
  do not, and `HANDOFF.md` rule 4 says the same thing for its own reasons.

Test it the way §9 says: both schemes, every page, and switch the scheme while
the game is open rather than only at load.

**Pages that exist and must survive the rebuild:** the game, friend setup
(`/import`), Ben's ops page (`/admin`). **Pages you will probably need to
invent:** the day's reveal (§4), a stats page (§3), and something for a season
ending (§6).

---

## 2. The gameplay rules you must not break

These were arrived at by measurement and by four independent design reviews.
Changing them is allowed; changing them *by accident* is not. Where something
below looks wrong, check whether the reasoning is recorded before you change
it — most of these have already been argued once.

**It must be finishable on the toilet.** Two to three minutes, three rounds, no
reading. Every feature below has to survive that constraint or be cut. If you
find yourself adding a screen someone has to study, you have gone wrong.

**Host rounds must score like normal rounds.** The current measured balance,
which is your regression baseline:

| format | blind | average | sharp | spread vs normal |
|---|---|---|---|---|
| NORMAL round | 101 | 505 | 876 | ×1.00 |
| nearest | 115 | 509 | 885 | ×1.03 |
| stranger | 112 | 520 | 881 | ×1.06 |
| orbit | 101 | 505 | 884 | ×0.97 |
| near | 94 | 531 | 893 | ×0.96 |
| antipode | 70 | 505 | 870 | ×0.96 |
| level | 60 | 494 | 856 | ×0.96 |
| penguin | 82 | 477 | 864 | ×0.89 |
| coast | — | 457 | — | ×0.92 |

**Ship gate for any format you add or change:** mean within ±50 of the normal
round at every skill level, and spread within ±20% of it. Both numbers, every
time. A format with a perfect mean and triple the spread is a coin flip wearing
a disguise — that is exactly how `level` slipped through once already.

**Three things about that table before you regress against it.** They are all
traps that have already caught somebody.

- **`blind` here means a player pinning at random**, which is not a player. An
  ignorant player who *optimises* — one fixed pin in Europe, always tick Ben —
  scores about **415**, not 101. Both numbers are true and they measure
  different things. §7 has the arithmetic. Never tune a format against the 101.
- **`coast` has no `blind` or `sharp` figure and that is correct**, not a gap to
  fill in. `coast`, `level`, `antipode` and `penguin` ask for a *constructed*
  target rather than the stay, so "how well do you know this place" does not map
  onto the answer — if it did, it would be the wrong question. Mean and spread
  are the only two columns that mean anything for those four.
- **The table cannot currently be re-derived**, because the simulators that
  produced it are gone. Rebuilding them into `tools/sim/` is the first item in
  §9 for that reason, and until you have, treat these numbers as the record of
  a measurement rather than something you can check.

**The shape rule.** Every format is a small discrete judgement plus a large
continuous pin: 200 + 800. Every format that has ever abandoned that shape has
drifted off balance, without exception. Keep it.

**The share grid must not say which rounds were yours.** A host round fires on
crew membership, so marking one publishes the WHO answer to anyone who has not
played yet. Rows render identically whatever the question was, and every round
counts toward the tail totals — leaving host rounds out of the totals leaked
them by subtraction. Do not add format names or a house glyph to the shared
text. §4 is where that information is allowed to live.

**Do not reopen these.** Each was a real, measured exploit:

| | |
|---|---|
| The client must never hold the deck | it was a guaranteed 3000/3000, undetectable |
| Scoring stays in the Worker | scoring on the client means shipping the answers |
| One answer per round, recorded server-side | else you clear storage and grind a frozen puzzle |
| `/api/deal` refuses days ahead of today | `?day=400` was every future answer, and it burned the deck |
| The owner is forced into their own crew | omitting yourself dodged host rounds, worth ~1500/day |
| A wrong passcode slows the *account*, never locks the *address* | five friends share a home wifi |
| Stay ids never reach the browser before the guess | ids are built from the place name (`troms-2025-2`); the card carried one, and `/api/deal` handed out today's three to anyone with the word. Closed 2026-09-11: the card has no id, the deal route is admin-only |
| One guess in flight per round | two concurrent guesses were both scored, last write winning. Closed 2026-09-11 with a ten-second edge-cache lock |
| A call is placed only after the round is answered | otherwise it could be fired blind the moment the round was dealt |
| The standing pays for played stays only | ten points for merely typing a stay in rewarded padding the deck. Since 2026-09-11 a stay earns once it has been dealt and guessed at |
| *Recorded, not closed:* the group word rides in every share link | deliberate; anyone sent a grid can play. A forwarded link plus 432 passcode combinations is a reversible rewrite of one friend's stays, logged on `/admin`. The answer is visibility, not length |
| *Recorded, not closed:* the animal half of the passcode is public | it is the player's mark, which the identity work wanted. A guesser inside the group has twelve homes left to try; the account delay now caps at sixty seconds a try, so that is a quarter of an hour of waiting, all of it visible on `/admin`. A stolen code still buys only a reversible rewrite of one friend's stays or a spoiled day, which the admin replay route undoes |
| *Recorded, not closed:* a stay comes back every fortnight | anyone who kept notes can pin it to the mile the second time. The reveal shows "Last time" so a repeat is a record attempt rather than a memory test; the honest fix is a bigger deck |
| *Recorded, not closed:* the day view opens to anyone who has finished | they already hold every answer from the three reveals; the grid rule is about the posted artefact. The page says "careful in the chat" until everyone has played |

**The sign-in is an animal and a home. Two tiles. Not four, and not one.**
It looks like an oversight in both directions and it is neither — it landed
there after both alternatives were built and looked at.

Thirty-six animals times twelve homes is 432, about nine bits. Against the
account slowdown — which doubles every three wrong guesses to a twenty-second
cap — walking the whole space averages a bit over an hour. One tile was four
minutes. `HANDOFF.md` §10's four taps would have been days, and would also have
been four taps.

Here is the reasoning, so you do not re-derive half of it and "fix" it in
either direction. The group word does the authenticating; the animal only says
which of five friends you are. A stolen one does **not** hand over the deck: a
submission only ever replaces the stays of the person who sent it, everyone
else's are untouched, and the Worker keeps a backup generation. So the prize is
rewriting one friend's holidays, reversibly, in a game between people who are
not attacking each other. Against that, extra taps a day levied on four people
who will not tolerate friction is a bad trade — and friction is the thing most
likely to kill this game.

The reason it is two and not one is not entropy, it is memory: *"my bear lives
in the mountains"* is a sentence, and people remember sentences. The eighteen
times more space is a side effect of the thing that made it memorable, which is
the only reason it was affordable.

The answer to a stolen passcode here is **visibility, not length**: every deck
write is logged and shown on `/admin`. If you find yourself wanting more bits,
add more ways to notice and undo instead.

---

## 3. Fun and stupid statistics

The game currently tells you a number out of 3000 and nothing else. Numbers out
of 3000 read as school marks. Build a stats surface that is *funny first* and
accurate second.

Two sources, and use both:

**From play history.** Every result is on the server already
(`play:<day>:<owner>`). Total distance you have been wrong by, expressed in
units nobody asked for — laps of the equator, trips to the Moon, Tromsø-to-Hobart
round trips. Your most confidently wrong moment. The hemisphere you never guess.
Your personal centre of gravity, the point you keep pinning, drawn on the map as
"where you think everything is". Bullseyes. Days you beat each specific friend.

**From the deck, at import time.** This is the richer seam and it is barely
touched. When someone imports, compute superlatives and oddities across the
whole pool and store them: the northernmost stay, the most isolated one (largest
distance to any other stay), the closest pair that were years apart, the only
one in the southern hemisphere, the six that cluster in one valley, the one with
the strangest amenity, the collective distance from the nearest penguin. Write
these as one-liners at import time and show them in the reveal and on the stats
page.

Seed ideas, not a specification. Invent better ones. The test of a good stat
here is whether it would get a reply in a group chat.

---

## 4. The day's reveal, and learning about your friends

Build the page the game is currently missing: **after everyone has played, show
the day with the spoilers in.** Place names, who was actually there, who hosted
which round, how everyone scored, the best and worst pins side by side.

This is the right home for everything the share grid must not carry. It is also
the only place the game currently has to teach you anything about your friends,
which is supposedly the point.

Two mechanics worth building into it:

**The host's line.** When a card is yours, invite one sentence — who you were
with, what went wrong, why you would not go back. Optional, one line, no
pressure. It appears in the reveal next to the place. Four separate reviewers
predicted the group would invent this rule themselves within a month; get there
first. This is the single highest-value feature in this document.

**Gate it honestly.** Do not show the reveal to someone who has not played, and
do not let reading the chat first be worth points.

---

## 5. Taunts, quips, and not feeling stale

Write a prose generator — plain JavaScript, deterministic, seeded from the day
and the result. No LLM at runtime.

**Two ways this fails, and they pull in opposite directions.**

*One template.* A single skeleton filled from word lists is an ad-lib generator,
and a reader clocks the skeleton in about four days. Variety has to live in the
*shape* of the sentence, not in its adjectives.

*Somebody else's game.* The obvious joke — take the error, convert it into a
relatable distance — is exactly what every other map game does. "Forty miles,
you could have walked that" is Worldle wearing our hat. It is fine. It is also
not ours, and a player who has seen one of those games will feel the borrow.

**The test to apply to every single line: would this work on any map game?**
If yes, delete it. TripPin knows things no map game does. It knows Andrew. It
knows this was a *bed*, that it had a private sauna, that it slept twelve, that
Benjamin was on the trip, that Ben wrote a sentence about it afterwards. That is
the material. Use it and the lines cannot be written by anybody else.

### The strategies

Five or six independent ones. Each gets its own structure, its own rhythm, its
own length, and — the part that matters most — **its own eligibility condition**.
Which strategy fires is decided by what actually happened, not by a die roll.
That is the whole difference between a line that reads as observed and a line
that reads as generated.

**1. The listing.** Describe the place they pinned as though it were the rental.
This is the most TripPin joke available and nothing else can tell it.
> *You have pinned the Laptev Sea. No bedrooms, no baths, and the host has never
> responded.*

Reverse-lookup the nearest named thing to their pin against the 6,776 cities
in `src/worldmap.js`; open water and empty desert are the best cases, not the
failure cases. Fires on any pin that lands somewhere with a nameable character.

**Check §0 before you build this one.** Those 6,776 cities are in the *browser*
bundle. The Worker has 68, for the `level` format, and §1 wants the line bank
server-side. Pick one of the three resolutions listed there.

**2. The accusation.** They blamed the wrong friend. Say something true about
that friend.
> *You said Anna. Anna has never been to this continent.*

Needs the roster and everyone's stays, both of which are in the pool. Fires
whenever the WHO half is wrong and the named person is provably innocent. This
is the strategy that makes the game feel like it knows these five people,
because it does.

**3. The amenity.** Pull a real detail off the card and hang the miss on it.
> *It had a private sauna. You put it in Nevada.*

Only 17 of 41 stays carry amenities, so this fires rarely — which is correct.
When it does, it is very good, because the detail is real and specific and
slightly absurd on its own.

**4. The deck yardstick.** Measure the error against the group's own geography
rather than against the world's. Not "that's London to Cairo" — anybody can say
that. Two places *from this deck*.
> *You missed by further than Tromsø is from Melbourne. Both of those are in
> this game.*

Same arithmetic as everyone else's distance joke, completely different payload,
and it quietly teaches people the shape of the deck.

**5. The witness.** Somebody in the chat was on that trip.
> *Benjamin was there. Benjamin is in this group chat.*

Fires when the crew has someone other than the player. Short, dry, and it does
the game's actual job — pointing at the fact that these are shared trips.

**6. The deadpan.** No joke. State the fact and stop. The humour is entirely in
the refusal to comment, and it is the one most likely to get a reply.
> *You were there. You got 200.*

Fires on a fumbled host round. Use sparingly and never dress it up.

**7. The callback.** Needs history, and only fires when a pattern genuinely
exists — which is exactly why it lands.
> *Ninth pin in a row in North America.*
> *Third day running you have blamed Benjamin.*

Invest in the pattern detection, not the phrasing.

**Once stories exist (§6), an eighth opens up: the blurb as the sting.** The
owner's own line, deployed against the person who just missed.
> *Ben wrote "never again". You have put it four thousand miles from where he
> never again'd.*

That one is worth building the moment there are enough stories to draw on.

### The seventh strategy is silence

Most rounds are not interesting. A generator that produces a line every single
time is noise, and noise is what makes people stop reading. If no strategy is
eligible, **print nothing**. An empty reveal is better than a limp one, and the
lines that do appear get their force from being occasional.

Aim for something like a line on one round in three.

### Rules that keep it from ageing

- Never repeat a line for the same player inside a fortnight. Track what has
  fired, per player, and exclude it.
- Vary length hard. Some strategies are four words, some are two sentences.
  Uniform length is its own tell.
- Punch at the guess. Never at the person, and never at the place — somebody's
  actual holiday is in there, and somebody's actual friend booked it. "Anna has
  never been to this continent" is about a guess. "Anna never goes anywhere" is
  about Anna. Know the difference.
- Run the borrow test on every line before it ships: if it would work on a map
  game that has never heard of these five people, it is not finished.
- The host formats already carry six wordings each and pick deterministically
  from the day. Same pattern, same seed discipline.
- Write the strategies so a new one can be added without touching the others.
  You will want a seventh in a month.

### Test it the way it will fail

Generate a season's worth — sixty days, five players — dump every line to a
file, and read it. You are looking for: the same shape twice in a row, any
strategy firing more than about a third of the time, a line that could have
been about any round, anything that reads as pleased with itself, and — most
important — any line that could have come out of somebody else's map game.
Then cut.

A useful sanity check while you are in there: pick your five best lines and
ask whether a stranger reading them could tell this game is built out of
five friends' holidays. If they could not, the generator is competent and
anonymous, which is the failure mode to worry about.

## 6. Getting the stories in

Read this one twice. It is the difference between a geography quiz and a game
about your friends.

**Where it stands: 41 stays, zero stories.** Every reveal is currently a place
name and a number. The single line about who was there and what went wrong is
the whole payload, and none of it exists.

The arithmetic decides the design. Asking one question a day fills the deck in
41 days — three full cycles — so a drip alone leaves the first fortnight,
the only fortnight that decides whether anyone keeps playing, completely bare.
It needs a burst and then a drip.

### The burst: a carousel at import

When somebody finishes importing, do not dump them back on a page. Deal their
stays out one at a time, big photo, one question, a text box, and two buttons:
**next** and **skip**. Forty cards at three seconds each is two minutes, and
most people will write six good ones and skip the rest — which is six more than
the game has now.

Make skip completely free and obviously free. The moment this feels like a form,
it is over.

### The drip: ask after the reward, never before

The obvious idea is a toll — write one to play today. Do not do that, or at
least do not do it at the front. This game's whole promise is two minutes on
the toilet, and a homework screen between the player and the first card will
kill the habit inside a week.

Put the ask **after** the score instead. They have finished, they have their
number, they are relaxed, and they are already looking at a place they slept in.
That is the moment. One card, one question, a skip that costs nothing.

Better still, ask at the **host round reveal**, when the card on screen is
already theirs and they have just spent thirty seconds thinking about it. Best
context in the game. On its own it is slow — about 38 days to fill the deck at
1.08 host rounds a day — so use it as well as the end-of-game ask, not instead.

### The blurb is the bait, not a caption

Before the mechanics: the single line is what somebody reads immediately after
getting your place wrong. That is its job. Build the reveal so it lands as the
punchline — guess, distance, *then* the line — and the whole ask changes shape.
Nobody wants to write a diary entry. Plenty of people want to write the thing
their friend reads after being 3,000 miles out.

### The prompt is the lever

A blank box is a wall. A question is a nudge, and it is the highest-leverage
thing in this whole section. Rotate them, keep them specific, keep them small:

> What broke? · Who slept on the floor? · One word for the host. · Would you go
> back? · What did it smell like? · Who complained first? · Best thing in the
> fridge. · What did you forget? · Rate the shower. · Who got the good bed?

"Tell us about your trip" gets nothing. "Who got the good bed?" gets an answer
and an argument. Write thirty of these and treat them as seriously as the host
round wordings.

### Make contributing pay: the curator game

This is the second-best idea in the document and it is worth building properly,
because it solves a problem nothing else does. One person is going to win the
daily every single day — that is what a 366-point skill gap does over three
rounds — and the other four need a way to be the best at something. Being good
at geography is not it. Owning the card that beats everybody is.

**Every stay keeps a record.** Times played, average miles off, the best guess
anyone has ever managed, how many people have never got close.

*On where to keep it:* the KV write budget is 1000 a day and play records
already spend about fifteen. Do not write a per-stay document on every guess —
derive these from the play records that already exist, either on read or in one
rollup pass a day. If you do add a store, say in the report what it costs a day.

Show it on the card's own page and in the reveal:

> *Tromsø has been played fourteen times. Average guess: 2,400 miles off.
> Nobody has ever got within 500.*

**A leaderboard of places, not players.** Whose cards beat the group hardest.
This is a standing you can top without being able to find Peru on a map, and it
is won by contributing well rather than by playing well.

**Then make it active.** A record you accumulate passively is a stat; a call you
make is a game. When one of your own cards is in today's deck — which you know,
because it comes to you as a host round — offer one tap:

> *Will anybody get within 500 miles of this one?*   **[ they won't ]  [ they will ]**

**It does not settle today, and that is the feature, not a bug to design
around.** The people who would prove you right or wrong have not played yet. So
the call is placed today and resolves when the last of them finishes — which
gives the game something it completely lacks: a reason to come back later in the
day. Show pending calls somewhere quiet, resolve them in the reveal, and let the
result arrive as a notification worth getting.

If that is more machinery than you want, the fallback is to settle it against
whoever has played by the time *you* finish, and say so in the copy. Do not
pretend it settles instantly when it cannot.

One tap, optional, and the placing of it fits inside the two minutes because you
are already looking at the card.

This is the trap frame from the top of the document, made mechanical. Read that
section again before you build this one — the reward loop it describes (a trap
that tells you when it catches somebody) is what makes the standing worth
playing for rather than a table nobody opens.

**The trap in this idea, and the fix.** If hard cards win, everybody imports only
their obscure stays and holds the easy ones back — which starves the deck, and
the deck is the thing the whole game runs on. So do not score curators on
difficulty alone. Score them on **resistance summed across every card they have
contributed**, so a card that nobody gets near is worth a lot and a card that is
merely *present* is still worth something. Then more stays is always better than
fewer, and the incentive points the right way.

**Guardrails, and these matter more than the feature.**

- **Never let any of this touch the daily score.** The emoji grid compares a
  number out of 3,000 across five people, and that comparison is the social
  engine of the game. A bonus earned while you were asleep, for a card that
  happened to come up, would make those numbers mean nothing. Different
  currency, different table, shown side by side.
- **One tap or it does not ship.** The moment the call needs thought, it costs
  the two-minute promise more than it earns.
- **Skipping costs nothing, for ever.**
- A card you contributed months ago still earning you something is the point.
  Do not expire it.

### A group goal, not a personal one

Individual nagging reads as guilt. A shared bar does not: the deck needs roughly
sixty stays to run a season without repeating, and the reveal page is thin until
the stories exist. Show the group where they are against that, on the reveal, in
one line. Let peer pressure do the work you should not be doing with a modal.

### Guardrails

- **Never block play.** No blurb, no gate, no exceptions. A skipped prompt must
  cost exactly nothing, for ever.
- **Never let it touch the score.** The moment a story is worth points, people
  write filler for points and the content gets worse, not better.
- **One line means one line.** Cap it, show the cap, and do not offer a bigger
  box. The constraint is what makes them funny.
- **Let people edit and delete their own.** Somebody will write something at
  midnight they regret. `/import` already edits stays; make sure it reaches
  stories too.

## 7. Structural problems you are allowed to solve

These came out of the reviews and none are fixed. Use judgement; they are
genuinely open.

**The deck lasts a fortnight.** 41 stays at three a day is 13.7 days, then
everything repeats and it becomes a memory test. Options: a season that *ends*
with a leaderboard rather than fizzling; host formats applied to everyone on a
second pass (41 × 8 = 328 puzzles, about four months); relational formats that
combine two stays and scale as the square. Pick one and argue for it.

**One person supplied all 41 stays.** Measured host rate is 100% for Ben, then
41%, 27%, 7% and 5%. The "36% average" describes nobody, and Ben has never once
played a normal round.

This is already half solved and you need to know which half.

*Done, in the Worker:* **importing is now the price of entry.** Claiming a name
lets you sign in; it does not let you play. `/api/round` and `/api/guess` both
refuse with `402` and `needStays: true` until that player owns at least one stay
in the pool. That makes the imbalance self-correcting rather than permanent —
every new player is also new content, so the host rate flattens on its own as
people arrive. `GET /api/crew` now reports `stays` per person and `deck` overall
so the front end can act on it. The four friend-dependent formats already gate
themselves when there is nothing to ask about.

*Yours to build:* the front end has to handle that `402` **kindly**. A player who
signs in and cannot play must land on one clear screen that says why, says what
it will take, and puts them one tap from `/import`. Not an error. Not a modal
they have to dismiss to find a dead game behind it.

Two things to get right:

- **The bar is one stay, deliberately.** Not eight. Somebody who has genuinely
  only booked three places should not be shut out of their friends' game, and a
  bar high enough to guarantee balance is high enough to lose people at the
  door. Nudge toward more, require one.
- **There needs to be a way in for somebody who has never used Airbnb at all.**
  Right now `/import` only takes a pasted trips page. Add a manual path — drop a
  few pins on a map, name them, done. Otherwise the entry rule quietly excludes
  the one friend who camps.

**A fixed pin scores 282 of 800 and "always tick Ben" scores 133 of 200.** With
zero knowledge that is 415 a round against an average player's 505. Both dissolve
as the deck balances across contributors; neither is worth a scoring hack. Know
about them before you tune anything against a "blind" baseline.

**Tension.** The game has none. Three rounds, a number, done. Ideas worth trying,
all cheap and all toilet-compatible: a single daily double-down declared *before*
the last round is dealt; a live count of how many friends have played today; a
visible countdown to the reset; showing your previous score on a stay you have
seen before so a repeat becomes a personal record attempt. Do not add anything
that lengthens the session.

---

## Give them a reason to come back

Everything above fixes something. This section is the opposite: **you are
invited to add.** Build things nobody asked for. Make it strange. The five
people playing this have no obligation to open it in March and the only thing
that will get them there is that it is theirs and it is funny.

**The one rule that governs all of it: the daily game does not get longer.**
Three rounds, two to three minutes, no reading, finishable on the toilet.
Everything in this section lives **after** the last pin drops — on the reveal,
on the stats page, in the share, in a notification the next morning. Anything
that adds a decision before or during the three rounds is wrong, however good
it is. Depth sits behind the game, never in front of it.

Within that, go as deep as you like. Bonus points, second currencies,
collections, titles, reactions, seasons, private jokes that only make sense to
five people. You do not need permission for any of it and you do not need to
ask which to build.

### The animal is already their mark — use it

The sign-in is an animal and where it lives, and it was built that way partly
because everyone will know whose is whose — Maddie is the dog, Ben is the bear.
That is a free identity system nobody has spent yet.

Put the animal where a name currently sits. On the progress pips for a round
they hosted. Beside their score in the reveal. On the cards they contributed,
so a card in the deck visibly belongs to somebody. In the group standing. The
share grid is the one place it may not go, for the reason in §2.

Then let it earn things. A home that changes with what they do — the bear moves
to the sea after five ocean pins — costs almost nothing and is exactly the kind
of stupid detail that gets a reply in a group chat. Their sign-in value must
not change; the *display* can do what it likes.

### Seeds, not a specification

Pick the ones you like, invent better, build three properly rather than eight
thinly:

- **Earned glyphs and titles.** Not achievements with progress bars — dry,
  specific epithets that arrive unannounced in the reveal. *Certified Atlantic
  Enjoyer* for somebody who keeps pinning open water. *Has Never Once Suspected
  Anna.* Awarded from play history, never explained, never on a list to
  complete.
- **A second currency that is not the daily score.** §6's curator standing is
  one. There is room for more, provided §6's guardrail holds absolutely: it
  never touches the number out of 3,000, because that number is what five
  people compare in the chat and it has to mean the same thing for all of them.
- **Bonus points, but only for a thing you did on purpose.** Within ten miles.
  The full crew, three days running. Calling a host round's constructed target
  exactly. Make the bonus visible *as a bonus*, in its own currency, and never
  silently folded into the 3,000.
- **A passport that fills in.** Every stay somebody gets within fifty miles of
  is a place they have "been". A world map colouring in over a season is a
  reason to open the app on a day you already played.
- **Reactions on somebody else's disaster.** One tap on a friend's worst pin in
  the reveal, and they see it next time they open the game. This is the cheapest
  social loop in the document and it is the one most likely to actually run.
- **A season that ends.** §7 raises this as a deck problem; it is also the best
  source of drama available. An ending makes the fortnight before it matter.
- **Something that only makes sense to these five.** You have their real trips,
  their real crews and, once §6 lands, their own sentences about them. Find the
  joke that is only available to somebody holding that data.

### The test to apply before you build any of it

1. Does it add a single tap before the third pin drops? Then no.
2. Could it be on any daily puzzle game? Then it is not ours yet.
3. Does it change the number out of 3,000? Then no.
4. Would it get a reply in the group chat? If not, it is a feature rather than
   a joke, and this game does not need more features.

---

## The review panel

**After you make design decisions, put them in front of the panel. Before you
call the night done, put the build in front of it.** This is not optional and
it is not a formality: every one of the rules in §2 came out of a round of this,
and two of them were exploits nobody had spotted by reading the code.

Four reviewers, and they disagree with each other on purpose. Spawn them with
`Agent({ model: 'sonnet', ... })` — the same budget rule as every other subagent — and **run them blind**: each gets the game described from scratch, none gets
your reasoning, and none gets the others' reports. A reviewer told what you
already decided will agree with you.

Run them **twice**: once when the shape of what you are building is settled and
before you have built much of it, and once against the finished thing. The
first round is cheap to act on; the second catches what you broke.

| | who they are | what they are good for |
|---|---|---|
| **The board-game designer** | twenty years of tabletop, thinks in turns, information and incentives | who is having fun on somebody else's turn; whether the standing is winnable by more than one kind of player; whether the rules can be explained in a sentence |
| **The video-game designer** | live-service and daily-loop background | the retention shape, the first session, what the game feels like on day 40; whether a reward arrives when it means something |
| **The party-game designer** | real-world games for people in a room, half of them drunk | whether five friends who are not concentrating can do this; where the laugh is; anything that is only fun for the person who knows the answer |
| **The adversary** | finds the cheapest way to win without playing | exploits, ways to farm points, anything a player learns to game once and then does for ever |

### How to brief one

The brief matters more than the reviewer. Each one gets, in its own prompt:

- what the game is, in a paragraph, written from scratch rather than pasted
  from this document;
- the exact mechanic under review, including the numbers;
- the five players and the fact that one of them wins every day;
- the constraints that cannot move: three rounds, two to three minutes, 200 +
  800, the share grid says nothing about host rounds, the daily score is the
  only thing compared between people;
- what you want back: the three biggest problems, each with the situation in
  which it goes wrong, and for each one either a fix or an argument that it is
  not fixable.

Tell them to be specific and to disagree. A reviewer that returns a list of
things that are going well has been briefed badly.

### What to do with what comes back

**Fix the issues. That is the point of running it.** Do not file the reports
and move on — a review you did not act on is a review you did not need.

- **Two or more panellists raising the same thing is a bug**, whatever you
  think of it. Fix it.
- **One panellist raising something sharp is a judgement call.** Make the call,
  write down which way and why.
- **Anything the adversary finds is a bug.** Every single one. If you cannot
  close it, say so in §2's exploit table so the next person knows.
- Re-measure after every fix that touches scoring. §2's ship gate applies to a
  change you made because a reviewer told you to, exactly as it applies to a
  format you invented.
- Put the panel's findings in the report with what you did about each, including
  the ones you overruled and why.

### The fifth reviewer is arithmetic

The panel reads; it does not measure. Anything that touches scoring also goes
through the simulator in §9 before it ships — mean *and* standard deviation,
against the baseline in §2. A format with a perfect mean and triple the spread
is a coin flip wearing a disguise, and no amount of design review catches that.
That is what `level` did.

---

## 8. Scrub the writing

Everything a player reads, and everything the next person to open this repo
reads, should sound like a person wrote it.

Run both skills across the work, and mean it — not as a final polish pass over
a file or two. Their exact names, because a wrong guess wastes time:

| skill | invoke as | what it is for |
|---|---|---|
| `avoid-ai-writing` | `anthropic-skills:avoid-ai-writing` | flags and rewrites AI-isms. Rewrite mode by default, Detect mode reports without editing |
| `humanizer` | `anthropic-skills:humanizer` | rewrites AI-sounding prose so it reads like the writer, without changing what it says. Built on Wikipedia's "Signs of AI writing" |

They overlap and they are not the same pass. Run `humanizer` first, on prose
that has a voice to preserve — this document, the report, player-facing copy,
the line bank. Then run `avoid-ai-writing` in **Detect** mode over the result:
Detect is the right mode for copy that is deliberately terse, because it tells
you which flags are real problems and which are a house style it does not
recognise. Use your judgement on what survives; do not let either skill smooth
the voice out of a game written by one friend for four others.

An earlier draft of this brief said `humanizer` was not installed. It is — it
was added on 2026-09-11 as `anthropic-skills:humanizer`. If either skill turns
out to be missing when you run, that is a line in the report and not a blocker:
do the pass by hand against the list below.

In scope:

- Every string a player sees: prompts, taunts, reveal copy, error messages,
  empty states, button labels, the help screen, the stats page.
- The prose generator in §5 — it is the highest-risk surface in the whole
  project, because it produces text at runtime and will drift to the mean
  without someone actively holding it back.
- Code comments and the files in `docs/`, including your own report.
- Anything the design system ships as placeholder copy.

What to hunt: em-dash-and-tricolon rhythm, "it's not just X, it's Y", hedging
that says nothing, cheerful exclamation, symmetry for its own sake, and the
particular smell of a sentence that has been balanced rather than meant. A game
between five friends should read like one of them wrote it at eleven at night,
because one of them did.

Do this **before** the audit, so the audit tests the copy you are actually
shipping.

## 9. The audit

Before you call anything done, audit it properly. There are harnesses to
model on in previous work; rebuild them if they are gone.

1. **Simulate players.** At least three skill archetypes across at least sixty
   simulated days. Report per-format mean *and* standard deviation against the
   baseline in §2. Any format outside the ship gate is a bug.
2. **Simulate a full deck cycle.** Confirm nothing repeats before the deck is
   spent and no stay is skipped at the cycle boundary — 41 is not divisible by 3
   and that edge has already broken once.
3. **Simulate the shares.** Generate grids for every combination of host and
   normal rounds and confirm none of them reveals which was which. Check the
   printed distances sum to the tail; a mismatch leaks by subtraction.
4. **Play it yourself, in a browser, end to end.** Sign in cold, play three
   rounds, reload mid-day, share. Then do the friend journey: game link →
   "not set up" → setup → import → back to the game.

   **The friend journey dead-ends unless you know this.** A freshly claimed name
   owns no stays, so `/api/round` and `/api/guess` answer `402 needStays` and
   there is no game behind the setup screen. That is the feature §7 asks you to
   handle kindly — and it also means you cannot test anything past the gate as a
   new player until that player has stays. Give the test account some:

   ```
   POST /api/stays
   { "key": "<group word>", "owner": "testbot", "pass": "<testbot's two tiles>",
     "stays": [ { "place": "Reykjavik", "lat": 64.15, "lng": -21.94,
                  "when": "March 2024", "crew": ["testbot","ben"] } ] }
   ```

   `place`, `lat` and `lng` are the only required fields; everything else is
   optional, and the owner is forced onto their own crew whatever you send. A
   submission **replaces** that owner's stays rather than appending.

   Then clean up with one call:

   ```
   POST /api/forget          (admin word)
   { "owner": "testbot" }
   ```

   That drops the account's stays, its roster entry and its claim together, and
   logs the removal on `/admin` like any other deck write. It was added on
   2026-09-10 for exactly this — before it existed, `unclaim` freed the name but
   left the stays in the pool for ever, so testing the friend journey meant
   permanently polluting the deck. Check the pool is back to 41 before you
   finish, and say in the report if it is not.
5. **Re-run the exploit list** in §2 and confirm every one still fails.
6. **Mobile.** 375×812. The card was 583px tall at one point and pushed the map
   off-screen; check it still is not. The sign-in was 32px tiles at one point,
   under the 44px floor, because a `justify-items: center` parent shrinks a grid
   child to its content — that one is fixed, check it stayed fixed.

   **Then screen for the whole error class, because you are about to rebuild
   every layout in the project.** Paste `tools/layout-audit.js` into the console
   and run it on **every screen state at 375, 768, 1280 and 1920**: signed out,
   the sign-in pad, the play board, a host round, the reveal, the summary, the
   `402` screen, `/import`, `/admin`. Its header explains the bug; the short
   version is that a container with fixed tracks gains a child, or a parent's
   alignment collapses one, and `body { overflow-x: hidden }` then swallows the
   evidence so the page looks fine with a control sitting off the edge.

   Two real instances, both shipped, both invisible in a diff:

   - `.topbar` declared `40px 1fr 40px` and got a fourth child when the sign-in
     chip arrived. The chip took the 40px track and hung off the right edge; the
     stats button dropped to an implicit second row. Fixed on 2026-09-10 by
     making both sides `minmax(40px, 1fr)` groups.
   - `.signin__pad` inherited `justify-items: center` from its parent, which
     shrink-wraps a grid child, so a six-across keypad rendered 32px tiles.

   **Any new container you add tonight is a candidate.** After each page you
   rebuild, run the audit before you move on rather than saving it all for the
   end — a spill found two pages later is a puzzle, a spill found immediately
   is a typo. A clean run is `spill`, `rows` and `clipped` all empty, and
   `small` containing nothing but the three controls `HANDOFF.md` rule 7 allows
   below 44px.
7. **Both colour schemes, on every page.** Not a screenshot of each — switch
   the scheme *while the game is open* and confirm the map repaints with it.
   Check the reveal, the summary, the sign-in, `/import` and `/admin`. Then
   grep: `prefers-color-scheme` should appear at the token layer and nowhere
   else, and no component should carry a colour literal.
8. **Hard-reload before you believe a browser.** A cached page cost this project
   an hour on 2026-09-10: the fix was deployed, the live bytes were correct, and
   the tab was serving the old CSS. Add a changing query string, or verify with
   `curl` against the deployed URL rather than trusting the pane.

---

## 10. When you may stop

Not when you run out of ideas. When all of these are true and you have *shown*
each one:

**These boxes are mostly about whether a thing exists, and existence is easy to
fake.** A stats page with three numbers is live and reachable. A curator table
full of zeroes exists. Mobile can be checked and be bad. So for the four that
carry the game — the reveal, the stories, the quips, the curator standing —
the bar is not "it is there", it is **you played with it and it was good**. If
it is there and it is thin, mark it thin. That is worth more than a tick.

- [ ] The front end is rebuilt on the design in `design/`, and every page the
      game needs exists. `HANDOFF.md` has its own acceptance checklist in §13 —
      work through it as well as this one and report both.
- [ ] `anthropic-skills:humanizer` and `anthropic-skills:avoid-ai-writing` have
      both been run across player copy, the prose generator, comments and docs
      — including your own report. §8 has the order and the modes.
- [ ] `python tools/build_single.py && cd worker && npx wrangler deploy` runs
      clean, and the live site plays a full day end to end.
- [ ] Every format passes the ship gate in §2. Table included in your report.
- [ ] Every exploit in §2 re-tested and still closed. Evidence included.
- [ ] A deck-cycle simulation showing no repeats and no skipped stays.
- [ ] Share grids that do not betray host rounds, with the sample you generated.
- [ ] Stats, reveal, the story prompts (§6) and the prose generator all live
      and reachable, and a skipped prompt costs nothing.
- [ ] A player with no stays gets a kind, actionable screen rather than a dead
      game — and somebody with no Airbnb history at all can still get in.
- [ ] The curator standing exists, is separate from the daily score, and
      rewards volume as well as difficulty.
- [ ] A trap that catches somebody tells its owner, and the story lands as the
      punchline of a reveal rather than as a caption.
- [ ] A season of generated quips dumped and read end to end: no strategy over
      a third of the time, no repeated shapes back to back, silence on the
      rounds that deserve it.
- [ ] Mobile: a full day played at 375×812, not merely rendered. The card was
      583px tall at one point and pushed the map off the screen.
- [ ] Dark and light both play, chosen by the browser with no toggle, on every
      page — and the map follows when the scheme changes mid-session.
- [ ] `tools/layout-audit.js` runs clean on every screen state at 375, 768,
      1280 and 1920: nothing off the edge, no grid on more rows than it has
      columns, no clipped text, nothing under 44px inside a turn.
- [ ] The pool is back to 41 stays and one player, with no test account left in
      it.
- [ ] The panel ran twice, on Sonnet, blind, and every finding has an outcome
      next to it in the report — fixed, overruled with a reason, or recorded in
      §2's exploit table. Everything the adversary found is closed.
- [ ] There is something in the game that exists only to be funny, that a
      player earns rather than chooses, and that does not touch the daily score
      or add a tap before the third pin drops.
- [ ] No unauthenticated path touches KV.
- [ ] The deployed page contains no place names, no coordinates and no group word.

Then write `docs/overnight-report.md`. Open it with anything that blocked you,
so it is read first. Then: what you built, what you measured, what you changed
your mind about, what you deliberately left alone, and what you shipped thin and
would do properly with another night. A known gap is worth more than a silent
one, and a thin feature you flagged is worth more than a thin feature you ticked.

**If you hit something genuinely ambiguous** — a design decision that could
reasonably go two ways and that you cannot settle by measurement — build the
version you think is better, ship it, and put the alternative in the report with
your reasoning. Do not stall waiting for an answer. Nobody is awake.

And the rule from the top of the document, restated here because this is where
you will be when it matters: **there is no outcome where you stop early.** Not a
missing skill, not a contradiction, not a box you cannot tick, not running out
of ideas. Every one of those is a line in the report and then the next item on
the list. The only thing that ends the night is the night.

The one thing you genuinely must not do is leave it broken. Whatever else
happens, the last deploy is a working one, and you have played a full day
against it yourself before you write a word of the report.

One last thing: the group word rides in the share link, so anyone who is sent a
grid can open the game. That is deliberate. It is also why nothing behind that
word may be anything you would mind a stranger reading. Keep it that way.
