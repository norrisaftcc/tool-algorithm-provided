/* layouts.js — which physical key makes a character, and which finger owns it.
 *
 * The engine never consults this file. It compares characters, so a learner on
 * any layout who produces the right character is right. This exists only so
 * the on-screen keyboard can point at the correct key, and a keyboard that
 * points at the wrong key is worse than one that points at nothing. Hence the
 * honesty rule at the bottom: unresolved characters highlight nothing.
 *
 * Three sources of truth, best first:
 *
 *   1. navigator.keyboard.getLayoutMap() — the browser telling us the real
 *      layout. Chromium only, and worth the ten lines.
 *   2. Observation — every keydown carries code and key together, so the map
 *      corrects itself after a few dozen keystrokes on any browser. Persisted.
 *   3. A hand-written table, picked in settings.
 *
 * `us` and `uk` were written by hand against physical boards. `fr`, `de` and
 * `es` were not written from memory at all — memory would mean shipping
 * plausible-looking wrong answers about which finger to use — but derived
 * mechanically from the X11 xkb data; see the note above them. Anything else
 * gets `auto`, which is sources 1 and 2 alone.
 */
(function (root) {
  'use strict';

  /* --- physical geometry, identical across layouts ------------------------ */

  var FINGERS = {
    pinky: 'pinky', ring: 'ring', middle: 'middle', index: 'index', thumb: 'thumb'
  };

  function f(hand, finger) { return { hand: hand, finger: finger }; }

  var KEY_FINGER = {
    Backquote: f('left', 'pinky'), Digit1: f('left', 'pinky'),
    Digit2: f('left', 'ring'), Digit3: f('left', 'middle'),
    Digit4: f('left', 'index'), Digit5: f('left', 'index'),
    Digit6: f('right', 'index'), Digit7: f('right', 'index'),
    Digit8: f('right', 'middle'), Digit9: f('right', 'ring'),
    Digit0: f('right', 'pinky'), Minus: f('right', 'pinky'),
    Equal: f('right', 'pinky'), Backspace: f('right', 'pinky'),

    Tab: f('left', 'pinky'),
    KeyQ: f('left', 'pinky'), KeyW: f('left', 'ring'), KeyE: f('left', 'middle'),
    KeyR: f('left', 'index'), KeyT: f('left', 'index'),
    KeyY: f('right', 'index'), KeyU: f('right', 'index'),
    KeyI: f('right', 'middle'), KeyO: f('right', 'ring'),
    KeyP: f('right', 'pinky'), BracketLeft: f('right', 'pinky'),
    BracketRight: f('right', 'pinky'), Backslash: f('right', 'pinky'),

    CapsLock: f('left', 'pinky'),
    KeyA: f('left', 'pinky'), KeyS: f('left', 'ring'), KeyD: f('left', 'middle'),
    KeyF: f('left', 'index'), KeyG: f('left', 'index'),
    KeyH: f('right', 'index'), KeyJ: f('right', 'index'),
    KeyK: f('right', 'middle'), KeyL: f('right', 'ring'),
    Semicolon: f('right', 'pinky'), Quote: f('right', 'pinky'),
    Enter: f('right', 'pinky'),

    ShiftLeft: f('left', 'pinky'),
    // The extra key an ISO board has between left Shift and Z. Absent on ANSI,
    // which is why the row entry below is marked `iso` and hidden when the
    // active layout has nothing mapped to it.
    IntlBackslash: f('left', 'pinky'),
    KeyZ: f('left', 'pinky'), KeyX: f('left', 'ring'), KeyC: f('left', 'middle'),
    KeyV: f('left', 'index'), KeyB: f('left', 'index'),
    KeyN: f('right', 'index'), KeyM: f('right', 'middle'),
    Comma: f('right', 'ring'), Period: f('right', 'ring'),
    Slash: f('right', 'pinky'), ShiftRight: f('right', 'pinky'),

    Space: f('both', 'thumb'),
    ControlLeft: f('left', 'pinky'), AltLeft: f('left', 'thumb'),
    AltRight: f('right', 'thumb'), ControlRight: f('right', 'pinky')
  };

  /** The rendered keyboard, row by row. `w` is a width class suffix. */
  var ROWS = [
    [
      { code: 'Backquote' }, { code: 'Digit1' }, { code: 'Digit2' },
      { code: 'Digit3' }, { code: 'Digit4' }, { code: 'Digit5' },
      { code: 'Digit6' }, { code: 'Digit7' }, { code: 'Digit8' },
      { code: 'Digit9' }, { code: 'Digit0' }, { code: 'Minus' },
      { code: 'Equal' }, { code: 'Backspace', label: '⌫', w: 'wide' }
    ],
    [
      { code: 'Tab', label: 'tab', w: 'wide' },
      { code: 'KeyQ' }, { code: 'KeyW' }, { code: 'KeyE' }, { code: 'KeyR' },
      { code: 'KeyT' }, { code: 'KeyY' }, { code: 'KeyU' }, { code: 'KeyI' },
      { code: 'KeyO' }, { code: 'KeyP' }, { code: 'BracketLeft' },
      { code: 'BracketRight' }, { code: 'Backslash' }
    ],
    [
      { code: 'CapsLock', label: 'caps', w: 'wide' },
      { code: 'KeyA' }, { code: 'KeyS' }, { code: 'KeyD' }, { code: 'KeyF' },
      { code: 'KeyG' }, { code: 'KeyH' }, { code: 'KeyJ' }, { code: 'KeyK' },
      { code: 'KeyL' }, { code: 'Semicolon' }, { code: 'Quote' },
      { code: 'Enter', label: '⏎', w: 'xwide' }
    ],
    [
      { code: 'ShiftLeft', label: 'shift', w: 'xwide' },
      { code: 'IntlBackslash', iso: true },
      { code: 'KeyZ' }, { code: 'KeyX' }, { code: 'KeyC' }, { code: 'KeyV' },
      { code: 'KeyB' }, { code: 'KeyN' }, { code: 'KeyM' }, { code: 'Comma' },
      { code: 'Period' }, { code: 'Slash' },
      { code: 'ShiftRight', label: 'shift', w: 'xwide' }
    ],
    [
      { code: 'AltLeft', label: 'alt', w: 'wide' },
      { code: 'Space', label: 'space', w: 'space' },
      { code: 'AltRight', label: 'alt gr', w: 'wide' }
    ]
  ];

  /* --- character tables ---------------------------------------------------
   * Each entry is [base, shifted], or [base, shifted, altgr] where a layout
   * uses the third level. A null in any slot means the key produces nothing
   * inside ASCII 32..126 there — a dead key, or an accented letter no lesson
   * asks for — and the resolver simply skips it.
   *
   * Letters on the two QWERTY tables are generated rather than typed out,
   * which removes a whole class of transcription mistake.
   */

  function letterRows(table) {
    'qwertyuiopasdfghjklzxcvbnm'.split('').forEach(function (ch) {
      table['Key' + ch.toUpperCase()] = [ch, ch.toUpperCase()];
    });
    return table;
  }

  var US = letterRows({
    Backquote: ['`', '~'],
    Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'],
    Digit4: ['4', '$'], Digit5: ['5', '%'], Digit6: ['6', '^'],
    Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('],
    Digit0: ['0', ')'], Minus: ['-', '_'], Equal: ['=', '+'],
    BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'],
    Semicolon: [';', ':'], Quote: ['\'', '"'],
    Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
    Space: [' ', ' '], Enter: ['\n', '\n']
  });

  // UK ISO differs from US in six places. Verified against a physical board
  // rather than recalled: the ones that matter for code are Backslash (# and
  // ~ on UK) and Quote (which carries @ shifted).
  var UK = letterRows({
    Backquote: ['`', '¬'],
    Digit1: ['1', '!'], Digit2: ['2', '"'], Digit3: ['3', '£'],
    Digit4: ['4', '$'], Digit5: ['5', '%'], Digit6: ['6', '^'],
    Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('],
    Digit0: ['0', ')'], Minus: ['-', '_'], Equal: ['=', '+'],
    BracketLeft: ['[', '{'], BracketRight: [']', '}'],
    Backslash: ['#', '~'], IntlBackslash: ['\\', '|'],
    Semicolon: [';', ':'], Quote: ['\'', '@'],
    Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
    Space: [' ', ' '], Enter: ['\n', '\n']
  });

  /* The three tables below were derived mechanically from the X11 xkb data in
   * /usr/share/X11/xkb/symbols, not recalled: each layout's `include` chain
   * was resolved and levels 1, 2 and 3 of every key read off, then everything
   * outside ASCII 32..126 was dropped, along with every dead key — a dead key
   * produces no character on its own, so pointing at one would be a lie.
   *
   *   FR  symbols/fr  xkb_symbols "basic"   include "latin"
   *   DE  symbols/de  xkb_symbols "basic"   include "latin(type4)"
   *   ES  symbols/es  xkb_symbols "basic"   include "latin(type4)"
   *
   * IntlBackslash is <LSGT>, the key an ISO board has between left Shift and
   * Z. de defines it itself; fr and es inherit it from symbols/pc "pc105",
   * which is where xkb puts it for every layout that does not override it.
   * All three agree: less, greater, bar.
   *
   * Keys are listed in physical reading order, and that order is load-bearing
   * — where two positions produce the same character the resolver points at
   * the first one it finds.
   *
   * Two consequences worth knowing. `^` is a dead key on both de and es, so
   * it has no entry there and resolves to nothing rather than to a wrong key.
   * And on all three boards the characters the C++ and Python tracks lean on
   * — { } [ ] \ | @ # ~ — sit on the AltGr level, which is why the resolver
   * and the on-screen keyboard understand a third level at all.
   */

  var FR = {
    Backquote: [null, '~'],
    Digit1: ['&', '1'],
    Digit2: [null, '2', '~'],
    Digit3: ['"', '3', '#'],
    Digit4: ["'", '4', '{'],
    Digit5: ['(', '5', '['],
    Digit6: ['-', '6', '|'],
    Digit7: [null, '7', '`'],
    Digit8: ['_', '8', '\\'],
    Digit9: [null, '9', '^'],
    Digit0: [null, '0', '@'],
    Minus: [')', null, ']'],
    Equal: ['=', '+', '}'],
    KeyQ: ['a', 'A'],
    KeyW: ['z', 'Z'],
    KeyE: ['e', 'E'],
    KeyR: ['r', 'R'],
    KeyT: ['t', 'T'],
    KeyY: ['y', 'Y'],
    KeyU: ['u', 'U'],
    KeyI: ['i', 'I'],
    KeyO: ['o', 'O'],
    KeyP: ['p', 'P'],
    BracketRight: ['$', null],
    Backslash: ['*', null],
    KeyA: ['q', 'Q', '@'],
    KeyS: ['s', 'S'],
    KeyD: ['d', 'D'],
    KeyF: ['f', 'F'],
    KeyG: ['g', 'G'],
    KeyH: ['h', 'H'],
    KeyJ: ['j', 'J'],
    KeyK: ['k', 'K'],
    KeyL: ['l', 'L'],
    Semicolon: ['m', 'M'],
    Quote: [null, '%'],
    IntlBackslash: ['<', '>', '|'],
    KeyZ: ['w', 'W'],
    KeyX: ['x', 'X'],
    KeyC: ['c', 'C'],
    KeyV: ['v', 'V'],
    KeyB: ['b', 'B'],
    KeyN: ['n', 'N'],
    KeyM: [',', '?'],
    Comma: [';', '.'],
    Period: [':', '/'],
    Slash: ['!', null],
    Space: [' ', ' '],
    Enter: ['\n', '\n']
  };

  var DE = {
    Digit1: ['1', '!'],
    Digit2: ['2', '"'],
    Digit3: ['3', null],
    Digit4: ['4', '$'],
    Digit5: ['5', '%'],
    Digit6: ['6', '&'],
    Digit7: ['7', '/', '{'],
    Digit8: ['8', '(', '['],
    Digit9: ['9', ')', ']'],
    Digit0: ['0', '=', '}'],
    Minus: [null, '?', '\\'],
    KeyQ: ['q', 'Q', '@'],
    KeyW: ['w', 'W'],
    KeyE: ['e', 'E'],
    KeyR: ['r', 'R'],
    KeyT: ['t', 'T'],
    KeyY: ['z', 'Z'],
    KeyU: ['u', 'U'],
    KeyI: ['i', 'I'],
    KeyO: ['o', 'O'],
    KeyP: ['p', 'P'],
    BracketRight: ['+', '*', '~'],
    Backslash: ['#', "'"],
    KeyA: ['a', 'A'],
    KeyS: ['s', 'S'],
    KeyD: ['d', 'D'],
    KeyF: ['f', 'F'],
    KeyG: ['g', 'G'],
    KeyH: ['h', 'H'],
    KeyJ: ['j', 'J'],
    KeyK: ['k', 'K'],
    KeyL: ['l', 'L'],
    IntlBackslash: ['<', '>', '|'],
    KeyZ: ['y', 'Y'],
    KeyX: ['x', 'X'],
    KeyC: ['c', 'C'],
    KeyV: ['v', 'V'],
    KeyB: ['b', 'B'],
    KeyN: ['n', 'N'],
    KeyM: ['m', 'M'],
    Comma: [',', ';'],
    Period: ['.', ':'],
    Slash: ['-', '_'],
    Space: [' ', ' '],
    Enter: ['\n', '\n']
  };

  var ES = {
    Backquote: [null, null, '\\'],
    Digit1: ['1', '!', '|'],
    Digit2: ['2', '"', '@'],
    Digit3: ['3', null, '#'],
    Digit4: ['4', '$', '~'],
    Digit5: ['5', '%'],
    Digit6: ['6', '&'],
    Digit7: ['7', '/', '{'],
    Digit8: ['8', '(', '['],
    Digit9: ['9', ')', ']'],
    Digit0: ['0', '=', '}'],
    Minus: ["'", '?', '\\'],
    KeyQ: ['q', 'Q', '@'],
    KeyW: ['w', 'W'],
    KeyE: ['e', 'E'],
    KeyR: ['r', 'R'],
    KeyT: ['t', 'T'],
    KeyY: ['y', 'Y'],
    KeyU: ['u', 'U'],
    KeyI: ['i', 'I'],
    KeyO: ['o', 'O'],
    KeyP: ['p', 'P'],
    BracketLeft: [null, null, '['],
    BracketRight: ['+', '*', ']'],
    Backslash: [null, null, '}'],
    KeyA: ['a', 'A'],
    KeyS: ['s', 'S'],
    KeyD: ['d', 'D'],
    KeyF: ['f', 'F'],
    KeyG: ['g', 'G'],
    KeyH: ['h', 'H'],
    KeyJ: ['j', 'J'],
    KeyK: ['k', 'K'],
    KeyL: ['l', 'L'],
    Quote: [null, null, '{'],
    IntlBackslash: ['<', '>', '|'],
    KeyZ: ['z', 'Z'],
    KeyX: ['x', 'X'],
    KeyC: ['c', 'C'],
    KeyV: ['v', 'V'],
    KeyB: ['b', 'B'],
    KeyN: ['n', 'N'],
    KeyM: ['m', 'M'],
    Comma: [',', ';'],
    Period: ['.', ':'],
    Slash: ['-', '_'],
    Space: [' ', ' '],
    Enter: ['\n', '\n']
  };

  /**
   * Where a layout reaches the same character from more than one key, the
   * layout's OWN xkb section outranks what it inherits from the shared
   * `latin` base.
   *
   * Spanish is the case in point. symbols/es defines [ ] { } itself, on the
   * four keys right of P and L — which is where a physical Spanish board
   * prints them. AltGr+7/8/9/0 reaches the same four characters, but only
   * because es includes latin(type4). Both are real under X11; the printed
   * one is the one worth teaching, because it is the one the learner can see.
   *
   * fr and de need no entry here: their duplicates are all native to their
   * own sections, and the resolver already prefers the easier level.
   */
  var ES_PREFER = {
    '[': 'BracketLeft',    // <AD11>, es section, AltGr level
    ']': 'BracketRight',   // <AD12>, es section, AltGr level
    '{': 'Quote',          // <AC11>, es section, AltGr level
    '}': 'Backslash'       // <BKSL>, es section, AltGr level
  };

  var LAYOUTS = [
    { id: 'us', name: 'US QWERTY', table: US },
    { id: 'uk', name: 'UK QWERTY', table: UK },
    { id: 'fr', name: 'French AZERTY', table: FR },
    { id: 'de', name: 'German QWERTZ', table: DE },
    { id: 'es', name: 'Spanish QWERTY', table: ES, prefer: ES_PREFER },
    {
      id: 'auto', name: 'Detect automatically', table: null,
      note: 'Reads the layout from the browser where it can, and otherwise ' +
            'learns it as you type. Use this for anything not listed above.'
    }
  ];

  function layoutMeta(id) {
    for (var i = 0; i < LAYOUTS.length; i++) {
      if (LAYOUTS[i].id === id) return LAYOUTS[i];
    }
    return LAYOUTS[0];
  }

  /* --- the resolver -------------------------------------------------------- */

  /**
   * Build a resolver over a base table plus whatever has been observed.
   *
   * @param {string} layoutId
   * @param {object|null} observed map of code -> [base, shifted], persisted
   *   between sessions.
   */
  function createResolver(layoutId, observed) {
    var base = layoutMeta(layoutId).table;
    var learned = Object.assign({}, observed || {});
    var index = null;   // character -> {code, level}, rebuilt lazily

    function invalidate() { index = null; }

    function build() {
      index = Object.create(null);
      // The hand-written table first, then observations on top: what the
      // browser and the learner's own keystrokes say wins over a guess.
      [base, learned].forEach(function (table) {
        if (!table) return;
        Object.keys(table).forEach(function (code) {
          var pair = table[code];
          if (!pair) return;
          if (pair[0] && index[pair[0]] === undefined) {
            index[pair[0]] = { code: code, level: 'base' };
          }
          if (pair[1] && pair[1] !== pair[0]) {
            index[pair[1]] = { code: code, level: 'shift' };
          }
        });
        // AltGr gets its own pass so that it only ever fills gaps. A
        // character some key produces plain or shifted must never be taught
        // as an AltGr press just because that key is written down first.
        Object.keys(table).forEach(function (code) {
          var pair = table[code];
          if (!pair || !pair[2]) return;
          if (index[pair[2]] === undefined) {
            index[pair[2]] = { code: code, level: 'altgr' };
          }
        });
      });
      // Curated preferences sit between the table scan and observation:
      // stronger than whatever order the table happens to be written in,
      // weaker than evidence from the learner's actual keyboard.
      var prefer = layoutMeta(layoutId).prefer;
      if (prefer) {
        Object.keys(prefer).forEach(function (ch) {
          var code = prefer[ch];
          var pair = base && base[code];
          if (!pair) return;
          var level = pair[0] === ch ? 'base'
                    : pair[1] === ch ? 'shift'
                    : pair[2] === ch ? 'altgr' : null;
          if (level) index[ch] = { code: code, level: level };
        });
      }

      // Observations override outright, not just fill gaps.
      Object.keys(learned).forEach(function (code) {
        var pair = learned[code];
        if (pair[0]) index[pair[0]] = { code: code, level: 'base' };
        if (pair[1] && pair[1] !== pair[0]) {
          index[pair[1]] = { code: code, level: 'shift' };
        }
      });
    }

    return {
      /**
       * @returns {{code,level,finger,hand}|null} null when the character
       *   cannot be placed, which the keyboard renders as silence.
       */
      resolve: function (ch) {
        if (!ch) return null;
        if (!index) build();
        var hit = index[ch];
        if (!hit) return null;
        var geo = KEY_FINGER[hit.code];
        return {
          code: hit.code,
          level: hit.level,
          finger: geo ? geo.finger : null,
          hand: geo ? geo.hand : null
        };
      },

      /** Record what a real keystroke proved about this keyboard. */
      observe: function (code, key, shiftKey) {
        if (!code || !key || key.length !== 1) return false;
        if (!KEY_FINGER[code]) return false;
        var pair = learned[code] || [null, null];
        var slot = shiftKey ? 1 : 0;

        // Guard against a source that reports a shifted character without
        // reporting the Shift modifier — some synthetic and on-screen
        // keyboards do. A character the table already calls this key's
        // SHIFTED form cannot also be its base form, and believing otherwise
        // mislabels the keycap.
        if (slot === 0 && base && base[code]) {
          if (key === base[code][1] && key !== base[code][0]) slot = 1;
        }

        // The same trap one level up. `code` and `key` alone cannot tell an
        // AltGr press from an unmodified one, so a character the table calls
        // this key's AltGr form is no evidence about its base form. Writing
        // it into slot 0 would relabel the keycap and quietly demote a
        // correct altgr entry to base, which is exactly the wrong answer.
        if (slot === 0 && base && base[code] && base[code][2] === key &&
            key !== base[code][0] && key !== base[code][1]) {
          return false;
        }
        if (slot === 0 && key.toLowerCase() !== key.toUpperCase() &&
            key === key.toUpperCase()) {
          slot = 1;   // an uppercase letter is never a base character
        }

        if (pair[slot] === key) return false;
        pair = pair.slice();
        pair[slot] = key;
        learned[code] = pair;
        invalidate();
        return true;
      },

      /** Adopt a map from navigator.keyboard.getLayoutMap(). */
      adoptLayoutMap: function (map) {
        var changed = false;
        map.forEach(function (value, code) {
          if (!KEY_FINGER[code] || !value || value.length !== 1) return;
          var pair = learned[code] || [null, null];
          if (pair[0] === value) return;
          pair = pair.slice();
          pair[0] = value;
          // A letter's shifted form is its uppercase; anything else is left
          // for observation rather than guessed at.
          if (value.toLowerCase() !== value.toUpperCase()) {
            pair[1] = value.toUpperCase();
          }
          learned[code] = pair;
          changed = true;
        });
        if (changed) invalidate();
        return changed;
      },

      /** What to print on a keycap: the base character this key produces. */
      keyLabel: function (code) {
        // A partial observation must not hide the table's answer.
        var seen = learned && learned[code];
        var table = base && base[code];
        var ch = (seen && seen[0]) || (table && table[0]) || null;
        if (!ch) return null;
        if (ch === ' ' || ch === '\n') return null;   // ROWS supplies these
        return ch.toLowerCase() !== ch.toUpperCase() ? ch.toUpperCase() : ch;
      },

      learned: function () { return Object.assign({}, learned); }
    };
  }

  /** Chromium exposes the real layout. Everyone else falls back to watching. */
  function readBrowserLayout() {
    try {
      if (root.navigator && root.navigator.keyboard &&
          root.navigator.keyboard.getLayoutMap) {
        return root.navigator.keyboard.getLayoutMap();
      }
    } catch (e) { /* permissions policy may forbid it */ }
    return null;
  }

  /**
   * Which Shift to press. The correct technique is the opposite hand, and it
   * is worth teaching rather than leaving to habit.
   */
  function shiftKeyFor(hand) {
    if (hand === 'left') return 'ShiftRight';
    if (hand === 'right') return 'ShiftLeft';
    return null;
  }

  var layouts = {
    FINGERS: FINGERS,
    KEY_FINGER: KEY_FINGER,
    ROWS: ROWS,
    LAYOUTS: LAYOUTS,
    US: US,
    UK: UK,
    FR: FR,
    DE: DE,
    ES: ES,
    layoutMeta: layoutMeta,
    createResolver: createResolver,
    readBrowserLayout: readBrowserLayout,
    shiftKeyFor: shiftKeyFor
  };

  root.TT = root.TT || {};
  root.TT.layouts = layouts;
  if (typeof module !== 'undefined' && module.exports) module.exports = layouts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
