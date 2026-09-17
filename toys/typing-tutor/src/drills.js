/* drills.js — targeted practice built from your own mistakes. Pure.
 *
 * This is the feature that makes the tutor adaptive rather than rote: rather
 * than repeating a lesson you already pass, drill the six characters you
 * actually keep missing.
 *
 * Deterministic under a seed, so the same statistics always produce the same
 * drill. A practice set that reshuffles itself every time you open it is not
 * practice, it is a slot machine.
 */
(function (root) {
  'use strict';

  var MIN_SAMPLES = 10;
  var DEFAULT_LIMIT = 6;

  /** Characters that cannot be drilled as glyphs, however often they are missed. */
  var UNDRILLABLE = { ' ': true, '\n': true, '\t': true };

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * Rank characters by miss rate, ignoring anything too rarely seen to judge.
   * A key touched twice is unmeasured, not clean.
   */
  function worstKeys(keyStats, opts) {
    opts = opts || {};
    var minSamples = opts.minSamples != null ? opts.minSamples : MIN_SAMPLES;
    var limit = opts.limit != null ? opts.limit : DEFAULT_LIMIT;
    var includeUndrillable = !!opts.includeUndrillable;

    var out = [];
    Object.keys(keyStats || {}).forEach(function (ch) {
      if (!includeUndrillable && UNDRILLABLE[ch]) return;
      var s = keyStats[ch];
      var total = s.hit + s.miss;
      if (total < minSamples) return;
      if (s.miss === 0) return;
      out.push({
        char: ch,
        hit: s.hit,
        miss: s.miss,
        total: total,
        rate: s.miss / total
      });
    });

    out.sort(function (a, b) {
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.miss !== a.miss) return b.miss - a.miss;
      return a.char < b.char ? -1 : 1;   // stable, so ties never reshuffle
    });

    return out.slice(0, limit);
  }

  function groupsLine(parts) { return parts.join(' '); }

  function buildLines(worst, rand) {
    var anchors = 'fjdk'.split('');
    var lines = [];

    // One line per offender: the character alone, then interleaved with a
    // home-row anchor so the hand keeps returning to a known position.
    worst.slice(0, 4).forEach(function (w, i) {
      var c = w.char;
      var a = anchors[i % anchors.length];
      lines.push(groupsLine([
        c + c + c, a + c + a, c + a + c, c + c + a, a + c + c, c + a + a
      ]));
    });

    // Then mixed lines drawing from the whole set, so they have to be
    // distinguished from each other rather than repeated in isolation.
    for (var k = 0; k < 2; k++) {
      var groups = [];
      for (var g = 0; g < 6; g++) {
        var t = '';
        for (var n = 0; n < 3; n++) {
          t += worst[Math.floor(rand() * worst.length)].char;
        }
        groups.push(t);
      }
      lines.push(groupsLine(groups));
    }

    return lines;
  }

  /**
   * @returns {object|null} a lesson-shaped object the engine can run, or null
   *   when there is not enough evidence to build one honestly.
   */
  function buildDrillLesson(keyStats, opts) {
    opts = opts || {};
    var worst = worstKeys(keyStats, opts);
    if (worst.length === 0) return null;

    var rand = rng(opts.seed != null ? opts.seed : 1);
    var chars = worst.map(function (w) { return w.char; });

    return {
      id: 'drill-worst',
      track: 'drill',
      order: 0,
      title: 'Your worst keys',
      prereq: null,
      newKeys: [],
      targetWpm: 0,
      targetAccuracy: 0,
      mode: 'prose',
      language: null,
      requireEnter: false,
      generated: true,
      drillChars: chars,
      note: 'Built from the keys you miss most: ' +
            chars.map(function (c) { return '"' + c + '"'; }).join(' ') +
            '. It is regenerated from your statistics, so it changes as you ' +
            'improve.',
      lines: buildLines(worst, rand)
    };
  }

  var drills = {
    MIN_SAMPLES: MIN_SAMPLES,
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    UNDRILLABLE: UNDRILLABLE,
    rng: rng,
    worstKeys: worstKeys,
    buildDrillLesson: buildDrillLesson
  };

  root.TT = root.TT || {};
  root.TT.drills = drills;
  if (typeof module !== 'undefined' && module.exports) module.exports = drills;
})(typeof globalThis !== 'undefined' ? globalThis : this);
