> **Historical brief.** Written before the host formats shipped. Some of it
> no longer matches the code: the `pin`, `people` and `choice` kinds it
> describes were never built (every live format ends in `pin`), and its
> note that the share grid needs a mark for these is the opposite of the
> rule the grid now enforces — see "Results share as an emoji grid" in the
> README. Read it for the reasoning, not the specifics.

# TripPin — host rounds (design brief)

A handoff note for whoever is redesigning the app. This covers one feature: what
happens when the game deals you a place you have actually been.

---

## The game, in three lines

TripPin is a daily guessing game built from the Airbnb stays of five friends.
Each day deals **3 stays**. For each one you answer two halves — **WHO** was
there (tap one or more faces) and **WHERE** it is (drop a pin on a world map).
Scoring is **800 for the pin** (exponential falloff by distance, full marks
within 50 miles) and **200 for the people** (set overlap), so **1,000 a round,
3,000 a day**. Then you share a spoiler-free emoji grid.

---

## The problem host rounds solve

The deck is pooled — everyone's stays go in the same pile. So sooner or later it
deals you a place **you slept in**. You know exactly where it is and exactly who
was there: 1,000 free points and no game.

**This is not an edge case.** With five players and a fair spread, about a
quarter of the deck is yours, which makes the odds of hitting at least one in a
three-round day roughly **58%**. More than half of all days contain one. Design
for it as a primary state, not an exception.

An earlier idea — skip the round and mark it as a freebie — was rejected because
it sidelines you from the day's puzzle more often than not.

## The rule

> If you are in the stay's `crew`, it becomes a host round.

Note it is `crew`, not just the person who booked it. If you were a guest on
someone else's trip you know that place just as well.

---

## What a host round is

**Same card, same map, same 1,000 points — a different question.**

The player still sees the exact stay everyone else is seeing that day, so the
group conversation survives intact. What changes is what they are asked, and
every question is one that having been there does not answer for you.

There are **eight formats** but only **four controls**. The four controls are
the thing to design; the eight formats are content poured into them.

### Control 1 — pick a person, then drop a pin  (200 + 800)

Visually closest to a normal round: the same face row, the same map. Three
formats use it.

| Format | The question |
|---|---|
| **Whose is nearest?** | Which of the other four has stayed closest to this place — and where was it? |
| **The stranger** | Which of them has never come close? Pin the nearest they ever got. |
| **Whose orbit is this in?** | Forget single stays — whose travelling, as a whole, centres nearest here? Pin that centre. |

### Control 2 — tick everyone who qualifies  (1,000, by set overlap)

Reuses the existing multi-select face row. **"Nobody" is a valid answer and must
be submittable** — that is the one new interaction need here.

| Format | The question |
|---|---|
| **Who else has been near here?** | Which of the others has ever stayed within 500 miles? |

### Control 3 — drop a pin  (1,000)

Map only, no face row. The screen should feel noticeably barer than a normal
round so the change of question is obvious.

| Format | The question |
|---|---|
| **Straight through** | Dig down through the middle of the Earth. Pin where you come out. (Almost always open ocean, which is why it is funny.) |
| **The nearest sea** | How hemmed in were you? Pin the nearest saltwater. |

### Control 4 — pick one of four  (1,000)

A simple four-option list. **This control does not exist yet** and is the one
genuinely new piece of UI.

| Format | The question |
|---|---|
| **Level with** | Which of these cities sits at almost the same latitude as this place? |
| **The penguin test** | Roughly how far were you from the nearest penguin? (Four distances. Near misses score partial credit.) |

---

## Design notes that matter

**It must read as a variant, not a different app.** Same card, same scoring
scale, same reveal. The player should feel they are still playing today's
puzzle, not being shunted into a side game.

**But it must be instantly legible as different.** The moment of "wait, this one
is mine" needs a clear visual beat before the new question lands — otherwise
people will answer the normal question out of habit and lose the round.

**Each format needs a one-line prompt and a reveal line.** The prompts are
written and live in `src/host.js`; treat them as copy to be styled, and feel
free to rewrite them. Every format also carries a `note` used on the reveal
("Their closest was still 1,240 miles away", "That is the distance due south to
60°S, where the penguins start").

**Rotation.** The format is chosen deterministically from the day, the round
number and the player, so reloading cannot reroll a question you did not like.
Formats that cannot run — "Whose orbit" needs at least two other players with
two stays each — are skipped silently. At 58% frequency, variety is the point.

**The share grid needs a mark for these.** A host round should be visually
distinct in the shared result, because "that was my cabin" is a better
conversation than a silent 1,000. It also lets the group infer whose place it
was from who got the odd row.

---

## The account flow this depends on

The game currently has **no idea who is playing** — entry is a single shared
word. Host rounds need identity, so sign-in is being added.

**Setup (once, on the import page):** pick your name → choose a passcode → paste
your Airbnb trips → they geocode and send.

**Sign in (once per device, on the game):** pick your name → tap your passcode.
Stored locally afterwards, so the daily does not ask again.

**The passcode is an emoji keypad.** A grid of 36 tiles; your code is a
**sequence of 4** taps — 🦆🌮🚀🧦. Design needs: the 36-tile grid, four slots
that fill as you tap, and an undo. Tiles are deliberately plain single-codepoint
emoji (no skin tones, no flags, no families) because anything fancier renders
differently machine to machine.

The passcode is two tiles, an animal and its home, which is enough to say which friend you are and no more.: one tile is ~5 bits
and would be guessed inside a single lockout window, whereas four is ~21 bits —
168× a bank PIN — and holds for years against the server's ten-guesses-per-
quarter-hour limit. **The length is the one number here that should not be
reduced for aesthetics.** Adding tiles to the grid is free; removing taps is not.

---

## Data limits worth knowing

Only **17 of 41** stays have a recoverable Airbnb listing id, so **title, rating,
amenities, property type and extra photos exist for well under half the deck.**
Any design that leans on them will have holes. Do not build a card that needs a
title.

What is present on **every** stay: a photo, a town name, coordinates, the month,
and who was there. Everything the host rounds ask is derived from those plus
arithmetic — distances, centroids, antipodes, latitudes — which is precisely why
they work on the whole deck when listing-based questions would not.

The stay's **title and date are deliberately never shown before the reveal**, in
either a normal round or a host round. They give it away.
