/* ===========================================================================
   import.js — the page your friends get.

   Single purpose: turn one person's Airbnb trips page (or a few typed towns)
   into stays and send them to the server. Then, while the photos are still
   up, deal them back one at a time and ask for one line each.

   The important property of this file is what it does NOT do. It never asks
   for /api/stays, never holds a library, and the page it runs in has no stays
   baked into it. Somebody opening this page learns the names of the players
   and nothing else — not where anyone has been, not who went with whom.

   The full editor, which does embed the library, is deliberately not deployed.
   =========================================================================== */

(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var THROTTLE_MS = 1100;              // Nominatim asks for one a second
  var STORE = 'trippin.import.word';
  var STORY_MAX = 140;

  var SNIPPET =
    "(()=>{const s='a[href*=\"/trips/\"]',n=document.querySelectorAll(s).length," +
    "d=[...document.querySelectorAll('div')].filter(e=>e.querySelectorAll(s).length===n).pop();" +
    "copy(d?d.outerHTML:'');console.log(n+' trips copied');})()";

  var COLORS = ['#3d7a8c', '#8c4a6b', '#5c7a4a', '#b07c2e', '#4a5c8c', '#8c5a3d'];

  var word = null;
  var crew = [];
  var rows = [];
  var owner = null;
  var pass = null;
  var pad = null;
  var busy = false;
  var chosen = null;        // the name picked in step 1, proven or not

  // ----------------------------------------------------------------- gate --

  function remembered() {
    try { return localStorage.getItem(STORE); } catch (e) { return null; }
  }
  function remember(w) {
    try { localStorage.setItem(STORE, w); } catch (e) { /* private window */ }
  }

  function api(path, opts) {
    opts = opts || {};
    var h = { 'x-trippin-key': word || '' };
    // The group word says you are in the group. This says you are you.
    // Percent-encoded because headers are Latin-1 and this is two emoji.
    if (pass) h['x-trippin-pass'] = encodeURIComponent(pass);
    opts.headers = Object.assign(h, opts.headers || {});
    return fetch(path, opts);
  }

  function passStore(id) { return 'trippin.pass.' + id; }
  function rememberPass(id, value) {
    try { localStorage.setItem(passStore(id), value); } catch (e) { /* fine */ }
  }
  function recallPass(id) {
    try { return localStorage.getItem(passStore(id)); } catch (e) { return null; }
  }

  function tryWord(candidate) {
    var was = word;
    word = candidate;
    return api('/api/crew')
      .then(function (r) {
        if (!r.ok) { word = was; return false; }
        return r.json().then(function (j) {
          crew = (j && j.crew) || [];
          return true;
        });
      })
      .catch(function () { word = was; return false; });
  }

  function openFlow() {
    $('#gate').hidden = true;
    $('#flow').hidden = false;
    paintPick();
    paintMates();
  }

  function dot(p, size) {
    var a = el('span', 'avatar' + (size ? ' avatar--' + size : '') + (p.animal ? ' avatar--glyph' : ''));
    if (p.animal) a.textContent = p.animal;
    else a.style.setProperty('--who', 'var(--p-' + p.id + ', ' + (p.color || 'var(--faint)') + ')');
    return a;
  }

  // ---------------------------------------------------------------- setup --

  function paintPick() {
    var box = $('#pick');
    box.replaceChildren();
    crew.forEach(function (p) {
      var b = el('button', 'who');
      b.type = 'button';
      b.dataset.id = p.id;
      var top = el('span', 'who__top');
      top.appendChild(dot(p));
      b.appendChild(top);
      b.appendChild(el('span', 'who__name', p.name));
      b.addEventListener('click', function () { choose(p.id); });
      box.appendChild(b);
    });
    var nb = el('button', 'who who--new');
    nb.type = 'button';
    nb.appendChild(el('span', 'who__name', "I'm not on this list"));
    nb.addEventListener('click', function () {
      $$('.who', box).forEach(function (x) { x.classList.remove('is-on'); });
      nb.classList.add('is-on');
      $('#newRow').hidden = false;
      $('#tripNewName').focus();
      $('#claimStep').hidden = true;
      owner = null; pass = null; chosen = null;
    });
    box.appendChild(nb);
  }

  function paintMates() {
    var box = $('#manMates');
    if (!box) return;
    box.replaceChildren();
    crew.forEach(function (p) {
      if (p.id === owner) return;
      var b = el('button', 'who');
      b.type = 'button';
      b.dataset.id = p.id;
      var top = el('span', 'who__top');
      top.appendChild(el('span', 'who__box'));
      top.appendChild(dot(p));
      b.appendChild(top);
      b.appendChild(el('span', 'who__name', p.name));
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = !b.classList.contains('is-on');
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      box.appendChild(b);
    });
  }

  function choose(id) {
    $$('#pick .who').forEach(function (x) { x.classList.toggle('is-on', x.dataset.id === id); });
    $('#newRow').hidden = true;
    chosen = id;
    onOwnerChange(id);
  }

  function onOwnerChange(v) {
    // Choosing a name proves nothing, so nothing is shown and nothing can be
    // sent until the passcode for that name is given.
    owner = null;
    pass = null;
    mine = [];
    renderMine();
    $('#mine').hidden = true;
    $('#carousel').hidden = true;
    $('#claimErr').hidden = true;
    $('#claimOk').hidden = true;
    $('#whoSlot').hidden = true;
    $('#backLink').hidden = false;
    $('#claimStep').hidden = !v;
    if (!v) return;

    api('/api/claim?owner=' + encodeURIComponent(v))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var claimed = j && j.claimed;
        $('#claimHead').textContent = claimed ? 'Put your animal back where it lives' : 'Your animal, and where it lives';
        $('#claimNote').textContent = claimed
          ? 'The same two you set the first time.'
          : 'Pick an animal and somewhere for it to live. That pair is how you sign in, and it is what stops anybody else editing your stays. Drag the animal onto the home, or tap one then the other.';
        $('#claimGo').textContent = claimed ? 'That is me' : 'Claim it';
        pad = window.EmojiCode.create($('#claimPad'), {
          onChange: function (val, done) { $('#claimGo').disabled = !done; },
        });
        $('#claimGo').disabled = true;
        var saved = recallPass(v);
        if (claimed && saved) {
          pad.set(saved);
          submitClaim(true);
        }
      })
      .catch(function () { msg('Could not reach the server.', true); });
  }

  function submitClaim(quiet) {
    var candidate = chosen;
    if (!candidate) return;
    var value = pad ? pad.value() : '';
    if (!value) return;

    // Always offer the claim rather than deciding from the button's label. A
    // 409 just means somebody already holds the name; the passcode check
    // below is what decides.
    api('/api/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: candidate, pass: value }),
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok || r.status === 409, j: j }; });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        owner = candidate;
        pass = value;
        return api('/api/mine?owner=' + encodeURIComponent(candidate));
      })
      .then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(function (j) { throw new Error(j.error || 'refused'); });
      })
      .then(function (j) {
        rememberPass(candidate, value);
        $('#claimBox').hidden = true;
        $('#claimErr').hidden = true;
        var p = crewOf(candidate);
        $('#claimOk').hidden = false;
        $('#claimOk').textContent = 'Signed in as ' + (p ? p.name : candidate) + '. ' +
          window.EmojiCode.sentence(window.EmojiCode.parts(value).animal, window.EmojiCode.parts(value).home);
        var slot = $('#whoSlot');
        slot.replaceChildren();
        slot.appendChild(dot(Object.assign({}, p || { id: candidate }, { animal: window.EmojiCode.parts(value).animal })));
        slot.appendChild(document.createTextNode((p ? p.name : candidate)));
        slot.hidden = false;
        $('#backLink').hidden = true;
        mine = (j && j.stays) || [];
        dirty = {};
        paintMates();
        renderMine();
      })
      .catch(function (e) {
        owner = null;
        pass = null;
        if (pad) pad.clear();
        if (!quiet) {
          $('#claimErr').textContent = e.message;
          $('#claimErr').hidden = false;
        }
        $('#claimBox').hidden = false;
      });
  }

  function crewOf(id) {
    return crew.filter(function (c) { return c.id === id; })[0] || null;
  }

  function addNewName() {
    var name = $('#tripNewName').value.trim();
    if (!name) { msg('Type your name first.', true); return; }
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'player';
    var taken = {};
    crew.forEach(function (p) { taken[p.id] = 1; });
    var base = id, n = 2;
    while (taken[id]) id = base + n++;
    crew.push({ id: id, name: name, color: COLORS[crew.length % COLORS.length], tell: '' });
    paintPick();
    paintMates();
    $('#newRow').hidden = true;
    choose(id);
  }

  function ensureOwner() {
    if (owner && pass) return owner;
    msg('Pick your name and put your animal where it lives first.', true);
    return null;
  }

  var msgTimer = null;
  function msg(text, bad) {
    var n = $('#tripMsg');
    n.textContent = text;
    n.className = 'msg' + (bad ? ' msg--bad' : ' msg--ok');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { n.textContent = ''; }, 7000);
  }

  function toCrewId(name) {
    var flat = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    var hit = null;
    crew.forEach(function (p) {
      if (hit) return;
      if (flat === p.id.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          flat === p.name.toLowerCase().replace(/[^a-z0-9]/g, '')) hit = p.id;
    });
    return hit;
  }

  // ----------------------------------------------------------------- read --

  function readPaste() {
    var out = window.Trips.parse($('#tripPaste').value);
    if (!out.rows.length) {
      return msg(out.error || 'No trips found in that.', true);
    }
    rows = rows.filter(function (r) { return r.manual; }).concat(out.rows.map(function (r) {
      var dates = window.Trips.readDates(r.when);
      var mates = [], strangers = 0;
      r.people.forEach(function (name) {
        var id = toCrewId(name);
        if (id) { if (mates.indexOf(id) === -1) mates.push(id); }
        else strangers++;
      });
      return {
        place: r.place,
        when: dates.label,
        nights: dates.nights,
        photo: r.photo ? r.photo + '?im_w=720' : null,
        mates: mates,
        others: strangers + (r.others || 0),
        lat: null, lng: null, resolved: null, status: 'pending',
      };
    }));
    $('#tripResult').hidden = false;
    $('#tripSend').disabled = true;
    render();
    msg('Found ' + out.rows.length + ' trips. Now find them on the map.');
  }

  // -------------------------------------------------------------- geocode --

  function lookup(place) {
    return fetch(NOMINATIM + '?format=jsonv2&limit=1&q=' + encodeURIComponent(place),
                 { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (hits) {
        if (!hits || !hits.length) return null;
        return { lat: +hits[0].lat, lng: +hits[0].lon, label: hits[0].display_name };
      })
      .catch(function () { return null; });
  }

  function lookupMany(place) {
    return fetch(NOMINATIM + '?format=jsonv2&limit=5&q=' + encodeURIComponent(place),
                 { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        return (list || []).map(function (h) {
          return { lat: +h.lat, lng: +h.lon, label: h.display_name };
        });
      })
      .catch(function () { return []; });
  }

  function shortPlace(label) {
    var parts = label.split(',').map(function (x) { return x.trim(); });
    return parts.length > 2 ? parts[0] + ', ' + parts[parts.length - 2] : parts[0];
  }

  function locateAll() {
    if (busy) return;
    busy = true;
    $('#tripLocate').disabled = true;
    var bar = $('#tripProgress');
    bar.hidden = false;
    var fill = bar.firstElementChild;

    var todo = rows.filter(function (r) { return r.lat == null; });
    if (!todo.length) return finish();

    var i = 0;
    (function step() {
      if (i >= todo.length) return finish();
      var row = todo[i];
      row.status = 'looking';
      render();
      lookup(row.place).then(function (hit) {
        if (hit) {
          row.lat = hit.lat; row.lng = hit.lng;
          row.resolved = hit.label; row.status = 'found';
        } else {
          row.status = 'missing';
        }
        i++;
        fill.style.width = Math.round((i / todo.length) * 100) + '%';
        render();
        setTimeout(step, THROTTLE_MS);
      });
    })();

    function finish() {
      busy = false;
      $('#tripLocate').disabled = false;
      bar.hidden = true;
      fill.style.width = '0%';
      var ok = rows.filter(function (r) { return r.lat != null; }).length;
      $('#tripSend').disabled = ok === 0;
      render();
      msg(ok + ' of ' + rows.length + ' placed. Towns share names, so check anything odd.');
    }
  }

  // --------------------------------------------------------------- render --

  function render() {
    var list = $('#tripList');
    list.replaceChildren();
    rows.forEach(function (row, idx) {
      var li = el('li', 'trip trip--' + row.status);
      if (row.photo) {
        var img = el('img', 'trip__thumb');
        img.src = row.photo; img.alt = ''; img.loading = 'lazy';
        li.appendChild(img);
      } else {
        li.appendChild(el('div', 'trip__thumb', 'No photo'));
      }
      var mid = el('div', 'trip__mid');
      mid.appendChild(el('span', 'trip__head', row.place));
      var sub = el('span', 'trip__sub');
      var bits = [];
      if (row.when) bits.push(row.when);
      if (row.nights) bits.push(row.nights + (row.nights === 1 ? ' night' : ' nights'));
      if (row.mates.length) bits.push('with ' + row.mates.map(function (id) { var p = crewOf(id); return p ? p.name : id; }).join(', '));
      if (row.others) bits.push('+' + row.others);
      sub.appendChild(document.createTextNode(bits.join(' · ')));
      if (row.status === 'found' && row.resolved) {
        sub.appendChild(document.createTextNode(' · '));
        sub.appendChild(el('span', 'muted', row.resolved.split(',').slice(0, 3).join(', ')));
      } else if (row.status === 'missing') {
        sub.appendChild(document.createTextNode(' · '));
        sub.appendChild(el('span', 'trip__warn', 'not found'));
      } else if (row.status === 'looking') {
        sub.appendChild(document.createTextNode(' · looking'));
      }
      mid.appendChild(sub);
      li.appendChild(mid);
      var drop = el('button', 'trip__drop', '✕');
      drop.type = 'button';
      drop.setAttribute('aria-label', 'Leave ' + row.place + ' out');
      drop.addEventListener('click', function () { rows.splice(idx, 1); render(); });
      li.appendChild(drop);
      list.appendChild(li);
    });
    $('#tripCount').textContent = rows.length + (rows.length === 1 ? ' trip' : ' trips');
    var ok = rows.filter(function (r) { return r.lat != null; }).length;
    $('#tripSend').disabled = ok === 0;
    $('#tripResult').hidden = rows.length === 0;
  }

  // ------------------------------------------------------------ by hand --
  //
  // For the friend who camps. A town, a month, who was there. Same rows.

  var manHit = null;
  var manTimer = null;

  function wireManual() {
    var toggle = $('#manualToggle');
    var body = $('#manualBody');
    toggle.addEventListener('click', function () {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      toggle.lastElementChild.textContent = body.hidden ? '+' : '−';
    });
    var town = $('#manTown');
    var hits = $('#manHits');
    town.addEventListener('input', function () {
      manHit = null;
      $('#manPlaced').textContent = '';
      $('#manAdd').disabled = true;
      clearTimeout(manTimer);
      var q = town.value.trim();
      if (q.length < 3) { hits.replaceChildren(); return; }
      manTimer = setTimeout(function () {
        lookupMany(q).then(function (list) {
          hits.replaceChildren();
          list.slice(0, 4).forEach(function (hit) {
            var li = el('li', null, hit.label);
            li.addEventListener('click', function () {
              manHit = hit;
              town.value = shortPlace(hit.label);
              hits.replaceChildren();
              $('#manPlaced').textContent = 'Placed at ' + hit.lat.toFixed(2) + ', ' + hit.lng.toFixed(2);
              $('#manAdd').disabled = false;
            });
            hits.appendChild(li);
          });
        });
      }, 550);
    });
    $('#manAdd').addEventListener('click', function () {
      if (!manHit) return;
      var month = $('#manMonth').value;
      var year = $('#manYear').value.trim();
      var nights = parseInt($('#manNights').value, 10);
      var mates = $$('#manMates .who.is-on').map(function (b) { return b.dataset.id; });
      rows.push({
        place: town.value.trim(),
        when: month && year ? month + ' ' + year : (year || month || null),
        nights: isFinite(nights) && nights > 0 ? nights : null,
        photo: null, mates: mates, others: 0,
        lat: Math.round(manHit.lat * 1e5) / 1e5, lng: Math.round(manHit.lng * 1e5) / 1e5,
        resolved: manHit.label, status: 'found', manual: true,
      });
      town.value = ''; $('#manYear').value = ''; $('#manNights').value = ''; $('#manMonth').value = '';
      $$('#manMates .who').forEach(function (b) { b.classList.remove('is-on'); });
      manHit = null;
      $('#manPlaced').textContent = '';
      $('#manAdd').disabled = true;
      $('#manMsg').textContent = 'Added. Add another, or send them in below.';
      render();
    });
  }

  // ----------------------------------------------------------------- send --

  function send() {
    var who = ensureOwner();
    if (!who) return;
    var usable = rows.filter(function (r) { return r.lat != null; });
    if (!usable.length) return msg('Nothing has a location yet.', true);

    var btn = $('#tripSend');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    var stays = usable.map(function (r) {
      return {
        booker: who,
        crew: [who].concat(r.mates.filter(function (m) { return m !== who; })),
        others: r.others || 0,
        lat: r.lat, lng: r.lng,
        place: r.place, when: r.when, nights: r.nights, photo: r.photo,
      };
    });
    // Anything already in the pool for this person rides along, with its
    // story, because a submission replaces that person's stays outright.
    var keep = mine.filter(function (s) {
      return !stays.some(function (n) { return n.place === s.place && n.when === s.when; });
    });

    api('/api/stays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: who, crew: crew, stays: keep.concat(stays) }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        msg('Sent ' + res.j.added + '. The deck now holds ' + res.j.total + '.');
        rows = [];
        $('#tripResult').hidden = true;
        $('#tripPaste').value = '';
        return loadMine().then(function () { startCarousel(); });
      })
      .catch(function (e) { msg('Failed: ' + e.message, true); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Send them in';
      });
  }

  // ------------------------------------------------------------ carousel --
  //
  // The burst. Forty cards at three seconds each is two minutes, and most
  // people write six good ones and skip the rest — which is six more than
  // the game had. Skip is free and obviously free.

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

  var pending = {};      // id -> story written in this session, not yet sent

  function flushStories() {
    var ids = Object.keys(pending);
    if (!ids.length || !owner) return Promise.resolve();
    var batch = {};
    ids.forEach(function (id) { batch[id] = pending[id]; });
    pending = {};
    return api('/api/stories', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: owner, stories: batch }),
    }).then(function (r) {
      if (!r.ok) throw new Error('refused');
      ids.forEach(function (id) {
        var s = mine.filter(function (x) { return x.id === id; })[0];
        if (s) s.story = batch[id];
      });
    }).catch(function () {
      ids.forEach(function (id) { pending[id] = batch[id]; });
    });
  }

  function startCarousel(force) {
    var box = $('#carousel');
    var queue = mine.filter(function (s) { return !s.story; });
    if (!queue.length) { box.hidden = true; return; }
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var i = 0;
    var written = 0;

    function paint() {
      box.replaceChildren();
      if (i >= queue.length) return finish();
      var s = queue[i];
      box.appendChild(el('p', 'panel__label', 'Load the deck · ' + (i + 1) + ' of ' + queue.length));
      if (s.photo) {
        var img = el('img', 'carousel__photo');
        img.src = s.photo; img.alt = '';
        box.appendChild(img);
      } else {
        box.appendChild(el('div', 'carousel__photo carousel__photo--empty', 'No photo to show you'));
      }
      box.appendChild(el('p', 'carousel__place', s.place));
      var bits = [];
      if (s.when) bits.push(s.when);
      if (s.nights) bits.push(s.nights + (s.nights === 1 ? ' night' : ' nights'));
      var mates = (s.crew || []).filter(function (id) { return id !== owner; }).map(function (id) { var p = crewOf(id); return p ? p.name : id; });
      if (mates.length) bits.push('with ' + mates.join(', '));
      box.appendChild(el('p', 'carousel__when', bits.join(' · ') || 'Somewhere you slept'));

      var ask = el('div', 'ask');
      ask.appendChild(el('p', 'ask__label', 'One line · they read it after they miss'));
      ask.appendChild(el('p', 'ask__q', PROMPTS[(hash(s.id) + i) % PROMPTS.length]));
      var field = el('div', 'ask__field');
      var input = el('input');
      input.type = 'text';
      input.maxLength = STORY_MAX;
      input.placeholder = 'Whatever you would say out loud about it';
      input.setAttribute('aria-label', 'One line about ' + s.place);
      field.appendChild(input);
      ask.appendChild(field);
      var meta = el('div', 'ask__meta');
      var count = el('span', null, '0 / ' + STORY_MAX);
      meta.appendChild(count);
      meta.appendChild(el('span', null, written + ' set so far'));
      ask.appendChild(meta);
      box.appendChild(ask);

      var acts = el('div', 'carousel__acts');
      var skip = el('button', 'btn btn--ghost', 'Skip');
      skip.type = 'button';
      var next = el('button', 'btn', 'Next');
      next.type = 'button';
      next.disabled = true;
      acts.appendChild(skip);
      acts.appendChild(next);
      box.appendChild(acts);
      var out = el('p', 'carousel__out');
      var done = el('button', null, 'Enough for now');
      done.type = 'button';
      out.appendChild(done);
      box.appendChild(out);

      input.addEventListener('input', function () {
        count.textContent = input.value.length + ' / ' + STORY_MAX;
        next.disabled = !input.value.trim();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); (next.disabled ? skip : next).click(); }
      });
      skip.addEventListener('click', function () { i++; paint(); });
      next.addEventListener('click', function () {
        var text = input.value.trim().slice(0, STORY_MAX);
        if (text) { pending[s.id] = text; written++; }
        i++;
        if (written % 5 === 0) flushStories();
        paint();
      });
      done.addEventListener('click', function () { i = queue.length; paint(); });
      setTimeout(function () { input.focus({ preventScroll: true }); }, 30);
    }

    function finish() {
      flushStories().then(function () {
        box.replaceChildren();
        box.appendChild(el('p', 'panel__label', 'Loaded'));
        box.appendChild(el('p', 'panel__h', written
          ? written + (written === 1 ? ' line set.' : ' lines set.') + ' Somebody is going to read one of those after being three thousand miles out.'
          : 'None set. That is fine. The game asks again, one at a time, after you have played.'));
        var a = el('a', 'btn btn--wide', 'Play →');
        a.href = '/';
        box.appendChild(a);
        renderMine();
      });
    }
    paint();
  }

  function hash(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
    return h >>> 0;
  }

  // ----------------------------------------------------- your own stays --

  var mine = [];
  var dirty = {};

  function loadMine() {
    if (!owner || !pass) return Promise.resolve();
    return api('/api/mine?owner=' + encodeURIComponent(owner))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        mine = (j && j.stays) || [];
        dirty = {};
        renderMine();
      })
      .catch(function () { /* offline */ });
  }

  function markDirty(id) {
    dirty[id] = true;
    $('#mineSave').disabled = false;
    var li = document.getElementById('mine-' + id);
    if (li) li.classList.add('is-dirty');
  }

  function renderMine() {
    var list = $('#mineList');
    list.replaceChildren();
    $('#mine').hidden = mine.length === 0;
    if (!mine.length) return;
    $('#mineCount').textContent = 'Your stays · ' + mine.length;
    var missing = mine.filter(function (s) { return !s.story; }).length;
    var acts = $('#mineActs');
    acts.hidden = missing === 0;
    if (missing) {
      var b = $('#mineLines');
      b.textContent = 'Write a line for the ' + missing + ' without one →';
      b.onclick = function () { startCarousel(true); };
    }

    mine.forEach(function (stay) {
      var li = el('li');
      li.id = 'mine-' + stay.id;
      var row = el('div', 'mine__row');
      if (stay.photo) {
        var img = el('img', 'mine__thumb');
        img.src = stay.photo; img.alt = ''; img.loading = 'lazy';
        row.appendChild(img);
      } else {
        row.appendChild(el('span', 'mine__thumb'));
      }
      var where = el('div', 'mine__where');
      var placeEl = el('span', 'mine__place', stay.place || '(no place)');
      where.appendChild(placeEl);
      var bits = [];
      if (stay.when) bits.push(stay.when);
      if (stay.nights) bits.push(stay.nights + (stay.nights === 1 ? ' night' : ' nights'));
      var mates = (stay.crew || []).filter(function (id) { return id !== owner; }).map(function (id) { var p = crewOf(id); return p ? p.name : id; });
      if (mates.length) bits.push('with ' + mates.join(', '));
      where.appendChild(el('span', 'mine__meta', bits.join(' · ')));
      row.appendChild(where);
      var status = el('span', 'mine__status' + (stay.story ? ' mine__status--line' : ''), stay.story ? 'Has a line' : 'No line');
      row.appendChild(status);
      var toggle = el('button', 'btn btn--ghost btn--sm btn--mono', 'Edit');
      toggle.type = 'button';
      row.appendChild(toggle);
      li.appendChild(row);

      var body = el('div', 'mine__body');
      body.hidden = true;
      toggle.addEventListener('click', function () {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? 'Edit' : 'Done';
      });

      var f1 = el('label', 'field');
      f1.appendChild(el('span', null, 'Where it actually was'));
      var search = el('input', 'input');
      search.value = stay.place || '';
      search.placeholder = 'e.g. Whitehall, Montana';
      f1.appendChild(search);
      body.appendChild(f1);
      var hits = el('ul', 'hits');
      body.appendChild(hits);
      var timer = null;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        var q = search.value.trim();
        if (q.length < 3) { hits.replaceChildren(); return; }
        timer = setTimeout(function () {
          lookupMany(q).then(function (found) {
            hits.replaceChildren();
            found.slice(0, 4).forEach(function (hit) {
              var opt = el('li', null, hit.label);
              opt.addEventListener('click', function () {
                stay.lat = Math.round(hit.lat * 1e5) / 1e5;
                stay.lng = Math.round(hit.lng * 1e5) / 1e5;
                stay.place = shortPlace(hit.label);
                search.value = stay.place;
                hits.replaceChildren();
                placeEl.textContent = stay.place;
                markDirty(stay.id);
              });
              hits.appendChild(opt);
            });
          });
        }, 550);
      });

      var f2 = el('label', 'field');
      f2.appendChild(el('span', null, 'The line on the back · read after they miss · ' + STORY_MAX + ' max'));
      var story = el('input', 'input' + (stay.story ? '' : ' input--optional'));
      story.type = 'text';
      story.maxLength = STORY_MAX;
      story.value = stay.story || '';
      story.placeholder = PROMPTS[hash(stay.id) % PROMPTS.length];
      story.addEventListener('input', function () {
        stay.story = story.value.trim().slice(0, STORY_MAX) || null;
        status.textContent = stay.story ? 'Has a line' : 'No line';
        status.classList.toggle('mine__status--line', !!stay.story);
        markDirty(stay.id);
      });
      f2.appendChild(story);
      body.appendChild(f2);

      var drop = el('button', 'btn btn--ghost btn--mono', 'Leave this one out');
      drop.type = 'button';
      drop.addEventListener('click', function () {
        if (!window.confirm('Take ' + stay.place + ' out of the deck?')) return;
        mine = mine.filter(function (s) { return s.id !== stay.id; });
        dirty.__removed = true;
        $('#mineSave').disabled = false;
        renderMine();
      });
      body.appendChild(drop);

      li.appendChild(body);
      list.appendChild(li);
    });
  }

  function saveMine() {
    if (!owner) return;
    var btn = $('#mineSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    api('/api/stays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: owner, crew: crew, stays: mine }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        dirty = {};
        $('#mineMsg').textContent = 'Saved.';
        $('#mineMsg').className = 'msg msg--ok';
        return loadMine();
      })
      .catch(function (e) {
        $('#mineMsg').textContent = 'Failed: ' + e.message;
        $('#mineMsg').className = 'msg msg--bad';
        btn.disabled = false;
      })
      .finally(function () { btn.textContent = 'Save changes'; });
  }

  // ----------------------------------------------------------------- boot --

  function boot() {
    $('#snippet').textContent = SNIPPET;
    $('#copySnippet').addEventListener('click', function (e) {
      var b = e.currentTarget;
      navigator.clipboard.writeText(SNIPPET).then(function () {
        b.textContent = 'Copied';
        setTimeout(function () { b.textContent = 'Copy'; }, 1600);
      }).catch(function () {
        window.prompt('Copy this into the console:', SNIPPET);
      });
    });

    $('#newGo').addEventListener('click', addNewName);
    $('#tripNewName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNewName(); } });
    $('#tripRead').addEventListener('click', readPaste);
    $('#tripLocate').addEventListener('click', locateAll);
    $('#tripSend').addEventListener('click', send);
    $('#mineSave').addEventListener('click', saveMine);
    $('#claimBox').addEventListener('submit', function (e) { e.preventDefault(); submitClaim(false); });
    $('#tripPaste').addEventListener('paste', function () { setTimeout(readPaste, 30); });
    wireManual();
    window.addEventListener('beforeunload', function () { flushStories(); });

    function attempt(candidate) {
      if (!candidate) return;
      tryWord(candidate).then(function (ok) {
        if (ok) { remember(candidate); openFlow(); }
        else { $('#gateErr').hidden = false; $('#gateWord').select(); }
      });
    }
    $('#gateGo').addEventListener('click', function () { attempt($('#gateWord').value.trim()); });
    $('#gateWord').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') attempt($('#gateWord').value.trim());
    });

    // A link with ?k= walks straight in; so does a return visit.
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('k'); } catch (e) { /* old */ }
    if (fromUrl) {
      try {
        var u = new URL(location.href);
        u.searchParams.delete('k');
        history.replaceState(null, '', u.pathname + u.hash);
      } catch (e) { /* fine */ }
    }
    var back = $('#backLink');
    if (back) back.href = '/' + (fromUrl || remembered() ? '?k=' + encodeURIComponent(fromUrl || remembered()) : '');
    attempt(fromUrl || remembered());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
