/* storage.js — persistence, with a hard contract: nothing in here throws.
 *
 * localStorage is not dependable. Chrome hands out an opaque origin for
 * file:// and can throw SecurityError on mere access; Safari's private mode
 * has historically thrown on every write; enterprise policy and extensions
 * block it outright; and quota can be reached mid-session by a store that
 * probed clean at boot. So every read and write is guarded individually, and
 * the app stays fully usable when persistence is gone — only persistence is
 * lost, never function.
 */
(function (root) {
  'use strict';

  var KEY = 'tt:progress';
  var FUTURE_KEY = 'tt:progress.future';
  var CORRUPT_PREFIX = 'tt:progress.corrupt.';
  var CURRENT_VERSION = 1;

  /* --- defaults and shape validation -------------------------------------- */

  function defaultSettings() {
    return {
      themeId: 'algocratic',
      layoutId: 'us',
      autoIndent: true,
      requireEnter: true,
      reduceMotion: null,      // null follows the OS
      fontScale: 1,
      sound: false,
      announceErrors: false,
      showKeyboard: true,
      observedLayout: null     // code -> [base, shifted], learned by watching
    };
  }

  function defaults() {
    return {
      version: CURRENT_VERSION,
      updatedAt: 0,
      settings: defaultSettings(),
      lessons: {},
      keyStats: {},
      confusions: {},
      totals: { sessions: 0, charsTyped: 0, activeMs: 0 }
    };
  }

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function num(v, fallback) {
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : fallback;
  }

  function bool(v, fallback) {
    return typeof v === 'boolean' ? v : fallback;
  }

  function lessonRecord(raw) {
    var r = isObj(raw) ? raw : {};
    return {
      cleared: bool(r.cleared, false),
      clearedByOverride: bool(r.clearedByOverride, false),
      attempts: Math.max(0, Math.floor(num(r.attempts, 0))),
      bestWpm: Math.max(0, num(r.bestWpm, 0)),
      bestAccuracy: Math.min(1, Math.max(0, num(r.bestAccuracy, 0))),
      lastWpm: Math.max(0, num(r.lastWpm, 0)),
      lastAt: Math.max(0, num(r.lastAt, 0)),
      totalMs: Math.max(0, num(r.totalMs, 0))
    };
  }

  /**
   * Rebuild a known-good object field by field. A partially-migrated or
   * hand-edited blob must never be able to produce `undefined.bestWpm` three
   * screens later, so nothing is trusted through by reference.
   */
  function validate(raw) {
    var out = defaults();
    if (!isObj(raw)) return out;

    var s = isObj(raw.settings) ? raw.settings : {};
    var d = out.settings;
    d.themeId = typeof s.themeId === 'string' ? s.themeId : d.themeId;
    d.layoutId = typeof s.layoutId === 'string' ? s.layoutId : d.layoutId;
    d.autoIndent = bool(s.autoIndent, d.autoIndent);
    d.requireEnter = bool(s.requireEnter, d.requireEnter);
    d.reduceMotion = s.reduceMotion === true || s.reduceMotion === false
      ? s.reduceMotion : null;
    d.fontScale = num(s.fontScale, d.fontScale);
    d.sound = bool(s.sound, d.sound);
    d.announceErrors = bool(s.announceErrors, d.announceErrors);
    d.showKeyboard = bool(s.showKeyboard, d.showKeyboard);
    d.observedLayout = isObj(s.observedLayout) ? s.observedLayout : null;

    if (isObj(raw.lessons)) {
      Object.keys(raw.lessons).forEach(function (id) {
        out.lessons[id] = lessonRecord(raw.lessons[id]);
      });
    }

    if (isObj(raw.keyStats)) {
      Object.keys(raw.keyStats).forEach(function (ch) {
        var k = raw.keyStats[ch];
        if (!isObj(k)) return;
        out.keyStats[ch] = {
          hit: Math.max(0, Math.floor(num(k.hit, 0))),
          miss: Math.max(0, Math.floor(num(k.miss, 0)))
        };
      });
    }

    if (isObj(raw.confusions)) {
      Object.keys(raw.confusions).forEach(function (pair) {
        var n = Math.floor(num(raw.confusions[pair], 0));
        if (n > 0) out.confusions[pair] = n;
      });
    }

    if (isObj(raw.totals)) {
      out.totals.sessions = Math.max(0, Math.floor(num(raw.totals.sessions, 0)));
      out.totals.charsTyped = Math.max(0, Math.floor(num(raw.totals.charsTyped, 0)));
      out.totals.activeMs = Math.max(0, num(raw.totals.activeMs, 0));
    }

    out.updatedAt = Math.max(0, num(raw.updatedAt, 0));
    out.version = CURRENT_VERSION;
    return out;
  }

  /* --- migrations ---------------------------------------------------------
   * Keyed by the version being migrated FROM. Each is a pure (obj) => obj.
   * Adding a schema version is a one-entry change plus a bump of
   * CURRENT_VERSION; the chain runs in sequence from wherever the blob sits.
   */

  var MIGRATIONS = {
    // v0 (pre-release) stored lessons as a flat id -> bestWpm map.
    0: function (obj) {
      var lessons = {};
      if (isObj(obj.lessons)) {
        Object.keys(obj.lessons).forEach(function (id) {
          var v = obj.lessons[id];
          lessons[id] = typeof v === 'number'
            ? { cleared: false, attempts: 1, bestWpm: v, bestAccuracy: 0 }
            : v;
        });
      }
      obj.lessons = lessons;
      obj.version = 1;
      return obj;
    }
  };

  function migrate(obj) {
    var guard = 0;
    while (obj.version < CURRENT_VERSION && guard++ < 50) {
      var step = MIGRATIONS[obj.version];
      if (!step) { obj.version = CURRENT_VERSION; break; }
      obj = step(obj);
    }
    return obj;
  }

  /* --- backends ------------------------------------------------------------ */

  function memoryBackend() {
    var m = Object.create(null);
    return {
      name: 'memory',
      getItem: function (k) { return k in m ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      keys: function () { return Object.keys(m); }
    };
  }

  /**
   * Probe rather than feature-detect: the presence of window.localStorage says
   * nothing about whether touching it will throw.
   */
  function probeLocalStorage() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var probe = 'tt:probe';
      ls.setItem(probe, '1');
      if (ls.getItem(probe) !== '1') return null;
      ls.removeItem(probe);
      return {
        name: 'localStorage',
        getItem: function (k) { return ls.getItem(k); },
        setItem: function (k, v) { ls.setItem(k, v); },
        removeItem: function (k) { ls.removeItem(k); }
      };
    } catch (e) {
      return null;
    }
  }

  function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError' ||
           e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
           e.code === 22 || e.code === 1014;
  }

  /* --- the store ----------------------------------------------------------- */

  /**
   * @param {object|null} backend injectable {getItem,setItem,removeItem}.
   *   Omit for the real thing; tests pass a throwing or counting stub.
   */
  function create(backend) {
    var real = backend || probeLocalStorage();
    var store = {
      backend: real || memoryBackend(),
      available: !!real,
      degraded: !real,
      futureDetected: false,
      corruptDetected: false
    };

    function safeGet(k) {
      try { return store.backend.getItem(k); } catch (e) { return null; }
    }

    function safeSet(k, v) {
      try { store.backend.setItem(k, v); return true; } catch (e) { return e; }
    }

    function degrade() {
      if (store.backend.name !== 'memory') store.backend = memoryBackend();
      store.degraded = true;
    }

    store.load = function () {
      var raw = safeGet(KEY);
      if (raw === null || raw === undefined) return defaults();

      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        // Keep the unreadable blob rather than destroying it; someone may want
        // to pick it apart later. Best effort, and failure here is fine.
        store.corruptDetected = true;
        safeSet(CORRUPT_PREFIX + Date.now(), raw);
        return defaults();
      }

      if (!isObj(parsed) || typeof parsed.version !== 'number') return defaults();

      if (parsed.version > CURRENT_VERSION) {
        // A newer deploy wrote this. Silently clobbering it is the one
        // unforgivable bug in this file, so set it aside and start clean.
        store.futureDetected = true;
        safeSet(FUTURE_KEY, raw);
        return defaults();
      }

      return validate(migrate(parsed));
    };

    store.save = function (progress) {
      var clean = validate(progress);
      clean.updatedAt = Date.now();

      var err = safeSet(KEY, JSON.stringify(clean));
      if (err === true) return true;

      if (isQuotaError(err)) {
        // Confusions are the biggest field and the least load-bearing.
        var trimmed = validate(clean);
        trimmed.confusions = {};
        trimmed.updatedAt = clean.updatedAt;
        if (safeSet(KEY, JSON.stringify(trimmed)) === true) return true;
      }

      degrade();
      return false;
    };

    store.exportJSON = function () {
      try {
        return JSON.stringify(store.load(), null, 2);
      } catch (e) {
        return JSON.stringify(defaults(), null, 2);
      }
    };

    store.importJSON = function (text) {
      var parsed;
      try {
        parsed = JSON.parse(String(text));
      } catch (e) {
        return { ok: false, error: 'That is not valid JSON.' };
      }
      if (!isObj(parsed)) {
        return { ok: false, error: 'Expected a JSON object.' };
      }
      if (typeof parsed.version === 'number' && parsed.version > CURRENT_VERSION) {
        return { ok: false, error: 'That progress came from a newer version.' };
      }
      if (typeof parsed.version !== 'number') parsed.version = 0;
      var clean = validate(migrate(parsed));
      var saved = store.save(clean);
      return { ok: true, progress: clean, persisted: saved };
    };

    store.reset = function () {
      try { store.backend.removeItem(KEY); } catch (e) { /* nothing to do */ }
      return defaults();
    };

    return store;
  }

  var singleton = null;

  var storage = {
    KEY: KEY,
    FUTURE_KEY: FUTURE_KEY,
    CURRENT_VERSION: CURRENT_VERSION,
    defaults: defaults,
    defaultSettings: defaultSettings,
    validate: validate,
    migrate: migrate,
    create: create,
    memoryBackend: memoryBackend,
    isQuotaError: isQuotaError,
    /** Lazily created store over the real backend. */
    instance: function () {
      if (!singleton) singleton = create(null);
      return singleton;
    }
  };

  root.TT = root.TT || {};
  root.TT.storage = storage;
  if (typeof module !== 'undefined' && module.exports) module.exports = storage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
