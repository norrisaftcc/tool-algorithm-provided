/* lessons.js — assembles the tracks, indexes them, and checks their shape.
 *
 * Track data lives in lessons.core.js, lessons.python.js and lessons.cpp.js.
 * This file is the only place that knows they exist together.
 */
(function (root) {
  'use strict';

  function req(name, globalName) {
    if (root.TT && root.TT[globalName]) return root.TT[globalName];
    if (typeof require === 'function') {
      try { return require('./' + name + '.js'); } catch (e) { return []; }
    }
    return [];
  }

  var TRACKS = [
    {
      id: 'fundamentals',
      name: 'Fundamentals',
      blurb: 'Home keys outward, one pair at a time, ending in the symbols ' +
             'that code is built from.',
      order: 1
    },
    {
      id: 'python',
      name: 'Python',
      blurb: 'Lines you would actually write: comprehensions, f-strings, ' +
             'context managers, dunder main.',
      order: 2
    },
    {
      id: 'cpp',
      name: 'C++',
      blurb: 'Modern C++: range-for, auto, smart pointers, the algorithm ' +
             'header, and a great many angle brackets.',
      order: 3
    }
  ];

  var all = []
    .concat(req('lessons.core', 'lessonsCore'))
    .concat(req('lessons.python', 'lessonsPython'))
    .concat(req('lessons.cpp', 'lessonsCpp'));

  var byId = {};
  all.forEach(function (l) { byId[l.id] = l; });

  var byTrack = {};
  TRACKS.forEach(function (t) { byTrack[t.id] = []; });
  all.forEach(function (l) {
    if (!byTrack[l.track]) byTrack[l.track] = [];
    byTrack[l.track].push(l);
  });
  Object.keys(byTrack).forEach(function (id) {
    byTrack[id].sort(function (a, b) { return a.order - b.order; });
  });

  function get(id) { return byId[id] || null; }

  function track(id) { return byTrack[id] ? byTrack[id].slice() : []; }

  function trackMeta(id) {
    for (var i = 0; i < TRACKS.length; i++) {
      if (TRACKS[i].id === id) return TRACKS[i];
    }
    return null;
  }

  /**
   * The characters a fundamentals lesson is allowed to use: everything
   * introduced up to and including it, walking the track in order.
   *
   * @returns {object|null} a set-shaped object, or null for tracks that are
   *   gated behind sym-1 and may therefore use anything.
   */
  function cumulativeAllowed(lessonId) {
    var lesson = byId[lessonId];
    if (!lesson || lesson.track !== 'fundamentals') return null;
    var allowed = Object.create(null);
    var list = byTrack.fundamentals;
    for (var i = 0; i < list.length; i++) {
      (list[i].newKeys || []).forEach(function (k) { allowed[k] = true; });
      if (list[i].id === lessonId) break;
    }
    return allowed;
  }

  /** Every lesson that lists `id` as its prerequisite. */
  function dependents(id) {
    return all.filter(function (l) { return l.prereq === id; });
  }

  /* --- validation ---------------------------------------------------------
   * Returns problems rather than throwing. A content mistake should show up
   * as a loud console warning during development and as a linter failure in
   * tools/lint-lessons.js, not as a blank page for a learner.
   */

  function validate() {
    var problems = [];
    var seen = Object.create(null);

    all.forEach(function (l) {
      if (seen[l.id]) problems.push('duplicate lesson id: ' + l.id);
      seen[l.id] = true;

      if (!Array.isArray(l.lines) || l.lines.length === 0) {
        problems.push(l.id + ': no lines');
      }
      if (l.prereq !== null && !byId[l.prereq]) {
        problems.push(l.id + ': prereq "' + l.prereq + '" does not exist');
      }
      (l.lines || []).forEach(function (line, i) {
        if (line.indexOf('\t') !== -1) {
          problems.push(l.id + ' line ' + (i + 1) + ': contains a tab');
        }
        if (line.indexOf('\n') !== -1) {
          problems.push(l.id + ' line ' + (i + 1) + ': contains a newline');
        }
      });
    });

    // Prerequisite cycles. A learner stuck behind one would simply never see
    // the lesson, with nothing on screen to explain why. Walk each chain to
    // its root, remembering what we passed.
    all.forEach(function (l) {
      var seenHere = Object.create(null);
      var node = l;
      while (node) {
        if (seenHere[node.id]) {
          problems.push('prerequisite cycle through ' + node.id);
          break;
        }
        seenHere[node.id] = true;
        node = node.prereq ? byId[node.prereq] : null;
      }
    });

    return problems;
  }

  var lessons = {
    TRACKS: TRACKS,
    all: all,
    byId: byId,
    byTrack: byTrack,
    get: get,
    track: track,
    trackMeta: trackMeta,
    cumulativeAllowed: cumulativeAllowed,
    dependents: dependents,
    validate: validate
  };

  root.TT = root.TT || {};
  root.TT.lessons = lessons;
  if (typeof module !== 'undefined' && module.exports) module.exports = lessons;
})(typeof globalThis !== 'undefined' ? globalThis : this);
