/* ===========================================================================
   admin.js — the page for whoever runs the game.

   The constraint that shapes this file: the person running TripPin also plays
   it. So this page asks the server for /api/summary, which returns counts and
   health and nothing else — no place names, no coordinates, no photos, no
   stories. You cannot accidentally spoil yourself by opening it.

   The one thing that would spoil you is behind an explicit checkbox with a
   warning on it, because sometimes you do need the data.
   =========================================================================== */

(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  var STORE = 'trippin.admin.word';
  var word = null;
  var crew = [];
  var summary = {};
  var tellsDirty = false;

  function api(path, opts) {
    opts = opts || {};
    // This page runs on the admin word. It goes in both headers because the
    // pool dump is still gated on the group word, and admin satisfies that.
    opts.headers = Object.assign(
      { 'x-trippin-key': word || '', 'x-trippin-admin': word || '' },
      opts.headers || {},
    );
    return fetch(path, opts);
  }

  function avatarFor(person) {
    var a = el('span', 'avatar');
    a.style.setProperty('--who', 'var(--p-' + person.id + ', ' + (person.color || 'var(--faint)') + ')');
    return a;
  }

  // ----------------------------------------------------------------- gate --

  function tryWord(candidate) {
    var was = word;
    word = candidate;
    return api('/api/summary')
      .then(function (r) {
        if (!r.ok) { word = was; return null; }
        return r.json();
      })
      .catch(function () { word = was; return null; });
  }

  // ---------------------------------------------------------------- paint --

  // Every player on the roster gets a row, including people who have sent
  // nothing yet — the empty rows are the point of the by-player table.
  function buildRows(data) {
    var rows = {};
    (data.perPlayer || []).forEach(function (p) { rows[p.owner] = p; });
    (data.crew || []).forEach(function (p) {
      if (!rows[p.id]) rows[p.id] = { owner: p.id, total: 0, thin: 0, noPhoto: 0, noStory: 0, solo: 0 };
    });
    return rows;
  }

  function paint(data) {
    summary = data;
    crew = (data.crew || []).slice();

    var totals = data.totals || {};
    var rows = buildRows(data);

    paintTiles(totals, rows);
    paintPlayers(rows);

    $('#updated').textContent = data.updated
      ? 'Pool last written ' + new Date(data.updated).toLocaleString()
      : 'Nothing published yet.';

    paintTells(rows, totals);
    paintClaims();
  }

  function paintTiles(totals, rows) {
    var ids = Object.keys(rows);
    var deck = crew.length;
    var sent = ids.filter(function (id) { return rows[id].total > 0; }).length;
    var thinSum = 0, noStorySum = 0;
    ids.forEach(function (id) {
      thinSum += rows[id].thin || 0;
      noStorySum += rows[id].noStory || 0;
    });

    var tiles = $('#tiles');
    tiles.replaceChildren();

    function tile(n, small, k, cls) {
      var box = el('div', 'tile');
      var p = el('p', 'tile__n' + (cls ? ' ' + cls : ''));
      p.appendChild(document.createTextNode(String(n)));
      if (small != null) p.appendChild(el('small', null, small));
      box.appendChild(p);
      box.appendChild(el('p', 'tile__k', k));
      tiles.appendChild(box);
    }

    tile(totals.stays == null ? '—' : totals.stays, null, 'Stays in the deck');
    tile(sent, '/' + deck, 'Players sent theirs');
    tile(thinSum, null, 'Thin · town and nothing else', 'warn');
    tile(noStorySum, null, 'Without a story', 'warn3');
  }

  function paintPlayers(rows) {
    var byId = {};
    crew.forEach(function (p) { byId[p.id] = p; });

    var body = $('#perPlayer');
    body.replaceChildren();

    Object.keys(rows).sort(function (a, b) {
      return rows[b].total - rows[a].total || a.localeCompare(b);
    }).forEach(function (id) {
      var p = rows[id];
      var person = byId[id] || { id: id, name: id };
      var tr = el('tr', p.total ? null : 'is-empty');

      var nameTd = el('td', 'name');
      nameTd.appendChild(avatarFor(person));
      nameTd.appendChild(document.createTextNode(person.name));
      tr.appendChild(nameTd);

      [
        [p.total, null],
        [p.thin, 'warn'],
        [p.noPhoto, null],
        [p.noStory, 'warn3'],
        [p.solo, null],
      ].forEach(function (pair) {
        var n = pair[0];
        var td = el('td', 'num');
        td.textContent = p.total ? String(n) : '—';
        if (p.total && n > 0 && pair[1]) td.classList.add(pair[1]);
        tr.appendChild(td);
      });

      var statusTd = el('td', 'status ' + (p.total ? 'status--in' : 'status--wait'));
      statusTd.textContent = p.total ? 'IN' : 'WAITING';
      tr.appendChild(statusTd);

      body.appendChild(tr);
    });
  }

  // ------------------------------------------------------------- the tells --

  function paintTells(rows, totals) {
    var box = $('#tells');
    box.replaceChildren();
    var deck = totals.stays == null ? 0 : totals.stays;

    crew.forEach(function (p) {
      var row = el('label', 'tellRow');

      var who = el('span', 'tellRow__who');
      who.appendChild(avatarFor(p));
      who.appendChild(document.createTextNode(p.name));
      row.appendChild(who);

      var input = el('input', 'input');
      input.value = p.tell || '';
      var count = rows[p.id] ? rows[p.id].total : 0;
      input.placeholder = count ? ('Counted: ' + count + ' of ' + deck) : '';
      input.addEventListener('input', function () {
        p.tell = input.value;
        tellsDirty = true;
        $('#saveTells').disabled = false;
      });
      row.appendChild(input);

      box.appendChild(row);
    });
  }

  function saveTells() {
    var btn = $('#saveTells');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    api('/api/crew', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ crew: crew }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        tellsDirty = false;
        note('#tellMsg', 'Saved.');
      })
      .catch(function (e) { note('#tellMsg', 'Failed: ' + e.message, true); btn.disabled = false; })
      .finally(function () { btn.textContent = 'Save tells'; });
  }

  function note(sel, text, bad) {
    var n = $(sel);
    n.textContent = text;
    n.classList.toggle('msg--bad', !!bad);
    n.classList.toggle('msg--ok', !bad);
    setTimeout(function () {
      n.textContent = '';
      n.classList.remove('msg--bad', 'msg--ok');
    }, 5000);
  }

  // ------------------------------------------------------------- passcodes --

  function paintClaims() {
    var box = $('#claims');
    box.replaceChildren();
    crew.forEach(function (p) {
      var row = el('div', 'claimRow');
      row.appendChild(avatarFor(p));
      row.appendChild(el('span', 'claimRow__name', p.name));

      var status = el('span', 'label ' + (p.claimed ? 'status--in' : 'label--faint'),
        p.claimed ? 'Passcode set' : 'Not claimed yet');
      row.appendChild(status);

      if (p.claimed) {
        var btn = el('button', 'btn btn--ghost btn--mono', 'Reset');
        btn.type = 'button';
        btn.addEventListener('click', function () { unclaim(p, btn); });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });

    var warn = $('#adminWarn');
    if (summary.adminLock === false) {
      warn.hidden = false;
      warn.textContent = 'ADMIN_KEY is not set, so this page and the reset button '
        + 'accept the group word, which every player has. Run '
        + '`npx wrangler secret put ADMIN_KEY` to give yourself a separate one.';
    } else {
      warn.hidden = true;
    }

    paintWrites();
  }

  function paintWrites() {
    var log = $('#writes');
    log.replaceChildren();
    var rows = summary.writes || [];

    if (!rows.length) {
      var empty = el('tr', 'is-empty');
      var td = el('td', null, 'Nothing sent in yet.');
      td.colSpan = 3;
      empty.appendChild(td);
      log.appendChild(empty);
      return;
    }

    rows.forEach(function (w) {
      var who = (crew.filter(function (p) { return p.id === w.owner; })[0] || {}).name || w.owner;
      var tr = el('tr');
      tr.appendChild(el('td', 'name', who));
      tr.appendChild(el('td', null, new Date(w.at).toLocaleString()));
      tr.appendChild(el('td', null, w.forgot ? 'removed' : (w.was + ' → ' + w.now)));
      log.appendChild(tr);
    });
  }

  function unclaim(p, btn) {
    if (!window.confirm('Reset ' + p.name + "'s passcode?\n\n"
      + 'Whoever opens the import page as ' + p.name + ' next gets to set a new '
      + 'one, so only do this if they asked.')) return;
    btn.disabled = true;
    api('/api/unclaim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: p.id }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'refused');
        p.claimed = false;
        paintClaims();
      })
      .catch(function (e) { window.alert('Failed: ' + e.message); btn.disabled = false; });
  }

  // ----------------------------------------------------------------- dump --

  function quote(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      .replace(/\n/g, '\\n').replace(/\r/g, '') + "'";
  }

  function jsValue(v, ind) {
    ind = ind || '';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return quote(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (v.every(function (x) { return typeof x === 'string'; }) && v.join('').length < 68) {
        return '[' + v.map(quote).join(', ') + ']';
      }
      return '[\n' + v.map(function (x) { return ind + '  ' + jsValue(x, ind + '  '); }).join(',\n') + '\n' + ind + ']';
    }
    return '{\n' + Object.keys(v).map(function (k) {
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k);
      return ind + '  ' + key + ': ' + jsValue(v[k], ind + '  ');
    }).join(',\n') + '\n' + ind + '}';
  }

  // The consent checkbox in the quarantine replaces a confirm() dialog — the
  // whole point is that ticking it is a deliberate, visible act, not a modal
  // you can reflexively dismiss.
  function dump() {
    var btn = $('#dumpBtn');
    btn.disabled = true;

    api('/api/stays')
      .then(function (r) { return r.json(); })
      .then(function (pool) {
        var text =
          '/* Pulled from the pool on ' + new Date().toISOString().slice(0, 10) + '.\n' +
          '   Drop into src/ to work on it locally. */\n\n' +
          'window.CREW = ' + jsValue(pool.crew || []) + ';\n\n' +
          'window.STAYS = ' + jsValue(pool.stays || []) + ';\n';
        var blob = new Blob([text], { type: 'text/javascript' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'stays.js';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        note('#dumpMsg', 'Downloaded ' + (pool.stays || []).length + ' stays.');
      })
      .catch(function (e) { note('#dumpMsg', 'Failed: ' + e.message, true); })
      .finally(function () { btn.disabled = !$('#dumpConsent').checked; });
  }

  // ----------------------------------------------------------------- boot --

  function boot() {
    $('#saveTells').addEventListener('click', saveTells);
    $('#dumpBtn').addEventListener('click', dump);
    $('#dumpConsent').addEventListener('change', function (e) {
      $('#dumpBtn').disabled = !e.target.checked;
    });

    function attempt(candidate) {
      if (!candidate) return;
      tryWord(candidate).then(function (data) {
        if (!data) { $('#gateErr').hidden = false; $('#gateWord').select(); return; }
        try { localStorage.setItem(STORE, candidate); } catch (e) { /* fine */ }
        $('#gate').hidden = true;
        $('#flow').hidden = false;
        paint(data);
      });
    }

    $('#gateGo').addEventListener('click', function () { attempt($('#gateWord').value.trim()); });
    $('#gateWord').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') attempt($('#gateWord').value.trim());
    });

    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('k'); } catch (e) { /* old */ }
    if (fromUrl) {
      try {
        var u = new URL(location.href);
        u.searchParams.delete('k');
        history.replaceState(null, '', u.pathname + u.hash);
      } catch (e) { /* fine */ }
    }
    var saved = null;
    try { saved = localStorage.getItem(STORE); } catch (e) { /* fine */ }
    attempt(fromUrl || saved);

    window.addEventListener('beforeunload', function (e) {
      if (tellsDirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
