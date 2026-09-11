/* ===========================================================================
   trips.js — read an Airbnb "Trips" page into stays.

   Airbnb's markup is machine-generated: every class is a hash like
   "c1dda67n atm_9s_1txwivl" and they change without warning. So nothing here
   looks at a class name. It anchors on the things Airbnb cannot change
   without breaking its own site:

     * each card is a link to /trips/v1/<id>
     * the listing photo is an <img> on a0.muscache.com/im/pictures/...
     * traveller avatars are on .../im/users/, .../im/pictures/user/ or
       .../im/Portrait/, and carry the person's name in alt
     * one of the two text lines matches a date range

   Everything is best-effort: a card missing a photo or a date still comes
   through, just with that field null.
   =========================================================================== */

(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var MONTH_RE = new RegExp('\\b(' + MONTHS.join('|') + ')\\b', 'i');
  // "August 1 – 4, 2026", "December 30 – January 1, 2018", "May 13 – 15, 2014"
  var DATE_RE = new RegExp(
    '^\\s*(?:' + MONTHS.join('|') + ')\\s+\\d{1,2}\\s*(?:,\\s*\\d{4})?\\s*[–—-]\\s*' +
    '(?:(?:' + MONTHS.join('|') + ')\\s+)?\\d{1,2}\\s*,?\\s*\\d{4}\\s*$', 'i');
  var PLUS_RE = /^\+(\d+)$/;
  var OTHERS_RE = /^(\d+)\s+others?$/i;

  function txt(s) {
    return (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isAvatar(src) {
    return /\/im\/(users|Portrait)\//i.test(src) || /\/im\/pictures\/user/i.test(src);
  }

  function isListingPhoto(src) {
    return /a0\.muscache\.com\/im\/pictures\//i.test(src) && !isAvatar(src);
  }

  // Prefer the un-resized original Airbnb stashes on the element, then the
  // plain src, then the first candidate in a srcset.
  function photoFrom(el) {
    var cands = [];
    var imgs = el.querySelectorAll('img[src], img[data-original-uri], source[srcset]');
    for (var i = 0; i < imgs.length; i++) {
      var n = imgs[i];
      var orig = n.getAttribute('data-original-uri');
      if (orig) cands.push(orig);
      var src = n.getAttribute('src');
      if (src) cands.push(src);
      var set = n.getAttribute('srcset');
      if (set) cands.push(set.split(',')[0].trim().split(/\s+/)[0]);
    }
    for (var j = 0; j < cands.length; j++) {
      if (isListingPhoto(cands[j])) return cands[j].split('?')[0];
    }
    return null;
  }

  function peopleFrom(el) {
    var out = [], seen = {};
    var imgs = el.querySelectorAll('img[alt]');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || imgs[i].getAttribute('data-original-uri') || '';
      if (!isAvatar(src)) continue;
      var name = txt(imgs[i].getAttribute('alt'));
      if (name && !seen[name]) { seen[name] = 1; out.push(name); }
    }
    return out;
  }

  // Every short run of visible text in the card, in document order.
  function textLines(el) {
    var lines = [], seen = {};
    var walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var t = txt(node.nodeValue);
      if (!t || t.length > 80) continue;
      // Airbnb duplicates "+9" as a visible chip and a screen-reader "9 others".
      if (!seen[t]) { seen[t] = 1; lines.push(t); }
    }
    return lines;
  }

  function othersFrom(lines) {
    for (var i = 0; i < lines.length; i++) {
      var m = PLUS_RE.exec(lines[i]) || OTHERS_RE.exec(lines[i]);
      if (m) return parseInt(m[1], 10);
    }
    return 0;
  }

  function cardsFrom(doc) {
    // The link to the trip is the one thing every card has.
    var links = doc.querySelectorAll('a[href*="/trips/"]');
    if (links.length) return Array.prototype.slice.call(links);

    // Someone copied a wrapper without the anchors — fall back to any element
    // that holds both a listing photo and a date-looking line.
    var out = [];
    var all = doc.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.querySelector('div')) continue;          // want the leaf-most wrapper
      out.push(el);
    }
    return out;
  }

  function parse(markup) {
    var doc;
    try {
      doc = new DOMParser().parseFromString(markup, 'text/html');
    } catch (e) {
      return { rows: [], error: 'That did not look like HTML.' };
    }

    var cards = cardsFrom(doc);
    var rows = [], seenTrip = {};

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var href = card.getAttribute && card.getAttribute('href') || '';
      var idm = /\/trips\/(?:v\d+\/)?(\d+)/.exec(href);
      var tripId = idm ? idm[1] : null;
      if (tripId && seenTrip[tripId]) continue;

      var photo = photoFrom(card);
      var lines = textLines(card);
      var when = null, place = null;

      for (var j = 0; j < lines.length; j++) {
        if (!when && DATE_RE.test(lines[j])) { when = lines[j]; continue; }
      }
      // The place is the label Airbnb puts on the photo, or the line above the
      // date, or just the first line that is not a date or a "+3".
      var labelled = card.querySelector('[role="img"][aria-label]');
      if (labelled) place = txt(labelled.getAttribute('aria-label'));
      if (!place) {
        for (var k = 0; k < lines.length; k++) {
          var l = lines[k];
          if (l === when || PLUS_RE.test(l) || OTHERS_RE.test(l)) continue;
          if (MONTH_RE.test(l) && /\d{4}/.test(l)) continue;
          place = l;
          break;
        }
      }
      if (!place) continue;

      if (tripId) seenTrip[tripId] = 1;
      rows.push({
        tripId: tripId,
        place: place,
        when: when,
        photo: photo,
        people: peopleFrom(card),
        others: othersFrom(lines),
      });
    }

    return { rows: rows, error: rows.length ? null : hint(markup) };
  }

  function hint(markup) {
    if (!markup || markup.trim().length < 40) return 'Nothing pasted yet.';
    if (!/muscache|trips\//i.test(markup)) {
      return 'No trip cards in there. Make sure you copied the element that ' +
             'holds the list of trips, not the whole page or a single card.';
    }
    return 'Found the markup but no trips in it — try selecting one level up.';
  }

  // "August 1 – 4, 2026" -> { label: "August 2026", nights: 3 }
  function readDates(when) {
    if (!when) return { label: null, nights: null };
    var year = (/(\d{4})\s*$/.exec(when) || [])[1];
    var month = (MONTH_RE.exec(when) || [])[1];
    var nums = when.replace(/,\s*\d{4}/g, '').match(/\b\d{1,2}\b/g) || [];
    var nights = null;
    if (nums.length >= 2) {
      var a = parseInt(nums[0], 10), b = parseInt(nums[nums.length - 1], 10);
      if (b > a) nights = b - a;
    }
    return {
      label: month && year ? (month[0].toUpperCase() + month.slice(1).toLowerCase() + ' ' + year) : when,
      nights: nights,
    };
  }

  window.Trips = { parse: parse, readDates: readDates, isListingPhoto: isListingPhoto };
})();
