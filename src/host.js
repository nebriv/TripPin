/* ===========================================================================
   host.js — what you play when the stay is one of yours.

   THE PROBLEM THIS SOLVES

   The deck is pooled, so sooner or later it deals you a place you slept in.
   You know where it is and you know who was there, which is a thousand free
   points and no game.

   How often: the real stays average 1.80 people per crew, so on a balanced
   five-player deck the chance a given card is one of yours is 1.80/5, about
   36 per cent. That is 1.08 host rounds in a three-round day, and a 74 per
   cent chance of at least one. (An earlier version of this comment said a
   quarter of rounds and three days in five. That was computed from bookers
   rather than crews and was too low — you host every trip you were ON, not
   just the ones you booked.)

   So this is not a patch on an edge case. It is a third of the game.

   THE SHAPE OF THE ANSWER

   Same card, same map, same thousand points — different question. Every
   format below asks something you cannot answer just by having been there:
   either about the rest of the group's relationship to the place, or about
   where it actually sits on the planet.

   WHAT THEY ARE ALLOWED TO USE

   Only fields that exist on every stay: lat, lng, place, when, crew, photo.
   Listing detail (rating, amenities, type, title) is out — only 17 of 41
   stays have a recoverable listing id, so anything built on it would fail
   more often than it fired. The cities list is already in the map bundle.
   Everything else here is arithmetic.

   TIES ARE REAL AND MUST BE HONOURED

   Twenty-five of the forty-one stays have more than one player on them, so
   two people routinely share the same nearest stay and tie to the exact mile.
   Picking one of them as "the" answer and marking the other wrong would be a
   bug that only ever bites the person who was right. Every superlative here
   returns *everyone* tied, and scoring accepts any of them — pinning against
   whichever one the player actually named.
   =========================================================================== */

(function () {
  'use strict';

  var MAX = 1000;                 // a host round is worth the same as a normal one
  var WHO_MAX = 200;              // when a format asks for a person as well
  var FALLOFF = 600;              // miles; matches the main game's curve
  var BULLSEYE = 50;              // matches CFG.BULLSEYE in game.js
  var NEAR_RADIUS = 500;          // miles, for "who else has been near here"
  var PENGUIN_LAT = -60;          // close enough to the Antarctic convergence
  var TIE_MILES = 1;              // inside this, two people are simply level

  // The same formula map.js uses. Repeated rather than imported so this file
  // stays a pure module that can be exercised outside a browser.
  function hav(lat1, lng1, lat2, lng2) {
    var R = 3958.7613;
    var p = Math.PI / 180;
    var dLat = (lat2 - lat1) * p;
    var dLng = (lng2 - lng1) * p;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function pinPoints(m, max) {
    if (m <= BULLSEYE) return max;
    return Math.round(max * Math.exp(-m / FALLOFF));
  }

  function miles(n) { return Math.round(n).toLocaleString('en-US'); }

  // Round a distance to something a person would say out loud. The step scales
  // because the coast is tens of miles away and a penguin is thousands: a flat
  // hundred-mile step collapses 63, 74 and 89 onto the same option and leaves
  // the pick with two answers instead of four.
  function roundMiles(m) {
    var step = m < 200 ? 10 : (m < 600 ? 25 : 50);
    return Math.round(m / step) * step;
  }

  // Mean direction on the sphere. Averaging degrees would put the centre of
  // a pair of stays either side of the antimeridian in the wrong ocean.
  function centroid(points) {
    var x = 0, y = 0, z = 0, p = Math.PI / 180;
    points.forEach(function (s) {
      var la = s.lat * p, ln = s.lng * p;
      x += Math.cos(la) * Math.cos(ln);
      y += Math.cos(la) * Math.sin(ln);
      z += Math.sin(la);
    });
    var n = points.length || 1;
    x /= n; y /= n; z /= n;
    return {
      lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / p,
      lng: Math.atan2(y, x) / p,
    };
  }

  // Coarse enough that naming it is a judgement rather than a lookup, and
  // every antipode of an inhabited place lands in one of them.
  // Each carries a rough centre so a wrong answer can be graded on how wrong.
  // Without that, naming the South Atlantic when the answer is the South
  // Pacific paid exactly as badly as naming Europe, and the format's blind
  // floor fell through the floor.
  var REGIONS = [
    { name: 'the South Pacific', lat: -25, lng: -140 },
    { name: 'the Indian Ocean', lat: -20, lng: 80 },
    { name: 'the South Atlantic', lat: -25, lng: -15 },
    { name: 'the North Pacific', lat: 30, lng: -170 },
    { name: 'the North Atlantic', lat: 35, lng: -40 },
    { name: 'the Southern Ocean', lat: -68, lng: 0 },
    { name: 'Asia', lat: 40, lng: 95 },
    { name: 'Africa', lat: 2, lng: 20 },
    { name: 'South America', lat: -15, lng: -60 },
    { name: 'Australasia', lat: -27, lng: 135 },
    { name: 'Europe', lat: 50, lng: 12 },
    { name: 'North America', lat: 45, lng: -100 },
  ];
  var REGION_BY = {};
  REGIONS.forEach(function (r) { REGION_BY[r.name] = r; });

  function regionOf(pt) {
    var la = pt.lat, ln = pt.lng;
    if (la < -60) return 'the Southern Ocean';
    // Land first, since a hit there is unambiguous.
    if (la > 10 && la < 72 && ln > -12 && ln < 45) return 'Europe';
    if (la > -35 && la < 37 && ln > -18 && ln < 52) return 'Africa';
    if (la > 5 && la < 75 && ln > 45 && ln < 150) return 'Asia';
    if (la > -45 && la < -9 && ln > 112 && ln < 180) return 'Australasia';
    if (la > -56 && la < 13 && ln > -82 && ln < -34) return 'South America';
    if (la > 13 && la < 72 && ln > -168 && ln < -52) return 'North America';
    // Otherwise water, by hemisphere and basin.
    var pacific = ln > 120 || ln < -70;
    var atlantic = ln >= -70 && ln < 20;
    if (la < 0) {
      if (pacific) return 'the South Pacific';
      if (atlantic) return 'the South Atlantic';
      return 'the Indian Ocean';
    }
    if (pacific) return 'the North Pacific';
    if (atlantic) return 'the North Atlantic';
    return 'the Indian Ocean';
  }

  function antipode(stay) {
    return {
      lat: -stay.lat,
      lng: stay.lng > 0 ? stay.lng - 180 : stay.lng + 180,
    };
  }

  // Where wild penguins actually live. Twelve is enough that the nearest one
  // genuinely varies with where you are, which is the point of asking.
  var COLONIES = [
    { name: 'the Galápagos', lat: -0.4, lng: -90.7 },
    { name: 'Punta San Juan, Peru', lat: -15.4, lng: -75.2 },
    { name: 'Boulders Beach, South Africa', lat: -34.2, lng: 18.45 },
    { name: 'Phillip Island, Australia', lat: -38.5, lng: 145.2 },
    { name: 'Punta Tombo, Argentina', lat: -44.0, lng: -65.2 },
    { name: 'Oamaru, New Zealand', lat: -45.1, lng: 170.97 },
    { name: 'the Snares Islands', lat: -48.0, lng: 166.6 },
    { name: 'the Falklands', lat: -51.7, lng: -59.2 },
    { name: 'Isla Magdalena, Chile', lat: -52.9, lng: -70.6 },
    { name: 'South Georgia', lat: -54.4, lng: -36.5 },
    { name: 'Macquarie Island', lat: -54.6, lng: 158.9 },
    { name: 'Cape Washington, Antarctica', lat: -74.6, lng: 165.4 },
  ];

  function partyOf(stay) {
    return (stay.crew && stay.crew.length) ? stay.crew : [stay.booker];
  }

  // Everyone except me, each with the stays they were on — minus this one,
  // which is the card we are all looking at.
  // Which stays a format is allowed to point at.
  //
  // "Whose is nearest" and "the stranger" answer with somebody else's stay —
  // named, and pinned on the map. If that stay has not been dealt yet, the
  // host round has just spoiled a future card for one player: three weeks
  // later it comes round as a normal round and they pin it to the mile. Two
  // formats leaking, at 36% host rate, burns a noticeable slice of a
  // forty-card deck over a month.
  //
  // The deal ledger already knows exactly which stays the group has played, so
  // targets are drawn from those. Nothing can be spoiled that everybody has
  // already seen — and the answer becomes a callback to a card people
  // remember, which is a better question than the one it replaces.
  function eligible(ctx, stay) {
    var seen = ctx.seen;
    var all = ctx.stays.filter(function (s) {
      return s.id !== stay.id &&
             typeof s.lat === 'number' && typeof s.lng === 'number';
    });
    if (!seen || !seen.length) return all;
    var played = {};
    seen.forEach(function (id) { played[id] = 1; });
    var safe = all.filter(function (s) { return played[s.id]; });
    // Early on almost nothing has been played. Rather than refuse to run, fall
    // back to the whole deck: a thin deck has little to spoil anyway.
    return safe.length >= 4 ? safe : all;
  }

  function rivals(ctx, stay, pool) {
    var me = ctx.me;
    var by = {};
    ctx.crew.forEach(function (p) { if (p.id !== me) by[p.id] = []; });
    (pool || ctx.stays).forEach(function (s) {
      if (s.id === stay.id) return;
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      partyOf(s).forEach(function (id) { if (by[id]) by[id].push(s); });
    });
    return Object.keys(by)
      .filter(function (id) { return by[id].length > 0; })
      .map(function (id) { return { id: id, stays: by[id] }; });
  }

  // Each rival's closest approach to this place.
  function approaches(ctx, stay, pool) {
    return rivals(ctx, stay, pool).map(function (r) {
      var best = null;
      r.stays.forEach(function (s) {
        var d = hav(stay.lat, stay.lng, s.lat, s.lng);
        if (!best || d < best.dist) best = { dist: d, stay: s };
      });
      return { id: r.id, dist: best.dist, at: best.stay, stays: r.stays };
    });
  }

  // Everyone at the extreme, not just the first one the sort happened to put
  // there. `pick` reads a distance off each row; `want` is 'min' or 'max'.
  function extremes(rows, want, pick) {
    var vals = rows.map(pick);
    var edge = want === 'max' ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
    return rows.filter(function (r, i) { return Math.abs(vals[i] - edge) <= TIE_MILES; });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function oneOf(list, rnd) { return list[Math.floor(rnd() * list.length)] || list[0]; }

  // Turn tied winners into the shape the UI and the scorer both want.
  // `rows` is everyone in the running, so the scorer can pay a near miss.
  function fromTied(tied, nameOf, rows, want) {
    var targetFor = {};
    tied.forEach(function (t) {
      targetFor[t.id] = { lat: t.at.lat, lng: t.at.lng, name: nameOf(t) };
    });
    // Rank every candidate by the same measure the answer was picked on, so
    // naming the second-nearest person is worth more than naming the fourth.
    // Ties share a rank. Without this the person half was all-or-nothing,
    // which tripled the spread at the blind end against a normal round.
    var rank = {};
    if (rows && rows.length) {
      var sorted = rows.slice().sort(function (a, b) {
        return want === 'max' ? b.dist - a.dist : a.dist - b.dist;
      });
      var r = 0;
      sorted.forEach(function (row, i) {
        if (i > 0 && Math.abs(row.dist - sorted[i - 1].dist) > TIE_MILES) r = i;
        rank[row.id] = r;
      });
    }
    return {
      answers: tied.map(function (t) { return t.id; }),
      answer: tied[0].id,
      target: targetFor[tied[0].id],
      targetName: nameOf(tied[0]),
      targetFor: targetFor,
      rank: rank,
      tied: tied.length > 1,
    };
  }

  /* ------------------------------------------------------------ formats --

     `kind` tells the UI which control to show:

       personpin  pick one of the others, then drop a pin   (200 + 800)
       peoplepin  tick who qualifies, then drop a pin       (200 + 800)
       choicepin  pick one of four, then drop a pin         (200 + 800)
       pin        drop a pin                                (1000)

     THE SHAPE RULE, AND WHY EVERY FORMAT NOW OBEYS IT

     A round is a small discrete judgement plus a large continuous one. That
     is not decoration — it is what makes the numbers comparable.

     Three formats used to be a single discrete pick worth the whole thousand,
     and simulation showed what that costs. Against a normal round's standard
     deviation of 154 points for a typical player, they scored 433, 467 and
     468 — three times the spread. A four-way pick has no middle: you are
     either right for a thousand or wrong for a hundred, so the round stops
     measuring what you know and starts measuring which way the coin fell.
     `level` was the instructive one. Its mean sat at 455, close enough to the
     baseline to look healthy, and it was a coin flip the whole time. Means
     alone will not catch this; spread will.

     Adding the 800-point pin back fixes the mean, the floor and the spread
     together, because the pin is a smooth curve over the whole planet and it
     dominates the variance. One rule, applied three times.

     `prompts` is a pool rather than a line, because a format comes round often
     enough that one fixed wording starts to read like a stuck record. They all
     ask exactly the same thing; only the voice changes. `how` is the text
     behind the ⓘ, for when the joke is obscuring the rules.
  */

  var FORMATS = [
    {
      id: 'nearest',
      kind: 'personpin',
      label: 'Whose is nearest?',
      how: 'Of the others, one has stayed closer to this place than the rest. ' +
           'Name them, then pin that stay. The person is worth 200, the pin 800. ' +
           'If two of them tie, either answer is right.',
      prompts: [
        'You know this one. So: which of the others has stayed closest to it — and where?',
        'Who nearly bumped into you here? Pick them, then pin where they were.',
        'Somebody else got close to this place. Which of them, and how close?',
        'Of the four, who has the nearest alibi? Pin it.',
        'This one is yours. Whose stay is the neighbour? Point at it.',
        'Name the closest neighbour you never knew you had, then pin their bed.',
      ],
      available: function (ctx, stay) {
        return approaches(ctx, stay, eligible(ctx, stay)).length >= 2;
      },
      build: function (ctx, stay, rnd) {
        // Only stays the group has already played, so the answer cannot
        // spoil a card that has yet to be dealt.
        var all = approaches(ctx, stay, eligible(ctx, stay));
        var tied = extremes(all, 'min', function (r) { return r.dist; });
        var spec = fromTied(tied, function (t) { return t.at.place; }, all, 'min');
        spec.people = all.map(function (r) { return r.id; });
        spec.note = 'Closest approach: ' + miles(tied[0].dist) + ' miles' +
                    (spec.tied ? ' — and two of them tie for it.' : '.');
        return spec;
      },
    },

    {
      id: 'stranger',
      kind: 'personpin',
      label: 'The stranger',
      how: 'The opposite of the last one. One of the others has never got near ' +
           'this place — their closest stay is further away than anybody ' +
           'else’s. Name them and pin that closest miss.',
      prompts: [
        'Who has never come close to this place? Pick them, then pin the nearest they ever got.',
        'One of them has been nowhere near here. Who, and what is the closest they managed?',
        'Which of them would need the longest taxi? Pin where it would have to start.',
        'Name the one who has most thoroughly avoided this corner of the world.',
        'Who is the furthest stranger to this place? Show me their nearest miss.',
        'Somebody here has no business being nearby. Which of them, and where were they instead?',
      ],
      available: function (ctx, stay) {
        return approaches(ctx, stay, eligible(ctx, stay)).length >= 2;
      },
      build: function (ctx, stay, rnd) {
        // Only stays the group has already played, so the answer cannot
        // spoil a card that has yet to be dealt.
        var all = approaches(ctx, stay, eligible(ctx, stay));
        var tied = extremes(all, 'max', function (r) { return r.dist; });
        var spec = fromTied(tied, function (t) { return t.at.place; }, all, 'max');
        spec.people = all.map(function (r) { return r.id; });
        spec.note = 'Their closest was still ' + miles(tied[0].dist) + ' miles away' +
                    (spec.tied ? ', and they tie for it.' : '.');
        return spec;
      },
    },

    {
      id: 'orbit',
      kind: 'personpin',
      label: 'Whose orbit is this in?',
      how: 'Not one stay — all of them. Average everything one person has ' +
           'booked into a single point on the globe. Whose point lands nearest ' +
           'this place? Name them, then pin that average.',
      prompts: [
        'Forget single stays — whose travelling, as a whole, centres nearest here? Pin that centre.',
        'Whose general orbit does this place fall inside? Pin the middle of it.',
        'Squash one of them into a single dot on the map. Whose dot is closest? Pin it.',
        'Whose centre of gravity is this? Pick them and pin it.',
        'On average, one of them practically lives round here. Who, and where is that average?',
        'Average out each of their travels. Whose average is the neighbour? Point at it.',
      ],
      available: function (ctx, stay) {
        return rivals(ctx, stay).filter(function (r) { return r.stays.length >= 2; }).length >= 2;
      },
      build: function (ctx, stay, rnd) {
        var rs = rivals(ctx, stay).filter(function (r) { return r.stays.length >= 2; });
        var rows = rs.map(function (r) {
          var c = centroid(r.stays);
          return { id: r.id, dist: hav(stay.lat, stay.lng, c.lat, c.lng), at: c };
        });
        var tied = extremes(rows, 'min', function (r) { return r.dist; });
        var spec = fromTied(tied, function () { return 'their centre of gravity'; }, rows, 'min');
        spec.people = rs.map(function (r) { return r.id; });
        spec.note = 'Their whole map averages out ' + miles(tied[0].dist) + ' miles from here.';
        return spec;
      },
    },

    {
      id: 'near',
      kind: 'peoplepin',
      label: 'Who else has been near here?',
      how: 'Tick every one of the others who has ever stayed within ' +
           NEAR_RADIUS + ' miles of this spot — it can easily be nobody, and ' +
           'an empty answer is a real move. That half is worth 200. Then pin ' +
           'the closest any of them ever got, which is worth 800 whether or ' +
           'not anybody made the radius.',
      prompts: [
        'Who has stayed within ' + NEAR_RADIUS +
          ' miles of here? Tick them — or nobody — then pin the closest anyone got.',
        'Who else has been in this neighbourhood? ' + NEAR_RADIUS +
          ' miles counts. Then pin the nearest of them.',
        'Tick anyone who slept within ' + NEAR_RADIUS +
          ' miles of this spot, possibly nobody, and pin whoever came closest.',
        'Small world check: who has been within ' + NEAR_RADIUS +
          ' miles? And how close did the closest get?',
        'Who was near enough to drive over for dinner? Call it ' + NEAR_RADIUS +
          ' miles — then pin the nearest one.',
        'Everyone within ' + NEAR_RADIUS +
          ' miles, or nobody. Either way, pin the closest anyone managed.',
      ],
      // Needs a wide field. Scoring counts correct in/out decisions above
      // chance, and with only two candidates chance is one of two — a coin
      // toss that pays 250 on average. Three is the minimum where knowing
      // something beats guessing by enough to be worth a thousand points.
      available: function (ctx, stay) { return approaches(ctx, stay).length >= 3; },
      build: function (ctx, stay, rnd) {
        var all = approaches(ctx, stay);
        var hit = all.filter(function (r) { return r.dist <= NEAR_RADIUS; });
        // There is always a closest, even when nobody cleared the radius, so
        // the pin half always has an answer to score against.
        var closest = all.slice().sort(function (a, b) { return a.dist - b.dist; })[0];
        return {
          people: all.map(function (r) { return r.id; }),
          answer: hit.map(function (r) { return r.id; }),
          answers: hit.map(function (r) { return r.id; }),
          allowEmpty: true,
          target: { lat: closest.at.lat, lng: closest.at.lng },
          targetName: closest.at.place,
          note: (hit.length
            ? hit.length + ' of them have been in the neighbourhood. '
            : 'Nobody else has been anywhere near. ') +
            'The closest anyone got was ' + miles(closest.dist) + ' miles.',
        };
      },
    },

    {
      id: 'antipode',
      kind: 'choicepin',
      label: 'Straight through',
      how: 'The antipode: the point on the far side of the planet, directly ' +
           'opposite this one. Mirror the latitude and go half a world round ' +
           'in longitude. Say which ocean or landmass you surface in, then pin ' +
           'the spot. 200 for the first, 800 for the second.',
      prompts: [
        'Dig straight through the middle of the Earth. What do you surface in, and where exactly?',
        'Drop a very determined shovel here. Which ocean does it come up in? Pin the spot.',
        'What is directly beneath this place, out the other side? Name it, then pin it.',
        'If you fell through the world from here, where would you land? Probably wet. Pin it.',
        'The exact opposite of this place — not thematically, geometrically. Name it and pin it.',
        'Straight through the core and out the far side. Which ocean, and whereabouts?',
      ],
      available: function () { return true; },
      build: function (ctx, stay, rnd) {
        // A pin with no judgement half had no mark to show in the share grid
        // and a blind floor of 21 against a normal round's 93 — the harshest
        // thing in the game, landing on whoever knew least. Naming the region
        // first gives it the same shape as everything else.
        var a = antipode(stay);
        var right = regionOf(a);
        var decoys = shuffled(REGIONS.filter(function (r) { return r.name !== right; }), rnd)
          .slice(0, 3);
        // Options are listed in a natural order — south to north — never
        // shuffled, so a near miss is visibly near the answer.
        return {
          options: [REGION_BY[right]].concat(decoys).sort(function (a, b) { return a.lat - b.lat; })
            .map(function (r) {
              return { key: r.name, label: r.name, lat: r.lat, lng: r.lng };
            }),
          answer: right,
          graded: 'region',
          refPt: a,
          target: a,
          targetName: 'the far side',
          note: 'Almost always open water — most of the planet is.',
        };
      },
    },

    {
      id: 'level',
      kind: 'choicepin',
      label: 'Level with',
      how: 'One of the four sits at nearly the same latitude as this place — ' +
           'the same distance from the equator, however far east or west it ' +
           'is. The other three are well off it.',
      prompts: [
        'Which of these sits at almost the same latitude as this place — and where is it?',
        'Same distance from the equator as this. Which one, and pin it.',
        'Draw a line round the world from here. Which of these does it hit? Pin it.',
        'Which of these is level with this place? Then put it on the map.',
        'Same parallel, different continent. Which one, and whereabouts?',
        'Head due east from here and keep going. Whose latitude are you sharing? Pin them.',
      ],
      available: function (ctx) { return (ctx.cities || []).length > 20; },
      build: function (ctx, stay, rnd) {
        var pool = ctx.cities.filter(function (c) { return c.rank <= 1; });
        if (pool.length < 20) pool = ctx.cities;
        var ranked = pool.slice().sort(function (a, b) {
          return Math.abs(a.lat - stay.lat) - Math.abs(b.lat - stay.lat);
        });
        var right = ranked[0];
        var decoys = shuffled(ranked.filter(function (c) {
          return Math.abs(c.lat - stay.lat) > 12 && c.name !== right.name;
        }), rnd).slice(0, 3);
        return {
          // South to north, never shuffled: the neighbour of the answer is
          // its neighbour on the list.
          options: [right].concat(decoys).sort(function (a, b) { return a.lat - b.lat; })
            .map(function (c) {
              return { key: c.name, label: c.name, lat: c.lat, lng: c.lng };
            }),
          answer: right.name,
          // Naming the city is the easy half; putting it on the globe is the
          // half that separates people.
          target: { lat: right.lat, lng: right.lng },
          targetName: right.name,
          // Graded by latitude rather than marked right or wrong. Four options
          // scored all-or-nothing cannot produce a spread: a good player who
          // takes the second-best city drops to zero, so the format's ceiling
          // sat well below what a good pin earns on a normal round.
          graded: 'lat',
          refLat: stay.lat,
          bestErr: Math.abs(right.lat - stay.lat),
          note: right.name + ' is within ' +
                Math.abs(right.lat - stay.lat).toFixed(1) + '° of it.',
        };
      },
    },

    {
      id: 'penguin',
      kind: 'choicepin',
      label: 'The penguin test',
      how: 'Two halves. The distance is measured due south to 60°S, where the ' +
           'wild colonies begin — a degree of latitude is 69 miles wherever ' +
           'you are, so that part is subtraction, and near misses still score. ' +
           'Then pin the nearest actual colony, which is a different question ' +
           'and the one worth more.',
      prompts: [
        'Roughly how far were you from the nearest penguin — and where is it?',
        'Penguin distance. How far south, and pin the colony.',
        'How many miles between this bed and the nearest wild penguin? Then find it.',
        'If a penguin set off towards you on foot, how long is its walk? Where did it start?',
        'How far from penguin territory were you sleeping? Pin the territory.',
        'Nearest penguin: pick the distance, then pin the bird.',
      ],
      available: function () { return true; },
      build: function (ctx, stay, rnd) {
        var m = (stay.lat - PENGUIN_LAT) * 69.0932;
        var real = Math.round(m / 100) * 100;
        // Spread the wrong answers further apart. A decoy at 0.78x was close
        // enough that the partial credit for missing it paid nearly as well as
        // getting it right, which is most of why a blind tap scored 215.
        var spread = shuffled([0.45, 0.68, 1.55], rnd).map(function (f) {
          return Math.round((m * f) / 100) * 100;
        });
        var seen = {};
        var opts = [real].concat(spread).filter(function (v) {
          if (seen[v] || v <= 0) return false;
          seen[v] = 1;
          return true;
        });
        // Pinning "due south to 60°S" would be free — you already know your own
        // longitude. The nearest real colony is a genuine question, and a more
        // charming one.
        var colony = COLONIES.slice().sort(function (a, b) {
          return hav(stay.lat, stay.lng, a.lat, a.lng) -
                 hav(stay.lat, stay.lng, b.lat, b.lng);
        })[0];
        return {
          // Ascending, never shuffled.
          options: opts.slice().sort(function (a, b) { return a - b; }).map(function (v) {
            return { key: String(v), label: v.toLocaleString('en-US') + ' miles', miles: v };
          }),
          answer: String(real),
          graded: 'ratio',
          target: { lat: colony.lat, lng: colony.lng },
          targetName: colony.name,
          note: 'Due south to 60°S is where the wild ones start. The nearest ' +
                'actual colony is ' + colony.name + ', ' +
                miles(hav(stay.lat, stay.lng, colony.lat, colony.lng)) + ' miles away.',
        };
      },
    },

    {
      id: 'coast',
      kind: 'choicepin',
      label: 'The nearest sea',
      how: 'Two halves. Pick how far the sea was, where a near miss still ' +
           'scores, then pin the coastline itself — which is a different ' +
           'question, and the one worth more.',
      prompts: [
        'How hemmed in were you? Say how far, then pin the nearest saltwater.',
        'How landlocked was this? Pick the distance, then pin the sea.',
        'Closest you could have got your feet wet in salt water: how far, and where?',
        'Nearest coastline. How far, then pin it.',
        'If you had fancied a swim in the sea, how long was the drive — and where to?',
        'How far from saltwater did you sleep? Then pin the nearest bit of it.',
      ],
      // Needs a precomputed nearest-coast point. The shipped map data is
      // country polygons, whose outlines are land borders as much as
      // coastline, so this cannot be derived in the browser — tools/ works it
      // out per stay against a real coastline layer and bakes in two numbers.
      // Only worth asking inland. On a coastal stay the nearest sea is
      // essentially the card's own pin, which is a free thousand and a wasted
      // round — difficulty that swings on which card you drew is exactly what
      // a shared daily cannot have.
      available: function (ctx, stay) {
        if (!stay.coast || typeof stay.coast.lat !== 'number') return false;
        return hav(stay.lat, stay.lng, stay.coast.lat, stay.coast.lng) > 60;
      },
      build: function (ctx, stay, rnd) {
        var m = hav(stay.lat, stay.lng, stay.coast.lat, stay.coast.lng);
        var real = roundMiles(m);
        // Same spread as the penguin distance, and for the same reason: decoys
        // any closer than this are paid nearly as well by the ratio grading as
        // the right answer is, which turns the judgement into a free 200.
        var spread = shuffled([0.45, 0.68, 1.55], rnd).map(function (f) {
          return roundMiles(m * f);
        });
        var seen = {};
        var opts = [real].concat(spread).filter(function (v) {
          if (seen[v] || v <= 0) return false;
          seen[v] = 1;
          return true;
        });
        return {
          // Ascending, never shuffled — the same rule as every other
          // four-way pick, so the position of an option carries no signal.
          options: opts.slice().sort(function (a, b) { return a - b; }).map(function (v) {
            return { key: String(v), label: v.toLocaleString('en-US') + ' miles', miles: v };
          }),
          answer: String(real),
          graded: 'ratio',
          target: { lat: stay.coast.lat, lng: stay.coast.lng },
          targetName: 'the nearest coast',
          note: miles(m) + ' miles to the sea.',
        };
      },
    },
  ];

  var BY_ID = {};
  FORMATS.forEach(function (f) { BY_ID[f.id] = f; });

  /* ---------------------------------------------------------- selection -- */

  // Deterministic: the same player on the same day gets the same question, so
  // reloading cannot reroll a format you did not like.
  function challenge(stay, ctx) {
    if (!stay || !ctx || !ctx.me) return null;
    if (partyOf(stay).indexOf(ctx.me) === -1) return null;   // not yours: play it straight

    // Seeded on the CARD and the slot, deliberately not on the player.
    //
    // It used to include the player, which meant two friends who were on the
    // same trip got different questions about it — up to a 180-point gap,
    // fixed in advance by a hash, and impossible to argue with. It also made
    // the shared grid dishonest: the same row on the same day could stand for
    // two different questions.
    //
    // Now everyone hosting a card gets the same question. The answers still
    // differ, because the candidates are everybody except you.
    var seed = (ctx.dayIndex | 0) * 7919 + (ctx.round | 0) * 104729 + hashStr(stay.id);
    var rnd = mulberry32(seed);

    // Formats already used today go to the back. With only a handful playable
    // on a thin pool, a blind shuffle happily deals the same question twice in
    // one sitting, which reads as a bug even when it is chance.
    var used = ctx.used || [];
    var order = shuffled(FORMATS, rnd).sort(function (a, b) {
      return (used.indexOf(a.id) === -1 ? 0 : 1) - (used.indexOf(b.id) === -1 ? 0 : 1);
    });

    for (var i = 0; i < order.length; i++) {
      var f = order[i];
      if (!f.available(ctx, stay)) continue;
      var spec = f.build(ctx, stay, rnd);
      spec.fmt = f.id;
      spec.kind = f.kind;
      spec.label = f.label;
      spec.how = f.how;
      spec.prompt = oneOf(f.prompts, rnd);
      return spec;
    }
    return null;                        // nothing playable: caller substitutes
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) {
      h = (h * 31 + String(s).charCodeAt(i)) | 0;
    }
    return h;
  }

  /* ------------------------------------------------------------ scoring -- */

  // How much of a wrong pick is still worth something, 0..1.
  function gradeChoice(spec, picked) {
    // Bands widened from 8 to 18 degrees and from a log factor of 4 to 2.
    // The old curves paid almost nothing for a near miss, which dropped the
    // blind floor on these two to 26 and 41 against a normal round's 93 — the
    // game was at its meanest on exactly the questions a newcomer could not
    // reason about.
    if (spec.graded === 'lat' && typeof picked.lat === 'number') {
      var over = Math.abs(picked.lat - spec.refLat) - (spec.bestErr || 0);
      return Math.max(0, Math.exp(-over / 18));
    }
    if (spec.graded === 'ratio' && picked.miles) {
      var ratio = picked.miles / Number(spec.answer);
      if (ratio > 0) return Math.max(0, Math.exp(-Math.abs(Math.log(ratio)) * 2));
    }
    // Naming a neighbouring ocean is nearly right; naming the wrong hemisphere
    // is not. Graded on how far the named region sits from the real answer.
    if (spec.graded === 'region' && typeof picked.lat === 'number' && spec.refPt) {
      var d = hav(picked.lat, picked.lng, spec.refPt.lat, spec.refPt.lng);
      return Math.max(0, Math.exp(-d / 4500));
    }
    return 0;
  }

  function accepted(spec) {
    return spec.answers && spec.answers.length ? spec.answers : [spec.answer];
  }

  // guess: { person?, people?, at?: {lat,lng}, key? }
  function score(spec, guess) {
    guess = guess || {};
    var out = { pts: 0, whoPts: 0, pinPts: 0, correct: false, dist: null };

    if (spec.kind === 'personpin') {
      var ok = accepted(spec).indexOf(guess.person) !== -1;
      out.correct = ok;
      // Right is 200. Second-best is 90, third 40, fourth 18 — a near miss
      // on the person is paid the way a near miss on the pin is.
      var rk = spec.rank && guess.person != null ? spec.rank[guess.person] : null;
      out.whoPts = ok ? WHO_MAX
        : (typeof rk === 'number' && rk > 0 ? Math.round(WHO_MAX * Math.pow(0.45, rk)) : 0);
      // Pin against the stay belonging to whoever they actually named, so a
      // player who picks the other half of a tie is not then marked down for
      // pinning the right place.
      var tgt = (ok && spec.targetFor && spec.targetFor[guess.person]) || spec.target;
      if (guess.at && tgt) {
        out.dist = hav(guess.at.lat, guess.at.lng, tgt.lat, tgt.lng);
        out.pinPts = pinPoints(out.dist, MAX - WHO_MAX);
      }
      out.pts = out.whoPts + out.pinPts;
      return out;
    }

    if (spec.kind === 'pin') {
      if (guess.at) {
        out.dist = hav(guess.at.lat, guess.at.lng, spec.target.lat, spec.target.lng);
        out.pinPts = pinPoints(out.dist, MAX);
      }
      out.correct = out.dist != null && out.dist <= BULLSEYE;
      out.pts = out.pinPts;
      return out;
    }

    // Both new shapes: a 200-point judgement plus the same 800-point pin every
    // other format uses. The pin is what keeps the spread honest.
    if (spec.kind === 'peoplepin' || spec.kind === 'choicepin') {
      if (spec.kind === 'choicepin') {
        if (guess.key === spec.answer) {
          out.correct = true;
          out.whoPts = WHO_MAX;
        } else {
          var hit = (spec.options || []).filter(function (o) { return o.key === guess.key; })[0];
          out.whoPts = hit ? Math.round(WHO_MAX * gradeChoice(spec, hit)) : 0;
        }
      } else {
        var want2 = (spec.answer || []).slice().sort();
        var got2 = (guess.people || []).slice().sort();
        if (!want2.length && !got2.length) {
          out.correct = true;
          out.whoPts = WHO_MAX;
        } else {
          var uni = {};
          want2.concat(got2).forEach(function (id) { uni[id] = 1; });
          var hits2 = got2.filter(function (id) { return want2.indexOf(id) !== -1; }).length;
          out.correct = hits2 === want2.length && got2.length === want2.length;
          out.whoPts = Math.round(WHO_MAX * (hits2 / Object.keys(uni).length));
        }
      }
      if (guess.at && spec.target) {
        out.dist = hav(guess.at.lat, guess.at.lng, spec.target.lat, spec.target.lng);
        out.pinPts = pinPoints(out.dist, MAX - WHO_MAX);
      }
      out.pts = out.whoPts + out.pinPts;
      return out;
    }

    if (spec.kind === 'people') {
      // Scored on how many of the candidates you classified correctly, in or
      // out — not on overlap with the yes-list.
      //
      // Overlap was badly broken. With four candidates of whom two are
      // typically correct, any answer at all overlaps, and a random tick
      // scored 537 of 1000 against 95 for a normal round. Counting decisions
      // instead puts coin-flipping at the bottom where it belongs: half of
      // four is chance, and only what you get above chance is worth anything.
      var cands = (spec.people || []).slice();
      var want = spec.answer || [];
      var got = guess.people || [];
      if (!cands.length) { out.correct = true; out.pts = MAX; return out; }
      var right = cands.filter(function (id) {
        return (want.indexOf(id) !== -1) === (got.indexOf(id) !== -1);
      }).length;
      // Squared, because clamping a symmetric distribution at zero is not
      // enough on its own. With four candidates a coin flip lands on three
      // correct often enough to pay 188 a round for no knowledge at all;
      // squaring the fraction drops that to about 125 while leaving a clean
      // sweep worth the full thousand and keeping partial credit real.
      var chance = cands.length / 2;
      var frac = Math.max(0, (right - chance) / (cands.length - chance));
      out.correct = right === cands.length;
      out.pts = Math.round(MAX * frac * frac);
      return out;
    }

    if (spec.kind === 'choice') {
      out.correct = guess.key === spec.answer;
      if (out.correct) { out.pts = MAX; return out; }
      var picked = (spec.options || []).filter(function (o) { return o.key === guess.key; })[0];
      if (!picked || !spec.graded) { out.pts = 0; return out; }

      // Near misses pay, so that picking the second-best of four is not the
      // same as picking the worst. Without this the format is a coin toss
      // with no middle, and its ceiling sits below a normal round's.
      if (spec.graded === 'lat' && typeof picked.lat === 'number') {
        var over = Math.abs(picked.lat - spec.refLat) - (spec.bestErr || 0);
        out.pts = Math.max(0, Math.round(MAX * Math.exp(-over / 8)));
      } else if (spec.graded === 'ratio' && picked.miles) {
        var ratio = picked.miles / Number(spec.answer);
        if (ratio > 0) {
          out.pts = Math.max(0, Math.round(MAX * Math.exp(-Math.abs(Math.log(ratio)) * 4)));
        }
      }
      return out;
    }

    return out;
  }

  var API = {
    challenge: challenge,
    score: score,
    accepted: accepted,
    FORMATS: FORMATS,
    byId: BY_ID,
    MAX: MAX,
    NEAR_RADIUS: NEAR_RADIUS,
    _internals: {
      hav: hav, centroid: centroid, antipode: antipode, extremes: extremes,
      approaches: approaches, rivals: rivals, partyOf: partyOf,
      regionOf: regionOf, REGIONS: REGIONS,
    },
  };

  // Runs in two places on purpose. The Worker scores with it, because scoring
  // on the client means shipping the client the answers. The browser still
  // imports it in the offline build, where there is no server to ask and the
  // deck is baked into the page anyway.
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.Host = API;
})();
