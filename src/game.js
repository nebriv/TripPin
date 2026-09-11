/* ===========================================================================
   game.js — TripPin

   Three stays a day. For each one: tick who was there, then drop a pin where
   it was. Everyone gets the same three, everywhere, until local midnight.

   Scoring, per stay (done in the Worker; repeated here for the offline file)
     WHERE   0-800, decaying with distance   800 * e^(-miles/600)
     WHO     0-200, Jaccard overlap of the party you named with the real one
   So a stay is worth 1000 and a day is worth 3000.

   WHAT THE WORKER SENDS (the contract this file is written against)

     GET  /api/crew                 roster: id, name, color, tell, claimed,
                                    stays, animal
     GET  /api/round?day&round&owner
                                    { card, ask, done, rounds }  — card has no
                                    place, no coordinates, no crew, no story
     POST /api/guess {owner, day, round, at, who, key, near}
                                    { result } — result carries truth, line,
                                    played, total
     POST /api/story {owner, id, story}   one line on one of your own stays
     POST /api/call  {owner, day, id, call}   'wont' | 'will'
     POST /api/react {owner, day, target}     one tap on a friend's worst pin
     GET  /api/day?day&owner        the day with the spoilers in, once you have
                                    played it
     GET  /api/history?owner        your play history, the deck's records, the
                                    standing, your titles

   THE BROWSER NEVER HOLDS THE DECK. Cards arrive one at a time with the
   answers stripped, and the answer comes back only after a guess is recorded.
   =========================================================================== */

(function () {
  'use strict';

  var CFG = {
    ROUNDS: 3,
    WHERE_MAX: 800,
    WHO_MAX: 200,
    FALLOFF: 600,          // miles; lower = harsher
    // Miles; inside this you get full marks. Fifty is "you named the town",
    // which is a real thing to be right about. Fifteen was under a pixel at
    // the zoom people actually play at, so nobody ever scored a perfect round.
    BULLSEYE: 50,
    // Puzzle #1 is this local date. Change it and every puzzle number shifts.
    EPOCH: new Date(2026, 8, 10),
    KEY: 'trippin.v1',
    STORY_MAX: 140,
  };

  var SETTINGS = window.SETTINGS || {};

  // Who is holding the phone. A pooled deck eventually deals you a place you
  // slept in, and without knowing who you are there is no way to notice.
  var ME = null;
  var MEPASS = null;

  // The word. Never baked into the deployed page — it arrives in the share
  // link or the player types it, and the SERVER decides whether it is right.
  var word = null;

  var CREW = window.CREW || [];
  var STAYS = window.STAYS || [];
  var byId = {};
  function indexCrew() {
    byId = {};
    CREW.forEach(function (p) { byId[p.id] = p; });
  }
  indexCrew();

  // Resolves to 'ok' | 'bad' | 'slow' | 'empty' | 'offline'.
  function loadPool() {
    if (!online()) return Promise.resolve('ok');
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch('/api/crew', {
      signal: ctrl.signal,
      headers: word ? { 'x-trippin-key': word } : {},
    })
      .then(function (r) {
        clearTimeout(t);
        if (r.status === 429) return 'slow';
        if (r.status === 401 || r.status === 403) return 'bad';
        if (!r.ok) return 'offline';
        return r.json().then(function (j) {
          if (!j || !j.crew || !j.crew.length) return 'empty';
          CREW = j.crew;
          DECK = j.deck || 0;
          indexCrew();
          return 'ok';
        });
      })
      .catch(function () { clearTimeout(t); return 'offline'; });
  }

  var DECK = 0;
  var online = function () { return /^https?:$/.test(location.protocol); };

  // ---------------------------------------------------------------- utils --

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function commas(n) { return Number(n).toLocaleString('en-US'); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // localStorage can throw outright in private windows and embedded contexts.
  //
  // Anything that belongs to a player rather than to the device is keyed by
  // who is signed in: five friends share laptops, and a streak is not a
  // property of a browser.
  var PER_PLAYER = { stats: 1, calls: 1, lines: 1, noticed: 1, seen: 1,
                     pro: 1, pitch: 1, probanner: 1 };
  function storeKey(key) {
    return CFG.KEY + '.' + (PER_PLAYER[key] && ME ? ME + '.' : '') + key;
  }
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(storeKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(storeKey(key), JSON.stringify(val)); } catch (e) { /* fine */ }
  }

  var isPhone = function () { return window.matchMedia('(max-width: 899px)').matches; };

  // ------------------------------------------------------- daily selection --

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var shuffleCache = {};
  function cycleOrder(cycle) {
    if (shuffleCache[cycle]) return shuffleCache[cycle];
    var rnd = mulberry32(cycle * 2654435761 + 12345);
    var arr = STAYS.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    shuffleCache[cycle] = arr;
    return arr;
  }

  // Offline only. Online the Worker keeps a ledger and deals from it.
  function dealFor(dayIndex) {
    var n = STAYS.length;
    if (!n) return [];
    var out = [], seen = {}, i = dayIndex * CFG.ROUNDS, guard = 0;
    while (out.length < Math.min(CFG.ROUNDS, n) && guard++ < n * 4) {
      var deck = cycleOrder(Math.floor(i / n));
      var stay = deck[((i % n) + n) % n];
      if (!seen[stay.id]) { seen[stay.id] = 1; out.push(stay); }
      i++;
    }
    return out;
  }

  function todayIndex() {
    var d = new Date();
    var local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((local - CFG.EPOCH) / 86400000);
  }

  function msToMidnight() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
  }

  // -------------------------------------------------------------- scoring --

  function wherePoints(miles) {
    if (miles <= CFG.BULLSEYE) return CFG.WHERE_MAX;
    return Math.round(CFG.WHERE_MAX * Math.exp(-miles / CFG.FALLOFF));
  }

  function fmtMiles(m) {
    if (m < 1) return (m * 5280 < 800) ? 'right on it' : (Math.round(m * 10) / 10) + ' mi';
    if (m < 10) return (Math.round(m * 10) / 10) + ' mi';
    return commas(Math.round(m)) + ' mi';
  }

  function whoScore(picked, actual) {
    var want = (actual || []).slice().sort();
    var got = (picked || []).slice().sort();
    if (!want.length) return { pts: 0, exact: false, hits: 0 };
    var hits = got.filter(function (id) { return want.indexOf(id) !== -1; }).length;
    var union = {};
    want.concat(got).forEach(function (id) { union[id] = 1; });
    var exact = hits === want.length && got.length === want.length;
    var frac = hits / Object.keys(union).length;      // Jaccard
    return { pts: Math.round(CFG.WHO_MAX * frac), exact: exact, hits: hits };
  }

  // A normal round's colour comes from how close the pin was; a host round
  // has no single distance to speak of, so it is graded on the whole round.
  function bandOf(r) {
    return r && r.host ? band((r.pts / 1000) * CFG.WHERE_MAX) : band(r ? r.wherePts : 0);
  }

  function band(pts) {
    var f = pts / CFG.WHERE_MAX;
    if (f >= 0.85) return 0;
    if (f >= 0.55) return 1;
    if (f >= 0.25) return 2;
    return 3;
  }

  var BAND_WORD = ['Right town', 'Right region', 'Right country', 'Wrong continent'];
  var HOST_BAND_WORD = ['On it', 'Close enough', 'Some of it', 'Not this time'];

  // ---------------------------------------------------------------- state --

  var state = {
    mode: 'daily',
    dayIndex: 0,
    stays: [],
    round: 0,
    results: [],
    phase: 'guessing',
    pickWho: [],
    pickAt: null,
    pickKey: null,
    guesses: 0,            // pin drops this round. Pro calls them guesses.
    host: null,
    seen: [],
    card: null,
    ask: null,
    rounds: 3,
    played: null,          // how many friends have played today, when known
    total: null,
  };

  var map = null;

  var renderListing = window.Listing.render;
  var avatar = window.Listing.avatar;

  // ------------------------------------------------------------- the line --

  // One sentence from the canned bank in lines.js. Never composed at runtime:
  // eligible lines are those whose every tag is true of the result, the most
  // specific wins, and which one is a hash of the puzzle and the stay so all
  // five players read the same thing and a refresh does not reroll it. The
  // last forty indices are skipped so nobody sees the same line twice in a
  // fortnight.
  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function lineFor(slot, tags, seed) {
    var bank = window.LINES || [];
    var recent = load('lines', []);
    var best = null, pool = [];
    bank.forEach(function (ln, i) {
      if (ln.slot !== slot) return;
      var ok = (ln.when || []).every(function (t) { return tags.indexOf(t) !== -1; });
      if (!ok) return;
      var n = (ln.when || []).length;
      if (best === null || n > best) { best = n; pool = [{ i: i, t: ln.t }]; }
      else if (n === best) pool.push({ i: i, t: ln.t });
    });
    if (!pool.length) return null;
    var fresh = pool.filter(function (p) { return recent.indexOf(p.i) === -1; });
    if (fresh.length) pool = fresh;
    var pick = pool[hashStr(seed) % pool.length];
    recent.push(pick.i);
    save('lines', recent.slice(-40));
    return pick.t;
  }

  function stayTags(r, truth) {
    var tags = [];
    if (r.host) {
      tags.push('host');
      tags.push('b' + bandOf(r));
    } else {
      tags.push('b' + band(r.wherePts));
      if (typeof r.dist === 'number' && r.dist <= CFG.BULLSEYE) tags.push('bullseye');
      var crew = (truth && truth.crew) || [];
      if (r.whoCorrect) tags.push('whoExact');
      else if (r.whoPts) tags.push('whoPart');
      else tags.push('whoNone');
      if ((r.who || []).length > crew.length && crew.length) tags.push('whoOver');
      if (crew.length === 1) tags.push('solo');
    }
    var card = state.card || {};
    if (!(card.amenities && card.amenities.length) && !card.type) tags.push('thin');
    return tags;
  }

  function dayTags(tot, st) {
    var tags = [];
    var max = (state.results.filter(Boolean).length || CFG.ROUNDS) * 1000;
    var f = tot / max;
    if (f >= 0.8) tags.push('dayHigh');
    else if (f >= 0.5) tags.push('dayMid');
    else tags.push('dayLow');
    if (tot >= max) tags.push('perfect');
    if (st && st.beatBest) tags.push('beatBest');
    if (st && st.streak >= 3) tags.push('streak');
    if (state.results.some(function (r) { return r && r.host; })) tags.push('host');
    return tags;
  }

  function lineNode(text) {
    var p = el('p', 'line');
    p.appendChild(el('span', null, text));
    return p;
  }

  // ----------------------------------------------------------- play round --

  function currentStay() {
    return online() ? state.card : state.stays[state.round];
  }

  function currentAsk() {
    if (online()) return state.ask || null;
    var st = state.stays[state.round];
    return st ? hostFor(st) : null;
  }

  function cityList() {
    var w = window.WORLDMAP;
    if (!w || !w.cities) return [];
    return w.cities.map(function (c) {
      return { name: c[0], lng: c[1], lat: c[2], rank: c[3] };
    });
  }

  // The nearest named place to a pin. The Worker has a 68-city list for one
  // format and no coastline; the browser has 6,776. So the lookup happens
  // here and only the name travels, which is all the Worker's lines need.
  function nearestCity(lat, lng) {
    var cities = cityList();
    var best = null;
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      var d = StayMap.haversine(lat, lng, c.lat, c.lng);
      if (!best || d < best.miles) best = { name: c.name, miles: d };
    }
    if (best) best.miles = Math.round(best.miles);
    return best;
  }

  function hostCtx() {
    return {
      me: ME, crew: CREW, stays: STAYS, cities: cityList(),
      seen: state.seen || [], dayIndex: state.dayIndex, round: state.round,
      used: state.results.filter(Boolean).map(function (r) { return r.fmt; }),
    };
  }

  function hostFor(stay) {
    if (!ME || !window.Host) return null;
    return window.Host.challenge(stay, hostCtx());
  }

  function setPlaying(on) {
    document.body.classList.toggle('is-playing', !!on);
    document.body.classList.remove('is-folded');
    if (on) {
      document.body.classList.remove('is-revealed', 'is-summary', 'is-page');
      $('#summary').hidden = true;
      $('#dayview').hidden = true;
      $('#record').hidden = true;
      $('#needstays').hidden = true;
      $('#reveal').hidden = true;
      $('#play').hidden = false;
    }
  }

  // Phone only: the first commitment folds the photo to a filmstrip and hands
  // the space to the map. Tapping the strip brings the card back.
  function foldCard() {
    if (!isPhone() || document.body.classList.contains('is-folded')) return;
    var stay = currentStay();
    if (!stay) return;
    var fold = $('#cardfold');
    fold.replaceChildren();
    if (stay.photo) {
      var t = el('img', 'cardfold__thumb');
      t.src = stay.photo; t.alt = '';
      fold.appendChild(t);
    } else {
      fold.appendChild(el('span', 'cardfold__thumb'));
    }
    var mid = el('span', 'cardfold__mid');
    var odd = window.Listing.oddOf(stay);
    mid.appendChild(el('span', 'cardfold__label', state.host ? 'Your stay'
      : (odd.hasOdd ? 'Odd detail' : 'Exhibit ' + pad2(state.round + 1))));
    mid.appendChild(el('span', 'cardfold__odd', state.host ? (state.host.label || '') : odd.text));
    fold.appendChild(mid);
    fold.appendChild(el('span', 'cardfold__caret', '▲'));
    fold.hidden = false;
    document.body.classList.add('is-folded');
    if (map) setTimeout(function () { map.refresh(); }, 40);
  }

  function unfoldCard() {
    document.body.classList.remove('is-folded');
    $('#cardfold').hidden = true;
    if (map) setTimeout(function () { map.refresh(); }, 40);
  }

  function whoTile(p, single) {
    var b = el('button', 'who');
    b.type = 'button';
    b.dataset.who = p.id;
    var top = el('span', 'who__top');
    top.appendChild(el('span', 'who__box'));
    top.appendChild(avatar(p));
    b.appendChild(top);
    b.appendChild(el('span', 'who__name', p.name));
    b.setAttribute('aria-pressed', 'false');
    return b;
  }

  function paintWhoState(who) {
    $$('.who', who).forEach(function (x) {
      var on = x.dataset.who
        ? state.pickWho.indexOf(x.dataset.who) !== -1
        : (x.classList.contains('who--nobody') && state.nobody);
      x.classList.toggle('is-on', !!on);
      x.setAttribute('aria-pressed', String(!!on));
    });
  }

  /* ------------------------------------------------------------ host round --

     When the deck hands you somewhere you have actually been, the two normal
     questions are free points. host.js swaps in a different question about the
     same card; everything below is the UI for the four shapes those take.
  */

  function renderHost(stay, spec) {
    state.host = spec;
    state.pickWho = [];
    state.nobody = false;
    state.pickAt = null;
    state.pickKey = null;
    state.phase = 'guessing';
    setPlaying(true);
    document.body.classList.add('is-host');

    $('#pips').replaceChildren(renderPips());
    $('#listing').replaceChildren(renderListing(stay, { exhibit: state.round + 1, host: true }));

    var q = $('#host');
    q.hidden = false;
    q.replaceChildren();
    q.appendChild(el('p', 'hostq__label', 'Host round · ' + spec.label));
    q.appendChild(el('p', 'hostq__prompt', spec.prompt));
    if (spec.how) {
      // The prompts are deliberately silly and a silly prompt can bury the
      // rule it is dressing up. This is the plain version.
      var how = el('button', 'hostq__how', 'How this one works');
      how.type = 'button';
      how.setAttribute('aria-expanded', 'false');
      var rules = el('p', 'hostq__rules', spec.how);
      rules.hidden = true;
      how.addEventListener('click', function () {
        rules.hidden = !rules.hidden;
        how.setAttribute('aria-expanded', String(!rules.hidden));
      });
      q.appendChild(how);
      q.appendChild(rules);
    }

    var multi = spec.kind === 'people' || spec.kind === 'peoplepin';
    var single = spec.kind === 'personpin';
    var who = $('#whoPicker');
    who.replaceChildren();
    who.hidden = !(single || multi);
    if (single) who.setAttribute('data-single', ''); else who.removeAttribute('data-single');
    var label = $('#whoLabel');
    label.hidden = who.hidden;
    label.textContent = single ? 'Pick one · then drop a pin'
      : (spec.kind === 'peoplepin' ? 'Tick everyone who qualifies · or nobody' : 'Tick everyone who qualifies');
    if (!who.hidden) {
      (spec.people || []).forEach(function (id) {
        var p = byId[id];
        if (!p) return;
        var b = whoTile(p, single);
        b.addEventListener('click', function () {
          state.nobody = false;
          if (single) {
            state.pickWho = state.pickWho[0] === id ? [] : [id];
          } else {
            var i = state.pickWho.indexOf(id);
            if (i === -1) state.pickWho.push(id); else state.pickWho.splice(i, 1);
          }
          paintWhoState(who);
          foldCard();
          updateAction();
        });
        who.appendChild(b);
      });
      if (multi) {
        // "Nobody" is a real answer, and the right one more often than you
        // would think. A full-width tile, exclusive with the four above it.
        var nb = el('button', 'who who--nobody');
        nb.type = 'button';
        var top = el('span', 'who__top');
        top.appendChild(el('span', 'who__box'));
        nb.appendChild(top);
        nb.appendChild(el('span', 'who__name', 'Nobody. Not one of them'));
        nb.setAttribute('aria-pressed', 'false');
        nb.addEventListener('click', function () {
          state.nobody = !state.nobody;
          if (state.nobody) state.pickWho = [];
          paintWhoState(who);
          foldCard();
          updateAction();
        });
        who.appendChild(nb);
      }
    }

    var choice = $('#choice');
    choice.replaceChildren();
    choice.hidden = !(spec.kind === 'choice' || spec.kind === 'choicepin');
    if (!choice.hidden) {
      label.hidden = false;
      label.textContent = spec.kind === 'choicepin' ? 'Pick one · then drop a pin' : 'Pick one';
      (spec.options || []).forEach(function (o, i) {
        var b = el('button', 'choice__opt');
        b.type = 'button';
        b.dataset.key = o.key;
        b.appendChild(el('span', 'choice__key', String.fromCharCode(65 + i)));
        b.appendChild(el('span', 'choice__label', o.label));
        b.appendChild(el('span', 'choice__dot'));
        b.addEventListener('click', function () {
          state.pickKey = o.key;
          $$('.choice__opt', choice).forEach(function (x) {
            var on = x.dataset.key === o.key;
            x.classList.toggle('is-on', on);
            x.setAttribute('aria-pressed', String(on));
          });
          foldCard();
          updateAction();
        });
        b.setAttribute('aria-pressed', 'false');
        choice.appendChild(b);
      });
    }
    if (spec.kind === 'pin') { label.hidden = false; label.textContent = 'Drop a pin · nothing else'; }

    map.clearMarkers();
    map.reset(true);
    var wantsPin = spec.kind !== 'people';
    map.setInteractive(wantsPin);
    // Your own stay is marked from the start. It is not a spoiler to you, and
    // "pin the far side of the planet" is not answerable without it.
    map.showAnswer(stay.lat, stay.lng, stay.place);
    updateAction();
    setTimeout(function () { map.refresh(); }, 30);
  }

  function hostLockIn() {
    if (online()) return submitGuess();
    var spec = state.host;
    var stay = currentStay();
    var guess = {
      person: state.pickWho[0] || null,
      people: state.pickWho.slice(),
      at: state.pickAt,
      key: state.pickKey,
    };
    var sc = window.Host.score(spec, guess);
    var result = {
      stayId: stay.id, host: true, fmt: spec.fmt, kind: spec.kind, label: spec.label,
      who: state.pickWho.slice(), whoCorrect: sc.correct, key: state.pickKey,
      lat: state.pickAt ? state.pickAt.lat : null, lng: state.pickAt ? state.pickAt.lng : null,
      dist: sc.dist, wherePts: sc.pinPts || 0,
      whoPts: sc.whoPts || (sc.pts - (sc.pinPts || 0)), pts: sc.pts,
      truth: {
        place: stay.place, lat: stay.lat, lng: stay.lng, when: stay.when, crew: stay.crew,
        story: stay.story, id: stay.id, owner: stay.booker,
        answer: spec.answers || spec.answer, target: spec.target || null,
        targetName: spec.targetName || null, note: spec.note || null,
      },
    };
    state.results[state.round] = result;
    state.phase = 'revealed';
    persist();
    map.setInteractive(false);
    if (spec.target) {
      map.showAnswer(spec.target.lat, spec.target.lng, spec.targetName || '');
      if (state.pickAt) map.frameBoth(state.pickAt, spec.target, true);
    }
    showHostReveal(Object.assign({}, stay, result.truth), Object.assign({}, spec, result.truth), result);
  }

  function ledgerRow(k, v, mono) {
    var row = el('div', 'rrow');
    row.appendChild(el('span', 'rrow__k', k));
    if (typeof v === 'string') row.appendChild(el('span', 'rrow__v' + (mono === false ? ' rrow__v--row' : ''), v));
    else row.appendChild(v);
    return row;
  }

  function nextButton() {
    var next = el('button', 'btn btn--wide');
    next.type = 'button';
    var last = state.round >= (state.rounds || state.stays.length) - 1;
    next.textContent = last ? 'See your day' : 'Next stay →';
    next.addEventListener('click', function () {
      if (last) { finishDay(); showSummary(); }
      else { advance(); }
    });
    return next;
  }

  function showHostReveal(stay, spec, r) {
    var box = $('#reveal');
    box.replaceChildren();
    box.hidden = false;
    document.body.classList.remove('is-playing', 'is-folded');
    document.body.classList.add('is-revealed');
    $('#cardfold').hidden = true;

    var head = el('div', 'reveal__head');
    var lead = el('div');
    var dist = el('p', 'reveal__dist');
    if (r.dist != null) {
      dist.appendChild(document.createTextNode(r.dist <= CFG.BULLSEYE ? 'On it' : fmtMiles(r.dist) + ' '));
      if (r.dist > CFG.BULLSEYE) dist.appendChild(el('small', null, 'off'));
    } else {
      dist.textContent = r.whoCorrect ? 'Got it' : 'Not quite';
    }
    lead.appendChild(dist);
    var b = bandOf(r);
    lead.appendChild(el('p', 'reveal__band is-band-' + b, 'Band ' + b + ' · ' + HOST_BAND_WORD[b]));
    head.appendChild(lead);
    head.appendChild(el('p', 'reveal__pts', '+' + commas(r.pts)));
    box.appendChild(head);

    var line = r.line || lineFor('stay', stayTags(r, stay), 'h' + state.dayIndex + ':' + state.round);
    if (line) box.appendChild(lineNode(line));

    box.appendChild(meterNode(r.pts / window.Host.MAX, b));

    // A host round has no ledger worth printing, so the answer takes the flag.
    var flag = el('div', 'flag');
    flag.appendChild(el('p', 'flag__k', 'Host round · ' + spec.label));
    var setKind = spec.kind === 'people' || spec.kind === 'peoplepin';
    var answerText = '';
    if (spec.kind === 'personpin' || setKind) {
      var want = setKind ? (spec.answer || []) : window.Host.accepted(spec);
      answerText = want.length
        ? want.map(function (id) { return byId[id] ? byId[id].name : id; }).join(' · ')
        : 'Nobody';
      if (spec.targetName && spec.kind === 'personpin') answerText += ' · ' + spec.targetName;
    } else if (spec.kind === 'choice' || spec.kind === 'choicepin') {
      answerText = answerLabel(spec);
    } else {
      answerText = spec.targetName || 'The spot';
    }
    flag.appendChild(el('p', 'flag__v', answerText));
    if (spec.note) flag.appendChild(el('p', 'flag__q', spec.note));
    box.appendChild(flag);

    var ledger = el('div', 'ledger');
    if (r.dist != null) {
      ledger.appendChild(ledgerRow('You pinned', fmtMiles(r.dist) + ' from ' + (spec.targetName || 'it') + ' · +' + r.wherePts));
    }
    if (spec.kind === 'personpin' || setKind || spec.kind === 'choice' || spec.kind === 'choicepin') {
      var said;
      if (spec.kind === 'choice' || spec.kind === 'choicepin') said = pickedLabel(spec, r.key) || r.key || '—';
      else said = r.who.length ? r.who.map(function (id) { return byId[id] ? byId[id].name : id; }).join(', ') : 'Nobody';
      ledger.appendChild(ledgerRow('You said', said + ' · +' + (r.whoPts || 0)));
    }
    if (stay.place) {
      ledger.appendChild(ledgerRow('The stay', stay.place + (stay.when ? ' · ' + stay.when : '')));
    }
    box.appendChild(ledger);

    // Best moment in the game to ask: the card is yours and you have just
    // spent thirty seconds thinking about it.
    if (online() && stay.id && !stay.story) box.appendChild(storyAsk(stay, 'host'));
    if (online() && stay.id) box.appendChild(callAsk(stay));

    var won = proWin();
    if (won) box.appendChild(won);

    box.appendChild(nextButton());
    $('#pips').replaceChildren(renderPips());
    box.querySelector('.btn').focus({ preventScroll: true });
    setTimeout(function () { map.refresh(); }, 30);
  }

  function meterNode(frac, b) {
    var bar = el('div', 'meter');
    var fill = el('i', 'meter__fill is-band-' + b);
    var pct = Math.max(1, Math.min(100, frac * 100));
    fill.style.width = '0%';
    bar.appendChild(fill);
    var tick = el('i', 'meter__tick');
    tick.style.left = pct + '%';
    bar.appendChild(tick);
    requestAnimationFrame(function () { fill.style.width = pct + '%'; });
    return bar;
  }

  function advance() {
    state.round++;
    persist();
    if (!online()) return renderRound();
    loadRound(state.round, function (j) {
      state.card = j.card;
      state.ask = j.ask;
      if (j.done) { state.results[state.round] = j.done; return advance(); }
      renderRound();
    }, function () { $('#hint').textContent = 'Could not reach the server.'; });
  }

  function answerLabel(spec) {
    var hit = (spec.options || []).filter(function (o) { return o.key === spec.answer; })[0];
    return hit ? hit.label : spec.answer;
  }
  function pickedLabel(spec, key) {
    var hit = (spec.options || []).filter(function (o) { return o.key === key; })[0];
    return hit ? hit.label : null;
  }

  function renderRound() {
    var stay = currentStay();
    if (!stay) return showSummary();
    state.guesses = 0;

    var spec = currentAsk();
    if (spec) return renderHost(stay, spec);

    state.host = null;
    state.pickKey = null;
    state.nobody = false;
    setPlaying(true);
    document.body.classList.remove('is-host');
    $('#host').hidden = true;
    $('#choice').hidden = true;
    var who = $('#whoPicker');
    who.hidden = false;
    who.removeAttribute('data-single');
    var label = $('#whoLabel');
    label.hidden = false;
    label.textContent = 'Who was there · tick all';

    $('#pips').replaceChildren(renderPips());
    $('#listing').replaceChildren(renderListing(stay, { exhibit: state.round + 1 }));

    who.replaceChildren();
    CREW.forEach(function (p) {
      var b = whoTile(p);
      b.addEventListener('click', function () {
        var i = state.pickWho.indexOf(p.id);
        if (i === -1) state.pickWho.push(p.id); else state.pickWho.splice(i, 1);
        paintWhoState(who);
        foldCard();
        updateAction();
      });
      who.appendChild(b);
    });

    state.pickWho = [];
    state.pickAt = null;
    state.phase = 'guessing';
    map.clearMarkers();
    map.setInteractive(true);
    map.reset(true);
    updateAction();
    setTimeout(function () { map.refresh(); }, 30);
  }

  function renderPips() {
    var wrap = el('ol', 'pips');
    var total = state.rounds || state.stays.length || CFG.ROUNDS;
    for (var i = 0; i < total; i++) {
      var li = el('li', 'pip');
      var r = state.results[i];
      if (r) {
        li.classList.add('is-done', 'is-band-' + bandOf(r));
        if (r.host) li.classList.add('is-host');
        if (r.whoCorrect) li.classList.add('is-who');
        else if (r.whoPts) li.classList.add('is-who-part');
      } else if (i === state.round && state.phase !== 'done') {
        li.classList.add('is-now');
        if (state.host) li.classList.add('is-host');
      }
      li.textContent = String(i + 1);
      wrap.appendChild(li);
    }
    return wrap;
  }

  function updateAction() {
    var btn = $('#lockin');
    var hint = $('#hint');
    paintGuesses();
    var named = function () {
      return state.pickWho.map(function (id) { return byId[id] ? byId[id].name : id; });
    };

    if (state.host) {
      var k = state.host.kind;
      var ok, say;
      if (k === 'personpin') {
        ok = state.pickWho.length === 1 && state.pickAt;
        say = !state.pickWho.length ? 'Pick one of them.'
            : !state.pickAt ? named()[0] + ' named. Now drop a pin.' : 'Ready.';
      } else if (k === 'people') {
        ok = state.pickWho.length > 0 || state.nobody;
        say = state.nobody ? 'Nobody. Bold.'
          : state.pickWho.length ? state.pickWho.length + ' ticked. Ready.'
          : 'Tick anyone who has, or nobody.';
      } else if (k === 'peoplepin') {
        ok = !!state.pickAt && (state.pickWho.length > 0 || state.nobody);
        say = !(state.pickWho.length || state.nobody) ? 'Tick anyone who has, or nobody, then pin.'
          : !state.pickAt ? 'Now drop a pin.' : 'Ready.';
      } else if (k === 'choicepin') {
        ok = !!state.pickKey && !!state.pickAt;
        say = !state.pickKey ? 'Pick one.' : !state.pickAt ? 'Now drop a pin.' : 'Ready.';
      } else if (k === 'pin') {
        ok = !!state.pickAt;
        say = ok ? 'Ready.' : 'Drop a pin.';
      } else {
        ok = !!state.pickKey;
        say = ok ? 'Ready.' : 'Pick one.';
      }
      btn.disabled = !ok;
      hint.textContent = say;
      return;
    }

    var ready = state.pickWho.length > 0 && state.pickAt;
    btn.disabled = !ready;
    if (ready) hint.textContent = state.pickWho.length === 1 ? 'One named. Ready.' : state.pickWho.length + ' named. Ready.';
    else if (!state.pickWho.length && !state.pickAt) hint.textContent = 'Pick everyone, then drop a pin.';
    else if (!state.pickWho.length) hint.textContent = 'Pin is down. Who was there?';
    else hint.textContent = (state.pickWho.length === 1 ? 'One named.' : state.pickWho.length + ' named.') + ' Now drop a pin.';
  }

  // Online, the guess goes to the Worker and the truth comes back with the
  // score. Offline, the old local path still runs against the baked-in deck.
  function submitGuess() {
    var btn = $('#lockin');
    btn.disabled = true;
    var near = state.pickAt ? nearestCity(state.pickAt.lat, state.pickAt.lng) : null;
    api('/api/guess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        owner: ME, day: state.dayIndex, round: state.round,
        at: state.pickAt, who: state.pickWho, key: state.pickKey, near: near,
        nobody: !!state.nobody,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 402) return showNeedStays();
        var result = res.j.result;
        if (!result) throw new Error(res.j.error || 'refused');
        state.results[state.round] = result;
        state.phase = 'revealed';
        if (typeof result.played === 'number') { state.played = result.played; state.total = result.total; state.waiting = result.waiting || 0; }
        persist();
        showAnswer(result);
      })
      .catch(function () {
        btn.disabled = false;
        $('#hint').textContent = 'Could not reach the server. Try again.';
      });
  }

  function showAnswer(r) {
    var truth = Object.assign({}, currentStay() || {}, r.truth || {});
    map.setInteractive(false);
    if (r.host) {
      var spec = Object.assign({}, state.host || currentAsk() || {}, {
        answers: (r.truth && r.truth.answer) || null,
        answer: (r.truth && r.truth.answer) || null,
        target: (r.truth && r.truth.target) || null,
        targetName: (r.truth && r.truth.targetName) || null,
        note: (r.truth && r.truth.note) || null,
      });
      if (spec.target) {
        map.showAnswer(spec.target.lat, spec.target.lng, spec.targetName || '');
        if (state.pickAt) map.frameBoth(state.pickAt, spec.target, true);
      }
      return showHostReveal(truth, spec, r);
    }
    map.showAnswer(truth.lat, truth.lng, truth.place);
    if (state.pickAt) map.frameBoth(state.pickAt, { lat: truth.lat, lng: truth.lng }, true);
    showReveal(truth, r);
  }

  function lockIn() {
    if (online()) return submitGuess();
    if (state.host) return hostLockIn();
    if (!state.pickWho.length || !state.pickAt) return;
    var stay = currentStay();
    var d = StayMap.haversine(state.pickAt.lat, state.pickAt.lng, stay.lat, stay.lng);
    var wp = wherePoints(d);
    var party = stay.crew && stay.crew.length ? stay.crew : [stay.booker];
    var w = whoScore(state.pickWho, party);
    var result = {
      stayId: stay.id, host: false, pts: wp + w.pts, who: state.pickWho.slice(),
      whoCorrect: w.exact, whoHits: w.hits, lat: state.pickAt.lat, lng: state.pickAt.lng,
      dist: d, wherePts: wp, whoPts: w.pts,
      truth: { place: stay.place, lat: stay.lat, lng: stay.lng, when: stay.when, crew: party,
               story: stay.story, id: stay.id, owner: stay.booker, others: stay.others || 0 },
    };
    state.results[state.round] = result;
    state.phase = 'revealed';
    persist();
    map.setInteractive(false);
    map.showAnswer(stay.lat, stay.lng, stay.place);
    map.frameBoth(state.pickAt, { lat: stay.lat, lng: stay.lng }, true);
    showReveal(Object.assign({}, stay, result.truth), result);
  }

  function partyTags(party, picked) {
    var v = el('span', 'rrow__v rrow__v--tags');
    party.forEach(function (id) {
      var p = byId[id];
      if (!p) return;
      var tag = el('span', 'whoTag' + (picked.indexOf(id) !== -1 ? ' is-hit' : ' is-miss'));
      tag.appendChild(avatar(p, 'sm'));
      tag.appendChild(el('span', null, p.name));
      v.appendChild(tag);
    });
    picked.filter(function (id) { return party.indexOf(id) === -1; }).forEach(function (id) {
      var p = byId[id];
      if (!p) return;
      var tag = el('span', 'whoTag is-wrong');
      tag.appendChild(avatar(p, 'sm'));
      tag.appendChild(el('span', null, p.name));
      v.appendChild(tag);
    });
    return v;
  }

  function storyNode(stay, photo) {
    var who = byId[stay.owner] || {};
    var box = el('div', 'story' + (photo ? '' : ' story--bare'));
    if (photo) {
      var img = el('img', 'story__img');
      img.src = photo; img.alt = '';
      box.appendChild(img);
    }
    var text = el('div', 'story__text');
    text.appendChild(el('p', 'story__line', stay.story));
    text.appendChild(el('p', 'story__by', '— ' + (who.name || stay.owner || 'them') + ', on the back of the print'));
    box.appendChild(text);
    return box;
  }

  function showReveal(stay, r) {
    var box = $('#reveal');
    box.replaceChildren();
    box.hidden = false;
    document.body.classList.remove('is-playing', 'is-folded');
    document.body.classList.add('is-revealed');
    $('#cardfold').hidden = true;

    var b = band(r.wherePts);
    var head = el('div', 'reveal__head');
    var lead = el('div');
    var dist = el('p', 'reveal__dist');
    if (r.dist <= CFG.BULLSEYE) {
      dist.textContent = 'Bullseye';
    } else {
      dist.appendChild(document.createTextNode(fmtMiles(r.dist) + ' '));
      dist.appendChild(el('small', null, 'off'));
    }
    lead.appendChild(dist);
    lead.appendChild(el('p', 'reveal__band is-band-' + b,
      'Band ' + b + (r.dist <= CFG.BULLSEYE ? ' · ' + fmtMiles(r.dist) : '') + ' · ' + BAND_WORD[b]));
    head.appendChild(lead);
    head.appendChild(el('p', 'reveal__pts', '+' + commas(r.wherePts + r.whoPts)));
    box.appendChild(head);

    // The line lands before the meter finishes, so the taunt is read first.
    var line = r.line || lineFor('stay', stayTags(r, stay), 's' + state.dayIndex + ':' + state.round);
    if (line) box.appendChild(lineNode(line));

    box.appendChild(meterNode(r.wherePts / CFG.WHERE_MAX, b));

    // Then the punchline: the owner's own line, on a beat.
    if (stay.story) box.appendChild(storyNode(stay, (state.card && state.card.photo) || stay.photo));

    if (stay.flag) {
      var flag = el('div', 'flag');
      flag.appendChild(el('p', 'flag__k', 'Deck record'));
      flag.appendChild(el('p', 'flag__v', stay.flag.v));
      flag.appendChild(el('p', 'flag__q', stay.flag.k));
      box.appendChild(flag);
    }

    box.appendChild(el('p', 'ledger__label', 'On file'));
    var ledger = el('div', 'ledger');
    ledger.appendChild(ledgerRow('Where', stay.place + ' · +' + r.wherePts, false));
    if (stay.when) ledger.appendChild(ledgerRow('When', stay.when + (stay.nights ? ' · ' + stay.nights + (stay.nights === 1 ? ' night' : ' nights') : '')));
    var party = (stay.crew && stay.crew.length ? stay.crew : [stay.owner]);
    var pr = el('div', 'rrow');
    pr.appendChild(el('span', 'rrow__k', 'Party · +' + r.whoPts));
    pr.appendChild(partyTags(party, r.who || []));
    ledger.appendChild(pr);
    if (stay.others) ledger.appendChild(ledgerRow('Plus', stay.others + (stay.others === 1 ? ' other who is not playing' : ' others who are not playing')));
    if (stay.last && typeof stay.last.dist === 'number') {
      var better = typeof r.dist === 'number' && r.dist < stay.last.dist;
      ledger.appendChild(ledgerRow('Last time', fmtMiles(stay.last.dist) + ' · No. ' + (stay.last.day + 1) +
        (better ? ' · beaten' : ' · not beaten')));
    }
    var card = state.card || {};
    var listed = [];
    if (card.type) listed.push(card.type);
    if (card.guests) listed.push(card.guests + ' guests');
    if (card.bedrooms) listed.push(card.bedrooms + ' br');
    if (card.beds) listed.push(card.beds + ' beds');
    if (card.baths) listed.push(card.baths + ' bath');
    if (listed.length) ledger.appendChild(ledgerRow('Listed', listed.join(' · ')));
    // The facts worth a row: anything compared against the deck. A flat
    // count is already in LISTED, and the flag has its own panel.
    (stay.facts || []).filter(function (f) {
      return f.w >= 2 && !(stay.flag && f.k === stay.flag.k && f.v === stay.flag.v);
    }).slice(0, 4).forEach(function (f) {
      ledger.appendChild(ledgerRow(f.k, f.v));
    });
    box.appendChild(ledger);

    var won = proWin();
    if (won) box.appendChild(won);

    box.appendChild(nextButton());
    $('#pips').replaceChildren(renderPips());
    box.querySelector('.btn').focus({ preventScroll: true });
    setTimeout(function () { map.refresh(); }, 30);
  }

  /* ------------------------------------------------------------- stories --

     One line, one question, a skip that costs nothing. The prompt rotates so
     it reads as a nudge rather than a form. Never blocks anything.
  */

  var PROMPTS = [
    'What broke?', 'Who slept on the floor?', 'What was wrong with the kitchen?', 'Would you go back?',
    'What did it smell like?', 'Who complained first?', 'Best thing in the fridge.',
    'What did you forget?', 'Rate the shower.', 'Who got the good bed?', 'What was the wifi password?',
    'What did the neighbours think?', 'What was the host’s excuse?', 'First thing you did on arrival.',
    'What woke you up?', 'What did you eat off?', 'Who found the place?', 'The one rule the host had.',
    'Who would you not take back?', 'What did you leave behind?', 'What did the reviews not mention?',
    'What did it sound like at night?', 'What was the towel situation?', 'Who drove?',
    'What was the view, honestly?', 'What did you argue about?', 'Any animals?', 'What was the bed like?',
    'What did the host lie about?', 'What would you tell the next people?',
  ];

  function promptFor(stay, n) {
    return PROMPTS[(hashStr(stay.id || '') + (n || 0)) % PROMPTS.length];
  }

  // where: 'host' | 'day' | 'card'. Returns a panel; resolves itself.
  function storyAsk(stay, where, onDone) {
    var box = el('div', 'ask');
    box.appendChild(el('p', 'ask__label', 'Your stay · one line'));
    // Say which stay. On a host reveal the card is on screen; at the end of
    // the day it is not, and "your stay" on its own is a puzzle.
    var which = el('div', 'ask__stay');
    if (stay.photo) {
      var th = el('img', 'ask__thumb');
      th.src = stay.photo; th.alt = '';
      which.appendChild(th);
    }
    var wt = el('span', 'ask__where');
    wt.appendChild(el('strong', null, stay.place || 'Your stay'));
    if (stay.when) wt.appendChild(el('span', 'ask__when', stay.when));
    which.appendChild(wt);
    box.appendChild(which);
    var q = el('p', 'ask__q', promptFor(stay, where === 'day' ? 1 : 0));
    box.appendChild(q);
    var field = el('div', 'ask__field');
    var input = el('input');
    input.type = 'text';
    input.maxLength = CFG.STORY_MAX;
    input.placeholder = 'Whatever you would say out loud about it';
    input.setAttribute('aria-label', 'One line about this place');
    field.appendChild(input);
    box.appendChild(field);
    var meta = el('div', 'ask__meta');
    var count = el('span', null, '0 / ' + CFG.STORY_MAX);
    meta.appendChild(count);
    meta.appendChild(el('span', null, 'They read it after they miss'));
    box.appendChild(meta);
    var acts = el('div', 'ask__acts');
    var skip = el('button', 'btn btn--ghost', 'Skip');
    skip.type = 'button';
    var send = el('button', 'btn', 'Set it');
    send.type = 'button';
    send.disabled = true;
    acts.appendChild(skip);
    acts.appendChild(send);
    box.appendChild(acts);

    input.addEventListener('input', function () {
      count.textContent = input.value.length + ' / ' + CFG.STORY_MAX;
      send.disabled = !input.value.trim();
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !send.disabled) send.click(); });
    skip.addEventListener('click', function () { box.remove(); if (onDone) onDone(null); });
    send.addEventListener('click', function () {
      var text = input.value.trim().slice(0, CFG.STORY_MAX);
      if (!text) return;
      send.disabled = true;
      api('/api/story', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: ME, id: stay.id, story: text }),
      }).then(function (r) {
        if (!r.ok) throw new Error('refused');
        stay.story = text;
        box.replaceChildren();
        box.appendChild(el('p', 'ask__label', 'On the back of the print'));
        box.appendChild(el('p', 'ask__done', '“' + text + '” is on the back now. Edit it on the setup page any time.'));
        if (onDone) onDone(text);
      }).catch(function () {
        send.disabled = false;
        count.textContent = 'Could not reach the server. Try again.';
      });
    });
    return box;
  }

  // Checking your own trap is a move: will anybody get within 500 miles?
  function callAsk(stay) {
    var placed = load('calls', {});
    var key = state.dayIndex + ':' + stay.id;
    var box = el('div', 'ask');
    box.appendChild(el('p', 'ask__label', 'Your call'));
    if (placed[key]) {
      box.appendChild(el('p', 'ask__done', 'You said ' + (placed[key] === 'wont' ? 'nobody' : 'somebody') +
        ' gets within 500 miles. It settles when the others have played.'));
      return box;
    }
    box.appendChild(el('p', 'ask__q', 'Will anybody get within 500 miles of this one?'));
    var call = el('div', 'call');
    var no = el('button', 'btn btn--ghost', "They won't");
    no.type = 'button';
    var yes = el('button', 'btn btn--ghost', 'They will');
    yes.type = 'button';
    call.appendChild(no);
    call.appendChild(yes);
    box.appendChild(call);
    function place(v) {
      no.disabled = yes.disabled = true;
      api('/api/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: ME, day: state.dayIndex, id: stay.id, call: v }),
      }).then(function (r) {
        if (!r.ok) throw new Error('refused');
        placed[key] = v;
        save('calls', placed);
        box.replaceChildren();
        box.appendChild(el('p', 'ask__label', 'Your call'));
        box.appendChild(el('p', 'ask__done', 'Noted. It settles when the others have played.'));
      }).catch(function () { no.disabled = yes.disabled = false; });
    }
    no.addEventListener('click', function () { place('wont'); });
    yes.addEventListener('click', function () { place('will'); });
    return box;
  }

  // ------------------------------------------------------------- summary --

  function totalScore(results) {
    return results.reduce(function (s, r) {
      if (!r) return s;
      return s + (r.pts != null ? r.pts : r.wherePts + r.whoPts);
    }, 0);
  }

  function finishDay() {
    if (state.mode !== 'daily') return;
    var st = load('stats', { played: 0, streak: 0, max: 0, last: null, best: 0, totals: [] });
    if (st.last === state.dayIndex) return;              // already banked
    st.played += 1;
    st.streak = st.last === state.dayIndex - 1 ? st.streak + 1 : 1;
    st.max = Math.max(st.max, st.streak);
    st.last = state.dayIndex;
    var tot = totalScore(state.results);
    st.beatBest = tot > (st.best || 0) && st.played > 1;
    st.best = Math.max(st.best || 0, tot);
    st.totals = (st.totals || []).concat([tot]).slice(-60);
    save('stats', st);
    state.phase = 'done';
    persist();
  }

  function grade(f) {
    if (f >= 0.92) return 'You were there.';
    if (f >= 0.8) return 'Excellent recall.';
    if (f >= 0.65) return 'Solid.';
    if (f >= 0.45) return 'Roughly the right planet.';
    if (f >= 0.25) return 'Some geography happened.';
    return 'Bold guesses throughout.';
  }

  function showPage(id) {
    state.phase = 'done';
    setPlaying(false);
    $('#play').hidden = true;
    $('#reveal').hidden = true;
    document.body.classList.remove('is-revealed', 'is-host');
    document.body.classList.add('is-summary', 'is-page');
    ['summary', 'dayview', 'record', 'needstays'].forEach(function (s) { $('#' + s).hidden = s !== id; });
    $('#pips').replaceChildren(renderPips());
    window.scrollTo(0, 0);
    return $('#' + id);
  }

  function showSummary() {
    var wrap = showPage('summary');
    wrap.replaceChildren();

    var tot = totalScore(state.results);
    var roundsPlayed = state.results.filter(Boolean).length || state.rounds || CFG.ROUNDS;
    var max = roundsPlayed * (CFG.WHERE_MAX + CFG.WHO_MAX);
    wrap.appendChild(el('p', 'sum__label', 'TripPin No. ' + (state.dayIndex + 1)));
    var big = el('p', 'sum__score');
    big.appendChild(document.createTextNode(commas(tot)));
    big.appendChild(el('small', null, ' / ' + commas(max)));
    wrap.appendChild(big);

    var st = load('stats', null);
    var dl = lineFor('day', dayTags(tot, st), 'd' + state.dayIndex) || grade(tot / max);
    wrap.appendChild(lineNode(dl));

    var list = el('ol', 'sum__list');
    state.results.forEach(function (r, i) {
      var stay = (r && r.truth) || state.stays[i] || {};
      var li = el('li', 'sum__row');
      li.appendChild(el('span', 'sum__n', String(i + 1)));
      var mid = el('span', 'sum__mid');
      mid.appendChild(el('span', 'sum__place', stay.place || '—'));
      var sub = el('span', 'sum__sub');
      sub.appendChild(el('span', 'dot dot--band-' + bandOf(r)));
      sub.appendChild(document.createTextNode(
        (typeof r.dist === 'number' ? fmtMiles(r.dist) : '—') + ' · '));
      if (r.host) {
        sub.appendChild(el('span', null, 'Yours · ' + (r.label || 'host round')));
      } else {
        var party = (stay.crew && stay.crew.length ? stay.crew : [stay.owner]);
        party.forEach(function (id, k) {
          var p = byId[id] || { name: id };
          if (k) sub.appendChild(document.createTextNode(', '));
          sub.appendChild(el('span', (r.who || []).indexOf(id) !== -1 ? 'ok' : 'part', p.name));
        });
        (r.who || []).filter(function (id) { return party.indexOf(id) === -1; }).forEach(function (id) {
          var p = byId[id] || { name: id };
          sub.appendChild(document.createTextNode(', '));
          sub.appendChild(el('span', 'no', p.name));
        });
      }
      mid.appendChild(sub);
      li.appendChild(mid);
      li.appendChild(el('span', 'sum__pts', commas(r.pts != null ? r.pts : r.wherePts + r.whoPts)));
      list.appendChild(li);
    });
    wrap.appendChild(list);

    if (isPro()) {
      var studio = el('div', 'studio');
      studio.appendChild(el('span', 'studio__k', 'Share Studio™'));
      studio.appendChild(el('span', 'studio__n', 'Copy takes whatever you type'));
      wrap.appendChild(studio);
    }
    var grid = el('pre', 'sum__grid', shareText(false));
    grid.id = 'sumGrid';
    if (isPro()) {
      grid.classList.add('is-studio');
      grid.contentEditable = 'true';
      grid.spellcheck = false;
      grid.setAttribute('role', 'textbox');
      grid.setAttribute('aria-multiline', 'true');
      grid.setAttribute('aria-label', 'Your result. Editable.');
    }
    wrap.appendChild(grid);

    var acts = el('div', 'sum__acts');
    var share = el('button', 'btn', 'Copy result');
    share.type = 'button';
    share.addEventListener('click', function () { doShare(share); });
    acts.appendChild(share);
    if (online()) {
      var day = el('button', 'btn btn--ghost', 'The day →');
      day.type = 'button';
      day.addEventListener('click', function () { showDay(state.dayIndex); });
      acts.appendChild(day);
    }
    wrap.appendChild(acts);

    var strip = proBanner();
    if (strip) wrap.appendChild(strip);

    if (online()) {
      var played = el('p', 'sum__played');
      played.id = 'sumPlayed';
      played.textContent = state.played != null
        ? describePlayed(state.played, state.total, state.waiting)
        : 'Checking who else has played…';
      wrap.appendChild(played);

      // After the score, and only then: one of today's cards that is yours
      // and has no line on it yet.
      var mine = state.results.filter(function (r) {
        return r && r.truth && r.truth.owner === ME && !r.truth.story && r.truth.id;
      })[0];
      if (mine) wrap.appendChild(storyAsk(mine.truth, 'day', function (text) {
        if (text) mine.truth.story = text;
      }));

      var notices = el('div');
      notices.id = 'notices';
      wrap.appendChild(notices);
    }

    if (state.mode === 'daily') {
      if (st && st.played) {
        var stats = el('div', 'sum__stats');
        [['Played', st.played], ['Streak', st.streak], ['Best', commas(st.best || 0)],
         ['Average', commas(Math.round((st.totals || []).reduce(function (a, b) { return a + b; }, 0) / Math.max(1, (st.totals || []).length)))]
        ].forEach(function (pair) {
          var b = el('div', 'stat');
          b.appendChild(el('span', 'stat__n', String(pair[1])));
          b.appendChild(el('span', 'stat__k', pair[0]));
          stats.appendChild(b);
        });
        wrap.appendChild(stats);
      }
      var cd = el('p', 'sum__next');
      wrap.appendChild(cd);
      tickCountdown(cd);
    }

    if (online()) loadNotices();
    maybePitch();
  }

  function describePlayed(n, total, waiting) {
    if (n == null) return '';
    var tail = waiting ? ' · ' + waiting + ' not set up yet' : '';
    if (n >= total) return 'Everyone has played. The day is open.' + tail;
    var left = total - n;
    return n + ' of ' + total + ' have played · ' + left + ' still to come' + tail;
  }

  // Traps that caught somebody and reactions to your own disasters. Only for
  // days that are settled, so nothing here can name a card before the others
  // have played it.
  function loadNotices() {
    api('/api/day?day=' + state.dayIndex + '&owner=' + encodeURIComponent(ME))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var box = $('#notices');
        var played = $('#sumPlayed');
        if (played && typeof j.played === 'number') {
          state.played = j.played; state.total = j.total; state.waiting = j.waiting || 0;
          played.textContent = describePlayed(j.played, j.total, j.waiting);
        }
        if (!box) return;
        box.replaceChildren();
        var seen = load('noticed', []);
        (j.notices || []).forEach(function (n) {
          var key = n.key;
          var node = el('div', 'notice');
          node.appendChild(el('span', 'notice__k', n.k));
          node.appendChild(document.createTextNode(n.t));
          box.appendChild(node);
          if (key && seen.indexOf(key) === -1) seen.push(key);
        });
        save('noticed', seen.slice(-60));
      })
      .catch(function () { /* fine */ });
  }

  var cdTimer = null;
  function tickCountdown(node) {
    if (cdTimer) clearInterval(cdTimer);
    function paint() {
      var ms = msToMidnight();
      var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      node.textContent = 'Next three in ' + h + ':' + pad2(m) + ':' + pad2(s);
      if (ms < 1000) location.reload();
    }
    paint();
    cdTimer = setInterval(paint, 1000);
  }

  /* ------------------------------------------------------------ the day --

     After you have played, the day with the spoilers in: place names, who
     was actually there, who hosted which round, how everyone scored, the best
     and worst pins. This is the only place the game teaches you about your
     friends, so it gets the space.
  */

  function showDay(day) {
    var wrap = showPage('dayview');
    wrap.replaceChildren();
    wrap.appendChild(el('p', 'sum__label', 'TripPin No. ' + (day + 1) + ' · the day'));
    var note = el('p', 'msg', 'Fetching…');
    wrap.appendChild(note);

    api('/api/day?day=' + day + '&owner=' + encodeURIComponent(ME))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var j = res.j;
        wrap.replaceChildren();
        wrap.appendChild(el('p', 'sum__label', 'TripPin No. ' + (day + 1) + ' · the day'));
        if (!res.ok || !j.allowed) {
          var e = el('div', 'empty');
          e.appendChild(el('div', 'empty__hatch', 'Not yet'));
          e.appendChild(el('p', 'empty__label', 'Sealed'));
          e.appendChild(el('p', 'empty__h', 'Play it first.'));
          e.appendChild(el('p', 'empty__p', (j && j.error) || 'The day opens once you have finished your three.'));
          wrap.appendChild(e);
          wrap.appendChild(backButton());
          return;
        }
        paintDay(wrap, j);
      })
      .catch(function () {
        note.textContent = 'Could not reach the server.';
        wrap.appendChild(backButton());
      });
  }

  function backButton(label) {
    var b = el('button', 'btn btn--ghost btn--wide', label || '← Back');
    b.type = 'button';
    b.style.marginTop = '16px';
    b.addEventListener('click', function () { showSummary(); });
    return b;
  }

  function nameOf(id) { return byId[id] ? byId[id].name : id; }

  function paintDay(wrap, j) {
    var players = j.players || [];
    var stays = j.stays || [];
    var stayById = {};
    stays.forEach(function (s) { stayById[s.id] = s; });

    wrap.appendChild(lineNode(j.everyone
      ? 'Everyone has played. Nothing below is a spoiler any more.'
      : describePlayed(j.played, j.total, j.waiting) + '. Careful in the chat.'));

    // The table: one row per player, one cell per round, a total.
    var table = el('table', 'hairtable dayTable');
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', null, 'Player'));
    stays.forEach(function (s, i) { hr.appendChild(el('th', 'num', String(i + 1))); });
    hr.appendChild(el('th', 'num', 'Day'));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    players.slice().sort(function (a, b) { return (b.total || 0) - (a.total || 0); }).forEach(function (p) {
      var tr = el('tr', p.played ? null : 'is-empty');
      var td = el('td');
      var nm = el('span', 'name');
      nm.appendChild(avatar(byId[p.id] || { id: p.id }));
      nm.appendChild(el('span', null, nameOf(p.id) + (p.id === ME ? ' (you)' : '')));
      td.appendChild(nm);
      tr.appendChild(td);
      stays.forEach(function (s, i) {
        var r = (p.results || [])[i];
        var cell = el('td', 'num');
        if (!r) cell.textContent = p.played ? '—' : '·';
        else {
          cell.appendChild(el('span', null, String(r.pts)));
          if (r.host) cell.appendChild(el('span', 'muted', ' ⌂'));
        }
        tr.appendChild(cell);
      });
      tr.appendChild(el('td', 'num', p.played ? commas(p.total || 0) : '—'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var tw = el('div', 'panel panel--table');
    tw.appendChild(el('p', 'panel__label', 'The scores · ⌂ marks a round that was theirs'));
    tw.appendChild(table);
    wrap.appendChild(tw);

    // Each stay: the place, who was there, the story, who hosted it, the best
    // and worst pins, and one tap on the worst.
    stays.forEach(function (s, i) {
      var panel = el('div', 'panel');
      panel.appendChild(el('p', 'panel__label', 'Stay ' + (i + 1)));
      var h = el('p', 'panel__h', s.place);
      panel.appendChild(h);
      var bits = [];
      if (s.when) bits.push(s.when);
      bits.push((s.crew || []).map(nameOf).join(' + '));
      if (s.others) bits.push('+' + s.others + ' not playing');
      panel.appendChild(el('p', 'panel__p mono', bits.join(' · ')));
      if (s.story) panel.appendChild(storyNode(s, s.photo));

      var pins = [];
      players.forEach(function (p) {
        var r = (p.results || [])[i];
        if (r && !r.host && typeof r.dist === 'number') pins.push({ id: p.id, dist: r.dist, pts: r.pts });
      });
      pins.sort(function (a, b) { return a.dist - b.dist; });
      var ledger = el('div', 'ledger');
      if (pins.length) {
        ledger.appendChild(ledgerRow('Closest', nameOf(pins[0].id) + ' · ' + fmtMiles(pins[0].dist)));
        if (pins.length > 1) {
          var worst = pins[pins.length - 1];
          var v = el('span', 'rrow__v');
          v.appendChild(document.createTextNode(nameOf(worst.id) + ' · ' + fmtMiles(worst.dist) + ' '));
          if (worst.id !== ME && j.everyone) {
            var rb = el('button', 'btn btn--ghost btn--sm btn--mono', reacted(j, worst.id, i) ? 'Seen' : '👀');
            rb.type = 'button';
            rb.title = 'Let them know you saw that';
            rb.disabled = reacted(j, worst.id, i);
            rb.addEventListener('click', function () {
              rb.disabled = true;
              api('/api/react', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ owner: ME, day: j.day, target: worst.id, round: i }),
              }).then(function () { rb.textContent = 'Seen'; });
            });
            v.appendChild(rb);
          }
          ledger.appendChild(ledgerRow('Furthest', v));
        }
      }
      var hosts = players.filter(function (p) { var r = (p.results || [])[i]; return r && r.host; });
      if (hosts.length) {
        ledger.appendChild(ledgerRow('Hosted by', hosts.map(function (p) {
          var r = p.results[i];
          return nameOf(p.id) + ' (' + (r.label || 'host round') + ' · ' + r.pts + ')';
        }).join(' · ')));
      }
      if (s.stats && s.stats.plays) {
        ledger.appendChild(ledgerRow('All time', s.stats.plays + ' played · avg ' + fmtMiles(s.stats.avg) + ' off' +
          (s.stats.best != null ? ' · best ' + fmtMiles(s.stats.best) : '') +
          (s.stats.near500 === 0 ? ' · nobody inside 500' : '')));
      }
      if (s.flag) ledger.appendChild(ledgerRow(s.flag.k, s.flag.v));
      panel.appendChild(ledger);
      wrap.appendChild(panel);
    });

    // Calls, settled or pending.
    if (j.calls && j.calls.length) {
      var cp = el('div', 'panel');
      cp.appendChild(el('p', 'panel__label', 'Calls'));
      j.calls.forEach(function (c) {
        var s = stayById[c.id] || {};
        var text = nameOf(c.owner) + ' said ' + (c.call === 'wont' ? 'nobody' : 'somebody') +
          ' gets within 500 miles of ' + (s.place || 'their stay') + '. ';
        if (c.result === 'held') text += 'Right.';
        else if (c.result === 'broke') text += 'Wrong. ' + nameOf(c.by) + ' got ' + fmtMiles(c.miles) + '.';
        else text += 'Not settled yet.';
        cp.appendChild(el('p', 'panel__p', text));
      });
      wrap.appendChild(cp);
    }

    if (j.goal) {
      var g = el('p', 'shell-foot');
      g.textContent = 'The deck holds ' + j.goal.deck + ' of the ' + j.goal.target +
        ' stays a season needs · ' + j.goal.stories + (j.goal.stories === 1 ? ' has' : ' have') + ' a line on the back';
      wrap.appendChild(g);
    }

    wrap.appendChild(backButton());
  }

  function reacted(j, target, round) {
    return (j.reactions || []).some(function (r) { return r.from === ME && r.to === target && r.round === round; });
  }

  /* ------------------------------------------------------------ record --

     Funny first, accurate second. Everything here comes from the server's
     record of what you actually did, plus the deck's own oddities.
  */

  function showRecord() {
    var wrap = showPage('record');
    wrap.replaceChildren();
    wrap.appendChild(el('p', 'sum__label', 'Your record'));
    var note = el('p', 'msg', 'Fetching…');
    wrap.appendChild(note);
    api('/api/history?owner=' + encodeURIComponent(ME))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        wrap.replaceChildren();
        wrap.appendChild(el('p', 'sum__label', 'Your record · since No. 1'));
        if (!j) { wrap.appendChild(el('p', 'msg msg--bad', 'Could not reach the server.')); wrap.appendChild(backButton()); return; }
        paintRecord(wrap, j);
      })
      .catch(function () { note.textContent = 'Could not reach the server.'; wrap.appendChild(backButton()); });
  }

  var UNITS = [
    { one: 'lap of the equator', many: 'laps of the equator', mi: 24901 },
    { one: 'trip to the Moon', many: 'trips to the Moon', mi: 238855 },
    { one: 'London-to-Sydney round trip', many: 'London-to-Sydney round trips', mi: 21200 },
    { one: 'length of the Nile', many: 'lengths of the Nile', mi: 4130 },
    { one: 'Channel crossing', many: 'Channel crossings', mi: 21 },
  ];

  function fmtLatLng(lat, lng) {
    return Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' +
           Math.abs(lng).toFixed(1) + '°' + (lng >= 0 ? 'E' : 'W');
  }

  function paintRecord(wrap, j) {
    var days = j.days || [];
    var rounds = [];
    days.forEach(function (d) { (d.rounds || []).forEach(function (r) { r.day = d.day; rounds.push(r); }); });
    var normal = rounds.filter(function (r) { return !r.host && typeof r.dist === 'number'; });

    var tiles = el('div', 'sum__stats');
    var st = load('stats', {});
    [['Played', days.length], ['Streak', st.streak || 0], ['Best run', st.max || 0], ['Best day', commas(st.best || 0)]]
      .forEach(function (pair) {
        var b = el('div', 'stat');
        b.appendChild(el('span', 'stat__n', String(pair[1])));
        b.appendChild(el('span', 'stat__k', pair[0]));
        tiles.appendChild(b);
      });
    wrap.appendChild(tiles);

    if (j.titles && j.titles.length) {
      var tp = el('div', 'panel');
      tp.appendChild(el('p', 'panel__label', 'Awarded'));
      j.titles.forEach(function (t) {
        tp.appendChild(el('p', 'panel__h', t));
      });
      wrap.appendChild(tp);
    }

    var fun = el('div', 'panel');
    fun.appendChild(el('p', 'panel__label', 'The numbers, honestly'));
    var ledger = el('div', 'ledger');
    if (normal.length) {
      var off = normal.reduce(function (a, r) { return a + r.dist; }, 0);
      var unit = UNITS[days.length % UNITS.length];
      var inUnits = off / unit.mi;
      ledger.appendChild(ledgerRow('Wrong by', fmtMiles(off) + ' in total · ' +
        (inUnits >= 1 ? (Math.round(inUnits * 10) / 10) + ' ' + (Math.round(inUnits * 10) === 10 ? unit.one : unit.many)
          : Math.round(inUnits * 100) + '% of a ' + unit.one)));
      var bulls = normal.filter(function (r) { return r.dist <= CFG.BULLSEYE; }).length;
      ledger.appendChild(ledgerRow('Bullseyes', bulls + ' of ' + normal.length));
      var worst = normal.slice().sort(function (a, b) { return b.dist - a.dist; })[0];
      if (worst) ledger.appendChild(ledgerRow('Furthest', fmtMiles(worst.dist) + ' from ' + (worst.place || 'it') + ' · No. ' + (worst.day + 1)));
      var confident = normal.filter(function (r) { return r.whoCorrect && r.dist > 2000; })[0];
      if (confident) ledger.appendChild(ledgerRow('Confidently wrong', 'Named the whole party, then put them ' + fmtMiles(confident.dist) + ' away'));
      var hemis = { N: 0, S: 0, E: 0, W: 0 };
      normal.forEach(function (r) { if (r.lat > 0) hemis.N++; else hemis.S++; if (r.lng > 0) hemis.E++; else hemis.W++; });
      var never = Object.keys(hemis).filter(function (k) { return !hemis[k]; });
      if (never.length && normal.length >= 6) {
        ledger.appendChild(ledgerRow('Never pinned', never.map(function (k) {
          return { N: 'the northern hemisphere', S: 'the southern hemisphere', E: 'the eastern hemisphere', W: 'the western hemisphere' }[k];
        }).join(' or ')));
      }
      if (j.centre) {
        ledger.appendChild(ledgerRow('Your centre', j.centre.name
          ? Math.round(j.centre.miles) + ' mi from ' + j.centre.name
          : fmtLatLng(j.centre.lat, j.centre.lng)));
      }
      if (j.passport) ledger.appendChild(ledgerRow('Been to', j.passport.count + ' of ' + j.passport.deck + ' stays inside 50 mi'));
    } else {
      ledger.appendChild(ledgerRow('So far', 'Nothing on record yet. Play a day.'));
    }
    if (j.blamed && j.blamed.length) {
      ledger.appendChild(ledgerRow('Most blamed', j.blamed.map(function (b) { return nameOf(b.id) + ' ×' + b.n; }).join(' · ')));
    }
    if (j.beat) {
      ledger.appendChild(ledgerRow('Days you beat', Object.keys(j.beat).map(function (id) { return nameOf(id) + ' ' + j.beat[id]; }).join(' · ') || 'nobody yet'));
    }
    fun.appendChild(ledger);
    wrap.appendChild(fun);

    // The personal centre of gravity, drawn.
    if (j.centre && window.StayMap) {
      var mp = el('div', 'panel');
      mp.appendChild(el('p', 'panel__label', 'Where you think everything is'));
      var host = el('div', 'mapwrap');
      host.style.aspectRatio = '16 / 8';
      var inner = el('div');
      inner.setAttribute('aria-label', 'Your average pin');
      host.appendChild(inner);
      mp.appendChild(host);
      wrap.appendChild(mp);
      setTimeout(function () {
        var m2 = StayMap.create(inner, { onPick: function () {} });
        m2.setInteractive(false);
        m2.showAnswer(j.centre.lat, j.centre.lng, 'you, on average');
        normal.slice(-30).forEach(function (r) { if (typeof r.lat === 'number') m2.setGuess(r.lat, r.lng); });
        m2.refresh();
      }, 40);
    }

    // The standing: whose cards beat the group hardest. Volume counts.
    if (j.curators && j.curators.length) {
      var cp = el('div', 'panel');
      cp.appendChild(el('p', 'panel__label', 'The standing · whose stays catch most'));
      var table = el('table', 'hairtable');
      var th = el('tr');
      ['Player', 'Stays', 'Played', 'Avg off', 'Per stay', 'Score'].forEach(function (h, i) { th.appendChild(el('th', i ? 'num' : null, h)); });
      var thead = el('thead'); thead.appendChild(th); table.appendChild(thead);
      var tb = el('tbody');
      j.curators.forEach(function (c) {
        var tr = el('tr');
        var td = el('td');
        var nm = el('span', 'name');
        nm.appendChild(avatar(byId[c.owner] || { id: c.owner }));
        nm.appendChild(el('span', null, nameOf(c.owner)));
        td.appendChild(nm);
        tr.appendChild(td);
        tr.appendChild(el('td', 'num', String(c.cards)));
        tr.appendChild(el('td', 'num', String(c.plays)));
        tr.appendChild(el('td', 'num', c.plays ? fmtMiles(c.avg) : '—'));
        tr.appendChild(el('td', 'num', c.perStay ? String(Math.round(c.perStay)) : '—'));
        tr.appendChild(el('td', 'num', commas(Math.round(c.resistance))));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      cp.appendChild(table);
      cp.appendChild(el('p', 'shell-foot', 'The score sums every stay of yours that has been played, so more stays beats fewer. Per stay is the same thing divided, for anyone who put in three. Neither touches the daily score.'));
      wrap.appendChild(cp);
    }

    if (j.records && j.records.length) {
      var rp = el('div', 'panel');
      rp.appendChild(el('p', 'panel__label', 'The deck, on record'));
      var rl = el('div', 'ledger');
      j.records.forEach(function (r) { rl.appendChild(ledgerRow(r.k, r.v)); });
      rp.appendChild(rl);
      wrap.appendChild(rp);
    }

    wrap.appendChild(backButton());
  }

  // ---------------------------------------------------------- need stays --

  // Importing is the price of entry. This is the one screen a player who has
  // signed in but owns nothing in the pool lands on: why, what it takes, and
  // the way there in one tap.
  function showNeedStays() {
    var wrap = showPage('needstays');
    wrap.replaceChildren();
    var e = el('div', 'empty');
    e.appendChild(el('div', 'empty__hatch', 'No stays of yours yet'));
    e.appendChild(el('p', 'empty__label', 'Not in the deck yet'));
    e.appendChild(el('p', 'empty__h', 'Everyone plays everyone’s stays.'));
    e.appendChild(el('p', 'empty__p', 'So the game needs at least one of yours before it deals you in. One is enough. Forty is better, because every one you add is a trap the others will walk into.'));
    var a = el('a', 'btn btn--wide', 'Add your stays →');
    a.href = setupLink();
    e.appendChild(a);
    e.appendChild(el('p', 'empty__foot', 'About four minutes · never used Airbnb? There is a by-hand option'));
    wrap.appendChild(e);
  }

  // --------------------------------------------------------------- share --

  var EMPTY_SQ = '⬜';
  // Bands in miles, so the bar means the same thing to everyone reading it:
  // colour follows length by construction. Warm is near, cold is far.
  var BAR_MILES = [50, 150, 400, 1000, 3000];      // 5,4,3,2,1 squares
  var BAR_SQ = ['🟩', '🟩', '🟨', '🟧', '🟦'];      // by fill count, 5 down to 1

  function proximityBar(miles) {
    if (typeof miles !== 'number' || !isFinite(miles)) return EMPTY_SQ.repeat(5);
    var filled = 0;
    for (var b = 0; b < BAR_MILES.length; b++) {
      if (miles <= BAR_MILES[b]) { filled = 5 - b; break; }
    }
    if (!filled) return EMPTY_SQ.repeat(5);
    var sq = BAR_SQ[5 - filled];
    var out = '';
    for (var i = 0; i < 5; i++) out += (i < filled ? sq : EMPTY_SQ);
    return out;
  }

  // THE GRID MUST NOT SAY WHICH ROUNDS WERE YOURS.
  //
  // A host round fires when you are in the stay's crew, so marking one tells
  // anyone who has not played yet exactly who to tick. Every row renders
  // identically whatever the question was, and every round counts toward the
  // tail — leaving host rounds out leaked them by subtraction.
  function gridText(results, dayIndex, streak) {
    var tot = totalScore(results);
    var lines = ['TripPin #' + (dayIndex + 1) + ' · ' + commas(tot)];
    results.forEach(function (r) {
      // Two formats are a pin and nothing else, so they have no judgement
      // half to report and would show a cross every time — which is itself
      // the tell this is meant to remove. Those grade the mark off the pin.
      var who;
      if (r.host && r.kind === 'pin') {
        who = r.wherePts >= 680 ? '✔' : (r.wherePts >= 250 ? '~' : '✘');
      } else {
        who = r.whoCorrect ? '✔' : (r.whoPts ? '~' : '✘');
      }
      lines.push('📌 ' + proximityBar(r.dist) + ' ' +
                 (typeof r.dist === 'number' ? fmtMiles(r.dist) : '—') + ' ' + who);
    });
    var dists = results.filter(function (r) { return typeof r.dist === 'number'; })
      .map(function (r) { return r.dist; });
    var tail = '';
    if (dists.length) {
      var best = Math.min.apply(null, dists);
      var off = dists.reduce(function (a, b) { return a + b; }, 0);
      tail = '🧭 best ' + fmtMiles(best) + ' · ' + fmtMiles(off) + ' off';
    }
    if (streak > 1) tail += (tail ? ' · ' : '') + '🔥' + streak;
    if (tail) lines.push(tail);
    return lines.join('\n');
  }

  function shareText(withLink) {
    var st = load('stats', null);
    var text = gridText(state.results.filter(Boolean), state.dayIndex, st ? st.streak : 0);
    if (withLink !== false) text += '\n' + shareLink();
    return text;
  }

  function doShare(btn) {
    var text = outgoingText();
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ text: text }).then(done).catch(function () { copy(text, done); });
    } else {
      copy(text, done);
    }
  }

  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    var ta = el('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copy your result:', text); }
    document.body.removeChild(ta);
  }

  // ------------------------------------------------------------ persist ---

  function persist() {
    if (state.mode !== 'daily') return;
    save('day', { dayIndex: state.dayIndex, round: state.round, phase: state.phase, results: state.results });
  }

  function restore() {
    // Online the Worker is the record of what was answered; this only
    // restores the offline file.
    if (online()) return false;
    var d = load('day', null);
    if (!d || d.dayIndex !== state.dayIndex) return false;
    state.results = (d.results || []).filter(Boolean);
    state.round = Math.min(d.round || 0, state.stays.length - 1);
    if (state.results.length >= state.stays.length) { state.phase = 'done'; return 'done'; }
    state.round = state.results.length;
    return true;
  }

  /* --------------------------------------------------------------- sign in --

     Two locks doing different jobs. The word says you are one of us and keeps
     the internet out; this says which one of us you are, so the game can tell
     when it has dealt you your own bed.
  */

  function api(path, opts) {
    opts = opts || {};
    var h = { 'x-trippin-key': word || '' };
    // Headers are Latin-1; the passcode is two emoji. Encode it or the fetch
    // throws before it is sent.
    if (MEPASS) h['x-trippin-pass'] = encodeURIComponent(MEPASS);
    opts.headers = Object.assign(h, opts.headers || {});
    return fetch(path, opts);
  }

  function rememberMe(id, pass) { save('me', { id: id, pass: pass }); }
  function forgetMe() { save('me', null); ME = null; MEPASS = null; }

  function signIn(done) {
    var saved = load('me', null);
    if (!online()) {
      // The local file has no server to ask. ?me=player1 says who is playing so
      // host rounds can be looked at without deploying.
      try { ME = new URLSearchParams(location.search).get('me') || null; } catch (e) { /* old */ }
      return done(false);
    }
    if (saved && saved.id && saved.pass) {
      ME = saved.id;
      MEPASS = saved.pass;
      // Confirm rather than trust: a reset passcode should not leave somebody
      // silently playing as a name they no longer hold.
      return api('/api/me?owner=' + encodeURIComponent(saved.id))
        .then(function (r) {
          if (r.ok) return done(true);
          forgetMe();
          return askWho(done);
        })
        .catch(function () { return done(true); });   // offline: trust the cache
    }
    return askWho(done);
  }

  function setupLink() {
    return '/import' + (word ? '?k=' + encodeURIComponent(word) : '');
  }

  function sendToSetup(err, lead) {
    err.hidden = false;
    err.replaceChildren();
    err.appendChild(document.createTextNode(lead + ' '));
    var a = el('a', null, 'Add your stays →');
    a.href = setupLink();
    err.appendChild(a);
  }

  function askWho(done) {
    api('/api/crew')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var claimed = {};
        ((j && j.crew) || []).forEach(function (p) { claimed[p.id] = !!p.claimed; });
        CREW.forEach(function (p) { if (j && j.crew) p.claimed = !!claimed[p.id]; });
      })
      .catch(function () { /* offline: every name looks available */ })
      .then(function () { paintWho(done); });
  }

  function paintWho(done) {
    var box = $('#signin');
    box.hidden = false;
    document.body.classList.add('is-signin');
    box.replaceChildren();

    var inner = el('div', 'signin__box');
    var brand = el('div', 'signin__brand');
    brand.innerHTML = '<svg class="mark" width="30" height="30" viewBox="0 0 34 34" aria-hidden="true"><line class="mark__thread" x1="8.5" y1="24.5" x2="25.5" y2="9.5" stroke-width="2.6"/><circle class="mark__answer" cx="25.5" cy="9.5" r="5.2"/><circle class="mark__guess" cx="8.5" cy="24.5" r="4.4" stroke-width="2.6"/></svg>';
    brand.appendChild(el('span', 'signin__name', 'TripPin'));
    inner.appendChild(brand);
    inner.appendChild(el('p', 'signin__sub', 'Places we actually stayed. Work out who was there, then find it on the map.'));
    inner.appendChild(el('p', 'label', 'Which one are you?'));

    var list = el('div', 'signin__crew');
    inner.appendChild(list);

    var padWrap = el('div', 'signin__pad');
    padWrap.hidden = true;
    inner.appendChild(padWrap);

    var err = el('p', 'signin__err');
    err.hidden = true;
    inner.appendChild(err);

    var skip = el('button', 'signin__skip', 'Not set up yet');
    skip.type = 'button';
    skip.addEventListener('click', function () {
      sendToSetup(err, 'Takes a few minutes: pick your name, pick an animal, paste your trips.');
    });
    inner.appendChild(skip);
    box.appendChild(inner);

    var chosen = null;
    var pad = null;

    CREW.forEach(function (p) {
      var b = el('button', 'who');
      b.type = 'button';
      var top = el('span', 'who__top');
      top.appendChild(avatar(p));
      b.appendChild(top);
      b.appendChild(el('span', 'who__name', p.name));
      if (p.claimed === false) {
        b.classList.add('is-unset');
        b.appendChild(el('span', 'who__unset', 'not set up'));
      }
      b.addEventListener('click', function () {
        chosen = p.id;
        err.hidden = true;
        if (p.claimed === false) {
          padWrap.hidden = true;
          return sendToSetup(err, 'You have not set up yet.');
        }
        $$('.who', list).forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        padWrap.hidden = false;
        padWrap.replaceChildren();
        padWrap.appendChild(el('p', 'label signin__ask', 'Sign in as ' + p.name));
        var host = el('div');
        padWrap.appendChild(host);
        pad = window.EmojiCode.create(host, {
          onComplete: function (code) { attempt(chosen, code); },
        });
      });
      list.appendChild(b);
    });

    function attempt(id, code) {
      err.hidden = true;
      ME = id;
      MEPASS = code;
      api('/api/me?owner=' + encodeURIComponent(id))
        .then(function (r) {
          if (r.ok) {
            rememberMe(id, code);
            box.hidden = true;
            document.body.classList.remove('is-signin');
            return done(true);
          }
          return r.json().catch(function () { return {}; }).then(function (j) {
            ME = null; MEPASS = null;
            if (pad) pad.clear();
            if (r.status === 409) {
              sendToSetup(err, 'Nobody has set up as ' + (byId[id] || {}).name + ' yet.');
            } else {
              err.hidden = false;
              err.textContent = j.error || 'That is not it.';
            }
          });
        })
        .catch(function () {
          ME = null; MEPASS = null;
          err.hidden = false;
          err.textContent = 'Could not reach the server.';
        });
    }
  }

  function paintWhoami() {
    var n = $('#whoami');
    if (!n) return;
    n.replaceChildren();
    var p = ME ? byId[ME] : null;
    n.hidden = !p;
    if (!p) return;
    n.appendChild(avatar(p, 'sm'));
    n.appendChild(el('span', null, p.name));
    if (isPro()) n.appendChild(el('span', 'whoami__pro', 'Pro'));
    n.title = 'Not you? Tap to switch.';
    n.setAttribute('aria-label', 'Signed in as ' + p.name + '. Tap to switch.');
    n.onclick = function () { forgetMe(); location.reload(); };
  }

  // ---------------------------------------------------------------- gate ---
  //
  // Soft entry, and deliberately not checked here: the page holds no word at
  // all. Whatever we have is sent to the server, and a wrong one gets a 401
  // that counts against the server's wrong-guess limiter. Arriving with
  // ?k=<word> lets someone straight in and is remembered.

  var wordFromUrl = false;

  function firstWord() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('k'); } catch (e) { /* old */ }
    if (fromUrl) {
      scrubKeyFromUrl();
      wordFromUrl = true;
      return fromUrl.trim();
    }
    return load('key', null) || SETTINGS.key || null;
  }

  // Take the word back out of the address bar so it does not ride along into
  // screenshots, history, or anything the browser syncs.
  function scrubKeyFromUrl() {
    try {
      var u = new URL(location.href);
      if (!u.searchParams.has('k')) return;
      u.searchParams.delete('k');
      var q = u.searchParams.toString();
      history.replaceState(null, '', u.pathname + (q ? '?' + q : '') + u.hash);
    } catch (e) { /* fine */ }
  }

  var gateWired = false;

  function showGate(onPass, why) {
    document.body.classList.add('is-gated');
    $('#gate').hidden = false;
    var input = $('#gateIn');
    var err = $('#gateErr');
    if (why) { err.textContent = why; err.hidden = false; }
    input.focus({ preventScroll: true });
    if (gateWired) return;
    gateWired = true;
    $('#gateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#gateForm').querySelector('button');
      var typed = input.value.trim();
      if (!typed) return;
      input.disabled = true;
      if (btn) btn.disabled = true;
      err.hidden = true;
      word = typed;
      loadPool().then(function (status) {
        input.disabled = false;
        if (btn) btn.disabled = false;
        if (status === 'ok' || status === 'empty') {
          save('key', typed);
          document.body.classList.remove('is-gated');
          $('#gate').hidden = true;
          if (!CREW.length) return emptyState();
          onPass();
          return;
        }
        word = null;
        err.textContent = status === 'slow' ? 'Too many tries. Wait a few minutes.'
          : status === 'offline' ? 'Could not reach the server. Try again.' : "That's not it.";
        err.hidden = false;
        input.select();
      });
    });
  }

  function shareLink() {
    var base = SETTINGS.shareUrl || (location.origin + location.pathname);
    // Whoever is sharing got in, so they have the word legitimately.
    if (word) base += (base.indexOf('?') === -1 ? '?' : '&') + 'k=' + encodeURIComponent(word);
    return base;
  }

  // ----------------------------------------------------------------- pro --
  //
  // TripPin Pro: a paid tier that is not paid, is not a tier, and does not
  // move a score by a single point. It is a bit between five people.
  //
  // Every perk is real and every perk is worthless, which is the whole joke.
  // Two of them describe what the free game has always done — you could
  // always move your pin, and you could always edit the text after pasting
  // it. One awards a feeling. One is a sticker. Nothing in here goes near
  // /api/guess, the grid's anti-spoiler rules, or anybody else's screen, and
  // the subscription itself is one line of this device's storage.
  //
  // It is also deliberately cheap to be near, because the game has to stay
  // playable every morning for two years: one pitch, once, after a finished
  // day, then a strip on every third summary, dismissible. The way back in is
  // a row at the foot of the help modal. Nothing ever sits on the puzzle.

  var PRO_PERKS = [
    { k: 'Unlimited Guesses™',
      v: 'Move your pin as many times as you like before locking it in.',
      n: 'Free users may also do this.' },
    { k: 'Instant Win™',
      v: 'Declare victory on any round, whatever the pin actually did.',
      n: 'Does not touch your score.' },
    { k: 'Share Studio™',
      v: 'Rewrite your result before you copy it.',
      n: 'You could always do this.' },
    { k: 'The badge',
      v: 'PRO, beside your name, in gold.',
      n: 'Nobody else can see it.' },
  ];

  var PITCHES = [
    'Pro players move their pin as many times as they like.',
    'Instant Win™ settles the argument about whether that counted.',
    'Your result, but worded better. That is Share Studio™.',
    'Four guesses is a free-plan number.',
    'Pro is $0.00 a month and it always will be.',
  ];

  var WON_NOTES = [
    'Victory recorded on this device. Nobody has been told.',
    'You have won this round. The scoreboard is unmoved.',
    'Congratulations. Nothing has happened.',
    'Logged, filed, and never read.',
  ];

  function proPlan() { return load('pro', null); }
  function isPro() { return !!proPlan(); }

  function setPro(on) {
    save('pro', on ? { since: state.dayIndex, at: Date.now() } : null);
    applyPro();
    if (!$('#summary').hidden) showSummary();
  }

  function applyPro() {
    document.body.classList.toggle('is-pro', isPro());
    paintWhoami();
    paintProLink();
    paintGuesses();
  }

  // The counter exists only to make a shrug look like a feature, so it stays
  // out of the way until the pin has actually moved.
  function paintGuesses() {
    var n = $('#proguess');
    if (!n) return;
    var show = isPro() && state.phase === 'guessing' && state.guesses > 0;
    n.hidden = !show;
    if (show) n.textContent = 'Guesses ' + state.guesses + ' / ∞';
  }

  function paintProLink() {
    var n = $('#prolink');
    if (!n) return;
    var on = isPro();
    n.hidden = false;
    n.replaceChildren();
    n.appendChild(el('span', 'prolink__k', on ? 'TripPin Pro · active' : 'TripPin Pro'));
    n.appendChild(el('span', 'prolink__go', on ? 'Manage →' : 'See plans →'));
    n.appendChild(el('span', 'prolink__v', on
      ? 'Unlimited Guesses™, Instant Win™ and Share Studio™ are on.'
      : 'Unlimited Guesses™, Instant Win™, Share Studio™. $0.00 a month.'));
    n.onclick = function () { closeModals(); openPro(); };
  }

  function openPro() {
    save('pitch', true);          // they found it themselves; never pitch now
    proModal();
    openModal('modal-pro');
  }

  function proModal() {
    var box = $('#proBody');
    if (!box) return;
    box.replaceChildren();
    var on = isPro();

    box.appendChild(el('p', 'pro__kicker', on ? 'TripPin Pro · active' : 'TripPin Pro'));
    var h = el('h2', 'pro__h', on ? 'You are a Pro.' : 'You are on the free plan.');
    h.id = 'proTitle';
    box.appendChild(h);
    box.appendChild(el('p', 'pro__sub', on
      ? 'Thank you for supporting independent guessing software.'
      : 'Serious players unlock the whole board. Everybody else keeps guessing the hard way.'));

    if (!on) {
      var price = el('div', 'pro__price');
      price.appendChild(el('span', 'pro__was', '$4.99'));
      price.appendChild(el('span', 'pro__now', '$0.00'));
      price.appendChild(el('span', 'pro__per', '/ month'));
      price.appendChild(el('span', 'pro__tag', 'Launch offer'));
      box.appendChild(price);
      box.appendChild(el('p', 'pro__note',
        'Billed never · renews never · cancelled with the same button'));
    }

    var list = el('ul', 'pro__feats');
    PRO_PERKS.forEach(function (f) {
      var li = el('li', 'profeat' + (on ? ' is-on' : ''));
      var t = el('div');
      t.appendChild(el('span', 'profeat__k', f.k));
      t.appendChild(el('span', 'profeat__v', f.v));
      t.appendChild(el('span', 'profeat__n', f.n));
      li.appendChild(t);
      list.appendChild(li);
    });
    box.appendChild(list);

    if (on) {
      var meta = el('div', 'pro__meta');
      [['Member since', 'No. ' + ((proPlan().since || 0) + 1)], ['Next bill', 'Never']]
        .forEach(function (pair) {
          var tile = el('div', 'stat');
          tile.appendChild(el('span', 'stat__n', pair[1]));
          tile.appendChild(el('span', 'stat__k', pair[0]));
          meta.appendChild(tile);
        });
      box.appendChild(meta);

      var off = el('button', 'btn btn--ghost btn--wide', 'Cancel subscription');
      off.type = 'button';
      off.style.marginTop = '16px';
      off.addEventListener('click', function () { setPro(false); proModal(); });
      box.appendChild(off);

      box.appendChild(el('p', 'pro__fine',
        'Still a joke. Nothing was charged, nothing left this browser, and your score is '
        + 'exactly what it would have been. Billing questions go to Ben, who is asleep.'));
      return;
    }

    var go = el('button', 'btn btn--wide pro__cta', 'Upgrade — $0.00');
    go.type = 'button';
    go.addEventListener('click', function () { setPro(true); proModal(); });
    box.appendChild(go);

    var no = el('button', 'btn btn--ghost btn--wide', 'Stay on the free plan');
    no.type = 'button';
    no.style.marginTop = '7px';
    no.addEventListener('click', closeModals);
    box.appendChild(no);

    box.appendChild(el('p', 'pro__fine',
      'TripPin Pro is a joke. Nothing is charged, no card is asked for, and nothing leaves '
      + 'this browser — the whole subscription is one line in this device’s storage. It '
      + 'cannot move your score, and nobody else can see it.'));
  }

  // One pitch, ever, and it waits for a finished day so it never lands on the
  // puzzle or on top of the first-run help.
  function maybePitch() {
    if (state.mode !== 'daily' || isPro() || load('pitch', false)) return;
    setTimeout(function () {
      if (document.body.classList.contains('modal-open')) return;
      if ($('#summary').hidden) return;
      openPro();
    }, 1200);
  }

  // Every third day, and only once the pitch has happened, so the first thing
  // anybody sees about Pro is the pitch rather than a strip.
  function proBanner() {
    if (isPro() || !load('pitch', false)) return null;
    if (state.dayIndex % 3 !== 0) return null;
    if (load('probanner', null) === state.dayIndex) return null;

    var bar = el('div', 'probanner');
    bar.appendChild(el('span', 'probanner__k', 'Pro'));
    bar.appendChild(el('span', 'probanner__t',
      PITCHES[hashStr('p' + state.dayIndex) % PITCHES.length]));

    var go = el('button', 'probanner__go', 'See plans');
    go.type = 'button';
    go.addEventListener('click', openPro);
    bar.appendChild(go);

    var x = el('button', 'probanner__x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Not today');
    x.addEventListener('click', function () { save('probanner', state.dayIndex); bar.remove(); });
    bar.appendChild(x);
    return bar;
  }

  // Instant Win. Nothing in here carries .btn, so the reveal's
  // focus-the-first-button still finds Next.
  function proWin() {
    if (!isPro()) return null;
    var box = el('div', 'prowin');
    box.appendChild(el('span', 'prowin__k', 'Instant Win™'));
    var go = el('button', 'prowin__go', 'Declare victory');
    go.type = 'button';
    box.appendChild(go);
    var note = el('p', 'prowin__n',
      'Included with Pro. Available on every round, including the ones that went badly.');
    box.appendChild(note);
    go.addEventListener('click', function () {
      box.classList.add('is-won');
      box.replaceChild(el('span', 'prowin__stamp', 'Won'), go);
      note.textContent = WON_NOTES[hashStr('w' + state.dayIndex + ':' + state.round) % WON_NOTES.length];
    });
    return box;
  }

  // Share Studio: if a Pro has rewritten the grid, that is what goes out. The
  // link still rides along, because the link was never the part being edited.
  function outgoingText() {
    var pre = $('#sumGrid');
    if (isPro() && pre && pre.isContentEditable) {
      return pre.textContent.replace(/\s+$/, '') + '\n' + shareLink();
    }
    return shareText(true);
  }

  // ------------------------------------------------------------- modals ---

  function openModal(id) {
    var m = $('#' + id);
    if (!m) return;
    m.hidden = false;
    document.body.classList.add('modal-open');
    var f = m.querySelector('[data-close], button');
    if (f) f.focus({ preventScroll: true });
  }
  function closeModals() {
    $$('.modal').forEach(function (m) { m.hidden = true; });
    document.body.classList.remove('modal-open');
  }

  function buildHelp() {
    var perfect = $('#perfectDay');
    if (perfect) perfect.textContent = commas(CFG.ROUNDS * (CFG.WHERE_MAX + CFG.WHO_MAX));
    var perRound = $('#roundCount');
    if (perRound) perRound.textContent = ['One', 'Two', 'Three', 'Four', 'Five'][CFG.ROUNDS - 1] || String(CFG.ROUNDS);

    var list = $('#crewTells');
    if (!list) return;
    list.replaceChildren();
    CREW.forEach(function (p) {
      var li = el('li', 'tell');
      var head = el('div', 'tell__head');
      head.appendChild(avatar(p));
      head.appendChild(el('span', 'tell__name', p.name));
      var count = el('span', 'tell__count', String(p.stays || 0));
      count.appendChild(el('span', null, '/' + (DECK || '—')));
      head.appendChild(count);
      li.appendChild(head);
      var written = p.tell && !/^TODO/i.test(p.tell);
      if (written) li.appendChild(el('p', 'tell__text', '“' + p.tell + '”'));
      else li.appendChild(el('p', 'tell__text tell__text--counted', p.stays ? p.stays + ' in the deck · nothing written yet' : 'Nothing sent in yet'));
      list.appendChild(li);
    });
    paintProLink();
  }

  function buildStats() {
    var body = $('#statsBody');
    var st = load('stats', { played: 0, streak: 0, max: 0, best: 0, totals: [] });
    body.replaceChildren();
    var since = $('#statsSince');
    if (since) since.textContent = 'Since No. 1';

    var row = el('div', 'sum__stats');
    row.style.marginTop = '0';
    row.style.borderTop = '0';
    row.style.paddingTop = '0';
    [['Played', st.played], ['Streak', st.streak], ['Best run', st.max || 0], ['Best day', commas(st.best || 0)]].forEach(function (p) {
      var b = el('div', 'stat');
      b.appendChild(el('span', 'stat__n', String(p[1])));
      b.appendChild(el('span', 'stat__k', p[0]));
      row.appendChild(b);
    });
    body.appendChild(row);

    var totals = st.totals || [];
    if (totals.length) {
      body.appendChild(el('p', 'modal__h3', 'Recent days'));
      var chart = el('div', 'spark');
      var slice = totals.slice(-24);
      slice.forEach(function (t, i) {
        var b = el('i', 'spark__b is-band-' + band((t / (CFG.ROUNDS * 1000)) * CFG.WHERE_MAX));
        b.style.height = Math.max(4, (t / (CFG.ROUNDS * 1000)) * 100) + '%';
        if (i === slice.length - 1 && st.last === state.dayIndex) b.classList.add('is-today');
        b.title = commas(t);
        chart.appendChild(b);
      });
      body.appendChild(chart);
      body.appendChild(el('p', 'fineprint', 'Each bar is a day, coloured by its band. Today is outlined.'));
    } else {
      body.appendChild(el('p', 'fineprint', 'Finish a day and it shows up here.'));
    }
    if (online() && ME) {
      var more = el('button', 'btn btn--wide', 'The full record →');
      more.type = 'button';
      more.style.marginBottom = '8px';
      more.addEventListener('click', function () { closeModals(); showRecord(); });
      body.appendChild(more);
    }
  }

  // ---------------------------------------------------------------- boot --

  function loadRound(n, then, fail) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 9000);
    api('/api/round?day=' + state.dayIndex + '&round=' + n +
        '&owner=' + encodeURIComponent(ME || ''), { signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(t);
        if (r.status === 402) { showNeedStays(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (j) { if (j && j.card) then(j); else if (j !== null || !$('#needstays').hidden) { if ($('#needstays').hidden) (fail || function () {})(); } else (fail || function () {})(); })
      .catch(function () { clearTimeout(t); (fail || function () {})(); });
  }

  function startDaily() {
    state.mode = 'daily';
    state.dayIndex = todayIndex();
    state.results = [];
    state.round = 0;
    state.rounds = CFG.ROUNDS;
    $('#summary').hidden = true;
    $('#todayLabel').textContent = 'No. ' + (state.dayIndex + 1);

    if (!online()) {
      state.stays = dealFor(state.dayIndex);
      state.rounds = state.stays.length;
      var r = restore();
      if (r === 'done') { showSummary(); return; }
      return renderRound();
    }

    // Walk forward over any rounds already answered so a reload lands on the
    // first unanswered one with the earlier results intact.
    (function step(n) {
      if (n >= CFG.ROUNDS) { finishDay(); return showSummary(); }
      loadRound(n, function (j) {
        state.rounds = j.rounds || CFG.ROUNDS;
        if (j.done) {
          state.results[n] = j.done;
          return step(n + 1);
        }
        state.round = n;
        state.card = j.card;
        state.ask = j.ask;
        renderRound();
      }, function () {
        $('#hint').textContent = 'Could not reach the server. Reload to try again.';
      });
    })(0);
  }

  function emptyState() {
    var wrap = showPage('needstays');
    wrap.replaceChildren();
    var e = el('div', 'empty');
    e.appendChild(el('div', 'empty__hatch', 'No photo to show you'));
    e.appendChild(el('p', 'empty__label', 'Nothing dealt'));
    e.appendChild(el('p', 'empty__h', 'No stays in the deck yet'));
    e.appendChild(el('p', 'empty__p', 'Somebody has to send their trips in before there is a game. It takes about four minutes.'));
    var a = el('a', 'btn btn--wide', 'Add yours');
    a.href = setupLink();
    e.appendChild(a);
    wrap.appendChild(e);
  }

  function boot() {
    map = StayMap.create($('#map'), {
      onPick: function (lat, lng) {
        if (state.phase !== 'guessing') return;
        state.guesses++;
        state.pickAt = { lat: lat, lng: lng };
        foldCard();
        updateAction();
      },
    });

    $('#lockin').addEventListener('click', lockIn);
    $('#cardfold').addEventListener('click', unfoldCard);

    $$('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.open === 'stats') buildStats();
        openModal('modal-' + b.dataset.open);
      });
    });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeModals); });
    $$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) closeModals(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModals();
      if (e.key === 'Enter' && !$('#lockin').disabled && state.phase === 'guessing'
          && !document.body.classList.contains('modal-open')
          && document.activeElement === document.body) lockIn();
    });
    window.addEventListener('resize', function () { if (map) map.refresh(); });

    function begin() {
      startDaily();
      map.refresh();
      if (!load('seen', false)) { openModal('modal-help'); save('seen', true); }
    }

    function enter() {
      return signIn(function () {
        buildHelp();
        applyPro();
        begin();
      });
    }

    function settle(status) {
      var verified = status === 'ok' || status === 'empty';
      var haveData = online() ? CREW.length > 0 : (STAYS.length > 0 && CREW.length > 0);
      if (!verified && !(status === 'offline' && haveData)) {
        buildHelp();
        return showGate(enter, status === 'slow'
          ? 'Too many tries. Wait a few minutes.'
          : status === 'offline' ? 'Could not reach the server. Try again.' : '');
      }
      if (verified && word) save('key', word);
      if (!haveData) return emptyState();
      return enter();
    }

    word = firstWord();
    loadPool().then(function (status) {
      // A stale ?k= in an old bookmark should not shut out somebody who
      // already has the current word — and should not spend a try either.
      if (status === 'bad' && wordFromUrl) {
        var saved = load('key', null);
        if (saved && saved !== word) {
          word = saved;
          return loadPool().then(settle);
        }
      }
      return settle(status);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.TripPin = {
    CFG: CFG, dealFor: dealFor, wherePoints: wherePoints, whoScore: whoScore,
    shareText: shareText, gridText: gridText, proximityBar: proximityBar,
    lineFor: lineFor, state: state, band: band, bandOf: bandOf, fmtMiles: fmtMiles,
  };
})();
