/* engine.js — the typing session, as a pure reducer.
 *
 * No DOM, no Date.now(). Every timestamp arrives on the action. That is the
 * whole reason this file is testable, and the reason the tests can assert
 * timing behavior without waiting a single millisecond.
 *
 * The error model is block-until-correct: a wrong keystroke never advances the
 * cursor. Everything left of the cursor is therefore verified correct, which
 * gives the invariant the rest of the app leans on:
 *
 *     cursor === indentEnd + lineCorrect
 */
(function (root) {
  'use strict';

  /** Pauses longer than this are deducted; thinking below it is part of typing. */
  var IDLE_MS = 3000;
  /** A wrong key repeated inside this window is one mistake, not many. */
  var REPEAT_MS = 120;
  /** How many times pressing Space over supplied indentation is forgiven. */
  var INDENT_GRACE = 3;
  /** Consecutive case-flipped errors before we suspect Caps Lock. */
  var CAPS_STREAK = 3;

  function leadingWhitespace(str) {
    var i = 0;
    while (i < str.length && (str[i] === ' ' || str[i] === '\t')) i++;
    return i;
  }

  function isLetter(ch) {
    return typeof ch === 'string' && ch.length === 1 &&
           ch.toLowerCase() !== ch.toUpperCase();
  }

  function ev(type, data) {
    var e = { type: type };
    if (data) Object.keys(data).forEach(function (k) { e[k] = data[k]; });
    return e;
  }

  function cloneState(s) {
    var c = Object.assign({}, s);
    c.perCharHits = Object.assign({}, s.perCharHits);
    c.perCharErrors = Object.assign({}, s.perCharErrors);
    c.confusions = Object.assign({}, s.confusions);
    c.lineTimes = s.lineTimes.slice();
    return c;
  }

  /* --- session construction ----------------------------------------------- */

  /**
   * Resolve the two policies that change what has to be typed.
   *
   * A lesson may force auto-indent on (`forceAutoIndent`) for deeply nested
   * material, and may force Enter off (`requireEnter: false`) where the reach
   * has not been taught yet. Otherwise the learner's settings decide.
   */
  function resolvePolicy(lesson, settings) {
    var s = settings || {};
    return {
      autoIndent: lesson.forceAutoIndent === true
        ? true
        : s.autoIndent !== false,
      requireEnter: lesson.requireEnter === false
        ? false
        : s.requireEnter !== false
    };
  }

  /**
   * Move to `idx`, skipping any line that has nothing left to type — an empty
   * line without Enter, or an all-whitespace line under auto-indent. Bounded by
   * the line count so malformed lesson data cannot spin.
   *
   * @returns {boolean} true when the new line has work to do.
   */
  function startLine(s, idx) {
    s.lineIndex = idx;
    var guard = 0;
    while (guard++ <= s.lines.length + 1) {
      var target = s.lines[s.lineIndex];
      if (target === undefined) return false;

      var indent = s.autoIndent ? leadingWhitespace(target) : 0;
      if (indent > target.length) indent = target.length;

      s.indentEnd = indent;
      s.cursor = indent;
      s.autoSuppliedTotal += indent;
      s.lineCorrect = 0;
      s.lineErrors = 0;
      s.indentIgnored = 0;
      s.lineStartedAt = null;

      if (s.cursor < target.length) return true;
      if (s.lineIndex >= s.lines.length - 1) return false;
      s.lineIndex++;
    }
    return false;
  }

  function createSession(lesson, settings) {
    var policy = resolvePolicy(lesson, settings);
    var sourceLines = (lesson.lines || []).slice();

    var s = {
      status: 'idle',
      lessonId: lesson.id,
      track: lesson.track,

      // Policy, kept on the session so RESTART needs no outside state.
      autoIndent: policy.autoIndent,
      requireEnter: policy.requireEnter,
      sourceLines: sourceLines,

      // Targets. Enter is appended here rather than handled as a state, so
      // cursor math, error attribution and heatmap tinting all fall out free.
      lines: sourceLines.map(function (l) {
        return policy.requireEnter ? l + '\n' : l;
      }),

      lineIndex: 0,
      cursor: 0,
      indentEnd: 0,
      lineCorrect: 0,
      lineErrors: 0,
      indentIgnored: 0,
      autoSuppliedTotal: 0,

      correctChars: 0,
      errorKeystrokes: 0,
      skippedLines: 0,
      perCharHits: {},
      perCharErrors: {},
      confusions: {},

      startedAt: null,
      lastInputAt: null,
      endedAt: null,
      idleDeductedMs: 0,
      pausedAt: null,
      lineStartedAt: null,
      lineTimes: [],

      lastMiss: null,
      capsStreak: 0,
      capsLockSuspected: false
    };

    if (!startLine(s, 0)) {
      // A lesson with nothing to type. Degenerate, but not a crash.
      s.status = 'finished';
      s.endedAt = null;
    }
    return s;
  }

  /* --- accessors ----------------------------------------------------------- */

  function currentTarget(s) {
    return s.lines[s.lineIndex] !== undefined ? s.lines[s.lineIndex] : '';
  }

  function currentChar(s) {
    if (s.status === 'finished') return null;
    var t = currentTarget(s);
    return s.cursor < t.length ? t.charAt(s.cursor) : null;
  }

  function isAutoSupplied(s, index) {
    return index < s.indentEnd;
  }

  function totalScorable(s) {
    var n = 0;
    for (var i = 0; i < s.lines.length; i++) {
      var indent = s.autoIndent ? leadingWhitespace(s.lines[i]) : 0;
      n += Math.max(0, s.lines[i].length - indent);
    }
    return n;
  }

  /* --- transitions --------------------------------------------------------- */

  function resumeIfPaused(s, t) {
    if (s.pausedAt !== null) {
      s.idleDeductedMs += Math.max(0, t - s.pausedAt);
      s.pausedAt = null;
      // Restart the idle clock from here, or the same interval is charged
      // twice: once as a pause and once as an idle gap.
      s.lastInputAt = t;
    }
  }

  function finish(s, t, events) {
    s.status = 'finished';
    s.endedAt = t;
    events.push(ev('session-complete'));
  }

  function completeLine(s, t, events) {
    var ms = s.lineStartedAt === null ? 0 : Math.max(0, t - s.lineStartedAt);
    s.lineTimes.push({
      index: s.lineIndex, ms: ms, errors: s.lineErrors, skipped: false
    });
    events.push(ev('line-complete', {
      lineIndex: s.lineIndex, errors: s.lineErrors, ms: ms
    }));

    if (s.lineIndex >= s.lines.length - 1) { finish(s, t, events); return; }
    if (!startLine(s, s.lineIndex + 1)) finish(s, t, events);
  }

  function handleInput(s, action, events) {
    var t = action.t;
    var char = action.char;

    if (s.status === 'finished') {
      events.push(ev('ignored', { reason: 'finished' }));
      return;
    }

    if (s.status === 'idle') {
      // The clock starts on the first accepted keystroke, right or wrong —
      // not on lesson load and not on focus.
      s.status = 'running';
      s.startedAt = t;
      events.push(ev('started'));
    }

    resumeIfPaused(s, t);

    if (s.lastInputAt !== null) {
      var gap = t - s.lastInputAt;
      if (gap > IDLE_MS) s.idleDeductedMs += gap - IDLE_MS;
    }
    s.lastInputAt = t;
    if (s.lineStartedAt === null) s.lineStartedAt = t;

    var target = currentTarget(s);
    var expected = target.charAt(s.cursor);

    // Indentation is supplied, so a learner reaching for it is not wrong —
    // just uninformed. Forgive a few presses, then start comparing again so
    // someone genuinely lost still gets feedback.
    if (s.cursor === s.indentEnd && s.indentEnd > 0 &&
        (char === ' ' || char === '\t') && char !== expected &&
        s.indentIgnored < INDENT_GRACE) {
      s.indentIgnored++;
      events.push(ev('ignored', {
        reason: 'indent-supplied', remaining: INDENT_GRACE - s.indentIgnored
      }));
      return;
    }

    if (char === expected) {
      s.cursor++;
      s.correctChars++;
      s.lineCorrect++;
      s.perCharHits[expected] = (s.perCharHits[expected] || 0) + 1;
      s.lastMiss = null;
      if (isLetter(expected)) {
        s.capsStreak = 0;
        s.capsLockSuspected = false;
      }
      events.push(ev('correct', { char: expected, index: s.cursor - 1 }));

      if (s.cursor >= target.length) completeLine(s, t, events);
      return;
    }

    // Auto-repeat guard. A learner leaning on a key must not rack up forty
    // errors in a second; the UI still flashes, the tally does not move.
    var held = action.repeat === true || (
      s.lastMiss !== null &&
      s.lastMiss.char === char &&
      s.lastMiss.pos === s.cursor &&
      s.lastMiss.line === s.lineIndex &&
      (t - s.lastMiss.t) < REPEAT_MS
    );
    s.lastMiss = { char: char, pos: s.cursor, line: s.lineIndex, t: t };

    if (held) {
      events.push(ev('incorrect', {
        expected: expected, actual: char, counted: false
      }));
      return;
    }

    // The miss is tallied against the character that was WANTED. The
    // pedagogical fact is "you miss semicolons", not "you pressed l".
    s.errorKeystrokes++;
    s.lineErrors++;
    s.perCharErrors[expected] = (s.perCharErrors[expected] || 0) + 1;
    s.confusions[expected + '|' + char] = (s.confusions[expected + '|' + char] || 0) + 1;

    // Caps Lock heuristic, because getModifierState is unreliable on macOS
    // Safari and some X11 setups.
    if (isLetter(expected) && isLetter(char) &&
        char.toLowerCase() === expected.toLowerCase() &&
        char === char.toUpperCase()) {
      s.capsStreak++;
      if (s.capsStreak >= CAPS_STREAK) s.capsLockSuspected = true;
    } else {
      s.capsStreak = 0;
    }

    events.push(ev('incorrect', {
      expected: expected, actual: char, counted: true
    }));
  }

  function reduce(state, action) {
    var events = [];
    var s = cloneState(state);

    switch (action.type) {
      case 'INPUT':
        handleInput(s, action, events);
        break;

      case 'BACKSPACE':
        // Under block-until-correct there is nothing incorrect behind the
        // cursor to erase. Its one effect is to clear the error flash, which
        // is what the learner's hand is actually saying: let me think.
        s.lastMiss = null;
        events.push(ev('backspace-ignored'));
        break;

      case 'PASTE':
        events.push(ev('paste-blocked'));
        break;

      case 'BLUR':
        if (s.status === 'running' && s.pausedAt === null) s.pausedAt = action.t;
        break;

      case 'FOCUS':
        resumeIfPaused(s, action.t);
        break;

      case 'CAPS':
        s.capsLockSuspected = !!action.on;
        if (!action.on) s.capsStreak = 0;
        break;

      case 'SKIP_LINE':
        if (s.status !== 'finished') {
          // Skipping can be clicked while the typing area is blurred, so the
          // pause has to be settled here too. Otherwise finishing on the last
          // line credits the whole absence as time spent typing.
          resumeIfPaused(s, action.t);
          s.skippedLines++;
          s.lineTimes.push({
            index: s.lineIndex, ms: 0, errors: s.lineErrors, skipped: true
          });
          events.push(ev('line-skipped', { lineIndex: s.lineIndex }));
          if (s.lineIndex >= s.lines.length - 1) finish(s, action.t, events);
          else if (!startLine(s, s.lineIndex + 1)) finish(s, action.t, events);
        }
        break;

      case 'RESTART':
        s = createSession(
          { id: s.lessonId, track: s.track, lines: s.sourceLines,
            requireEnter: s.requireEnter, forceAutoIndent: s.autoIndent },
          { autoIndent: s.autoIndent, requireEnter: s.requireEnter }
        );
        events.push(ev('restarted'));
        break;

      default:
        break;
    }

    return { state: s, events: events };
  }

  var engine = {
    IDLE_MS: IDLE_MS,
    REPEAT_MS: REPEAT_MS,
    INDENT_GRACE: INDENT_GRACE,
    CAPS_STREAK: CAPS_STREAK,
    createSession: createSession,
    reduce: reduce,
    currentTarget: currentTarget,
    currentChar: currentChar,
    isAutoSupplied: isAutoSupplied,
    totalScorable: totalScorable,
    leadingWhitespace: leadingWhitespace,
    resolvePolicy: resolvePolicy
  };

  root.TT = root.TT || {};
  root.TT.engine = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
