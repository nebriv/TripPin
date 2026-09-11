/* ===========================================================================
   map.js — a small self-contained slippy map.

   No tiles, no network, no dependencies. Geometry comes from worldmap.js and
   is projected once at load; pan and zoom are pure viewBox maths after that,
   so it stays smooth on a phone.

   Two projections ship: Equal Earth (default, equal-area, honest about
   Africa) and Mercator (dishonest about Africa, much easier to tap Svalbard).
   The player switches with the globe button; the choice is remembered.

   Layers, bottom to top:
     <svg>   sphere, coastlines, borders, states, the guess->answer line
     <div>   city labels and pin markers, positioned in screen space so they
             never scale with the map

   StayMap.create(hostEl, opts) -> map
     opts.onPick(lat, lng)   fired when the player drops a pin
   =========================================================================== */

(function () {
  'use strict';

  var W = 1024;                   // world width in projected units
  var H;                          // world height, derived below
  var LAT_TOP = 84;               // we never pan beyond the inhabited band
  var LAT_BOTTOM = -60;
  var MAX_ZOOM = 3000;

  // ------------------------------------------------------------ projection --

  // Two projections, because they are good at opposite things.
  //
  //   Equal Earth  genuinely equal-area, so Africa is fourteen Greenlands as
  //                it is in life. The price is squashed poles: Svalbard is a
  //                few pixels tall until you zoom.
  //   Mercator     wildly inflates high latitudes, which is terrible for
  //                honesty and excellent for clicking on Longyearbyen.
  //
  // Both map 360 degrees of longitude onto W units, so zoom means the same
  // thing in either and we can switch without losing the view.

  var RAD = Math.PI / 180, DEG = 180 / Math.PI;

  var A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
  var M = Math.sqrt(3) / 2;

  function eeY(l) {                       // l is the auxiliary angle theta
    var l2 = l * l, l6 = l2 * l2 * l2;
    return l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  }
  function eeDY(l) {                      // d(eeY)/dl, also the x denominator
    var l2 = l * l, l6 = l2 * l2 * l2;
    return A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2);
  }

  var EE_RX = Math.PI / (M * eeDY(0));
  var EE_RY = eeY(Math.asin(M));
  var EE_K = W / (2 * EE_RX);

  var MERC_MAX_LAT = 85.05112878;

  var PROJECTIONS = {
    equalearth: {
      id: 'equalearth',
      name: 'Equal Earth',
      note: 'True relative sizes',
      round: true,                        // the world is not a rectangle
      H: 2 * EE_RY * EE_K,
      forward: function (lng, lat) {
        var phi = Math.max(-90, Math.min(90, lat)) * RAD;
        var l = Math.asin(M * Math.sin(phi));
        return [
          W / 2 + ((lng * RAD) * Math.cos(l)) / (M * eeDY(l)) * EE_K,
          this.H / 2 - eeY(l) * EE_K,
        ];
      },
      inverse: function (px, py) {
        var y = (this.H / 2 - py) / EE_K, x = (px - W / 2) / EE_K;
        if (Math.abs(y) > EE_RY + 1e-9) return null;
        var l = y;
        for (var i = 0; i < 14; i++) {
          var d = (eeY(l) - y) / eeDY(l);
          l -= d;
          if (Math.abs(d) < 1e-12) break;
        }
        var lam = (M * x * eeDY(l)) / Math.cos(l);
        if (Math.abs(lam) > Math.PI + 1e-6) return null;
        var sn = Math.sin(l) / M;
        if (Math.abs(sn) > 1) return null;
        return [Math.asin(sn) * DEG, lam * DEG];
      },
    },

    mercator: {
      id: 'mercator',
      name: 'Mercator',
      note: 'Easier to hit the Arctic',
      round: false,
      H: W,
      forward: function (lng, lat) {
        var la = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat));
        var sn = Math.sin(la * RAD);
        return [
          ((lng + 180) / 360) * W,
          (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * W,
        ];
      },
      inverse: function (px, py) {
        var lng = (px / W) * 360 - 180;
        if (lng < -180.000001 || lng > 180.000001) return null;
        var n = Math.PI * (1 - (2 * py) / W);
        return [Math.atan(Math.sinh(n)) * DEG, lng];
      },
    },
  };

  var P = PROJECTIONS.equalearth;

  function project(lng, lat) { return P.forward(lng, lat); }
  function unproject(px, py) { return P.inverse(px, py); }

  // Great-circle distance in miles.
  function haversine(lat1, lng1, lat2, lng2) {
    var R = 3958.7613;
    var dLat = (lat2 - lat1) * RAD;
    var dLng = (lng2 - lng1) * RAD;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // --------------------------------------------------------------- decoding --

  // Inverse of encode_ring() in tools/build_map.py (Google polyline).
  function decodeRing(str, factor) {
    var pts = [];
    var i = 0, x = 0, y = 0, len = str.length;
    while (i < len) {
      var r = 0, sh = 0, b;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      x += (r & 1) ? ~(r >> 1) : (r >> 1);
      r = 0; sh = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      y += (r & 1) ? ~(r >> 1) : (r >> 1);
      pts.push(x / factor, y / factor);
    }
    return pts;
  }

  // Every ring becomes one subpath of a single big <path>. Rings that jump the
  // antimeridian are broken rather than smeared across the map.
  function ringsToPath(rings, factor, closed) {
    var out = [];
    for (var r = 0; r < rings.length; r++) {
      var flat = decodeRing(rings[r], factor);
      var started = false, prevLng = 0;
      for (var i = 0; i < flat.length; i += 2) {
        var lng = flat[i];
        if (started && Math.abs(lng - prevLng) > 180) {
          if (closed) out.push('Z');
          started = false;
        }
        var p = project(lng, flat[i + 1]);
        out.push((started ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1));
        started = true;
        prevLng = lng;
      }
      if (started && closed) out.push('Z');
    }
    return out.join('');
  }

  // The outline of the whole globe: two curved meridians and two pole lines.
  // A rectangular projection just gets its bounding box.
  function spherePath() {
    if (!P.round) return 'M0 0H' + W + 'V' + P.H + 'H0Z';
    var d = [], i;
    for (i = -180; i <= 180; i += 2) d.push((i === -180 ? 'M' : 'L') + project(i, 90).join(' '));
    for (i = 90; i >= -90; i -= 2) d.push('L' + project(180, i).join(' '));
    for (i = 180; i >= -180; i -= 2) d.push('L' + project(i, -90).join(' '));
    for (i = -90; i <= 90; i += 2) d.push('L' + project(-180, i).join(' '));
    return d.join('') + 'Z';
  }

  // ------------------------------------------------------------------- map --

  function create(host, opts) {
    opts = opts || {};
    var data = window.WORLDMAP;
    if (!data) throw new Error('worldmap.js must load before map.js');

    var NS = 'http://www.w3.org/2000/svg';
    host.classList.add('map-host');
    host.innerHTML = '';

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'map-svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    host.appendChild(svg);

    var gGeo = document.createElementNS(NS, 'g');
    svg.appendChild(gGeo);

    function path(cls, d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      p.setAttribute('d', d);
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      gGeo.appendChild(p);
      return p;
    }

    var pSphere = path('map-sphere', '');
    var pLand = path('map-land', '');
    var pAdmin = path('map-admin', '');
    pAdmin.style.opacity = 0;

    var shotLine = document.createElementNS(NS, 'path');
    shotLine.setAttribute('class', 'map-shot');
    shotLine.setAttribute('vector-effect', 'non-scaling-stroke');
    shotLine.style.display = 'none';
    svg.appendChild(shotLine);

    var overlay = document.createElement('div');
    overlay.className = 'map-overlay';
    host.appendChild(overlay);

    var labels = document.createElement('div');
    labels.className = 'map-labels';
    overlay.appendChild(labels);

    var pins = document.createElement('div');
    pins.className = 'map-pins';
    overlay.appendChild(pins);

    var cities = data.cities.map(function (c) {
      return { name: c[0], lng: c[1], lat: c[2], x: 0, y: 0, rank: c[3], el: null };
    });

    // Everything in projected space has to be recomputed when the projection
    // changes, which is cheap enough (~40k points) to just redo wholesale.
    var yTop = 0, yBot = 0;
    function rebuildGeometry() {
      pSphere.setAttribute('d', spherePath());
      pLand.setAttribute('d', ringsToPath(data.countries, data.factor, true));
      pAdmin.setAttribute('d', ringsToPath(data.admin1, data.factor, false));
      for (var i = 0; i < cities.length; i++) {
        var q = project(cities[i].lng, cities[i].lat);
        cities[i].x = q[0]; cities[i].y = q[1];
      }
      yTop = project(0, LAT_TOP)[1];
      yBot = project(0, LAT_BOTTOM)[1];
    }

    // ------------------------------------------------------------- view --

    var cw = 1, ch = 1;
    try {
      var saved = localStorage.getItem('trippin.v1.projection');
      if (saved && PROJECTIONS[saved]) P = PROJECTIONS[saved];
    } catch (e) { /* private window */ }
    rebuildGeometry();
    var view = { x: W / 2, y: (yTop + yBot) / 2, z: 1 };

    function measure() {
      var r = host.getBoundingClientRect();
      cw = Math.max(1, r.width);
      ch = Math.max(1, r.height);
    }

    // Zoomed all the way out you must be able to see every longitude at once,
    // or half the world is unreachable without panning first.
    function minZoom() { return 1; }

    function viewSize() {
      var vw = W / view.z;
      return { vw: vw, vh: (vw * ch) / cw };
    }

    function clampView() {
      view.z = Math.max(minZoom(), Math.min(MAX_ZOOM, view.z));
      var s = viewSize();
      if (s.vw >= W) view.x = W / 2;
      else view.x = Math.max(s.vw / 2, Math.min(W - s.vw / 2, view.x));
      if (s.vh >= yBot - yTop) view.y = (yTop + yBot) / 2;
      else view.y = Math.max(yTop + s.vh / 2, Math.min(yBot - s.vh / 2, view.y));
    }

    function applyView() {
      var s = viewSize();
      svg.setAttribute('viewBox',
        (view.x - s.vw / 2) + ' ' + (view.y - s.vh / 2) + ' ' + s.vw + ' ' + s.vh);
      pAdmin.style.opacity = view.z > 3 ? Math.min(1, (view.z - 3) / 6) * 0.75 : 0;
      drawLabels();
      drawPins();
    }

    function toScreen(wx, wy) {
      var s = viewSize();
      return [
        ((wx - (view.x - s.vw / 2)) / s.vw) * cw,
        ((wy - (view.y - s.vh / 2)) / s.vh) * ch,
      ];
    }

    function toWorld(sx, sy) {
      var s = viewSize();
      return [view.x - s.vw / 2 + (sx / cw) * s.vw, view.y - s.vh / 2 + (sy / ch) * s.vh];
    }

    // ----------------------------------------------------------- labels --

    var MAX_LABELS = 90;

    function drawLabels() {
      // Natural Earth's scalerank is roughly "the zoom this place earns a
      // label at", so it doubles as our budget.
      var budget = Math.max(0, Math.min(10, Math.round(Math.log2(view.z) * 1.25)));
      var placed = [], frag = document.createDocumentFragment(), shown = 0, pad = 60;

      for (var i = 0; i < cities.length && shown < MAX_LABELS; i++) {
        var c = cities[i];
        if (c.rank > budget) break;                 // list is pre-sorted by rank
        var p = toScreen(c.x, c.y);
        if (p[0] < -pad || p[0] > cw + pad || p[1] < -pad || p[1] > ch + pad) continue;

        var box = [p[0] - 4, p[1] - 8, p[0] + 7 + c.name.length * 6.2, p[1] + 8];
        var hit = false;
        for (var j = 0; j < placed.length; j++) {
          var b = placed[j];
          if (box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) { hit = true; break; }
        }
        if (hit) continue;
        placed.push(box);

        if (!c.el) {
          c.el = document.createElement('div');
          c.el.className = 'map-city';
          c.el.innerHTML = '<i></i><span></span>';
          c.el.lastChild.textContent = c.name;
        }
        c.el.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px)';
        frag.appendChild(c.el);
        shown++;
      }
      labels.replaceChildren(frag);
    }

    // ------------------------------------------------------------- pins --

    var guess = null, answer = null, pinEls = {};

    function pinEl(kind) {
      if (!pinEls[kind]) {
        var e = document.createElement('div');
        e.className = 'map-pin map-pin--' + kind;
        e.innerHTML = '<span class="map-pin__dot"></span>';
        pinEls[kind] = e;
      }
      return pinEls[kind];
    }

    function place(el, lat, lng) {
      var w = project(lng, lat);
      var p = toScreen(w[0], w[1]);
      el.style.transform = 'translate(' + p[0].toFixed(1) + 'px,' + p[1].toFixed(1) + 'px)';
      return w;
    }

    function drawPins() {
      var frag = document.createDocumentFragment();
      if (guess) frag.appendChild((place(pinEl('guess'), guess.lat, guess.lng), pinEl('guess')));
      if (answer) {
        var ae = pinEl('answer');
        place(ae, answer.lat, answer.lng);
        var lbl = ae.querySelector('.map-pin__label');
        if (!lbl) {
          lbl = document.createElement('span');
          lbl.className = 'map-pin__label';
          ae.appendChild(lbl);
        }
        lbl.textContent = answer.label || '';
        frag.appendChild(ae);
      }
      pins.replaceChildren(frag);

      if (guess && answer) {
        var p1 = project(guess.lng, guess.lat);
        var p2 = project(answer.lng, answer.lat);
        shotLine.setAttribute('d', 'M' + p1[0] + ' ' + p1[1] + 'L' + p2[0] + ' ' + p2[1]);
        shotLine.style.display = '';
      } else {
        shotLine.style.display = 'none';
      }
    }

    // ----------------------------------------------------- interactions --

    var interactive = true, raf = null;
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = null; clampView(); applyView(); });
    }

    function zoomAbout(sx, sy, factor) {
      var before = toWorld(sx, sy);
      view.z = Math.max(minZoom(), Math.min(MAX_ZOOM, view.z * factor));
      clampView();
      var after = toWorld(sx, sy);
      view.x += before[0] - after[0];
      view.y += before[1] - after[1];
      schedule();
    }

    function localPoint(e) {
      var r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function pickAt(sx, sy) {
      var w = toWorld(sx, sy);
      var ll = unproject(w[0], w[1]);
      if (!ll) return;                      // clicked the space outside the globe
      setGuess(ll[0], ll[1]);
      if (opts.onPick) opts.onPick(ll[0], ll[1]);
    }

    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = localPoint(e);
      var d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAbout(p[0], p[1], Math.pow(2, -d / 320));
    }, { passive: false });

    var pointers = new Map(), dragged = 0, pinchStart = null;

    host.addEventListener('pointerdown', function (e) {
      host.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, localPoint(e));
      dragged = 0;
      if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchStart = {
          dist: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]),
          z: view.z,
        };
      }
      host.classList.add('is-grabbing');
    });

    host.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      var prev = pointers.get(e.pointerId);
      var cur = localPoint(e);
      pointers.set(e.pointerId, cur);

      if (pointers.size === 2 && pinchStart) {
        var pts = Array.from(pointers.values());
        var dist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
        var mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        var before = toWorld(mid[0], mid[1]);
        view.z = Math.max(minZoom(), Math.min(MAX_ZOOM, pinchStart.z * (dist / pinchStart.dist)));
        clampView();
        var after = toWorld(mid[0], mid[1]);
        view.x += before[0] - after[0];
        view.y += before[1] - after[1];
        dragged += 10;
        schedule();
        return;
      }

      var dx = cur[0] - prev[0], dy = cur[1] - prev[1];
      dragged += Math.abs(dx) + Math.abs(dy);
      var s = viewSize();
      view.x -= (dx / cw) * s.vw;
      view.y -= (dy / ch) * s.vh;
      schedule();
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      var p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) {
        host.classList.remove('is-grabbing');
        if (dragged < 6 && interactive) pickAt(p[0], p[1]);
      }
    }
    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', endPointer);

    host.addEventListener('dblclick', function (e) {
      e.preventDefault();
      var p = localPoint(e);
      zoomAbout(p[0], p[1], 2);
    });

    // Keyboard: arrows pan, +/- zoom, Enter drops a pin at the centre.
    host.addEventListener('keydown', function (e) {
      var s = viewSize(), step = s.vw / 12, handled = true;
      switch (e.key) {
        case 'ArrowLeft':  view.x -= step; break;
        case 'ArrowRight': view.x += step; break;
        case 'ArrowUp':    view.y -= step; break;
        case 'ArrowDown':  view.y += step; break;
        case '+': case '=': zoomAbout(cw / 2, ch / 2, 1.9); return e.preventDefault();
        case '-': case '_': zoomAbout(cw / 2, ch / 2, 1 / 1.9); return e.preventDefault();
        case 'Enter': case ' ':
          if (interactive) pickAt(cw / 2, ch / 2);
          return e.preventDefault();
        default: handled = false;
      }
      if (handled) { e.preventDefault(); schedule(); }
    });

    new ResizeObserver(function () { measure(); clampView(); applyView(); }).observe(host);

    // ---------------------------------------------------------- controls --

    var ctl = document.createElement('div');
    ctl.className = 'map-ctl';
    ctl.innerHTML =
      '<button type="button" data-act="in"  aria-label="Zoom in">+</button>' +
      '<button type="button" data-act="out" aria-label="Zoom out">−</button>' +
      '<button type="button" data-act="reset" aria-label="Reset view">⌂</button>' +
      '<button type="button" data-act="proj" class="map-ctl__proj"></button>';
    ctl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'in') zoomAbout(cw / 2, ch / 2, 1.9);
      else if (b.dataset.act === 'out') zoomAbout(cw / 2, ch / 2, 1 / 1.9);
      else if (b.dataset.act === 'proj') setProjection(P.round ? 'mercator' : 'equalearth');
      else reset(true);
    });
    host.appendChild(ctl);

    // ------------------------------------------------------------- api --

    var projBtn = ctl.querySelector('.map-ctl__proj');

    function paintProjBtn() {
      projBtn.textContent = P.round ? '◍' : '▦';
      var other = P.round ? PROJECTIONS.mercator : PROJECTIONS.equalearth;
      var label = 'Switch to ' + other.name + ' (' + other.note.toLowerCase() + ')';
      projBtn.title = label;
      projBtn.setAttribute('aria-label', label);
      host.dataset.projection = P.id;
    }

    function setProjection(id) {
      var next = PROJECTIONS[id];
      if (!next || next === P) return;
      // Hold the view on the same piece of the world across the switch.
      var centre = unproject(view.x, view.y);
      var z = view.z;
      P = next;
      rebuildGeometry();
      if (centre) {
        var q = project(centre[1], centre[0]);
        view.x = q[0]; view.y = q[1]; view.z = z;
      } else {
        view = { x: W / 2, y: (yTop + yBot) / 2, z: 1 };
      }
      clampView();
      applyView();
      paintProjBtn();
      try { localStorage.setItem('trippin.v1.projection', P.id); } catch (e) { /* fine */ }
    }

    paintProjBtn();

    function setGuess(lat, lng) {
      guess = { lat: lat, lng: lng };
      host.classList.add('has-guess');
      drawPins();
    }

    function clearMarkers() {
      guess = null; answer = null;
      host.classList.remove('has-guess');
      drawPins();
    }

    var anim = null;
    function animateTo(target, ms) {
      if (anim) cancelAnimationFrame(anim);
      var from = { x: view.x, y: view.y, z: view.z };
      var t0 = performance.now();
      var lz0 = Math.log(from.z);
      var lz1 = Math.log(Math.max(minZoom(), Math.min(MAX_ZOOM, target.z)));
      (function step(now) {
        var t = Math.min(1, (now - t0) / ms);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        view.x = from.x + (target.x - from.x) * e;
        view.y = from.y + (target.y - from.y) * e;
        view.z = Math.exp(lz0 + (lz1 - lz0) * e);   // log-interpolate so it feels even
        clampView();
        applyView();
        anim = t < 1 ? requestAnimationFrame(step) : null;
      })(performance.now());
    }

    function reset(animate) {
      var target = { x: W / 2, y: (yTop + yBot) / 2, z: minZoom() };
      if (animate) animateTo(target, 420);
      else { view = target; clampView(); applyView(); }
    }

    // Frame two points with padding — used on reveal.
    function frameBoth(a, b, animate) {
      var p1 = project(a.lng, a.lat), p2 = project(b.lng, b.lat);
      var spanX = Math.max(Math.abs(p2[0] - p1[0]), 1);
      var spanY = Math.max(Math.abs(p2[1] - p1[1]), 1);
      var z = Math.max(minZoom(), Math.min(MAX_ZOOM,
        Math.min(W / (spanX * 1.9), (W * ch) / cw / (spanY * 2.4))));
      var t = { x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2, z: z };
      if (animate) animateTo(t, 620); else { view = t; clampView(); applyView(); }
    }

    measure();
    reset(false);

    return {
      project: project,
      unproject: unproject,
      haversine: haversine,
      setGuess: setGuess,
      getGuess: function () { return guess; },
      clearMarkers: clearMarkers,
      showAnswer: function (lat, lng, label) {
        answer = { lat: lat, lng: lng, label: label };
        drawPins();
      },
      frameBoth: frameBoth,
      flyTo: function (lat, lng, z) {
        var p = project(lng, lat);
        animateTo({ x: p[0], y: p[1], z: z || 40 }, 520);
      },
      reset: reset,
      setProjection: setProjection,
      projection: function () { return P.id; },
      setInteractive: function (v) {
        interactive = v;
        host.classList.toggle('is-locked', !v);
      },
      refresh: function () { measure(); clampView(); applyView(); },
    };
  }

  window.StayMap = {
    create: create,
    project: project,
    unproject: unproject,
    haversine: haversine,
  };
})();
