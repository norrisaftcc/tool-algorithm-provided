/* keyboard.js — the on-screen keyboard.
 *
 * Built once, then mutated by class. Nothing here re-renders on a keystroke.
 *
 * The whole surface is aria-hidden: it duplicates information the live region
 * already carries, and exposing sixty keycaps to a screen reader is noise.
 */
(function (root) {
  'use strict';

  var layouts = (root.TT && root.TT.layouts) ||
    (typeof require === 'function' ? require('./layouts.js') : null);

  /** Below this many observations a key is unmeasured, not clean. */
  var MIN_SAMPLES = 10;

  /** Miss-rate thresholds for the five heat buckets. */
  var HEAT_STOPS = [0.02, 0.05, 0.10, 0.18, 0.30];

  function heatBucket(hit, miss) {
    var total = hit + miss;
    if (total < MIN_SAMPLES) return 'none';
    var rate = miss / total;
    for (var i = 0; i < HEAT_STOPS.length; i++) {
      if (rate < HEAT_STOPS[i]) return i;
    }
    return 5;
  }

  function mount(container, resolver) {
    var wrap = document.createElement('div');
    wrap.className = 'kbd';
    wrap.setAttribute('aria-hidden', 'true');

    var rows = document.createElement('div');
    rows.className = 'kbd-rows';
    wrap.appendChild(rows);

    var caps = {};       // code -> element
    var current = { next: [], heat: [], caps: false };

    layouts.ROWS.forEach(function (rowSpec) {
      var row = document.createElement('div');
      row.className = 'kbd-row';
      rowSpec.forEach(function (spec) {
        var key = document.createElement('div');
        key.className = 'key' + (spec.w ? ' key-' + spec.w : '');
        var geo = layouts.KEY_FINGER[spec.code];
        if (geo) key.setAttribute('data-finger', geo.finger);
        if (spec.code === 'KeyF' || spec.code === 'KeyJ') {
          key.classList.add('key-home');
        }
        key.textContent = spec.label || resolver.keyLabel(spec.code) || '';
        key.setAttribute('data-code', spec.code);
        caps[spec.code] = key;
        row.appendChild(key);
      });
      rows.appendChild(row);
    });

    container.appendChild(wrap);

    function clear(list, cls) {
      list.forEach(function (code) {
        if (caps[code]) caps[code].classList.remove(cls);
      });
    }

    /* --- next key ---------------------------------------------------------
     * Returns what the caller should say when nothing can be highlighted, so
     * the typing screen can show a neutral chip instead of pointing at the
     * wrong finger.
     */
    function setNext(ch) {
      clear(current.next, 'key-next');
      clear(current.next, 'key-mod');
      current.next = [];

      if (ch === null || ch === undefined) return { resolved: true, char: null };

      var hit = resolver.resolve(ch);
      if (!hit || !caps[hit.code]) {
        return { resolved: false, char: ch };
      }

      caps[hit.code].classList.add('key-next');
      current.next.push(hit.code);

      if (hit.level === 'shift') {
        // Opposite-hand rule: a shifted key on the right takes left Shift.
        var shift = layouts.shiftKeyFor(hit.hand);
        if (shift && caps[shift]) {
          caps[shift].classList.add('key-mod');
          current.next.push(shift);
        }
      } else if (hit.level === 'altgr' && caps.AltRight) {
        caps.AltRight.classList.add('key-mod');
        current.next.push('AltRight');
      }

      return { resolved: true, char: ch, finger: hit.finger, hand: hit.hand };
    }

    /* --- heat ------------------------------------------------------------- */

    function setHeat(keyStats) {
      current.heat.forEach(function (code) {
        var el = caps[code];
        if (!el) return;
        el.className = el.className.replace(/\s*key-heat-[a-z0-9]+/g, '');
      });
      current.heat = [];
      if (!keyStats) return;

      var perCode = Object.create(null);
      Object.keys(keyStats).forEach(function (ch) {
        var stat = keyStats[ch];
        var hit = resolver.resolve(ch);
        if (!hit) return;
        var bucket = perCode[hit.code] || (perCode[hit.code] = { hit: 0, miss: 0 });
        bucket.hit += stat.hit;
        bucket.miss += stat.miss;

        // Half the weight of a shifted character's misses belongs to the
        // Shift key, so someone who keeps fumbling capitals sees it go hot.
        if (hit.level === 'shift') {
          var shift = layouts.shiftKeyFor(hit.hand);
          if (shift) {
            var sb = perCode[shift] || (perCode[shift] = { hit: 0, miss: 0 });
            sb.hit += stat.hit / 2;
            sb.miss += stat.miss / 2;
          }
        }
      });

      Object.keys(perCode).forEach(function (code) {
        var el = caps[code];
        if (!el) return;
        var b = heatBucket(perCode[code].hit, perCode[code].miss);
        el.classList.add('key-heat-' + b);
        current.heat.push(code);
      });
    }

    function setCapsLock(on) {
      current.caps = !!on;
      if (caps.CapsLock) caps.CapsLock.classList.toggle('key-caps-on', !!on);
    }

    function relabel(nextResolver) {
      resolver = nextResolver || resolver;
      Object.keys(caps).forEach(function (code) {
        var el = caps[code];
        var spec = el.getAttribute('data-label-fixed');
        if (spec) return;
        var label = resolver.keyLabel(code);
        if (label) el.textContent = label;
      });
    }

    // Keys whose label comes from ROWS rather than the layout must not be
    // relabelled when the layout changes.
    layouts.ROWS.forEach(function (rowSpec) {
      rowSpec.forEach(function (spec) {
        if (spec.label && caps[spec.code]) {
          caps[spec.code].setAttribute('data-label-fixed', '1');
        }
      });
    });

    return {
      el: wrap,
      setNext: setNext,
      setHeat: setHeat,
      setCapsLock: setCapsLock,
      relabel: relabel,
      destroy: function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  var keyboard = {
    MIN_SAMPLES: MIN_SAMPLES,
    HEAT_STOPS: HEAT_STOPS,
    heatBucket: heatBucket,
    mount: mount
  };

  root.TT = root.TT || {};
  root.TT.keyboard = keyboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = keyboard;
})(typeof globalThis !== 'undefined' ? globalThis : this);
