/* progress.js — unlock rules and clear thresholds. Pure.
 *
 * Two numbers gate a lesson: speed and accuracy, both from metrics.js. A
 * lesson is cleared only when both clear their targets on a run with no
 * skipped lines.
 *
 * An escape hatch matters more than a clean rule here. A learner who cannot
 * hit 95% on the pinky lesson must not be walled out of the rest of the
 * course, so a third completed attempt unlocks what follows and is recorded
 * as an override — it never touches the recorded bests, and the lesson list
 * shows the difference.
 *
 * The `unlockAll` setting is the blunter version of the same argument: it
 * suspends the order outright, for a tester who has to reach a late lesson
 * directly and for a learner who already types. It is a gate on what may be
 * STARTED and nothing else. Clearing still means meeting the lesson's own
 * targets, so nothing here writes a record it would not otherwise have
 * written, and switching the setting back off restores the ladder with
 * whatever was genuinely cleared still cleared.
 */
(function (root) {
  'use strict';

  /** Completed attempts after which a lesson unlocks regardless of score. */
  var OVERRIDE_AFTER = 3;

  function emptyRecord() {
    return {
      cleared: false,
      clearedByOverride: false,
      attempts: 0,
      bestWpm: 0,
      bestAccuracy: 0,
      lastWpm: 0,
      lastAt: 0,
      totalMs: 0
    };
  }

  function recordFor(progress, lessonId) {
    var r = progress && progress.lessons ? progress.lessons[lessonId] : null;
    return r || emptyRecord();
  }

  /**
   * Did this run meet the lesson's bar?
   * @returns {{passed: boolean, reasons: string[]}}
   */
  function evaluate(lesson, summary) {
    var reasons = [];
    if (!summary.finished) reasons.push('the lesson was not finished');
    if (summary.skippedLines > 0) {
      reasons.push(summary.skippedLines + ' line(s) were skipped');
    }
    var acc = summary.accuracy;
    if (acc === null || acc < lesson.targetAccuracy) {
      reasons.push('accuracy below ' + Math.round(lesson.targetAccuracy * 100) + '%');
    }
    if (summary.wpm < lesson.targetWpm) {
      reasons.push('speed below ' + lesson.targetWpm + ' wpm');
    }
    return { passed: reasons.length === 0, reasons: reasons };
  }

  /**
   * Fold a finished run into the stored progress. Returns a NEW progress
   * object; the caller persists it.
   */
  function recordResult(progress, lesson, summary, now) {
    var next = Object.assign({}, progress);
    next.lessons = Object.assign({}, progress.lessons);
    next.keyStats = Object.assign({}, progress.keyStats);
    next.confusions = Object.assign({}, progress.confusions);
    next.totals = Object.assign({}, progress.totals);

    var prev = recordFor(progress, lesson.id);
    var verdict = evaluate(lesson, summary);
    var rec = Object.assign({}, prev);

    if (summary.finished) rec.attempts = prev.attempts + 1;
    rec.lastWpm = summary.wpm;
    rec.lastAt = now;
    rec.totalMs = prev.totalMs + summary.activeMs;

    // Bests only move on a clean run. A run with skipped lines is practice,
    // not a score.
    if (summary.finished && summary.skippedLines === 0) {
      if (summary.wpm > rec.bestWpm) rec.bestWpm = summary.wpm;
      if (summary.accuracy !== null && summary.accuracy > rec.bestAccuracy) {
        rec.bestAccuracy = summary.accuracy;
      }
    }

    if (verdict.passed) {
      rec.cleared = true;
    } else if (!rec.cleared && rec.attempts >= OVERRIDE_AFTER) {
      // Nobody gets permanently stuck. This unlocks what follows without
      // pretending the bar was met.
      rec.cleared = true;
      rec.clearedByOverride = true;
    }

    next.lessons[lesson.id] = rec;

    // Per-character tallies, keyed by the character that was wanted.
    Object.keys(summary.perCharHits).forEach(function (ch) {
      var k = next.keyStats[ch] || { hit: 0, miss: 0 };
      next.keyStats[ch] = { hit: k.hit + summary.perCharHits[ch], miss: k.miss };
    });
    Object.keys(summary.perCharErrors).forEach(function (ch) {
      var k = next.keyStats[ch] || { hit: 0, miss: 0 };
      next.keyStats[ch] = { hit: k.hit, miss: k.miss + summary.perCharErrors[ch] };
    });
    Object.keys(summary.confusions).forEach(function (pair) {
      next.confusions[pair] = (next.confusions[pair] || 0) + summary.confusions[pair];
    });

    next.totals.sessions += summary.finished ? 1 : 0;
    next.totals.charsTyped += summary.correctChars;
    next.totals.activeMs += summary.activeMs;

    return { progress: next, verdict: verdict, record: rec };
  }

  function isCleared(progress, lessonId) {
    return recordFor(progress, lessonId).cleared === true;
  }

  /**
   * Is the order suspended? Read from the settings handed in, falling back to
   * the copy the progress blob carries. The store keeps those two in step; the
   * explicit argument is there so a caller can ask what the rule ALONE says,
   * which is what the lesson list needs in order to keep showing it.
   */
  function unlockAllOn(progress, settings) {
    var s = settings || (progress && progress.settings) || null;
    return !!(s && s.unlockAll);
  }

  /** Does the lesson's own prerequisite hold, ignoring any override? */
  function prereqMet(progress, lesson) {
    if (!lesson) return false;
    if (!lesson.prereq) return true;
    return isCleared(progress, lesson.prereq);
  }

  function isUnlocked(progress, lesson, settings) {
    if (!lesson) return false;
    return prereqMet(progress, lesson) || unlockAllOn(progress, settings);
  }

  /**
   * Everything a lesson card needs, including the sentence that explains a
   * lock. A padlock glyph on its own tells a screen-reader user nothing.
   *
   * `gated` is what the ladder says, `unlocked` is what the learner may
   * actually do, and they differ only while the order is suspended. Both are
   * reported so the list can stay legible instead of pretending the
   * prerequisite was never there.
   */
  function lessonState(progress, lesson, lessonsIndex, settings) {
    var rec = recordFor(progress, lesson.id);
    var met = prereqMet(progress, lesson);
    var unlocked = met || unlockAllOn(progress, settings);

    var bar = '';
    if (!met) {
      var pre = lessonsIndex ? lessonsIndex.get(lesson.prereq) : null;
      if (pre) {
        bar = '"' + pre.title + '" at ' +
          Math.round(pre.targetAccuracy * 100) + '% accuracy and ' +
          pre.targetWpm + ' wpm';
      }
    }

    var lockReason = '';
    var bypassReason = '';
    if (!met && !unlocked) {
      lockReason = bar ? 'Locked — clear ' + bar + ' to unlock.' : 'Locked.';
    } else if (!met) {
      bypassReason = bar
        ? 'Opened out of order — the usual way in is to clear ' + bar + '.'
        : 'Opened out of order.';
    }

    return {
      id: lesson.id,
      unlocked: unlocked,
      gated: !met,
      bypassed: !met && unlocked,
      cleared: rec.cleared,
      byOverride: rec.clearedByOverride,
      attempts: rec.attempts,
      bestWpm: rec.bestWpm,
      bestAccuracy: rec.bestAccuracy,
      lockReason: lockReason,
      bypassReason: bypassReason
    };
  }

  /** The first unlocked, uncleared lesson — what the home screen suggests. */
  function nextLesson(progress, lessonList, settings) {
    for (var i = 0; i < lessonList.length; i++) {
      var l = lessonList[i];
      if (isUnlocked(progress, l, settings) && !isCleared(progress, l.id)) return l;
    }
    return null;
  }

  function trackSummary(progress, lessonList) {
    var cleared = 0, best = 0, attempted = 0;
    lessonList.forEach(function (l) {
      var r = recordFor(progress, l.id);
      if (r.cleared) cleared++;
      if (r.attempts > 0) attempted++;
      if (r.bestWpm > best) best = r.bestWpm;
    });
    return {
      total: lessonList.length,
      cleared: cleared,
      attempted: attempted,
      bestWpm: best
    };
  }

  var progressApi = {
    OVERRIDE_AFTER: OVERRIDE_AFTER,
    emptyRecord: emptyRecord,
    recordFor: recordFor,
    evaluate: evaluate,
    recordResult: recordResult,
    isCleared: isCleared,
    prereqMet: prereqMet,
    unlockAllOn: unlockAllOn,
    isUnlocked: isUnlocked,
    lessonState: lessonState,
    nextLesson: nextLesson,
    trackSummary: trackSummary
  };

  root.TT = root.TT || {};
  root.TT.progress = progressApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = progressApi;
})(typeof globalThis !== 'undefined' ? globalThis : this);
