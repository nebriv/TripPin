/* ===========================================================================
   layout-audit.js — paste into the browser console on any TripPin page.

   WHAT IT IS FOR

   One bug class has now bitten this project twice, and both times it was
   invisible until somebody happened to look at the right width:

     1. `.topbar` was `grid-template-columns: 40px 1fr 40px` and somebody added
        a fourth child. The new one took the 40px track and spilled off the
        right edge; the stats button dropped onto an implicit second row.
     2. `.signin__pad` inherited `justify-items: center`, which shrinks a grid
        child to its content, so a six-column keypad rendered 32px tiles on a
        phone — under the 44px floor and too small to drag to.

   Neither threw. Neither logged. `body { overflow-x: hidden }` swallowed the
   first one so the page did not even scroll sideways: the chip was simply
   gone, off the edge, and the layout looked fine.

   The general shape: **a container with fixed tracks gains a child, or a
   parent's alignment collapses a child, and the overflow is clipped rather
   than shown.** You cannot catch it by reading a diff and you cannot catch it
   with a screenshot at one width.

   HOW TO USE IT

   Paste the whole file into the console, then:

     __audit('play 375')            // one width
     __sweep()                      // prints a row per screen state you set up

   Check every *state*, not just every page: signed out, the sign-in pad open,
   the play board, a host round, the reveal, the summary, an error. A state you
   cannot reach by clicking, reach by setting localStorage and reloading.

   Widths that matter: 375, 414, 768, 1024, 1280, 1920. Both colour schemes.

   WHAT IT REPORTS

     spill     an element whose box sits outside the viewport. Always a bug.
     rows      a grid whose children landed on more rows than it declares
               columns for — the topbar bug, caught directly.
     small     a tap target under 44px inside a turn. See HANDOFF.md rule 7 for
               the three controls allowed to be smaller.
     clipped   text cut off by an ancestor. Form fields are excluded: an input
               scrolling its own value is normal.
   =========================================================================== */

(function () {
  'use strict';

  function name(n) {
    var cls = typeof n.className === 'string' ? n.className.trim() : '';
    return n.tagName.toLowerCase()
      + (n.id ? '#' + n.id : '')
      + (cls ? '.' + cls.split(/\s+/).join('.') : '');
  }

  window.__audit = function (tag) {
    var W = document.documentElement.clientWidth;
    var out = { tag: tag || W + 'px', w: W, spill: [], rows: [], small: [], clipped: [] };
    var seen = {};
    var all = document.querySelectorAll('body *');

    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      var r = n.getBoundingClientRect();
      if (!r.width && !r.height) continue;

      var sel = name(n);
      var right = Math.round(r.right - W);
      var left = Math.round(r.left);

      // Outside the viewport. overflow:hidden hides this from the eye, not
      // from getBoundingClientRect.
      if ((right > 1 || left < -1) && !seen['s' + sel]) {
        seen['s' + sel] = 1;
        out.spill.push({
          el: sel,
          right: right > 1 ? right : 0,
          left: left < -1 ? left : 0,
          text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        });
      }

      // A grid with more children than declared columns, wrapping onto rows it
      // never asked for. repeat()/auto-fill grids are meant to wrap, so skip
      // them; a literal track list is a fixed layout and wrapping is the bug.
      if (cs.display === 'grid' && n.children.length > 1 && !seen['r' + sel]) {
        var tracks = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
        var declared = n.style.gridTemplateColumns || cs.gridTemplateColumns;
        // A hidden child has not landed anywhere, so it neither counts nor
        // contributes a row. The game keeps its reveal column in the grid
        // with display:none until it is needed, and that is not a wrap.
        var live = Array.prototype.filter.call(n.children, function (c) {
          return getComputedStyle(c).display !== 'none';
        });
        // A child told to span the row (grid-column: 1 / -1, or span N) is a
        // second row on purpose — the "Nobody" tile, the "not on this list"
        // tile. Only unplanned wrapping is the bug.
        var spans = live.some(function (c) {
          var g = getComputedStyle(c);
          return /span|-1/.test(g.gridColumnStart + ' ' + g.gridColumnEnd);
        });
        if (spans) live = [];
        // A single-track grid is a stack by definition: one column, N children,
        // N rows is what it was asked for. Only a multi-column grid can wrap
        // onto a row nobody planned.
        if (tracks > 1 && live.length > tracks && !/repeat|auto-fill|auto-fit/.test(declared)) {
          var tops = {};
          for (var k = 0; k < live.length; k++) {
            tops[Math.round(live[k].getBoundingClientRect().top)] = 1;
          }
          if (Object.keys(tops).length > 1) {
            seen['r' + sel] = 1;
            out.rows.push({
              el: sel, children: live.length,
              columns: tracks, rowsUsed: Object.keys(tops).length,
            });
          }
        }
      }

      // Tap targets inside a turn.
      var tag2 = n.tagName.toLowerCase();
      if ((tag2 === 'button' || tag2 === 'a')
          && n.closest && n.closest('#play, #signin, #host')
          && (r.width < 44 || r.height < 44) && !seen['t' + sel]) {
        seen['t' + sel] = 1;
        out.small.push({ el: sel, size: Math.round(r.width) + 'x' + Math.round(r.height) });
      }

      // Text cut off. An input or textarea scrolling its own value is normal.
      if (!n.children.length && tag2 !== 'input' && tag2 !== 'textarea'
          && n.scrollWidth - n.clientWidth > 2
          && /hidden|clip/.test(cs.overflowX) && !seen['c' + sel]) {
        seen['c' + sel] = 1;
        out.clipped.push({
          el: sel, by: n.scrollWidth - n.clientWidth,
          text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        });
      }
    }

    out.clean = !out.spill.length && !out.rows.length && !out.clipped.length;
    return out;
  };

  // Resizing has to happen outside the page, so this only reports the width it
  // is currently at. Call it again after each resize.
  window.__sweep = function () {
    var a = window.__audit(document.documentElement.clientWidth + 'px');
    console.log(a.clean ? 'clean at ' + a.w : a);
    return a;
  };

  console.log('layout audit ready: __audit(tag), __sweep()');
})();
