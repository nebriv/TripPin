/* ===========================================================================
   editor-trips.js — the "Import your stays" panel.

   Takes a lump of markup copied off airbnb.com/trips and turns it into stays
   belonging to one player. Parsing is in trips.js; this file is the workflow
   around it: who you are, reading the paste, finding each town on the map,
   and handing the result to the editor.

   Only people who are actually in CREW are named on a stay. Everyone else on
   the trip becomes a head count — your friends travel with their own friends
   and there is no reason to drag all those names into the game.
   =========================================================================== */

(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = window.Listing.el;
  var API = window.StayEditor;

  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var THROTTLE_MS = 1100;        // Nominatim asks for at most one a second

  var SNIPPET =
    "(()=>{const s='a[href*=\"/trips/\"]',n=document.querySelectorAll(s).length," +
    "d=[...document.querySelectorAll('div')].filter(e=>e.querySelectorAll(s).length===n).pop();" +
    "copy(d?d.outerHTML:'');console.log(n+' trips copied');})()";

  var rows = [];                 // parsed, then annotated with lat/lng
  var owner = null;
  var busy = false;

  var COLORS = ['#3d7a8c', '#8c4a6b', '#5c7a4a', '#b07c2e', '#4a5c8c', '#8c5a3d'];

  // ---------------------------------------------------------------- setup --

  function fillOwners() {
    var sel = $('#tripOwner');
    var keep = sel.value;
    sel.replaceChildren();
    API.crew().forEach(function (p) {
      var o = el('option', null, p.name);
      o.value = p.id;
      sel.appendChild(o);
    });
    var neu = el('option', null, 'Someone new…');
    neu.value = '__new';
    sel.appendChild(neu);
    if (keep) sel.value = keep;
    onOwnerChange();
  }

  function onOwnerChange() {
    var sel = $('#tripOwner');
    var isNew = sel.value === '__new';
    $('#tripNewName').hidden = !isNew;
    if (isNew) $('#tripNewName').focus();
    owner = isNew ? null : sel.value;
  }

  function ensureOwner() {
    if (owner) return owner;
    var name = $('#tripNewName').value.trim();
    if (!name) {
      msg('Pick who these trips belong to first.', true);
      return null;
    }
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'player';
    var taken = {};
    API.crew().forEach(function (p) { taken[p.id] = 1; });
    var base = id, n = 2;
    while (taken[id]) id = base + n++;
    API.addCrew({
      id: id,
      name: name,
      color: COLORS[API.crew().length % COLORS.length],
      tell: 'TODO - what kind of place does ' + name + ' always book?',
    });
    fillOwners();
    $('#tripOwner').value = id;
    onOwnerChange();
    owner = id;
    return id;
  }

  var msgTimer = null;
  function msg(text, bad) {
    var n = $('#tripMsg');
    n.textContent = text;
    n.style.color = bad ? 'var(--bad)' : 'var(--good)';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { n.textContent = ''; }, 6000);
  }

  // ---------------------------------------------------------------- read --

  // Map a name off the facepile onto a crew id, or null if they are not
  // playing. Matching is loose because Airbnb shows whatever they typed.
  function toCrewId(name) {
    var flat = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    var hit = null;
    API.crew().forEach(function (p) {
      if (hit) return;
      var pid = p.id.toLowerCase().replace(/[^a-z0-9]/g, '');
      var pnm = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (flat === pid || flat === pnm) hit = p.id;
    });
    return hit;
  }

  function readPaste() {
    var markup = $('#tripPaste').value;
    var out = window.Trips.parse(markup);
    if (!out.rows.length) {
      $('#tripResult').hidden = true;
      return msg(out.error || 'No trips found.', true);
    }

    rows = out.rows.map(function (r) {
      var dates = window.Trips.readDates(r.when);
      var mates = [], strangers = 0;
      r.people.forEach(function (name) {
        var id = toCrewId(name);
        if (id) { if (mates.indexOf(id) === -1) mates.push(id); }
        else strangers++;
      });
      return {
        place: r.place,
        rawWhen: r.when,
        when: dates.label,
        nights: dates.nights,
        photo: r.photo ? r.photo + '?im_w=720' : null,
        mates: mates,
        others: strangers + (r.others || 0),
        lat: null, lng: null, resolved: null, status: 'pending',
      };
    });

    $('#tripResult').hidden = false;
    $('#tripAdd').disabled = true;
    render();
    msg('Found ' + rows.length + ' trips.');
  }

  // ------------------------------------------------------------- geocode --

  function lookup(place) {
    var url = NOMINATIM + '?format=jsonv2&limit=1&q=' + encodeURIComponent(place);
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (hits) {
        if (!hits || !hits.length) return null;
        return { lat: +hits[0].lat, lng: +hits[0].lon, label: hits[0].display_name };
      })
      .catch(function () { return null; });
  }

  function locateAll() {
    if (busy) return;
    busy = true;
    var btn = $('#tripLocate');
    btn.disabled = true;
    var bar = $('#tripProgress');
    bar.hidden = false;
    var fill = bar.firstElementChild;

    var todo = rows.filter(function (r) { return r.lat == null; });
    if (!todo.length) { finish(); return; }

    var i = 0;
    (function step() {
      if (i >= todo.length) return finish();
      var row = todo[i];
      row.status = 'looking';
      render();
      lookup(row.place).then(function (hit) {
        if (hit) {
          row.lat = hit.lat;
          row.lng = hit.lng;
          row.resolved = hit.label;
          // Same town name exists in a dozen places; say what was chosen so
          // it can be corrected rather than silently trusted.
          row.status = 'found';
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
      btn.disabled = false;
      bar.hidden = true;
      fill.style.width = '0%';
      var ok = rows.filter(function (r) { return r.lat != null; }).length;
      $('#tripAdd').disabled = ok === 0;
      render();
      msg(ok + ' of ' + rows.length + ' located. Check anything marked "check me".');
    }
  }

  // -------------------------------------------------------------- render --

  // Towns whose name alone is famously not enough.
  function looksAmbiguous(row) {
    if (!row.resolved) return false;
    var parts = row.resolved.split(',').map(function (s) { return s.trim(); });
    return parts.length > 1 && /^[A-Z]/.test(row.place) &&
           !/\d/.test(row.place) && row.place.split(' ').length <= 2;
  }

  function render() {
    var list = $('#tripList');
    list.replaceChildren();

    rows.forEach(function (row, idx) {
      var li = el('li', 'trip trip--' + row.status);

      if (row.photo) {
        var img = el('img', 'trip__thumb');
        img.src = row.photo;
        img.alt = '';
        img.loading = 'lazy';
        li.appendChild(img);
      } else {
        li.appendChild(el('div', 'trip__thumb', '⌂'));
      }

      var mid = el('div', 'trip__mid');
      var head = el('div', 'trip__head');
      head.appendChild(el('strong', null, row.place));
      if (row.when) head.appendChild(el('span', 'muted', ' · ' + row.when));
      if (row.nights) head.appendChild(el('span', 'muted', ' · ' + row.nights + 'n'));
      mid.appendChild(head);

      var sub = el('div', 'trip__sub');
      row.mates.forEach(function (id) {
        var p = API.crew().filter(function (c) { return c.id === id; })[0];
        if (p) sub.appendChild(window.Listing.avatar(p, 'sm'));
      });
      if (row.others) sub.appendChild(el('span', 'muted', '+' + row.others + ' not playing'));
      if (row.status === 'found') {
        sub.appendChild(el('span', looksAmbiguous(row) ? 'trip__warn' : 'muted',
          row.resolved.split(',').slice(0, 3).join(', ')));
      } else if (row.status === 'missing') {
        sub.appendChild(el('span', 'trip__warn', 'not found — set it by hand'));
      } else if (row.status === 'looking') {
        sub.appendChild(el('span', 'muted', 'looking…'));
      }
      mid.appendChild(sub);
      li.appendChild(mid);

      var drop = el('button', 'trip__drop', '✕');
      drop.type = 'button';
      drop.title = 'Leave this one out';
      drop.addEventListener('click', function () {
        rows.splice(idx, 1);
        render();
        $('#tripCount').textContent = rows.length + ' trips';
      });
      li.appendChild(drop);
      list.appendChild(li);
    });

    $('#tripCount').textContent = rows.length + ' trips';
  }

  // ----------------------------------------------------------------- add --

  function addAll() {
    var who = ensureOwner();
    if (!who) return;

    var usable = rows.filter(function (r) { return r.lat != null; });
    if (!usable.length) return msg('Nothing has a location yet.', true);

    var stays = usable.map(function (r) {
      return {
        id: null,
        title: null,
        type: null,
        amenities: [],
        booker: who,
        crew: [who].concat(r.mates.filter(function (m) { return m !== who; })),
        lat: Math.round(r.lat * 1e5) / 1e5,
        lng: Math.round(r.lng * 1e5) / 1e5,
        place: r.place,
        when: r.when,
        nights: r.nights,
        story: null,
        others: r.others || 0,
        photo: r.photo,
        source: 'airbnb-trips',
      };
    });

    var n = API.addStays(stays);
    msg('Added ' + n + ' stays. Give the good ones a story, then Export.');
    rows = [];
    $('#tripResult').hidden = true;
    $('#tripPaste').value = '';
  }

  // -------------------------------------------------------------- publish --

  // Only offered when the page is being served by the Worker; opening
  // editor.html off the filesystem has nothing to publish to.
  function checkServer() {
    if (!/^https?:$/.test(location.protocol)) return;
    fetch('/api/health')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) {
        if (h && h.ok) $('#btnPublish').hidden = false;
      })
      .catch(function () { /* running from a plain static host */ });
  }

  function publish() {
    var who = ensureOwner();
    if (!who) return msg('Pick who you are at the top first.', true);

    var mine = API.library().filter(function (s) {
      return (s.booker || s.owner) === who;
    });
    if (!mine.length) {
      return msg('Nothing in the library belongs to ' + who + ' yet.', true);
    }

    var word = window.prompt(
      'Publishing ' + mine.length + ' stays as ' + who + '.\n\nWhat is the entry word?');
    if (!word) return;

    var btn = $('#btnPublish');
    btn.disabled = true;
    btn.textContent = 'Publishing…';

    fetch('/api/stays', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trippin-key': word },
      body: JSON.stringify({ key: word, owner: who, crew: API.crew(), stays: mine }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        msg('Published ' + res.j.added + ' stays. The deck now holds ' + res.j.total + '.');
      })
      .catch(function (e) { msg('Publish failed: ' + e.message, true); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Publish to the game';
      });
  }

  // ---------------------------------------------------------------- boot --

  function boot() {
    if (!API) return;
    checkServer();
    $('#btnPublish').addEventListener('click', publish);

    // The bulk-import flow lives on import.html now, which ships no stays.
    // This file keeps only the publish button when that panel is not here.
    if (!$('#tripsPanel') || !window.Trips) return;

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

    fillOwners();
    $('#tripOwner').addEventListener('change', onOwnerChange);
    $('#tripRead').addEventListener('click', readPaste);
    $('#tripLocate').addEventListener('click', locateAll);
    $('#tripAdd').addEventListener('click', addAll);

    $('#tripsToggle').addEventListener('click', function (e) {
      var body = $('#tripsBody');
      var open = body.hidden;
      body.hidden = !open;
      e.currentTarget.textContent = open ? 'Hide' : 'Show';
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });

    // Pasting a big lump into the textarea is the whole point — read it right
    // away rather than making them find the button.
    $('#tripPaste').addEventListener('paste', function () {
      setTimeout(readPaste, 30);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
