/* cases.js — the assertions, authored as data.
 *
 * Both runners consume this same array: test/run.node.js wraps each case in
 * node:test, and test/test.html runs them in the browser. One copy, so the two
 * cannot drift.
 */
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports &&
               typeof require === 'function';

  // A module that is absent resolves to null rather than exploding the whole
  // suite on load. Cases that touch it then fail individually and say so,
  // which is also what happens in the browser if a script tag is missing.
  function req(name) {
    if (!isNode) return (root.TT || {})[name] || null;
    try { return require('../src/' + name + '.js'); }
    catch (e) { return null; }
  }

  var TTm = {
    storage: req('storage'),
    engine: req('engine'),
    metrics: req('metrics'),
    progress: req('progress'),
    drills: req('drills'),
    lessons: req('lessons')
  };

  /* --- a minimal assertion kit, so no adapter sits between the runners ----- */

  function fail(msg) { throw new Error(msg); }

  function ok(cond, msg) {
    if (!cond) fail(msg || 'expected truthy');
  }

  function eq(actual, expected, msg) {
    if (actual !== expected) {
      fail((msg || 'not equal') + ' — expected ' + fmt(expected) +
           ', got ' + fmt(actual));
    }
  }

  function near(actual, expected, tol, msg) {
    if (!(Math.abs(actual - expected) <= tol)) {
      fail((msg || 'not close') + ' — expected ' + expected + ' +/- ' + tol +
           ', got ' + actual);
    }
  }

  function deepEq(a, b, msg) {
    var sa = JSON.stringify(sorted(a));
    var sb = JSON.stringify(sorted(b));
    if (sa !== sb) fail((msg || 'not deep equal') + '\n  a: ' + sa + '\n  b: ' + sb);
  }

  function sorted(v) {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = sorted(v[k]); });
      return out;
    }
    return v;
  }

  function fmt(v) {
    if (typeof v === 'string') return JSON.stringify(v);
    return String(v);
  }

  function noThrow(fn, msg) {
    try { return fn(); }
    catch (e) { fail((msg || 'threw') + ' — ' + (e && e.message)); }
  }

  /* --- helpers ------------------------------------------------------------ */

  /** A lesson literal for engine tests; keeps cases readable. */
  function lesson(lines, opts) {
    opts = opts || {};
    return {
      id: opts.id || 'test',
      track: opts.track || 'fundamentals',
      title: 'Test',
      prereq: null,
      newKeys: [],
      targetWpm: opts.targetWpm != null ? opts.targetWpm : 0,
      targetAccuracy: opts.targetAccuracy != null ? opts.targetAccuracy : 0,
      mode: opts.mode || 'prose',
      language: null,
      autoIndent: opts.autoIndent !== false,
      requireEnter: !!opts.requireEnter,
      lines: lines
    };
  }

  /** Type a string into a session, one INPUT per character, 100ms apart. */
  function type(session, text, startT, stepMs) {
    var t = startT == null ? 1000 : startT;
    var step = stepMs == null ? 100 : stepMs;
    var s = session;
    for (var i = 0; i < text.length; i++) {
      s = TTm.engine.reduce(s, { type: 'INPUT', char: text[i], t: t }).state;
      t += step;
    }
    return s;
  }

  /** Deterministic PRNG so the fuzz case is reproducible. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  var cases = [];
  function add(name, fn) { cases.push({ name: name, fn: fn }); }

  /* ======================================================================
     storage
     ====================================================================== */

  add('storage: a backend that throws on every call degrades, never throws out', function () {
    var hostile = {
      name: 'hostile',
      getItem: function () { throw new Error('SecurityError'); },
      setItem: function () { throw new Error('SecurityError'); },
      removeItem: function () { throw new Error('SecurityError'); }
    };
    var s = TTm.storage.create(hostile);
    var loaded = noThrow(function () { return s.load(); }, 'load threw');
    eq(loaded.version, TTm.storage.CURRENT_VERSION, 'defaults returned');
    var saved = noThrow(function () { return s.save(loaded); }, 'save threw');
    eq(saved, false, 'save reports failure');
    ok(s.degraded, 'store marked degraded');
    noThrow(function () { return s.reset(); }, 'reset threw');
  });

  add('storage: corrupt JSON yields defaults and is set aside, not destroyed', function () {
    var mem = TTm.storage.memoryBackend();
    mem.setItem(TTm.storage.KEY, '{not json at all');
    var s = TTm.storage.create(mem);
    var loaded = s.load();
    eq(loaded.version, TTm.storage.CURRENT_VERSION);
    eq(Object.keys(loaded.lessons).length, 0);
    ok(s.corruptDetected, 'corruption flagged');
    var stash = mem.keys().filter(function (k) {
      return k.indexOf('tt:progress.corrupt.') === 0;
    });
    eq(stash.length, 1, 'the unreadable blob was set aside');
    eq(mem.getItem(stash[0]), '{not json at all', 'set aside verbatim');
  });

  add('storage: a v0 blob migrates to a shape-valid v1 record', function () {
    var mem = TTm.storage.memoryBackend();
    mem.setItem(TTm.storage.KEY, JSON.stringify({
      version: 0,
      lessons: { 'home-1': 31.4 }
    }));
    var loaded = TTm.storage.create(mem).load();
    eq(loaded.version, 1, 'version bumped');
    var rec = loaded.lessons['home-1'];
    ok(rec, 'lesson record survived');
    eq(rec.bestWpm, 31.4, 'flat number became bestWpm');
    eq(rec.cleared, false);
    eq(rec.attempts, 1);
    eq(typeof rec.bestAccuracy, 'number', 'missing fields filled, not undefined');
    eq(typeof rec.totalMs, 'number');
  });

  add('storage: a blob from a NEWER version is never clobbered', function () {
    var mem = TTm.storage.memoryBackend();
    var future = JSON.stringify({ version: 999, lessons: { x: { bestWpm: 90 } } });
    mem.setItem(TTm.storage.KEY, future);
    var s = TTm.storage.create(mem);
    var loaded = s.load();
    eq(loaded.version, TTm.storage.CURRENT_VERSION, 'defaults used');
    eq(Object.keys(loaded.lessons).length, 0, 'future data not adopted');
    ok(s.futureDetected, 'future flag set for the UI');
    eq(mem.getItem(TTm.storage.FUTURE_KEY), future, 'original preserved verbatim');
  });

  add('storage: a non-numeric version is treated as unusable', function () {
    var mem = TTm.storage.memoryBackend();
    mem.setItem(TTm.storage.KEY, JSON.stringify({ version: 'one', lessons: { a: {} } }));
    var loaded = TTm.storage.create(mem).load();
    eq(Object.keys(loaded.lessons).length, 0);
  });

  add('storage: quota errors drop confusions and retry before degrading', function () {
    var attempts = [];
    var mem = TTm.storage.memoryBackend();
    var quota = {
      name: 'quota',
      getItem: mem.getItem,
      removeItem: mem.removeItem,
      setItem: function (k, v) {
        attempts.push(v);
        if (attempts.length === 1) {
          var e = new Error('quota');
          e.name = 'QuotaExceededError';
          throw e;
        }
        mem.setItem(k, v);
      }
    };
    var s = TTm.storage.create(quota);
    var p = TTm.storage.defaults();
    p.confusions = { ';|l': 17, '{|[': 9 };
    p.keyStats = { a: { hit: 5, miss: 1 } };
    eq(s.save(p), true, 'second attempt succeeded');
    eq(attempts.length, 2, 'exactly one retry');
    var reread = JSON.parse(attempts[1]);
    deepEq(reread.confusions, {}, 'confusions dropped');
    deepEq(reread.keyStats, { a: { hit: 5, miss: 1 } }, 'key stats kept');
    ok(!s.degraded, 'retry succeeded, so no degrade');
  });

  add('storage: export then import round-trips', function () {
    var mem = TTm.storage.memoryBackend();
    var s = TTm.storage.create(mem);
    var p = TTm.storage.defaults();
    p.lessons['home-1'] = {
      cleared: true, clearedByOverride: false, attempts: 3,
      bestWpm: 28.5, bestAccuracy: 0.97, lastWpm: 27, lastAt: 123, totalMs: 4000
    };
    p.keyStats = { ';': { hit: 140, miss: 39 } };
    p.settings.themeId = 'amber';
    s.save(p);

    var text = s.exportJSON();
    var fresh = TTm.storage.create(TTm.storage.memoryBackend());
    var res = fresh.importJSON(text);
    ok(res.ok, 'import accepted');
    deepEq(res.progress.lessons, s.load().lessons, 'lessons round-tripped');
    deepEq(res.progress.keyStats, s.load().keyStats, 'key stats round-tripped');
    eq(res.progress.settings.themeId, 'amber', 'settings round-tripped');
  });

  add('storage: import rejects junk without throwing', function () {
    var s = TTm.storage.create(TTm.storage.memoryBackend());
    var a = noThrow(function () { return s.importJSON('<html>'); });
    eq(a.ok, false);
    var b = noThrow(function () { return s.importJSON('[1,2,3]'); });
    eq(b.ok, false, 'an array is not a progress object');
    var c = noThrow(function () { return s.importJSON('{"version":999}'); });
    eq(c.ok, false, 'refuses progress from a newer version');
  });

  add('storage: validate fills every field of a half-written record', function () {
    var v = TTm.storage.validate({ lessons: { x: { bestWpm: 10 } } });
    var r = v.lessons.x;
    ['cleared', 'clearedByOverride', 'attempts', 'bestWpm', 'bestAccuracy',
     'lastWpm', 'lastAt', 'totalMs'].forEach(function (f) {
      ok(r[f] !== undefined, f + ' filled');
    });
    eq(v.settings.themeId, 'algocratic', 'settings defaulted');
    eq(v.totals.sessions, 0);
  });

  root.TT_CASES = { cases: cases, assert: { ok: ok, eq: eq, near: near, deepEq: deepEq } };
  if (isNode) module.exports = root.TT_CASES;

  /* Exported for the engine cases appended below in later steps. */
  root.TT_CASES.helpers = { lesson: lesson, type: type, rng: rng, add: add, TTm: TTm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
