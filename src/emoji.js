/* ===========================================================================
   emoji.js — sign-in.

   Your animal, and where it lives. Drag the bear onto the mountain, or tap one
   and then the other. "My bear lives in the mountains" is a sentence, and
   people remember sentences. They do not remember passwords.

   WHY IT IS SHAPED LIKE THIS

   Four friends will not tolerate anything that feels like admin, so this has
   to survive being done half-asleep on a phone. That rules out anything typed.
   It also ruled out a longer code: the three-tap version was rejected,
   correctly, because friction is the thing most likely to kill a game nobody
   is obliged to play.

   Both input methods produce the same value, so neither is the "fallback":
   drag covers touch and mouse, tap-then-tap covers everything including a
   keyboard.

   HOW STRONG IS IT, HONESTLY

   Thirty-six animals times twelve homes is 432 — about nine bits. Against the
   Worker's account slowdown, which doubles every three wrong guesses to a
   twenty-second cap, walking the whole space averages a bit over an hour.
   That is eighteen times the single tile this replaces, and still nowhere near
   a real secret.

   That trade was made on purpose. The group word does the
   authenticating — fifty bits, checked on every request, keeps the internet
   out. This only says which of five friends you are, and a stolen one buys
   somebody the ability to rewrite one friend's stays, reversibly, with every
   deck write logged on /admin.

   All tiles are single code points from well-established blocks: no skin
   tones, no flags, no zero-width-joiner families, nothing needing a variation
   selector to render as a picture. A passcode you cannot see is a passcode you
   cannot enter.
   =========================================================================== */

(function () {
  'use strict';

  // Picked for character rather than coverage. The point is that people take
  // the same one every time and everyone knows whose it is — one of you is
  // the dog, one is the bear. A tasteful grid of shapes would defeat that.
  var ANIMALS = [
    { e: '🐻', n: 'bear' },      { e: '🦆', n: 'duck' },      { e: '🐙', n: 'octopus' },
    { e: '🦊', n: 'fox' },       { e: '🐢', n: 'tortoise' },  { e: '🦖', n: 'dinosaur' },
    { e: '🐝', n: 'bee' },       { e: '🐐', n: 'goat' },      { e: '🦩', n: 'flamingo' },
    { e: '🦫', n: 'beaver' },    { e: '🐌', n: 'snail' },     { e: '🐳', n: 'whale' },
    { e: '🐶', n: 'dog' },       { e: '🐈', n: 'cat' },       { e: '🦉', n: 'owl' },
    { e: '🦡', n: 'badger' },    { e: '🐧', n: 'penguin' },   { e: '🦦', n: 'otter' },
    { e: '👻', n: 'ghost' },     { e: '🤖', n: 'robot' },     { e: '💀', n: 'skull' },
    { e: '👽', n: 'alien' },     { e: '🤠', n: 'cowboy' },    { e: '🥸', n: 'disguise' },
    { e: '🌮', n: 'taco' },      { e: '🍕', n: 'pizza' },     { e: '🥐', n: 'croissant' },
    { e: '🍄', n: 'mushroom' },  { e: '🥑', n: 'avocado' },   { e: '🧀', n: 'cheese' },
    { e: '🚀', n: 'rocket' },    { e: '🛸', n: 'saucer' },    { e: '🎸', n: 'guitar' },
    { e: '🔑', n: 'key' },       { e: '🎩', n: 'top hat' },   { e: '🦀', n: 'crab' }
  ];

  // Somewhere a thing could live, plus a few that make the sentence funnier.
  // None of these appear in the animal grid.
  var HOMES = [
    { e: '🗻', n: 'the mountains' },  { e: '🌊', n: 'the sea' },
    { e: '🌲', n: 'the forest' },     { e: '🌋', n: 'a volcano' },
    { e: '🌴', n: 'an island' },      { e: '🌙', n: 'the moon' },
    { e: '🏠', n: 'a perfectly normal house' }, { e: '🎪', n: 'the circus' },
    { e: '🏭', n: 'a factory' },      { e: '🚇', n: 'the underground' },
    { e: '🌾', n: 'a field' },        { e: '🎢', n: 'a rollercoaster' }
  ];

  var BY = {};
  ANIMALS.forEach(function (a) { BY[a.e] = a; });
  HOMES.forEach(function (h) { BY[h.e] = h; });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // A passcode is the animal followed by the home. Both are one code point, so
  // splitting it back is a code-point split and never a character one.
  function parts(value) {
    var cps = Array.from(String(value || ''));
    return { animal: cps[0] || null, home: cps[1] || null };
  }

  function sentence(animal, home) {
    var a = BY[animal], h = BY[home];
    if (!a) return 'Pick something to be.';
    if (!h) return 'Now put your ' + a.n + ' somewhere.';
    return 'Your ' + a.n + ' lives in ' + h.n + '.';
  }

  function create(host, opts) {
    opts = opts || {};
    var animal = null;
    var home = null;
    var drag = null;

    host.replaceChildren();
    host.classList.add('ecode');

    var say = el('p', 'ecode__say');
    say.setAttribute('role', 'status');
    var animalPad = el('div', 'ecode__pad ecode__pad--animals');
    var homeLabel = el('p', 'ecode__sub', 'and where does it live?');
    var homePad = el('div', 'ecode__pad ecode__pad--homes');
    var again = el('button', 'ecode__back', 'Start again');
    again.type = 'button';

    function value() { return (animal || '') + (home || ''); }
    function complete() { return !!(animal && home); }

    function paint() {
      say.textContent = sentence(animal, home);
      Array.prototype.forEach.call(animalPad.children, function (b) {
        b.classList.toggle('is-on', b.dataset.e === animal);
      });
      Array.prototype.forEach.call(homePad.children, function (b) {
        b.classList.toggle('is-on', b.dataset.e === home);
      });
      homePad.classList.toggle('is-live', !!animal);
      // pointer-events: none does not take a button out of the tab order, so
      // a keyboard user tabbed through twelve faded keys that did nothing.
      Array.prototype.forEach.call(homePad.children, function (b) { b.disabled = !animal; });
      homeLabel.classList.toggle('is-live', !!animal);
      again.hidden = !animal;
      if (opts.onChange) opts.onChange(value(), complete());
    }

    function setAnimal(e) {
      animal = e;
      home = null;
      paint();
    }

    function setHome(e) {
      if (!animal) return;
      home = e;
      paint();
      if (complete() && opts.onComplete) opts.onComplete(value());
    }

    /* --- the drag ---------------------------------------------------------
       One gesture from an animal to a home. Pointer events cover mouse, touch
       and pen in one code path, and elementFromPoint is what lets the drop
       work without every home carrying its own listener. */

    function ghostAt(x, y) {
      if (drag) drag.node.style.transform = 'translate(' + (x - 22) + 'px,' + (y - 22) + 'px)';
    }

    function dropDrag(x, y) {
      if (!drag) return;
      drag.node.remove();
      host.classList.remove('is-dragging');
      var over = document.elementFromPoint(x, y);
      var tile = over && over.closest ? over.closest('.ecode__key--home') : null;
      drag = null;
      if (tile) setHome(tile.dataset.e);
    }

    function startDrag(ev, e) {
      if (drag || (ev.button != null && ev.button !== 0)) return;
      setAnimal(e);
      var node = el('div', 'ecode__ghost', e);
      document.body.appendChild(node);
      drag = { node: node, id: ev.pointerId };
      host.classList.add('is-dragging');
      ghostAt(ev.clientX, ev.clientY);
    }

    document.addEventListener('pointermove', function (ev) {
      if (drag && ev.pointerId === drag.id) {
        ev.preventDefault();
        ghostAt(ev.clientX, ev.clientY);
      }
    }, { passive: false });

    document.addEventListener('pointerup', function (ev) {
      if (drag && ev.pointerId === drag.id) dropDrag(ev.clientX, ev.clientY);
    });

    document.addEventListener('pointercancel', function (ev) {
      if (drag && ev.pointerId === drag.id) {
        drag.node.remove();
        host.classList.remove('is-dragging');
        drag = null;
      }
    });

    /* --- the tiles -------------------------------------------------------- */

    ANIMALS.forEach(function (a) {
      var b = el('button', 'ecode__key ecode__key--animal', a.e);
      b.type = 'button';
      b.dataset.e = a.e;
      b.setAttribute('aria-label', a.n);
      b.addEventListener('pointerdown', function (ev) { startDrag(ev, a.e); });
      // Tapping is the same move, for anyone not dragging and for the keyboard.
      b.addEventListener('click', function () { if (!drag) setAnimal(a.e); });
      animalPad.appendChild(b);
    });

    HOMES.forEach(function (h) {
      var b = el('button', 'ecode__key ecode__key--home', h.e);
      b.type = 'button';
      b.dataset.e = h.e;
      b.setAttribute('aria-label', h.n);
      b.addEventListener('click', function () { setHome(h.e); });
      homePad.appendChild(b);
    });

    again.addEventListener('click', function () {
      animal = null;
      home = null;
      paint();
    });

    host.appendChild(say);
    host.appendChild(animalPad);
    host.appendChild(homeLabel);
    host.appendChild(homePad);
    host.appendChild(again);
    paint();

    return {
      value: value,
      complete: complete,
      clear: function () { animal = null; home = null; paint(); },
      set: function (v) {
        var p = parts(v);
        animal = BY[p.animal] ? p.animal : null;
        home = BY[p.home] ? p.home : null;
        paint();
      }
    };
  }

  window.EmojiCode = {
    create: create,
    parts: parts,
    sentence: sentence,
    ANIMALS: ANIMALS,
    HOMES: HOMES
  };
})();
