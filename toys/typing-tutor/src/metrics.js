/* metrics.js — speed and accuracy, pure.
 *
 *   activeMs = (endedAt ?? now) - startedAt - idleDeductedMs
 *   WPM      = (correctChars / 5) / (activeMs / 60000)
 *   accuracy = correctChars / (correctChars + errorKeystrokes)
 *
 * Errors are not deducted from WPM, and accuracy is reported beside it. The
 * usual gross-versus-net distinction is meaningless under block-until-correct:
 * the finished text is always perfect, so uncorrected errors are always zero
 * and net would equal gross by definition. A mistake already costs you the
 * seconds you spent making it; charging for it twice is double jeopardy.
 *
 * Auto-supplied indentation is excluded from correctChars, so code WPM stays
 * comparable line to line regardless of nesting depth. It is still not
 * comparable to prose WPM, and the UI says so.
 */
(function (root) {
  'use strict';

  var engine = (root.TT && root.TT.engine) ||
    (typeof require === 'function' ? require('./engine.js') : null);

  var IDLE_MS = engine ? engine.IDLE_MS : 3000;

  /**
   * Elapsed time with idle and blur removed.
   *
   * @param {object} s session state
   * @param {number} [nowT] wall clock, for a session still running. Omit for a
   *   finished session; passing it for a running one keeps the live readout
   *   from inflating while the learner stares at the screen.
   */
  function activeMs(s, nowT) {
    if (!s || s.startedAt === null) return 0;

    var running = s.endedAt === null;
    var end = running
      ? (nowT != null ? nowT : (s.lastInputAt != null ? s.lastInputAt : s.startedAt))
      : s.endedAt;

    var deducted = s.idleDeductedMs;

    if (running && nowT != null) {
      if (s.pausedAt !== null) {
        // Blurred right now: the whole open pause comes off.
        deducted += Math.max(0, nowT - s.pausedAt);
      } else if (s.lastInputAt !== null) {
        var gap = nowT - s.lastInputAt;
        if (gap > IDLE_MS) deducted += gap - IDLE_MS;
      }
    }

    return Math.max(0, end - s.startedAt - deducted);
  }

  function wpm(s, nowT) {
    var ms = activeMs(s, nowT);
    if (ms <= 0) return 0;
    return (s.correctChars / 5) / (ms / 60000);
  }

  /** @returns {number|null} null when nothing has been typed — not NaN. */
  function accuracy(s) {
    var total = s.correctChars + s.errorKeystrokes;
    if (total === 0) return null;
    return s.correctChars / total;
  }

  function summarize(s, nowT) {
    var ms = activeMs(s, nowT);
    return {
      lessonId: s.lessonId,
      track: s.track,
      wpm: wpm(s, nowT),
      accuracy: accuracy(s),
      activeMs: ms,
      correctChars: s.correctChars,
      errorKeystrokes: s.errorKeystrokes,
      autoSuppliedChars: s.autoSuppliedTotal,
      skippedLines: s.skippedLines,
      lines: s.lines.length,
      lineTimes: s.lineTimes.slice(),
      perCharHits: Object.assign({}, s.perCharHits),
      perCharErrors: Object.assign({}, s.perCharErrors),
      confusions: Object.assign({}, s.confusions),
      finished: s.status === 'finished'
    };
  }

  /* --- formatting, so every screen renders these the same way ------------- */

  function formatWpm(n) {
    if (!isFinite(n) || n <= 0) return '0.0';
    return n.toFixed(1);
  }

  /** An untyped lesson shows an em dash, never NaN%. */
  function formatAccuracy(a) {
    if (a === null || a === undefined || !isFinite(a)) return '—';
    return Math.round(a * 100) + '%';
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var sec = total % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  var metrics = {
    IDLE_MS: IDLE_MS,
    activeMs: activeMs,
    wpm: wpm,
    accuracy: accuracy,
    summarize: summarize,
    formatWpm: formatWpm,
    formatAccuracy: formatAccuracy,
    formatDuration: formatDuration
  };

  root.TT = root.TT || {};
  root.TT.metrics = metrics;
  if (typeof module !== 'undefined' && module.exports) module.exports = metrics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
