# TripPin — design brief

**For:** incoming design contractor
**Scope:** complete visual identity, design language, logo, and UI design for all four pages
**Existing build:** working, deployed, functional. Ugly. Yours to replace.

Requirement language: **MUST** / **MUST NOT** are hard — break one and the work
comes back. **SHOULD** is a strong default you may argue with. **MAY** is yours.

---

## 1. What this is

TripPin is a daily guessing game for **five specific people**. Not a product. Not
a startup. There is no signup, no marketing page, no growth loop, no user
acquisition. There are five friends — Ben, Benjamin, Andrew, Maddie, Anna — and a
private URL behind a shared password.

They pooled their real Airbnb trip histories. Every day the game deals three of
those stays to everybody, and you have to work out **who was there** and **where
it was**.

### The joke at the centre of it

It is a game about the comedy of your friends' taste.

The photos are real Airbnb listing photos, which means they are mostly *mundane*.
A beige living room in Lima. A bunk bed in Queens with a bedspread nobody chose.
A tiny home in upstate New York at golden hour, because that host knew what they
were doing. They are not beautiful travel photography and they MUST NOT be
designed as if they were.

The amenities are the punchline. These are real strings pulled from real
listings:

> Private hot tub — available all year, open 24 hours
> 29 inch TV with standard cable
> Private backyard — Not fully fenced
> Fast wifi — 73 Mbps
> Ski-in/Ski-out
> Rifle locker

"29 inch TV with standard cable" tells you something about a place and about the
person who booked it. "Wifi" does not. The game already ranks amenities by how
weird and specific they are and leads with the strangest one. **That ranked
oddity is the personality of the product.** If your design buries it, the design
has failed.

### Tone

Dry, warm, a little deadpan. The register of a group chat between people who have
known each other fifteen years, not the register of a consumer app.

It should feel like **evidence being laid out**, not like a quiz being
administered. You are looking at a photograph of a room and inferring a human
being from it. Detective energy, played for laughs.

Things it is not: perky, gamified, congratulatory, "Well done! 🎉", badge-driven,
streak-anxiety-inducing, corporate-travel, real-estate-listing, or wistful
travel-blog. It also MUST NOT read as an Airbnb product or sub-brand.

### Design for the 400th play, not the first

Everyone already knows the rules. Nobody will ever onboard again. The interface
that matters is the one you see every morning for two years. That means:

- Density over hand-holding
- No tutorial UI in the main flow (there is a help modal; it is for reference)
- Nothing that is charming once and irritating on the fortieth repeat
- The first frame after load should be *the puzzle*, immediately

---

## 2. How it plays

One turn, two answers, then a reveal. Three turns a day.

```
   ┌─ THE CARD ─────────────┐      ┌─ THE MAP ──────────────────┐
   │ photo (hero)           │      │                            │
   │ photo strip (3 thumbs) │      │   world map, pan + zoom     │
   │ ♨ the odd amenity      │      │   tap to drop a pin         │
   │ [chips] [chips]        │      │                            │
   │ 2 guests · 1br · 1 bed │      └────────────────────────────┘
   │ ★4.96 (190)            │
   └────────────────────────┘
   ① WHO WAS THERE?  (tap everyone)
   [Ben] [Benjamin] [Andrew] [Maddie] [Anna]

                                        [ Lock it in ]
```

1. **Who was there?** Multi-select over the five. Partial credit. Most stays are
   one or two people; some are four. Over-guessing is penalised.
2. **Where was it?** Drop a pin on a world map. Scored on great-circle distance.
3. **Lock it in** — enabled only when both halves are answered.
4. **Reveal** — the map flies to frame your pin and the true location with a
   dashed line between them; the card is replaced by the result panel.
5. **Next stay** → repeat → after the third, the day's summary.

Both answers belong to **one turn**. They MUST feel simultaneous and equal, not
sequential steps. The player's eye moves photo → people → map → button.

### Sharing

A Wordle-style emoji grid, copied to the clipboard. This is the only thing that
ever leaves the product, so it MUST stay parseable as plain text in a message:

```
TripPin #14  2,140/3,000
✅ 🟩🟩🟩🟩⬜  12 mi
🔶 🟨🟨🟨⬜⬜  240 mi
❌ 🟧🟧⬜⬜⬜  610 mi
🎯 best 12 mi · 🌍 862 mi off · 🔥6
https://…/?k=…
```

One line per stay. The first glyph is the WHO result (✅ exact / 🔶 partial /
❌ nothing). Then a five-square proximity bar, Worldle-style: how much of the
distance score you kept, one square per fifth, coloured by which band you landed
in (🟩 🟨 🟧 🟥). Then the raw distance. The tail line carries your best pin,
your total miles off, and the streak.

Note what it deliberately withholds: distances and bands, never a place. You can
post this in the group chat before your friends have played.

You MAY redesign the glyph vocabulary and the tail. You MUST keep it to one line
per stay, plain text, and free of anything that identifies a location.

---

## 3. Scoring

| | |
|---|---|
| **Where** | 0–800. `800 · e^(−miles / 600)`. Inside 15 miles is a flat 800. |
| **Who** | 0–200, by set overlap (Jaccard). Exact party = 200. |
| **Per stay** | 1,000 |
| **Per day** | 3,000 |

Real values, for designing the reveal: 100 miles out still earns 675. 500 miles
earns 348. 1,000 miles earns 149. 2,000 miles earns 29.

Distance bands drive the colour of the WHERE result:

| Band | Share of max | Feels like |
|---|---|---|
| 0 | ≥85% | right town |
| 1 | ≥55% | right region |
| 2 | ≥25% | right country-ish |
| 3 | <25% | wrong continent |

These four bands need a **semantic colour ramp that is separate from your brand
accent** and legible in both themes. Do not reuse the accent for "good".

---

## 4. The pages

Four pages. Different audiences, different rules.

### 4.1 `/` — the game

The main event. Seen daily by all five. Everything in §5 lives here.

States it must handle:
- **Gate** — full-screen password entry, shown when the link has no `?k=` and
  nothing is remembered. Minimal: wordmark, one line, one field.
- **Playing** — card + who-picker + map + action bar
- **Revealed** — result panel replaces the card; map stays, showing both pins
- **Day complete** — summary with per-stay rows, share button, streak stats,
  countdown to the next set
- **Empty** — no stays published yet (rare, but real)

### 4.2 `/import` — for the friends

Where the other four add their own trips. Seen a handful of times each, ever.

It is a **five-step instructional flow** that asks a non-technical person to open
Chrome DevTools and paste a console snippet. That is genuinely intimidating and
the design's whole job here is to make it feel routine. Steps, a copyable code
block, a keyboard-key affordance for `F12`, and a collapsible "or do it by hand"
alternative.

After importing, the same page lists **only that person's own stays** so they can
fix a wrong town or add a story. Nobody sees anyone else's data here — that is a
privacy constraint, not a nicety.

### 4.3 `/admin` — for the one running it

Counts and health only. **This page MUST NOT display place names, coordinates,
photos, or stories**, because the person running the game also plays it and
cannot be allowed to spoil themselves by opening the dashboard.

Contents: four total tiles; a per-player table (stays / thin / no photo / no
story / solo) where "thin" means a card with nothing but a town on it; an editor
for the five "tell" lines; and one deliberately-quarantined destructive action
("download everything, this will spoil you") that MUST look and feel different
from everything around it.

### 4.4 `editor.html` — local only, never deployed

Full data editor with map picker. Runs on one laptop. **Lowest priority** — style
it consistently and move on. Do not spend budget here.

---

## 5. Components

This is the real work. Every one of these exists today and needs redesigning.

### 5.1 The stay card — *the centrepiece*

The single most important object in the product. Composition, top to bottom:

1. **Hero photo.** Arbitrary aspect ratio, arbitrary quality, frequently
   unflattering. Currently 16:7 crop. Your design MUST survive a genuinely ugly
   photo — assume a dim phone snap of a beige sofa, because that is a real card.
2. **Property-type badge** overlaid on the photo ("Tiny home", "Entire cabin",
   "Entire rental unit").
3. **Photo strip** — up to three more thumbnails beneath the hero. Clicking one
   swaps it into the hero. These are CDN links that can fail; a failed thumb
   removes itself, so the strip MUST look correct with 3, 2, 1, or 0 thumbs.
4. **The odd amenity**, alone on its own line with an icon, at display size. The
   most characterful line on the page.
5. **Amenity chips** — up to five more, ranked, less weird than the first.
6. **Facts line**, demoted: `2 guests · 1 bedroom · 1 bed · 1 bath`.
7. **Rating** `★ 4.96 (190)` and, when present, nightly price.

There is no title. There is no date. See §6.

**Empty states are the norm, not the exception.** 21 of 41 current stays have no
amenities at all, because the enrichment could not find their listing. A card can
be nothing but a photo and "4 nights". That version MUST still look deliberate —
not like a broken card.

### 5.2 The who-picker

Five multi-select toggles. Each is an avatar (coloured circle, single initial)
plus a first name. Two are "B" — Ben and Benjamin — so **initial alone is never
sufficient**; the name is load-bearing.

Needs: unselected, selected, hover, focus-visible, and a clear affordance that
this is multi-select rather than radio. Must fit five across on desktop without
one orphan wrapping, and lay out sanely on a 375px phone.

Current player colours (yours to replace, but keep five distinguishable hues that
work on both themes):
`#3d7a8c` `#8c4a6b` `#5c7a4a` `#b07c2e` `#4a5c8c`

### 5.3 The map

A bespoke SVG renderer. **You MUST NOT replace it** — no Leaflet, no Mapbox, no
tiles. It is 446 KB of baked Natural Earth geometry with no network calls, which
is a deliberate feature.

You **MAY and SHOULD** restyle it completely: land, water, borders, the sphere
outline, city dots and labels, the pin markers, the guess→answer line, and the
control cluster.

What it does:
- Two projections, toggled by a control: **Equal Earth** (default — genuinely
  equal-area, so the world is a rounded lens shape, not a rectangle) and
  **Mercator** (rectangular, easier to hit the Arctic). Your styling must work
  for both silhouettes.
- Pan, wheel/pinch zoom, double-click zoom, keyboard arrows, reset
- 6,776 city labels that fade in progressively as you zoom, with collision
  avoidance
- US states and Canadian provinces appear above a zoom threshold
- Two pin types: the player's guess and the true answer (the answer carries a
  place-name label pill)

Design constraints: labels are HTML positioned over the SVG, so they never scale;
strokes are non-scaling. Controls currently sit bottom-right as a stack of four
28px buttons — zoom in, zoom out, reset, projection toggle.

### 5.4 The reveal panel

Replaces the card on lock-in. Contains, in order:

- **Distance headline** — `316 mi away`, or `Bullseye` under 15 miles
- **Points earned** `+472`
- **A meter bar** filling to the WHERE fraction, coloured by band
- **Two result rows**: WHERE (the true place + month + points) and WHO (tags for
  each person who was actually there, marked hit/miss, plus struck-through tags
  for anyone you named who was not)
- **"Plus 12 other people who are not playing"** when the party included
  non-players
- **The story** — a free-text anecdote, when the owner wrote one. Set this at
  display size in the display face; it is the emotional payoff of the whole turn
  and currently the most under-designed thing in the product.
- **Next stay →**

### 5.5 Progress pips

One per stay in the day. States: upcoming, current, and done — where done is
tinted by distance band and carries a secondary mark for the WHO result (exact /
partial / miss). Three tiny objects carrying two dimensions of information each.

### 5.6 Action bar

Fixed to the bottom. A hint line that changes with state ("Pick everyone who was
there, then drop a pin" → "Now drop a pin on the map" → "Ready — two people") and
the primary button. Hidden during reveal and summary.

### 5.7 Day summary

Score against max, a one-line grade that is dry rather than congratulatory
("Roughly the right planet."), a row per stay with place / distance / who /
points, share button, practice button, four stat tiles, and a live countdown.

### 5.8 Supporting

Help modal (rules, the score key, and the five "tells" — one line per person
describing what kind of place they always book). Stats modal with a sparkline of
recent days. Toasts/inline messages. The gate screen.

---

## 6. The anti-spoiler rules — read twice

These are the constraints most likely to be violated by a good designer doing
what normally makes a card better.

**MUST NOT appear anywhere on the playing card:**

- **The listing title.** Host-written titles routinely contain the town —
  "Cosy Cabin in Asheville" hands over the answer. Titles are stripped entirely.
- **The date.** The month is half the answer: February plus snow means the Arctic
  trip. Dates appear only in the reveal.
- **The place name**, obviously — including inside amenity text or a review
  quote, which is why there is a redaction pass that blanks any part of the
  answer appearing in displayed strings (it renders as `•••`). If your design
  introduces a new text surface on the card, it must go through that redaction.

**Also:** the `/admin` page MUST NOT show place names, photos, coordinates or
stories (§4.3). This one catches people out because dashboards normally want to
show you your data.

---

## 7. Hard technical requirements

- **No build step. No framework.** Vanilla ES5-compatible JS, plain CSS. The
  whole thing inlines into single HTML files by a Python script. React, Tailwind,
  Sass, PostCSS and npm are all out.
- **CSS custom properties for everything.** There is an existing token system
  (`--bg --panel --ink --muted --faint --line --accent --good --ok --meh --bad
  --sea --land --land-line --admin`). You may rename and restructure it; you MUST
  deliver a token system, not hard-coded values.
- **Both themes.** System-following by default, with explicit override winning
  in both directions. Every colour defined at `:root` first.
- **Mobile-first, and genuinely used on phones.** The card and the map both have
  to be reachable in one turn. The current build makes you scroll past a 583px
  card to reach the map on a 375px screen — **fixing that is in scope and is one
  of the clearest wins available to you.**
- **Accessible:** visible focus states, the map is keyboard-operable (arrows pan,
  +/− zoom, Enter drops a pin), `aria-pressed` on the toggles, `prefers-reduced-
  motion` honoured, real contrast in both themes.
- **Fonts** from Google Fonts or system stacks only.
- Photos are `<img>` from a CDN and can fail; every image needs a defined failure
  appearance.

---

## 8. What exists now, and what is wrong with it

The current design is a competent NYT-daily-games pastiche: warm cream paper,
Fraunces for display, Inter for UI, terracotta accent. It works. It is also
exactly the design anyone would produce from that reference, and it carries none
of the specific comedy of the actual content.

Specific weaknesses worth your attention:

1. **The story is wasted.** The best content in the product — the anecdote after
   the guess — is a small serif paragraph in a bordered box.
2. **The card doesn't know what to do with a bad photo**, and most photos are
   bad.
3. **Mobile makes the two answers feel like two screens.**
4. **The five-person picker looks like a form control**, not like accusing your
   friends of something.
5. **No identity.** No logo, no mark, no favicon beyond emoji, nothing that makes
   the emoji grid recognisably *this game* when it lands in a chat.

---

## 9. Art direction — ideas, not instructions

Yours to reject. Offered so you know what register we are in.

- The material world of the subject: **listing photos, map contours, pin drops,
  lockboxes, keypads, a printed itinerary, a guestbook, luggage tags, a
  polaroid's white border, a police-corkboard with red string**. The corkboard
  metaphor in particular fits the "who was there" half.
- Something that treats the photo as **evidence**: a border, a caption slug, an
  exhibit number, a slightly clinical frame that makes a beige sofa feel like it
  is being examined.
- The map is the one place that **MAY be beautiful and atmospheric** — it is
  already the most striking thing on screen.
- Avoid: travel-brochure gradients, passport stamps, paper-plane icons, dotted
  flight paths, globes-with-orbit-rings, and the entire visual language of
  booking sites.
- We already know we do not want: warm cream + serif + terracotta (that is what
  we have), or near-black with one acid-green pop.

**Take one real swing.** Five people will see this every morning for two years. A
safe design is worse than a strange one.

---

## 10. Deliverables

1. **Identity** — wordmark, standalone mark/logo usable at favicon size, and a
   favicon. The mark should still read at 16px in a browser tab.
2. **Design language** — documented token system (colour both themes, type scale,
   spacing scale, radii, elevation, motion), with rationale.
3. **Component designs** — every item in §5, in every state listed.
4. **Page designs** — the four pages in §4, at mobile (375px) and desktop
   (1280px) minimum, covering every state in §4.1.
5. **The share grid** — glyph vocabulary and how it reads in a message.
6. **Implementation notes** — enough that a developer can map your design onto
   the existing class names without guessing.

## 11. Acceptance criteria

- A card with **only a photo and "4 nights"** looks deliberate.
- A card with an **ugly photo** looks deliberate.
- On a 375px phone, a player can complete one turn — both answers — without
  feeling the two halves are separate screens.
- Both themes pass contrast, and neither looks like an afterthought.
- Nothing on the playing card or the admin page violates §6.
- The emoji grid is recognisable as this game in a group chat.
- Someone who has played 400 times is not bored by, or irritated by, any
  animation in it.

---

## Appendix — real data to design against

Do not use lorem. These are actual stays from the deck.

| Photo shows | Amenity lead | Facts | Answer |
|---|---|---|---|
| Dusk exterior, black timber, woodpile | ♨ Fast wifi — 73 Mbps | Tiny home · 3 guests · 2 beds · 1 bath | New Russia, New York |
| Beige living room, orange flowers | 📶 Wifi — 20 Mbps | 2 guests · 1br · 1 bed · 1 bath · ★4.96 (190) | Livingston Manor, New York |
| Aurora over a harbour town | *(none — thin card)* | 4 nights | Tromsø, Norway |
| Modern kitchen, mountain light | ♨ Private hot tub — available all year | Entire home · 2 guests · 1br | Whitehall, Montana |
| Big group house, many beds | ♨ Private hot tub — available all year, open 24 hours | Entire home · 15 guests · 5br · 16 beds · 3 bath | Stonington, Connecticut |
| Bunk bed, patterned bedspread | *(none — thin card)* | 2 nights | Queens, New York |

The five players: **Ben** (41 stays, the whole deck so far), **Benjamin** (17
appearances as a companion), **Andrew** (11), **Maddie** (2), **Anna** (3).

Ben's tell, written from his own data and the only one finished so far:
*"Adirondack and Catskill cabins, Hokkaido, and the Arctic in February."*
