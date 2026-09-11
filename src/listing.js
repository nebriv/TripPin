/* ===========================================================================
   listing.js — the listing card.

   Shared by the game and by editor.html, so the preview you build a stay
   against is the exact card players are shown.

   What the card deliberately does NOT show: the listing title, and the date.
   Host-written titles routinely name the town, and the month is half the
   answer on its own. Both are reveal detail.

   What it does show is the photos and the odd amenity. "29 inch TV with
   standard cable" and "Private backyard - Not fully fenced" tell you something
   about a place; "Wifi" does not. Amenities are ranked by how much they narrow
   things down and the strangest is pulled out on its own line, under a red
   ODD DETAIL label. Change the ranking and the card changes character.

   25 of the 41 stays have no listing record at all. Those get one dashed
   block that says so over the night count, so the empty slot reads as
   deliberate rather than as a gap.
   =========================================================================== */

(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ------------------------------------------------------------ redaction --

  // Amenity text and review quotes occasionally name the place. Short words
  // are skipped so "New" or "Bay" do not eat real text.
  function redact(text, place) {
    if (!text || !place) return text || '';
    var out = text;
    place.split(/[,/]/).forEach(function (part) {
      var word = part.trim();
      if (word.length < 4) return;
      out = out.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '•••');
    });
    return out;
  }

  // ------------------------------------------------------------ amenities --

  // Everyone has wifi. Rank on how much a thing narrows down the place.
  var DULL = /^(wifi|kitchen|essentials|tv|hdtv|washer|dryer|heating|air conditioning|free parking on premises|hot water|hangers|iron|shampoo|smoke alarm|carbon monoxide alarm|self check-?in|bed linens|cooking basics|dishes and silverware|refrigerator|microwave|coffee maker|long term stays allowed|dedicated workspace|pets allowed)$/i;
  var JUICY = /sauna|hot tub|fire ?pit|fireplace|wood stove|pool|outdoor shower|piano|kayak|canoe|boat|bikes?|ski|beach|waterfront|lake|river|ocean|pond|barn|hammock|telescope|arcade|pool table|sound system|ev charger|outhouse|composting|generator|well water|no wifi|rifle|aurora|hot spring|onsen|treehouse|dock|trail|crib/i;

  function amenityScore(name) {
    var s = 0;
    if (DULL.test(name.trim())) s -= 4;
    if (JUICY.test(name)) s += 4;
    if (/\d/.test(name)) s += 2;              // "29 inch TV", "73 Mbps"
    if (/[-–—]/.test(name)) s += 2;           // "Private backyard - Not fully fenced"
    if (/private|shared|only|not |no /i.test(name)) s += 1;
    s += Math.min(2, Math.floor(name.length / 18));
    return s;
  }

  function rankAmenities(list) {
    return (list || []).map(function (a, i) {
      return { name: a, score: amenityScore(a), i: i };
    }).sort(function (a, b) {
      return b.score - a.score || a.i - b.i;
    });
  }

  // The card no longer draws these — the label does the work. The editor
  // still uses them, so the function stays exported.
  var AMENITY_ICON = [
    [/no wifi|patchy|radio only/i, '📵'],
    [/hot tub|sauna|soak|onsen|bath/i, '♨️'],
    [/pool/i, '🏊'],
    [/wifi|mbps|internet/i, '📶'],
    [/workspace|desk|office/i, '💻'],
    [/stove|fire|braai|bbq|grill|heating|heat pump/i, '🔥'],
    [/pet|dog|cat/i, '🐾'],
    [/park|4x4|garage|ev charger/i, '🅿️'],
    [/wash|laundry|dry|dishwasher/i, '🧺'],
    [/ski|boot|gear|snow/i, '🎿'],
    [/kayak|surf|bike|bicycle|scooter|canoe|boat|dock/i, '🚲'],
    [/view|vista|aurora|telescope|binocular|stargaz/i, '👁️'],
    [/beach|waterfront|ocean|river|lake|sea|creek|tide|pond/i, '🌊'],
    [/breakfast|kitchen|espresso|coffee|microwave|oven|fridge|cooking/i, '☕'],
    [/garden|courtyard|terrace|patio|balcony|porch|roof|stoep|deck|backyard/i, '🪴'],
    [/shared|host on site|private room/i, '🚪'],
    [/stairs|elevator|lift|ladder/i, '🪜'],
    [/a\/c|air con|fan|cooling/i, '❄️'],
    [/solar|composting|off-grid|eco|generator/i, '♻️'],
    [/mosquito|net|rifle|blackout|safe|first aid|alarm/i, '🛡️'],
    [/tv|netflix|record player|game|books|arcade|sound/i, '📺'],
    [/crib|baby|family|child/i, '🧸'],
  ];

  function amenityIcon(name) {
    for (var i = 0; i < AMENITY_ICON.length; i++) {
      if (AMENITY_ICON[i][0].test(name)) return AMENITY_ICON[i][1];
    }
    return '•';
  }

  // ------------------------------------------------------------- players --

  // The player's mark. A colour dot by default; their animal when the roster
  // knows it, because everyone knows whose bear that is.
  function avatar(person, size) {
    var glyph = person && person.animal;
    var a = el('span', 'avatar' + (size ? ' avatar--' + size : '') + (glyph ? ' avatar--glyph' : ''));
    if (glyph) {
      a.textContent = glyph;
      a.setAttribute('aria-hidden', 'true');
    } else {
      a.style.setProperty('--who', playerColor(person));
    }
    return a;
  }

  // Known players get their token so the dot lightens in dark mode; anyone
  // added later falls back to the colour the roster carries.
  function playerColor(person) {
    if (!person) return 'var(--faint)';
    var id = String(person.id || '').replace(/[^a-z0-9_-]/g, '');
    var fallback = person.color || 'var(--faint)';
    return id ? 'var(--p-' + id + ', ' + fallback + ')' : fallback;
  }

  function fmtRating(r) {
    return String(Math.round(r * 100) / 100);
  }

  // ---------------------------------------------------------------- card --

  // opts: { exhibit: 2, host: true, photoCount: true }
  function render(stay, opts) {
    opts = opts || {};
    var card = el('article', 'listing' + (opts.host ? ' listing--host' : ''));
    var place = stay.place || '';

    if (opts.host) {
      var head = el('div', 'listing__host');
      head.appendChild(el('span', null, 'Your stay'));
      head.appendChild(el('span', null, "So we'll ask something else"));
      card.appendChild(head);
    }

    // ---- photos: the hero is the puzzle
    var extras = (stay.photos || []).slice(1, 4);
    if (stay.photo) {
      var media = el('div', 'listing__media');
      var img = el('img', 'listing__img');
      img.src = stay.photo;
      img.alt = '';
      img.loading = 'eager';
      media.appendChild(img);
      if (stay.type) media.appendChild(el('span', 'listing__type', stay.type));
      if (opts.exhibit) {
        media.appendChild(el('span', 'listing__exhibit',
          'Exhibit ' + String(opts.exhibit).padStart(2, '0')));
      }
      card.appendChild(media);

      // More of the listing's own photos. These are CDN links rather than
      // embedded, so any that fail remove themselves instead of leaving a gap.
      if (extras.length) {
        var strip = el('div', 'listing__strip');
        extras.forEach(function (src) {
          // A real button: it swaps the hero photo, so it is a control, and a
          // bare <img> with a listener has no keyboard path and announces
          // itself as a picture that does nothing.
          var b = el('button', 'listing__thumbbtn');
          b.type = 'button';
          b.setAttribute('aria-label', 'Show this photo instead');
          var t = el('img', 'listing__thumb');
          t.src = src;
          t.alt = '';
          t.loading = 'lazy';
          t.addEventListener('error', function () { b.remove(); });
          b.addEventListener('click', function () {
            var was = img.src;
            img.src = t.src;
            t.src = was;
          });
          b.appendChild(t);
          strip.appendChild(b);
        });
        card.appendChild(strip);
      }
    } else {
      var ph = el('div', 'listing__media listing__media--empty');
      ph.appendChild(el('span', 'listing__nophoto', 'No photo to show you'));
      if (stay.type) ph.appendChild(el('span', 'listing__type', stay.type));
      card.appendChild(ph);
    }

    var body = el('div', 'listing__body');

    var ranked = rankAmenities(stay.amenities);
    var star = ranked.length && ranked[0].score > 2 ? ranked[0].name : null;

    // ---- nothing on file: one dashed block, and nothing else
    if (!ranked.length && !stay.guests && !stay.beds && !stay.rating) {
      var thin = el('div', 'listing__thin');
      thin.appendChild(el('p', null, 'No listing record'));
      thin.appendChild(el('p', null, stay.nights
        ? stay.nights + (stay.nights === 1 ? ' night' : ' nights')
        : 'Somewhere they slept'));
      body.appendChild(thin);
      card.appendChild(body);
      return card;
    }

    // ---- the odd detail, under its red label
    if (star) {
      body.appendChild(el('p', 'listing__oddlabel', 'Odd detail'));
      body.appendChild(el('p', 'listing__odd', redact(star, place)));
    }

    // ---- the rest as chips, never the odd one
    var rest = ranked.filter(function (a) { return a.name !== star; }).slice(0, 5);
    if (rest.length) {
      var chips = el('ul', 'chips');
      rest.forEach(function (a) {
        chips.appendChild(el('li', 'chip', redact(a.name, place)));
      });
      body.appendChild(chips);
    }

    // ---- the counts, in mono, on one line
    var facts = [];
    if (stay.guests) facts.push(stay.guests + ' guests');
    if (stay.bedrooms) facts.push(stay.bedrooms + ' br');
    if (stay.beds) facts.push(stay.beds + (stay.beds === 1 ? ' bed' : ' beds'));
    if (stay.baths) facts.push(stay.baths + (stay.baths === 1 ? ' bath' : ' baths'));
    if (!facts.length && stay.nights) {
      facts.push(stay.nights + (stay.nights === 1 ? ' night' : ' nights'));
    }
    var more = rest.length;
    var row = el('p', 'listing__facts');
    var left = el('span', null, facts.join(' · '));
    // On a phone the chips are folded away, so the count stands in for them.
    if (more) left.appendChild(el('span', 'listing__more', (facts.length ? ' · ' : '') + '+' + more + ' more'));
    row.appendChild(left);
    if (stay.rating) {
      var rate = el('span', 'listing__rating');
      rate.appendChild(document.createTextNode('★ ' + fmtRating(stay.rating)));
      if (stay.reviews) rate.appendChild(el('span', 'muted', ' (' + stay.reviews + ')'));
      row.appendChild(rate);
    }
    if (facts.length || stay.rating) body.appendChild(row);

    if (stay.quote) {
      var bq = el('blockquote', 'listing__quote');
      bq.appendChild(el('p', null, '“' + redact(stay.quote, place) + '”'));
      if (stay.quoteBy) bq.appendChild(el('cite', null, redact(stay.quoteBy, place)));
      body.appendChild(bq);
    }

    if (body.childNodes.length) card.appendChild(body);
    return card;
  }

  // The odd detail on its own, for the folded card on a phone.
  function oddOf(stay) {
    var ranked = rankAmenities(stay.amenities);
    if (ranked.length && ranked[0].score > 2) {
      return { hasOdd: true, text: redact(ranked[0].name, stay.place || '') };
    }
    if (stay.nights) return { hasOdd: false, text: stay.nights + (stay.nights === 1 ? ' night' : ' nights') };
    return { hasOdd: false, text: 'No listing record' };
  }

  window.Listing = {
    render: render,
    oddOf: oddOf,
    avatar: avatar,
    playerColor: playerColor,
    amenityIcon: amenityIcon,
    rankAmenities: rankAmenities,
    redact: redact,
    el: el,
  };
})();
