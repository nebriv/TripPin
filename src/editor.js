/* ===========================================================================
   editor.js — the stay editor.

   Getting stays in is the whole bottleneck of this game, so there are three
   ways to do it and they all end in the same place:

     1. Paste a listing URL. Needs the companion server running:
            python tools/import_url.py --serve
        It reads OpenGraph and schema.org data off the page — title, photo,
        rating, amenities, sometimes coordinates.
     2. Fill the form by hand. Fifteen seconds if you paste a screenshot.
     3. Load an existing stays.js and edit it.

   The library lives in IndexedDB (photos are far too big for localStorage).
   Nothing is saved to disk until you hit Export, which writes a complete
   stays.js you drop into src/.
   =========================================================================== */

(function () {
  'use strict';

  var HELPER = 'http://localhost:8732';
  var DB = 'trippin-editor';
  var PHOTO_MAX_W = 1200;
  var PHOTO_Q = 0.72;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = window.Listing.el;

  var crew = (window.CREW || []).slice();
  var crewById = {};
  crew.forEach(function (p) { crewById[p.id] = p; });

  var lib = [];
  var editingId = null;
  var draft = { photo: null, lat: null, lng: null };
  var map = null;

  // ------------------------------------------------------------- storage --
  // Photos are a megabyte apiece, so localStorage is not an option.

  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function idbGet(k) {
    return openDb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction('kv', 'readonly').objectStore('kv').get(k);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  function idbSet(k, v) {
    return openDb().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k);
        q.onsuccess = function () { res(); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }

  function persist() {
    return idbSet('library', lib).catch(function () {
      note('Could not save locally — export before you close the tab.', true);
    });
  }

  // ---------------------------------------------------------------- misc --

  function slug(s) {
    return String(s || 'stay').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44) || 'stay';
  }

  function uniqueId(base, ignore) {
    var id = base, n = 2;
    while (lib.some(function (s) { return s.id === id && s.id !== ignore; })) id = base + '-' + n++;
    return id;
  }

  function kb(n) {
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  }

  var noteTimer = null;
  function note(msg, bad) {
    var n = $('#saveMsg');
    n.textContent = msg;
    n.style.color = bad ? 'var(--bad)' : 'var(--good)';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { n.textContent = ''; }, 4000);
  }

  // --------------------------------------------------------------- photo --

  // Everything ends up as a resized JPEG data URI, whether it arrived from a
  // file, the clipboard, or the import helper.
  function processImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, PHOTO_MAX_W / img.width);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try { res(c.toDataURL('image/jpeg', PHOTO_Q)); } catch (e) { rej(e); }
      };
      img.onerror = function () { rej(new Error('could not read that image')); };
      img.src = src;
    });
  }

  function fileToDataUri(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(file);
    });
  }

  function setPhoto(dataUri) {
    draft.photo = dataUri || null;
    var img = $('#dropImg'), bar = $('#dropBar'), empty = $('#dropEmpty');
    if (dataUri) {
      img.src = dataUri;
      img.hidden = false;
      bar.hidden = false;
      empty.hidden = true;
      $('#photoSize').textContent = kb(dataUri.length * 0.75) + ' embedded';
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      bar.hidden = true;
      empty.hidden = false;
    }
    renderPreview();
  }

  function acceptImage(src) {
    return processImage(src).then(setPhoto).catch(function (e) {
      note(e.message || 'image failed', true);
    });
  }

  // ---------------------------------------------------------------- form --

  var FIELDS = ['title', 'type', 'guests', 'bedrooms', 'beds', 'baths', 'amenities',
                'price', 'rating', 'reviews', 'quote', 'quoteBy', 'place', 'when', 'story'];

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function readForm() {
    var g = function (k) { return $('#f-' + k).value.trim(); };
    var stay = {
      id: editingId || uniqueId(slug(g('title'))),
      title: g('title'),
      type: g('type') || null,
      guests: numOrNull(g('guests')),
      bedrooms: numOrNull(g('bedrooms')),
      beds: numOrNull(g('beds')),
      baths: numOrNull(g('baths')),
      amenities: g('amenities').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      price: numOrNull(g('price')),
      rating: numOrNull(g('rating')),
      reviews: numOrNull(g('reviews')),
      quote: g('quote') || null,
      quoteBy: g('quoteBy') || null,
      booker: draft.booker || null,
      crew: (draft.crew || []).slice(),
      lat: draft.lat,
      lng: draft.lng,
      place: g('place') || null,
      when: g('when') || null,
      story: g('story') || null,
      photo: draft.photo,
    };
    if (stay.booker && stay.crew.indexOf(stay.booker) === -1) stay.crew.unshift(stay.booker);
    return stay;
  }

  function writeForm(stay) {
    stay = stay || {};
    FIELDS.forEach(function (k) {
      var v = stay[k];
      if (k === 'amenities') v = (stay.amenities || []).join(', ');
      $('#f-' + k).value = v == null ? '' : v;
    });
    draft.booker = stay.booker || null;
    draft.crew = (stay.crew || []).slice();
    draft.lat = stay.lat == null ? null : stay.lat;
    draft.lng = stay.lng == null ? null : stay.lng;
    setPhoto(stay.photo || null);
    paintPickers();
    paintCoords();
    if (draft.lat != null) {
      map.setGuess(draft.lat, draft.lng);
      map.flyTo(draft.lat, draft.lng, 60);
    } else {
      map.clearMarkers();
      map.reset(true);
    }
    renderPreview();
  }

  function paintPickers() {
    var b = $('#f-booker');
    b.replaceChildren();
    crew.forEach(function (p) {
      var btn = el('button', 'pick' + (draft.booker === p.id ? ' is-on' : ''));
      btn.type = 'button';
      btn.appendChild(window.Listing.avatar(p));
      btn.appendChild(el('span', null, p.name));
      btn.addEventListener('click', function () {
        draft.booker = draft.booker === p.id ? null : p.id;
        paintPickers();
        renderPreview();
      });
      b.appendChild(btn);
    });

    var c = $('#f-crew');
    c.replaceChildren();
    crew.forEach(function (p) {
      var on = (draft.crew || []).indexOf(p.id) !== -1;
      var btn = el('button', 'pick' + (on ? ' is-on' : ''));
      btn.type = 'button';
      btn.appendChild(window.Listing.avatar(p));
      btn.appendChild(el('span', null, p.name));
      btn.addEventListener('click', function () {
        draft.crew = draft.crew || [];
        var i = draft.crew.indexOf(p.id);
        if (i === -1) draft.crew.push(p.id); else draft.crew.splice(i, 1);
        paintPickers();
      });
      c.appendChild(btn);
    });
  }

  function paintCoords() {
    var n = $('#coords');
    if (draft.lat == null) {
      n.textContent = 'No location set — click the map';
      return;
    }
    n.replaceChildren();
    n.appendChild(el('b', null, draft.lat.toFixed(4) + ', ' + draft.lng.toFixed(4)));
    n.appendChild(document.createTextNode('  — this exact point is what the game scores against'));
  }

  var previewTimer = null;
  function renderPreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      $('#preview').replaceChildren(window.Listing.render(readForm()));
    }, 90);
  }

  // ------------------------------------------------------------ geocoding --

  function searchPlaces(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        return rows.map(function (h) {
          return { lat: +h.lat, lng: +h.lon, label: h.display_name };
        });
      })
      .catch(function () {
        // Offline or blocked — the companion server can do it instead.
        return fetch(HELPER + '/geocode?q=' + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            return j.result ? [{ lat: j.result.lat, lng: j.result.lng, label: j.result.place }] : [];
          })
          .catch(function () { return []; });
      });
  }

  function reverseGeocode(lat, lng) {
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=' + lat + '&lon=' + lng;
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var a = j.address || {};
      var town = a.city || a.town || a.village || a.hamlet || a.municipality || a.county;
      var region = a.state || a.region;
      var country = a.country;
      // "Sisters, Oregon" at home, "Vík, Iceland" abroad.
      var bits = country === 'United States'
        ? [town, region]
        : [town, country];
      return bits.filter(Boolean).join(', ');
    }).catch(function () { return ''; });
  }

  var searchTimer = null;
  function wireSearch() {
    var input = $('#placeSearch'), list = $('#searchList');

    function close() { list.hidden = true; list.replaceChildren(); }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(searchTimer);
      if (q.length < 3) return close();
      // Nominatim asks for at most one request a second.
      searchTimer = setTimeout(function () {
        searchPlaces(q).then(function (rows) {
          if (!rows.length) return close();
          list.replaceChildren();
          rows.forEach(function (r) {
            var li = el('li');
            var head = r.label.split(',')[0];
            li.appendChild(el('strong', null, head));
            li.appendChild(el('small', null, r.label));
            li.addEventListener('click', function () {
              setLocation(r.lat, r.lng, true);
              if (!$('#f-place').value.trim()) {
                var parts = r.label.split(',').map(function (s) { return s.trim(); });
                $('#f-place').value = parts.length > 1
                  ? parts[0] + ', ' + parts[parts.length - 1]
                  : parts[0];
                renderPreview();
              }
              input.value = '';
              close();
            });
            list.appendChild(li);
          });
          list.hidden = false;
        });
      }, 550);
    });

    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.ed-search')) close();
    });
  }

  function setLocation(lat, lng, fly) {
    draft.lat = lat;
    draft.lng = lng;
    map.setGuess(lat, lng);
    if (fly) map.flyTo(lat, lng, 90);
    paintCoords();
  }

  // ------------------------------------------------------------- library --

  function renderLib() {
    var q = $('#libFilter').value.trim().toLowerCase();
    var list = $('#libList');
    list.replaceChildren();

    lib.filter(function (s) {
      if (!q) return true;
      return (s.title + ' ' + (s.place || '') + ' ' + (s.booker || '')).toLowerCase().indexOf(q) !== -1;
    }).forEach(function (s) {
      var li = el('li', 'lib' + (s.id === editingId ? ' is-editing' : ''));

      if (s.photo) {
        var img = el('img', 'lib__thumb');
        img.src = s.photo;
        img.alt = '';
        li.appendChild(img);
      } else {
        li.appendChild(el('div', 'lib__thumb', '⌂'));
      }

      var mid = el('div', 'lib__mid');
      mid.appendChild(el('span', 'lib__t', s.title || '(untitled)'));
      var sub = el('span', 'lib__s');
      if (s.booker && crewById[s.booker]) sub.appendChild(window.Listing.avatar(crewById[s.booker]));
      var problems = [];
      if (s.lat == null) problems.push('no location');
      if (!s.booker) problems.push('no booker');
      if (!s.place) problems.push('no place label');
      sub.appendChild(problems.length
        ? el('span', 'lib__warn', problems.join(' · '))
        : el('span', null, s.place));
      mid.appendChild(sub);
      li.appendChild(mid);

      var acts = el('div', 'lib__acts');
      [['✎', 'Edit', function () { startEdit(s.id); }],
       ['⧉', 'Duplicate', function () {
          var copy = JSON.parse(JSON.stringify(s));
          copy.id = uniqueId(slug(s.title) + '-copy');
          lib.push(copy);
          persist(); renderLib(); paintMeta();
        }],
       ['✕', 'Delete', function () {
          if (!confirm('Delete “' + (s.title || s.id) + '”?')) return;
          lib = lib.filter(function (x) { return x.id !== s.id; });
          if (editingId === s.id) newStay();
          persist(); renderLib(); paintMeta();
        }, true]
      ].forEach(function (a) {
        var b = el('button', a[3] ? 'is-danger' : null, a[0]);
        b.type = 'button';
        b.title = a[1];
        b.setAttribute('aria-label', a[1] + ' ' + (s.title || s.id));
        b.addEventListener('click', a[2]);
        acts.appendChild(b);
      });
      li.appendChild(acts);
      list.appendChild(li);
    });
  }

  function paintMeta() {
    var bytes = JSON.stringify(lib).length;
    var withPhotos = lib.filter(function (s) { return !!s.photo; }).length;
    $('#libMeta').textContent =
      lib.length + ' stays · ' + withPhotos + ' with photos · ' + kb(bytes) +
      (lib.length < 5 ? ' · need 5 to make a daily puzzle' : '');
  }

  function startEdit(id) {
    var s = lib.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    editingId = id;
    writeForm(s);
    renderLib();
    $('#btnSave').textContent = 'Update stay';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function newStay() {
    editingId = null;
    draft = { photo: null, lat: null, lng: null, booker: null, crew: [] };
    writeForm({});
    $('#btnSave').textContent = 'Save stay';
    renderLib();
  }

  function saveStay() {
    var stay = readForm();
    var missing = [];
    if (!stay.title) missing.push('a title');
    if (stay.lat == null) missing.push('a location');
    if (!stay.booker) missing.push('who booked it');
    if (!stay.place) missing.push('a place label');
    if (missing.length) return note('Still needs ' + missing.join(', ') + '.', true);

    if (editingId) {
      var i = lib.findIndex(function (x) { return x.id === editingId; });
      stay.id = editingId;
      if (i !== -1) lib[i] = stay; else lib.push(stay);
      note('Updated.');
    } else {
      stay.id = uniqueId(slug(stay.title));
      lib.push(stay);
      note('Saved — ' + lib.length + ' stays.');
      newStay();
    }
    persist();
    renderLib();
    paintMeta();
  }

  // -------------------------------------------------------------- export --

  function quote(s) {
    return "'" + String(s)
      .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      .replace(/\n/g, '\\n').replace(/\r/g, '') + "'";
  }

  function jsValue(v, ind) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return quote(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      var flat = v.every(function (x) { return typeof x === 'string'; });
      if (flat && v.join('').length < 68) return '[' + v.map(quote).join(', ') + ']';
      return '[\n' + v.map(function (x) { return ind + '  ' + jsValue(x, ind + '  '); }).join(',\n') + '\n' + ind + ']';
    }
    var keys = Object.keys(v);
    return '{\n' + keys.map(function (k) {
      var key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k);
      return ind + '  ' + key + ': ' + jsValue(v[k], ind + '  ');
    }).join(',\n') + '\n' + ind + '}';
  }

  var ORDER = ['id', 'title', 'type', 'guests', 'bedrooms', 'beds', 'baths', 'amenities',
               'price', 'rating', 'reviews', 'quote', 'quoteBy', 'booker', 'crew',
               'lat', 'lng', 'place', 'when', 'story', 'photo'];

  function ordered(stay) {
    var out = {};
    ORDER.forEach(function (k) { if (stay[k] !== undefined) out[k] = stay[k]; });
    Object.keys(stay).forEach(function (k) { if (!(k in out)) out[k] = stay[k]; });
    return out;
  }

  function buildStaysFile() {
    var head =
      '/* ===========================================================================\n' +
      '   stays.js — written by editor.html on ' + new Date().toISOString().slice(0, 10) + '\n' +
      '\n' +
      '   CREW  the people who could have booked a stay\n' +
      '   STAYS one entry per place. Photos are embedded as data URIs.\n' +
      '\n' +
      '   Keep editing here by hand, or reopen editor.html and load this file.\n' +
      '   =========================================================================== */\n\n';
    return head +
      'window.CREW = ' + jsValue(crew, '') + ';\n\n' +
      'window.STAYS = ' + jsValue(lib.map(ordered), '') + ';\n';
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function parseStaysFile(text) {
    var w = {};
    // The file is a pair of assignments onto `window`; run it with our own.
    new Function('window', text + '\n;')(w);
    return { crew: w.CREW, stays: w.STAYS };
  }

  // ------------------------------------------------------- import helper --

  function pingHelper() {
    var s = $('#helperStatus');
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 1500);
    fetch(HELPER + '/ping', { signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .then(function () {
        clearTimeout(t);
        s.replaceChildren();
        s.appendChild(el('span', 'ok', '● '));
        s.appendChild(document.createTextNode('Import helper is running. Paste any listing URL above.'));
      })
      .catch(function () {
        clearTimeout(t);
        s.replaceChildren();
        s.appendChild(document.createTextNode('○ URL import is off. Start it with '));
        s.appendChild(el('code', null, 'python tools/import_url.py --serve'));
        s.appendChild(document.createTextNode(' — or just fill the form below, which works offline.'));
      });
  }

  function importUrl() {
    var url = $('#urlIn').value.trim();
    if (!url) return;
    var btn = $('#btnFetch');
    btn.disabled = true;
    btn.textContent = 'Importing…';

    fetch(HELPER + '/fetch?url=' + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'import failed');
        var s = j.stay, info = j.result;
        newStay();
        $('#f-title').value = s.title || '';
        $('#f-amenities').value = (s.amenities || []).join(', ');
        if (s.price) $('#f-price').value = s.price;
        if (s.rating) $('#f-rating').value = s.rating;
        if (s.reviews) $('#f-reviews').value = s.reviews;
        if (s.quote) $('#f-quote').value = s.quote;
        if (s.place) $('#f-place').value = s.place;
        if (s.lat != null) setLocation(s.lat, s.lng, true);
        renderPreview();

        var msg = 'Imported from ' + (info.site || 'the page') + '.';
        if (info.geocoded) msg += ' Location is geocoded from the text — check it on the map.';
        note(msg);
        $('#urlIn').value = '';

        if (info.photo) return acceptImage(info.photo);
      })
      .catch(function (e) {
        note(String(e.message || e).split('\n')[0], true);
        // The helper's longer explanation is worth showing in full.
        if (String(e.message || '').indexOf('\n') !== -1) alert(e.message);
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Import';
      });
  }

  // ---------------------------------------------------------------- boot --

  function wire() {
    FIELDS.forEach(function (k) {
      $('#f-' + k).addEventListener('input', renderPreview);
    });

    $('#btnSave').addEventListener('click', saveStay);
    $('#btnNew').addEventListener('click', newStay);
    $('#btnFetch').addEventListener('click', importUrl);
    $('#urlIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') importUrl(); });
    $('#libFilter').addEventListener('input', renderLib);

    $('#btnExport').addEventListener('click', function () {
      if (!lib.length) return note('Nothing to export yet.', true);
      download('stays.js', buildStaysFile());
      note('Exported — drop it into src/ and reload the game.');
    });

    $('#btnImportFile').addEventListener('click', function () { $('#staysFileIn').click(); });
    $('#staysFileIn').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var parsed;
        try { parsed = parseStaysFile(text); }
        catch (err) { return note('Could not read that file: ' + err.message, true); }
        if (!parsed.stays || !parsed.stays.length) return note('No STAYS found in that file.', true);
        if (!confirm('Replace the current library (' + lib.length + ' stays) with ' +
                     parsed.stays.length + ' from that file?')) return;
        lib = parsed.stays;
        if (parsed.crew && parsed.crew.length) {
          crew = parsed.crew;
          crewById = {};
          crew.forEach(function (p) { crewById[p.id] = p; });
        }
        persist(); newStay(); renderLib(); paintMeta();
        note('Loaded ' + lib.length + ' stays.');
      });
      e.target.value = '';
    });

    $('#btnReseed').addEventListener('click', function () {
      if (!confirm('Discard the library and reload the stays that shipped in src/stays.js?')) return;
      lib = JSON.parse(JSON.stringify(window.STAYS || []));
      persist(); newStay(); renderLib(); paintMeta();
    });

    // ---- photo input: click, drop, paste
    var drop = $('#drop');
    drop.addEventListener('click', function (e) {
      if (e.target.closest('#btnPhotoClear')) return;
      $('#fileIn').click();
    });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); }
    });
    $('#fileIn').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) fileToDataUri(f).then(acceptImage);
      e.target.value = '';
    });
    $('#btnPhotoClear').addEventListener('click', function (e) {
      e.stopPropagation();
      setPhoto(null);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer.files[0];
      if (f && f.type.indexOf('image/') === 0) fileToDataUri(f).then(acceptImage);
    });
    document.addEventListener('paste', function (e) {
      if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        // Let a URL paste into the URL box behave normally.
        if (document.activeElement.id === 'urlIn') return;
      }
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); fileToDataUri(f).then(acceptImage); }
          return;
        }
      }
    });
  }

  // Whoever published last may have introduced a player this page has never
  // heard of. Pull the pooled crew in so they can be tagged on trips here.
  function mergePooledCrew() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve();
    var key = (window.SETTINGS || {}).key;
    return fetch('/api/stays', { headers: key ? { 'x-trippin-key': key } : {} })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (pool) {
        if (!pool || !pool.crew) return;
        pool.crew.forEach(function (p) {
          if (!p || !p.id || crewById[p.id]) return;
          crew.push(p);
          crewById[p.id] = p;
        });
      })
      .catch(function () { /* not served by the Worker */ });
  }

  function boot() {
    map = window.StayMap.create($('#map'), {
      onPick: function (lat, lng) {
        setLocation(lat, lng, false);
        if (!$('#f-place').value.trim()) {
          reverseGeocode(lat, lng).then(function (label) {
            if (label && !$('#f-place').value.trim()) {
              $('#f-place').value = label;
              renderPreview();
            }
          });
        }
      },
    });

    wire();
    wireSearch();
    pingHelper();

    mergePooledCrew().then(paintPickers);

    idbGet('library').then(function (saved) {
      lib = (saved && saved.length) ? saved : JSON.parse(JSON.stringify(window.STAYS || []));
      newStay();
      renderLib();
      paintMeta();
    }).catch(function () {
      lib = JSON.parse(JSON.stringify(window.STAYS || []));
      newStay();
      renderLib();
      paintMeta();
      note('Local storage unavailable — export before closing.', true);
    });
  }

  // Small surface for editor-trips.js, which owns the bulk-import panel.
  window.StayEditor = {
    crew: function () { return crew; },
    library: function () { return lib; },
    addCrew: function (person) {
      crew.push(person);
      crewById[person.id] = person;
      paintPickers();
      return person;
    },
    addStays: function (list) {
      var added = 0;
      list.forEach(function (stay) {
        stay.id = uniqueId(stay.id || slug(stay.place || stay.title));
        lib.push(stay);
        added++;
      });
      persist();
      renderLib();
      paintMeta();
      return added;
    },
    edit: startEdit,
    note: note,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
