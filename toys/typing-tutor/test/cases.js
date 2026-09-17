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
    eq(loaded.version, TTm.storage.CURRENT_VERSION,
       'the chain runs all the way to the current version, not just one step');
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

  /* ======================================================================
     engine: cursor arithmetic and the error model
     ====================================================================== */

  add('engine: a correct keystroke advances the cursor by exactly one', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    eq(s.cursor, 0);
    eq(s.status, 'idle');
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 1000 });
    eq(r.state.cursor, 1);
    eq(r.state.correctChars, 1);
    eq(r.state.status, 'running');
    eq(r.events[0].type, 'started', 'the clock starts on the first keystroke');
    eq(r.events[1].type, 'correct');
  });

  add('engine: ten wrong keys then the right one leaves the cursor at one', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    var t = 1000;
    // Alternate the wrong character so the auto-repeat guard stays out of it.
    for (var i = 0; i < 10; i++) {
      s = TTm.engine.reduce(s, {
        type: 'INPUT', char: i % 2 ? 'x' : 'z', t: t
      }).state;
      t += 200;
    }
    eq(s.cursor, 0, 'a wrong key never advances');
    eq(s.errorKeystrokes, 10);
    eq(s.correctChars, 0);
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: t }).state;
    eq(s.cursor, 1);
    eq(s.errorKeystrokes, 10, 'errors are not forgiven by a later success');
  });

  add('engine: the auto-repeat guard counts a held key once', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    // Same wrong char, same position, 20ms apart: one mistake.
    var t = 1000;
    for (var i = 0; i < 40; i++) {
      s = TTm.engine.reduce(s, { type: 'INPUT', char: 'q', t: t }).state;
      t += 20;
    }
    eq(s.errorKeystrokes, 1, 'forty repeats, one error');
    eq(s.perCharErrors.a, 1);
  });

  add('engine: an explicit repeat flag is never counted', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'q', t: 1000, repeat: true });
    eq(r.state.errorKeystrokes, 0);
    eq(r.events[r.events.length - 1].counted, false, 'the UI still flashes');
  });

  add('engine: repeats further apart than the guard window are real mistakes', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'q', t: 1000 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'q', t: 1500 }).state;
    eq(s.errorKeystrokes, 2);
  });

  add('engine: the cursor invariant holds under a few thousand random keys', function () {
    var rand = rng(20260917);
    var alphabet = 'abcdefg \n(){};'.split('');
    var s = TTm.engine.createSession(
      lesson(['def f(x):', '    return x + 1', 'print(f(2))'],
             { requireEnter: true, mode: 'code' }),
      { autoIndent: true, requireEnter: true }
    );
    var t = 0;
    for (var i = 0; i < 4000 && s.status !== 'finished'; i++) {
      var ch = rand() < 0.5
        ? TTm.engine.currentChar(s)          // bias toward progress
        : alphabet[Math.floor(rand() * alphabet.length)];
      if (ch === null) break;
      t += 10 + Math.floor(rand() * 40);
      s = TTm.engine.reduce(s, { type: 'INPUT', char: ch, t: t }).state;

      var target = TTm.engine.currentTarget(s);
      eq(s.cursor, s.indentEnd + s.lineCorrect,
         'invariant broke at iteration ' + i);
      ok(s.cursor <= target.length, 'cursor ran past the line at iteration ' + i);
      ok(s.lineIndex < s.lines.length, 'line index in range at iteration ' + i);
    }
    eq(s.status, 'finished', 'the biased walk should complete the lesson');
  });

  /* ======================================================================
     engine: error attribution
     ====================================================================== */

  add('engine: a miss is tallied against the expected char, not the pressed one', function () {
    var s = TTm.engine.createSession(lesson([';a']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'l', t: 1000 }).state;
    eq(s.perCharErrors[';'], 1, 'the semicolon is what you missed');
    eq(s.perCharErrors.l, undefined, 'the key you hit is not blamed');
    eq(s.confusions[';|l'], 1, 'the confusion pair is recorded');
  });

  add('engine: correct keystrokes accumulate per-character hits', function () {
    var s = TTm.engine.createSession(lesson(['aab']), {});
    s = type(s, 'aab');
    eq(s.perCharHits.a, 2);
    eq(s.perCharHits.b, 1);
  });

  /* ======================================================================
     engine: indentation
     ====================================================================== */

  add('engine: auto-indent starts the cursor past the supplied whitespace', function () {
    var s = TTm.engine.createSession(
      lesson(['    return a + b'], { mode: 'code' }),
      { autoIndent: true }
    );
    eq(s.cursor, 4, 'cursor begins past the indent');
    eq(s.indentEnd, 4);
    eq(s.autoSuppliedTotal, 4);
    s = type(s, 'return a + b');
    eq(s.status, 'finished');
    eq(s.correctChars, 12, 'supplied indentation is not scored');
    eq(s.perCharHits[' '], 3, 'only the three spaces inside the line count');
  });

  add('engine: pressing space over supplied indent is forgiven, then compared', function () {
    var s = TTm.engine.createSession(
      lesson(['    return x'], { mode: 'code' }),
      { autoIndent: true }
    );
    var t = 1000;
    for (var i = 0; i < 3; i++) {
      var r = TTm.engine.reduce(s, { type: 'INPUT', char: ' ', t: t });
      s = r.state;
      t += 300;
      eq(r.events[r.events.length - 1].type, 'ignored', 'press ' + (i + 1) + ' forgiven');
      eq(s.errorKeystrokes, 0);
      eq(s.cursor, 4, 'and the cursor does not move');
    }
    var r4 = TTm.engine.reduce(s, { type: 'INPUT', char: ' ', t: t });
    eq(r4.events[r4.events.length - 1].type, 'incorrect',
       'the fourth press is real feedback');
    eq(r4.state.errorKeystrokes, 1);
    eq(r4.state.perCharErrors.r, 1, 'blamed on the r that was wanted');
  });

  add('engine: with auto-indent off the spaces must actually be typed', function () {
    var s = TTm.engine.createSession(
      lesson(['    return x'], { mode: 'code' }),
      { autoIndent: false }
    );
    eq(s.cursor, 0);
    eq(s.indentEnd, 0);
    eq(s.autoSuppliedTotal, 0);
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'r', t: 1000 });
    eq(r.state.errorKeystrokes, 1, 'r is wrong here; a space was wanted');
    eq(r.state.perCharErrors[' '], 1, 'the miss is attributed to space');
    s = type(r.state, '    return x', 2000);
    eq(s.status, 'finished');
    eq(s.correctChars, 12, 'every character counts when none is supplied');
  });

  add('engine: indent is recomputed per line, so dedents need no special case', function () {
    var s = TTm.engine.createSession(
      lesson(['for x in y:', '    print(x)', 'done'], { mode: 'code' }),
      { autoIndent: true }
    );
    eq(s.indentEnd, 0, 'line 1 is flush left');
    s = type(s, 'for x in y:');
    eq(s.lineIndex, 1);
    eq(s.indentEnd, 4, 'line 2 is indented');
    eq(s.cursor, 4);
    s = type(s, 'print(x)');
    eq(s.lineIndex, 2);
    eq(s.indentEnd, 0, 'line 3 dedents back');
    eq(s.cursor, 0);
  });

  /* ======================================================================
     engine: Enter and line transitions
     ====================================================================== */

  add('engine: requireEnter makes the newline a real, attributable character', function () {
    var s = TTm.engine.createSession(
      lesson(['ab'], { requireEnter: true }),
      { requireEnter: true }
    );
    eq(TTm.engine.currentTarget(s).length, 3, 'target is the line plus a newline');
    s = type(s, 'ab');
    eq(s.status, 'running', 'the line is not done until Enter');
    eq(TTm.engine.currentChar(s), '\n');
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'x', t: 9000 });
    eq(r.state.perCharErrors['\n'], 1, 'the miss is attributed to the newline');
    var done = TTm.engine.reduce(r.state, { type: 'INPUT', char: '\n', t: 9200 });
    eq(done.state.status, 'finished');
  });

  add('engine: requireEnter false advances on the last visible character', function () {
    var s = TTm.engine.createSession(
      lesson(['ab', 'cd'], { requireEnter: false }),
      { requireEnter: true }   // the lesson wins; the reach is not taught yet
    );
    eq(TTm.engine.currentTarget(s).length, 2);
    s = type(s, 'ab');
    eq(s.lineIndex, 1, 'moved on without an Enter');
    s = type(s, 'cd', 5000);
    eq(s.status, 'finished');
  });

  add('engine: finishing the last line completes the session exactly once', function () {
    var s = TTm.engine.createSession(lesson(['ab', 'cd']), {});
    s = type(s, 'ab');
    var r = TTm.engine.reduce(
      type(s, 'c', 5000), { type: 'INPUT', char: 'd', t: 5200 }
    );
    var kinds = r.events.map(function (e) { return e.type; });
    eq(kinds.filter(function (k) { return k === 'session-complete'; }).length, 1);
    eq(kinds.filter(function (k) { return k === 'line-complete'; }).length, 1);
    eq(r.state.lineIndex, 1, 'the line index never runs past the last line');
  });

  add('engine: input after the session has finished is ignored', function () {
    var s = type(TTm.engine.createSession(lesson(['a']), {}), 'a');
    eq(s.status, 'finished');
    var before = s.endedAt;
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'b', t: 99999 });
    eq(r.events[0].type, 'ignored');
    eq(r.state.errorKeystrokes, 0);
    eq(r.state.endedAt, before, 'and the clock stays stopped');
  });

  add('engine: empty lines are skipped without spinning', function () {
    var s = TTm.engine.createSession(
      lesson(['', '', 'ab', ''], { requireEnter: false }),
      { requireEnter: false }
    );
    eq(s.lineIndex, 2, 'walked past the leading empties');
    s = type(s, 'ab');
    eq(s.status, 'finished', 'a trailing empty line ends the session');
  });

  add('engine: a lesson with nothing to type finishes rather than hanging', function () {
    var s = TTm.engine.createSession(
      lesson(['', ''], { requireEnter: false }), { requireEnter: false }
    );
    eq(s.status, 'finished');
  });

  add('engine: backspace moves nothing and is not an error', function () {
    var s = type(TTm.engine.createSession(lesson(['abc']), {}), 'a');
    var r = TTm.engine.reduce(s, { type: 'BACKSPACE', t: 5000 });
    eq(r.state.cursor, 1, 'everything left of the cursor is already correct');
    eq(r.state.errorKeystrokes, 0);
    eq(r.events[0].type, 'backspace-ignored', 'but the UI is told, so it can say why');
  });

  add('engine: paste is refused and reported, not silently dropped', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    var r = TTm.engine.reduce(s, { type: 'PASTE', t: 1000 });
    eq(r.events[0].type, 'paste-blocked');
    eq(r.state.cursor, 0);
  });

  add('engine: Caps Lock is suspected after three case-flipped errors', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    var t = 1000;
    ['A', 'A', 'A'].forEach(function (c) {
      s = TTm.engine.reduce(s, { type: 'INPUT', char: c, t: t }).state;
      t += 400;
    });
    ok(s.capsLockSuspected, 'three flips is a pattern, not a slip');
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: t }).state;
    ok(!s.capsLockSuspected, 'cleared by a correctly-cased letter');
  });

  add('engine: restart returns a clean session with the same policy', function () {
    var s = TTm.engine.createSession(
      lesson(['    ab'], { mode: 'code' }), { autoIndent: true }
    );
    s = type(s, 'ab');
    var r = TTm.engine.reduce(s, { type: 'RESTART', t: 9000 });
    eq(r.state.status, 'idle');
    eq(r.state.correctChars, 0);
    eq(r.state.startedAt, null);
    eq(r.state.cursor, 4, 'auto-indent policy survived the restart');
  });

  /* ======================================================================
     metrics
     ====================================================================== */

  add('metrics: the clock starts on the first keystroke, right or wrong', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    eq(s.startedAt, null, 'not on load');
    eq(TTm.metrics.activeMs(s), 0);
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'z', t: 4321 });
    eq(r.state.startedAt, 4321, 'a wrong key still starts it');
  });

  add('metrics: 25 characters in 30 seconds is exactly 10 WPM', function () {
    var s = TTm.engine.createSession(
      lesson(['abcdefghijklmnopqrstuvwxy'], { requireEnter: false }),
      { requireEnter: false }
    );
    s = type(s, 'abcdefghijklmnopqrstuvwxy', 0, 1250);
    eq(s.correctChars, 25);
    eq(s.status, 'finished');
    eq(s.endedAt, 30000, 'the clock stops on the final keystroke, not at render');
    eq(TTm.metrics.activeMs(s), 30000);
    near(TTm.metrics.wpm(s), 10, 1e-9);
  });

  add('metrics: a ten-second gap costs seven, with three seconds of grace', function () {
    var s = TTm.engine.createSession(lesson(['abcdef']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 0 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'b', t: 10000 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'c', t: 10100 }).state;
    eq(s.idleDeductedMs, 7000);
    eq(TTm.metrics.activeMs(s), 3100);
  });

  add('metrics: blurring away deducts the whole absence', function () {
    var s = TTm.engine.createSession(lesson(['abcdef']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 0 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'b', t: 100 }).state;
    s = TTm.engine.reduce(s, { type: 'BLUR', t: 200 }).state;
    s = TTm.engine.reduce(s, { type: 'FOCUS', t: 60200 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'c', t: 60300 }).state;
    eq(s.idleDeductedMs, 60000, 'the absence is deducted once, not twice');
    eq(TTm.metrics.activeMs(s), 300);
  });

  add('metrics: a live reading does not inflate while the learner stares', function () {
    var s = TTm.engine.createSession(lesson(['abcdef']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 0 }).state;
    // 30s later, still running, nothing typed since.
    eq(TTm.metrics.activeMs(s, 30000), 3000, 'only the grace period accrues');
  });

  add('metrics: zero elapsed gives zero WPM, never Infinity', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    eq(TTm.metrics.wpm(s), 0);
    var r = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 500 });
    eq(TTm.metrics.activeMs(r.state), 0, 'one keystroke spans no time');
    eq(TTm.metrics.wpm(r.state), 0);
    ok(isFinite(TTm.metrics.wpm(r.state)));
  });

  add('metrics: accuracy is null before anything is typed, and renders as a dash', function () {
    var s = TTm.engine.createSession(lesson(['abc']), {});
    eq(TTm.metrics.accuracy(s), null, 'null, not NaN');
    eq(TTm.metrics.formatAccuracy(TTm.metrics.accuracy(s)), '—');
    eq(TTm.metrics.formatAccuracy(0.9612), '96%');
    eq(TTm.metrics.formatWpm(0), '0.0');
  });

  add('metrics: accuracy counts every keystroke, including the corrected ones', function () {
    var s = TTm.engine.createSession(lesson(['ab']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'x', t: 0 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 300 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'b', t: 600 }).state;
    near(TTm.metrics.accuracy(s), 2 / 3, 1e-9);
  });

  add('metrics: summarize reports a code lesson without counting supplied indent', function () {
    var s = TTm.engine.createSession(
      lesson(['    return x'], { mode: 'code' }), { autoIndent: true }
    );
    s = type(s, 'return x', 0, 1000);
    var sum = TTm.metrics.summarize(s);
    eq(sum.correctChars, 8);
    eq(sum.autoSuppliedChars, 4);
    ok(sum.finished);
    eq(sum.lineTimes.length, 1);
  });

  /* ======================================================================
     lesson content
     ====================================================================== */

  add('lessons: the structural validator reports nothing', function () {
    deepEq(TTm.lessons.validate(), [], 'validator found problems');
  });

  add('lessons: no fundamentals line demands a key it has not taught', function () {
    TTm.lessons.byTrack.fundamentals.forEach(function (l) {
      var allowed = TTm.lessons.cumulativeAllowed(l.id);
      l.lines.forEach(function (line, i) {
        for (var j = 0; j < line.length; j++) {
          ok(allowed[line[j]],
             l.id + ' line ' + (i + 1) + ' uses ' + JSON.stringify(line[j]) +
             ' before it is taught');
        }
      });
    });
  });

  add('lessons: every prerequisite chain terminates at a track head', function () {
    TTm.lessons.all.forEach(function (l) {
      var seen = {}, node = l, steps = 0;
      while (node && node.prereq) {
        ok(!seen[node.id], 'cycle at ' + node.id);
        seen[node.id] = true;
        var next = TTm.lessons.get(node.prereq);
        ok(next, l.id + ' depends on missing lesson ' + node.prereq);
        node = next;
        ok(steps++ < 200, 'runaway chain from ' + l.id);
      }
    });
  });

  add('lessons: the fundamentals track introduces every key it later uses', function () {
    var last = TTm.lessons.byTrack.fundamentals.slice(-1)[0];
    var allowed = TTm.lessons.cumulativeAllowed(last.id);
    'abcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach(function (ch) {
      ok(allowed[ch], 'the track never teaches ' + JSON.stringify(ch));
    });
    '(){}[]<>=+*|\\&%$#@_^~`;:\'",.?!/- \n'.split('').forEach(function (ch) {
      ok(allowed[ch], 'the track never teaches ' + JSON.stringify(ch));
    });
  });

  add('lessons: a session can be built and completed for every lesson', function () {
    TTm.lessons.all.forEach(function (l) {
      var s = TTm.engine.createSession(l, { autoIndent: true, requireEnter: true });
      var guard = 0;
      var t = 0;
      while (s.status !== 'finished' && guard++ < 20000) {
        var ch = TTm.engine.currentChar(s);
        if (ch === null) break;
        t += 50;
        s = TTm.engine.reduce(s, { type: 'INPUT', char: ch, t: t }).state;
      }
      eq(s.status, 'finished', l.id + ' could not be completed');
      eq(s.errorKeystrokes, 0, l.id + ' reported errors on a perfect run');
      ok(s.correctChars > 0, l.id + ' scored nothing');
    });
  });

  /* ======================================================================
     layouts, keyboard projection and drills
     ====================================================================== */

  var layoutsM = req('layouts');
  var keyboardM = req('keyboard');

  add('layouts: a character resolves to a key, a level and a finger', function () {
    var r = layoutsM.createResolver('us', null);
    deepEq(r.resolve('f'), { code: 'KeyF', level: 'base', finger: 'index', hand: 'left' });
    deepEq(r.resolve('{'), { code: 'BracketLeft', level: 'shift', finger: 'pinky', hand: 'right' });
    eq(r.resolve('é'), null, 'an unmapped character resolves to nothing');
  });

  add('layouts: shift is the opposite hand, which is the technique worth teaching', function () {
    eq(layoutsM.shiftKeyFor('right'), 'ShiftLeft');
    eq(layoutsM.shiftKeyFor('left'), 'ShiftRight');
    eq(layoutsM.shiftKeyFor('both'), null);
  });

  add('layouts: a shifted character reported without its modifier is not taken as a base key', function () {
    // Some synthetic and on-screen keyboards report key=":" with shiftKey
    // false. Believing that would relabel the semicolon keycap.
    var r = layoutsM.createResolver('us', null);
    r.observe('Semicolon', ':', false);
    eq(r.keyLabel('Semicolon'), ';', 'the keycap still reads semicolon');
    deepEq(r.resolve(':'), { code: 'Semicolon', level: 'shift', finger: 'pinky', hand: 'right' });

    r.observe('KeyA', 'A', false);
    eq(r.keyLabel('KeyA'), 'A', 'letters print uppercase either way');
    eq(r.resolve('a').code, 'KeyA', 'and lowercase a still resolves');
  });

  add('layouts: a genuine observation overrides the table', function () {
    var r = layoutsM.createResolver('us', null);
    eq(r.resolve('q').code, 'KeyQ');
    r.observe('KeyA', 'q', false);      // as on AZERTY
    eq(r.resolve('q').code, 'KeyA', 'what the keyboard actually does wins');
    eq(r.keyLabel('KeyA'), 'Q');
  });

  add('keyboard: heat buckets treat a barely-touched key as unmeasured', function () {
    eq(keyboardM.heatBucket(4, 1), 'none', 'five attempts prove nothing');
    eq(keyboardM.heatBucket(200, 0), 0);
    eq(keyboardM.heatBucket(50, 50), 5);
    ok(keyboardM.heatBucket(90, 10) > keyboardM.heatBucket(97, 3),
       'a worse miss rate is a hotter bucket');
  });

  add('drills: worst keys ignore anything too rarely seen to judge', function () {
    var stats = {
      ';': { hit: 100, miss: 40 },   // 28.6%
      'a': { hit: 900, miss: 5 },    // 0.6%
      'b': { hit: 2, miss: 2 },      // 50% but only 4 attempts
      'c': { hit: 50, miss: 0 }      // never missed
    };
    var worst = TTm.drills.worstKeys(stats);
    eq(worst.length, 2, 'only the two with both evidence and misses');
    eq(worst[0].char, ';');
    eq(worst[1].char, 'a');
  });

  add('drills: the same statistics always produce the same drill', function () {
    var stats = { ';': { hit: 100, miss: 40 }, '{': { hit: 60, miss: 17 } };
    var a = TTm.drills.buildDrillLesson(stats, { seed: 7 });
    var b = TTm.drills.buildDrillLesson(stats, { seed: 7 });
    deepEq(a.lines, b.lines, 'practice must not reshuffle itself');
    ok(a.lines.length > 0);
    a.lines.forEach(function (line) {
      ok(line.length <= 72, 'drill line within the length limit');
      ok(line.indexOf('\t') === -1, 'no tabs in generated content');
    });
  });

  add('drills: space is never drilled as a glyph however often it is missed', function () {
    var lesson = TTm.drills.buildDrillLesson({
      ' ': { hit: 100, miss: 80 }, ';': { hit: 100, miss: 30 }
    }, { seed: 1 });
    eq(lesson.drillChars.indexOf(' '), -1, 'space excluded from drill characters');
  });

  add('drills: no evidence produces no drill, rather than a fake one', function () {
    eq(TTm.drills.buildDrillLesson({}, {}), null);
    eq(TTm.drills.buildDrillLesson({ a: { hit: 3, miss: 1 } }, {}), null);
  });

  /* ======================================================================
     progression
     ====================================================================== */

  add('progress: a lesson clears only when both targets are met', function () {
    var lesson = { id: 'x', targetWpm: 20, targetAccuracy: 0.95 };
    eq(TTm.progress.evaluate(lesson, {
      finished: true, skippedLines: 0, wpm: 25, accuracy: 0.97
    }).passed, true);
    var slow = TTm.progress.evaluate(lesson, {
      finished: true, skippedLines: 0, wpm: 12, accuracy: 0.99
    });
    eq(slow.passed, false);
    ok(slow.reasons.join(' ').indexOf('speed') !== -1, 'and says which target');
    eq(TTm.progress.evaluate(lesson, {
      finished: true, skippedLines: 2, wpm: 30, accuracy: 0.99
    }).passed, false, 'skipping lines is practice, not a score');
  });

  add('progress: three finished attempts unlock what follows without faking the score', function () {
    var lesson = { id: 'x', targetWpm: 40, targetAccuracy: 0.99 };
    var p = TTm.storage.defaults();
    var summary = {
      finished: true, skippedLines: 0, wpm: 10, accuracy: 0.8,
      activeMs: 1000, correctChars: 50, errorKeystrokes: 12,
      perCharHits: {}, perCharErrors: {}, confusions: {}
    };
    for (var i = 0; i < 2; i++) p = TTm.progress.recordResult(p, lesson, summary, i).progress;
    eq(TTm.progress.isCleared(p, 'x'), false, 'not after two');
    p = TTm.progress.recordResult(p, lesson, summary, 3).progress;
    eq(TTm.progress.isCleared(p, 'x'), true, 'open after three');
    eq(p.lessons.x.clearedByOverride, true, 'and honestly labelled');
    near(p.lessons.x.bestWpm, 10, 1e-9, 'the recorded best is not inflated');
  });

  add('progress: a run with skipped lines never moves the recorded best', function () {
    var lesson = { id: 'x', targetWpm: 1, targetAccuracy: 0.1 };
    var p = TTm.storage.defaults();
    var base = {
      finished: true, skippedLines: 0, wpm: 30, accuracy: 0.99, activeMs: 1000,
      correctChars: 10, errorKeystrokes: 0,
      perCharHits: {}, perCharErrors: {}, confusions: {}
    };
    p = TTm.progress.recordResult(p, lesson, base, 1).progress;
    near(p.lessons.x.bestWpm, 30, 1e-9);
    var cheated = Object.assign({}, base, { wpm: 400, skippedLines: 3 });
    p = TTm.progress.recordResult(p, lesson, cheated, 2).progress;
    near(p.lessons.x.bestWpm, 30, 1e-9, 'the skipped run did not count');
  });

  add('progress: key stats fold in keyed by the character that was wanted', function () {
    var lesson = { id: 'x', targetWpm: 1, targetAccuracy: 0.1 };
    var p = TTm.storage.defaults();
    p = TTm.progress.recordResult(p, lesson, {
      finished: true, skippedLines: 0, wpm: 10, accuracy: 0.9, activeMs: 100,
      correctChars: 5, errorKeystrokes: 1,
      perCharHits: { ';': 4 }, perCharErrors: { ';': 1 }, confusions: { ';|l': 1 }
    }, 1).progress;
    deepEq(p.keyStats[';'], { hit: 4, miss: 1 });
    eq(p.confusions[';|l'], 1);
  });

  add('progress: a lock explains itself in words, not with a padlock alone', function () {
    var p = TTm.storage.defaults();
    var lesson = TTm.lessons.get('home-2');
    var st = TTm.progress.lessonState(p, lesson, TTm.lessons);
    eq(st.unlocked, false);
    ok(st.lockReason.indexOf('Anchors') !== -1, 'names the blocking lesson');
    ok(/\d+%/.test(st.lockReason), 'and the bar to clear it');
  });

  /* ======================================================================
     regressions from review
     ====================================================================== */

  add('engine: skipping the last line while blurred does not bank the absence', function () {
    var s = TTm.engine.createSession(lesson(['ab', 'cd']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 0 }).state;
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'b', t: 100 }).state;
    // Now on line 2. Blur away for a minute, then click Skip, which can be
    // done without ever refocusing the typing area.
    s = TTm.engine.reduce(s, { type: 'BLUR', t: 200 }).state;
    s = TTm.engine.reduce(s, { type: 'SKIP_LINE', t: 60200 }).state;
    eq(s.status, 'finished');
    eq(s.idleDeductedMs, 60000, 'the open pause was settled, not ignored');
    eq(TTm.metrics.activeMs(s), 200, 'only the time actually spent typing counts');
  });

  add('engine: skipping mid-lesson while blurred settles the pause too', function () {
    var s = TTm.engine.createSession(lesson(['ab', 'cd', 'ef']), {});
    s = TTm.engine.reduce(s, { type: 'INPUT', char: 'a', t: 0 }).state;
    s = TTm.engine.reduce(s, { type: 'BLUR', t: 100 }).state;
    s = TTm.engine.reduce(s, { type: 'SKIP_LINE', t: 30100 }).state;
    eq(s.pausedAt, null, 'no pause left hanging');
    eq(s.idleDeductedMs, 30000);
  });

  add('layouts: the UK backslash resolves to a key the board actually renders', function () {
    var uk = layoutsM.createResolver('uk', null);
    var hit = uk.resolve('\\');
    eq(hit.code, 'IntlBackslash', 'UK puts backslash left of Z, not left of Enter');
    ok(layoutsM.KEY_FINGER[hit.code], 'and that key has a finger assigned');
    eq(hit.finger, 'pinky');
    eq(hit.hand, 'left');

    var rendered = [];
    layoutsM.ROWS.forEach(function (row) {
      row.forEach(function (spec) { rendered.push(spec.code); });
    });
    ok(rendered.indexOf('IntlBackslash') !== -1, 'and the board renders it');
  });

  add('layouts: the ISO-only key is marked so ANSI boards can hide it', function () {
    var spec = null;
    layoutsM.ROWS.forEach(function (row) {
      row.forEach(function (k) { if (k.code === 'IntlBackslash') spec = k; });
    });
    ok(spec && spec.iso === true, 'flagged as ISO-only');
    eq(layoutsM.createResolver('us', null).keyLabel('IntlBackslash'), null,
       'US has nothing mapped there, so it renders hidden');
    eq(layoutsM.createResolver('uk', null).keyLabel('IntlBackslash'), '\\',
       'UK does, so it renders');
  });

  add('layouts: every code the shipped tables name has a finger assigned', function () {
    [['us', layoutsM.US], ['uk', layoutsM.UK], ['fr', layoutsM.FR],
     ['de', layoutsM.DE], ['es', layoutsM.ES]].forEach(function (pair) {
      Object.keys(pair[1]).forEach(function (code) {
        ok(layoutsM.KEY_FINGER[code],
           pair[0] + ' maps ' + code + ' but no finger owns it');
      });
    });
  });

  /* --- the derived AZERTY / QWERTZ / Spanish tables ------------------------
   * These three were derived from the X11 xkb data rather than recalled, so
   * the assertions below quote the derivation: each one is checkable against
   * /usr/share/X11/xkb/symbols/{fr,de,es} and the `latin` base they include.
   */

  // Every character the C++ and Python tracks are dense in.
  var CODE_CHARS = '{}[]()<>=+-_*/\\|&%$#@^~;:\'",.'.split('');

  // `^` is a dead key on both German and Spanish boards — dead_circumflex on
  // <TLDE> for de, on <AD11> shifted for es — so it produces no character on
  // its own. It is left out rather than guessed at, and must resolve to
  // nothing rather than to a plausible wrong key.
  var DEAD_ONLY = { fr: [], de: ['^'], es: ['^'] };

  ['fr', 'de', 'es'].forEach(function (id) {
    add('layouts: ' + id + ' reaches the characters code is written in',
        function () {
      var r = layoutsM.createResolver(id, null);
      var rendered = [];
      layoutsM.ROWS.forEach(function (row) {
        row.forEach(function (spec) { rendered.push(spec.code); });
      });

      CODE_CHARS.forEach(function (ch) {
        var hit = r.resolve(ch);
        if (DEAD_ONLY[id].indexOf(ch) !== -1) {
          eq(hit, null, id + ' claims a key for ' + ch + ', which is a dead ' +
             'key there and produces nothing on its own');
          return;
        }
        ok(hit, id + ' cannot place ' + ch);
        ok(layoutsM.KEY_FINGER[hit.code],
           id + ' places ' + ch + ' on ' + hit.code + ', which has no finger');
        ok(rendered.indexOf(hit.code) !== -1,
           id + ' places ' + ch + ' on ' + hit.code + ', which is not rendered');
        ok(hit.finger && hit.hand, id + ' gives ' + ch + ' no finger to press it');
        ok(hit.level === 'base' || hit.level === 'shift' || hit.level === 'altgr',
           id + ' put ' + ch + ' on an unknown level ' + hit.level);
      });

      // Letters and digits, which no layout may lose.
      'abcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach(function (ch) {
        ok(r.resolve(ch), id + ' cannot place ' + ch);
      });
      eq(r.resolve(' ').code, 'Space');
    });
  });

  add('layouts: the third level is AltGr, and only where xkb says so', function () {
    // Each of these is level 3 of the named key in the xkb source.
    var expected = {
      // symbols/fr "basic": <AE04> [apostrophe, 4, braceleft, dollar] and so on
      fr: {
        '{': ['Digit4', 'altgr'], '}': ['Equal', 'altgr'],
        '[': ['Digit5', 'altgr'], ']': ['Minus', 'altgr'],
        '\\': ['Digit8', 'altgr'], '|': ['Digit6', 'altgr'],
        '#': ['Digit3', 'altgr'], '@': ['Digit0', 'altgr'],
        '^': ['Digit9', 'altgr'],
        // and the levels below it, which AltGr must not have stolen
        '(': ['Digit5', 'base'], ')': ['Minus', 'base'],
        '<': ['IntlBackslash', 'base'], '>': ['IntlBackslash', 'shift'],
        '~': ['Backquote', 'shift'], 'a': ['KeyQ', 'base'],
        'A': ['KeyQ', 'shift'], ',': ['KeyM', 'base'], ';': ['Comma', 'base']
      },
      // symbols/de "basic": <AE11> [ssharp, question, backslash, ...],
      // latin(type4) <AE07>..<AE10> carry the braces and brackets.
      de: {
        '\\': ['Minus', 'altgr'], '{': ['Digit7', 'altgr'],
        '[': ['Digit8', 'altgr'], ']': ['Digit9', 'altgr'],
        '}': ['Digit0', 'altgr'], '@': ['KeyQ', 'altgr'],
        '~': ['BracketRight', 'altgr'], '|': ['IntlBackslash', 'altgr'],
        '#': ['Backslash', 'base'], "'": ['Backslash', 'shift'],
        '+': ['BracketRight', 'base'], '*': ['BracketRight', 'shift'],
        'z': ['KeyY', 'base'], 'y': ['KeyZ', 'base'],
        '-': ['Slash', 'base'], '_': ['Slash', 'shift']
      },
      // symbols/es "basic": <TLDE> [masculine, ordfeminine, backslash, ...],
      // <AE01> [1, exclam, bar, ...], <AE02> [2, quotedbl, at, ...].
      es: {
        '\\': ['Backquote', 'altgr'], '|': ['Digit1', 'altgr'],
        '@': ['Digit2', 'altgr'], '#': ['Digit3', 'altgr'],
        '~': ['Digit4', 'altgr'],
        // es reaches [ ] { } from two places: AltGr+7/8/9/0, inherited from
        // latin(type4), and the four keys right of P and L, which symbols/es
        // defines itself and which a physical Spanish board prints. The
        // preference map picks the printed ones. See ES_PREFER in layouts.js.
        '[': ['BracketLeft', 'altgr'], ']': ['BracketRight', 'altgr'],
        '{': ['Quote', 'altgr'], '}': ['Backslash', 'altgr'],
        "'": ['Minus', 'base'], '?': ['Minus', 'shift'],
        '+': ['BracketRight', 'base'], '<': ['IntlBackslash', 'base']
      }
    };

    Object.keys(expected).forEach(function (id) {
      var r = layoutsM.createResolver(id, null);
      Object.keys(expected[id]).forEach(function (ch) {
        var want = expected[id][ch];
        var hit = r.resolve(ch);
        ok(hit, id + ' cannot place ' + ch);
        eq(hit.code, want[0], id + ' places ' + ch + ' on the wrong key');
        eq(hit.level, want[1], id + ' places ' + ch + ' on the wrong level');
      });
    });
  });

  add('layouts: an AltGr key highlights AltRight, not a Shift', function () {
    // keyboard.js keys off level alone, so the level is the whole contract.
    var fr = layoutsM.createResolver('fr', null);
    eq(fr.resolve('{').level, 'altgr');
    eq(layoutsM.shiftKeyFor(fr.resolve('{').hand), 'ShiftRight',
       'the shift hint still exists, but the altgr branch is what runs');
    var de = layoutsM.createResolver('de', null);
    eq(de.resolve('\\').level, 'altgr');
  });

  add('layouts: the ISO key carries < > and | on all three derived tables', function () {
    // <LSGT> is [less, greater, bar] in symbols/pc, which de restates and
    // fr and es inherit unchanged.
    ['fr', 'de', 'es'].forEach(function (id) {
      var r = layoutsM.createResolver(id, null);
      eq(r.keyLabel('IntlBackslash'), '<', id + ' should render the ISO key');
      eq(r.resolve('<').code, 'IntlBackslash', id + ' < ');
      eq(r.resolve('>').code, 'IntlBackslash', id + ' > ');
      eq(r.resolve('>').level, 'shift');
      ok(layoutsM.KEY_FINGER.IntlBackslash, 'and a finger owns it');
    });
  });

  add('layouts: a third level never steals a character from base or shift', function () {
    // fr puts ~ on AltGr+2 as well as Shift+<TLDE>, and @ on AltGr+0 as well
    // as AltGr+<AC01>. The easier press wins, and it must not depend on which
    // key happens to be written down first.
    var fr = layoutsM.createResolver('fr', null);
    deepEq(fr.resolve('~'), { code: 'Backquote', level: 'shift',
                              finger: 'pinky', hand: 'left' });
    eq(fr.resolve('@').code, 'Digit0', 'the first AltGr key wins, in row order');

    // es reaches | from both AltGr+1 and AltGr+<LSGT>; whichever is chosen it
    // is an altgr press, never something cheaper that does not exist.
    var es = layoutsM.createResolver('es', null);
    eq(es.resolve('|').level, 'altgr');
  });

  add('layouts: an AltGr character reported without a modifier is not taken as base',
      function () {
    // code + key cannot distinguish AltGr+4 from plain 4, and believing the
    // keystroke would relabel the keycap and demote a correct altgr entry.
    var r = layoutsM.createResolver('fr', null);
    eq(r.observe('Digit4', '{', false), false, 'the observation is refused');
    eq(r.keyLabel('Digit4'), "'", 'the keycap still reads apostrophe');
    deepEq(r.resolve('{'), { code: 'Digit4', level: 'altgr',
                             finger: 'index', hand: 'left' });

    // A genuine base observation on the same key is still believed.
    eq(r.observe('Digit4', 'x', false), true);
    eq(r.resolve('x').code, 'Digit4');
    eq(r.resolve('{').code, 'Digit4', 'and the altgr entry survives it');
    eq(r.resolve('{').level, 'altgr');
  });

  add('layouts: US and UK are unchanged by the arrival of a third level', function () {
    var us = layoutsM.createResolver('us', null);
    var uk = layoutsM.createResolver('uk', null);
    var flat = {
      '{': 'BracketLeft shift', '}': 'BracketRight shift',
      '[': 'BracketLeft base', ']': 'BracketRight base',
      '(': 'Digit9 shift', ')': 'Digit0 shift',
      '<': 'Comma shift', '>': 'Period shift',
      '=': 'Equal base', '+': 'Equal shift',
      '-': 'Minus base', '_': 'Minus shift',
      '*': 'Digit8 shift', '/': 'Slash base',
      '&': 'Digit7 shift', '%': 'Digit5 shift', '$': 'Digit4 shift',
      '^': 'Digit6 shift', ';': 'Semicolon base', ':': 'Semicolon shift',
      ',': 'Comma base', '.': 'Period base', "'": 'Quote base'
    };
    Object.keys(flat).forEach(function (ch) {
      [['us', us], ['uk', uk]].forEach(function (pair) {
        var hit = pair[1].resolve(ch);
        ok(hit, pair[0] + ' lost ' + ch);
        eq(hit.code + ' ' + hit.level, flat[ch], pair[0] + ' moved ' + ch);
      });
    });

    // The six places UK differs, and nothing else.
    eq(us.resolve('\\').code + ' ' + us.resolve('\\').level, 'Backslash base');
    eq(uk.resolve('\\').code + ' ' + uk.resolve('\\').level, 'IntlBackslash base');
    eq(us.resolve('#').code + ' ' + us.resolve('#').level, 'Digit3 shift');
    eq(uk.resolve('#').code + ' ' + uk.resolve('#').level, 'Backslash base');
    eq(us.resolve('@').code + ' ' + us.resolve('@').level, 'Digit2 shift');
    eq(uk.resolve('@').code + ' ' + uk.resolve('@').level, 'Quote shift');
    eq(us.resolve('"').code + ' ' + us.resolve('"').level, 'Quote shift');
    eq(uk.resolve('"').code + ' ' + uk.resolve('"').level, 'Digit2 shift');
    eq(us.resolve('~').code + ' ' + us.resolve('~').level, 'Backquote shift');
    eq(uk.resolve('~').code + ' ' + uk.resolve('~').level, 'Backslash shift');
    eq(us.resolve('|').code + ' ' + us.resolve('|').level, 'Backslash shift');
    eq(uk.resolve('|').code + ' ' + uk.resolve('|').level, 'IntlBackslash shift');

    // No US or UK character is ever an AltGr press.
    [['us', us], ['uk', uk]].forEach(function (pair) {
      CODE_CHARS.concat('abcXYZ0189 '.split('')).forEach(function (ch) {
        var hit = pair[1].resolve(ch);
        if (hit) ok(hit.level !== 'altgr', pair[0] + ' made ' + ch + ' an AltGr press');
      });
    });
  });

  add('layouts: a layout\'s own section outranks what it inherits', function () {
    // Both mappings are real under X11. The question is which one to teach,
    // and the answer is the one printed on the key.
    var es = layoutsM.createResolver('es', null);
    [['[', 'BracketLeft'], [']', 'BracketRight'],
     ['{', 'Quote'], ['}', 'Backslash']].forEach(function (pair) {
      var hit = es.resolve(pair[0]);
      eq(hit.code, pair[1], pair[0] + ' should point at the printed key');
      eq(hit.level, 'altgr');
      ok(layoutsM.KEY_FINGER[hit.code], 'and that key has a finger');
    });

    // The inherited route still exists in the table — dropping it would be a
    // lie about what AltGr+7 does — it simply is not the one taught.
    eq(layoutsM.ES.Digit7[2], '{', 'AltGr+7 still produces a brace');
    eq(layoutsM.ES.Digit8[2], '[');

    // And the preference must not leak into layouts that do not declare one.
    eq(layoutsM.createResolver('de', null).resolve('{').code, 'Digit7',
       'de keeps its own answer');
    eq(layoutsM.createResolver('fr', null).resolve('{').code, 'Digit4',
       'fr keeps its own answer');
    eq(layoutsM.createResolver('us', null).resolve('{').code, 'BracketLeft',
       'us is untouched');
  });

  add('layouts: a genuine observation still beats a curated preference', function () {
    // Evidence from the learner's real keyboard outranks our judgement about
    // which of two valid keys to teach.
    var es = layoutsM.createResolver('es', null);
    eq(es.resolve('[').code, 'BracketLeft');
    // KeyZ carries no bracket in the es table, so this is new information
    // rather than an AltGr press that lost its modifier.
    es.observe('KeyZ', '[', false);
    eq(es.resolve('[').code, 'KeyZ', 'what the keyboard really does wins');
  });

  add('layouts: an AltGr press that lost its modifier cannot demote the key', function () {
    // code + key cannot distinguish AltGr+8 from plain 8. Believing such a
    // report would relabel the 8 keycap as "[" and teach the wrong press, so
    // an observation matching the key's own AltGr slot is refused outright.
    var es = layoutsM.createResolver('es', null);
    eq(layoutsM.ES.Digit8[2], '[', 'precondition: AltGr+8 does make a bracket');
    es.observe('Digit8', '[', false);
    eq(es.keyLabel('Digit8'), '8', 'the keycap still reads 8');
    eq(es.resolve('[').code, 'BracketLeft', 'and the printed key is still taught');
    // A genuine base observation on the same key is still accepted.
    es.observe('Digit8', '8', false);
    eq(es.keyLabel('Digit8'), '8');
  });

  add('storage: v1 observations are filed under the layout they came from', function () {
    var mem = TTm.storage.memoryBackend();
    mem.setItem(TTm.storage.KEY, JSON.stringify({
      version: 1,
      settings: { layoutId: 'uk', observedLayout: { KeyZ: ['z', 'Z'] } }
    }));
    var loaded = TTm.storage.create(mem).load();
    eq(loaded.version, 2);
    deepEq(loaded.settings.observedLayouts, { uk: { KeyZ: ['z', 'Z'] } },
           'filed under uk, where it was actually collected');
    eq(loaded.settings.observedLayout, undefined, 'the flat map is gone');
  });

  add('storage: a v1 blob with no observations migrates to an empty map', function () {
    var mem = TTm.storage.memoryBackend();
    mem.setItem(TTm.storage.KEY, JSON.stringify({ version: 1, settings: {} }));
    var loaded = TTm.storage.create(mem).load();
    deepEq(loaded.settings.observedLayouts, {});
  });

  add('layouts: one layout\'s observations never override another\'s table', function () {
    // The bug this guards: observations were persisted as a single global map
    // and applied over every table, so a US session made AZERTY resolve z to
    // KeyZ — silently defeating the shipped fr table.
    var us = layoutsM.createResolver('us', null);
    us.observe('KeyZ', 'z', false);
    us.observe('KeyW', 'w', false);
    var fromUs = us.learned();

    // What the settings layer now hands each resolver: only its own slot.
    var scoped = { us: fromUs };
    var fr = layoutsM.createResolver('fr', scoped.fr);
    eq(fr.resolve('z').code, 'KeyW', 'AZERTY still says z is on the W position');
    eq(fr.resolve('w').code, 'KeyZ');
    eq(fr.keyLabel('KeyZ'), 'W', 'and the keycap still reads W');

    // The US slot is untouched and still applies to US.
    var usAgain = layoutsM.createResolver('us', scoped.us);
    eq(usAgain.resolve('z').code, 'KeyZ');
  });

  root.TT_CASES = {
    cases: cases,
    assert: { ok: ok, eq: eq, near: near, deepEq: deepEq },
    helpers: { lesson: lesson, type: type, rng: rng, add: add, TTm: TTm }
  };
  if (isNode) module.exports = root.TT_CASES;
})(typeof globalThis !== 'undefined' ? globalThis : this);
