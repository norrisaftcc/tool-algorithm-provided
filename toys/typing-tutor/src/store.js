/* store.js — one state object, one dispatch, one notification path.
 *
 * Chosen over an event emitter on purpose. At this size an emitter buys
 * nothing and costs untraceable ordering bugs and duplicate-subscription
 * leaks. A single store also lets the typing engine stay a literal pure
 * reducer — the same function the tests call.
 *
 * Subscribers receive (state, events). The events let the line and keyboard
 * renderers touch individual character elements instead of re-rendering on
 * every keystroke; the state covers everything else.
 */
(function (root) {
  'use strict';

  function mod(name) {
    if (root.TT && root.TT[name]) return root.TT[name];
    if (typeof require === 'function') {
      try { return require('./' + name + '.js'); } catch (e) { return null; }
    }
    return null;
  }

  function create(deps) {
    var engine = (deps && deps.engine) || mod('engine');
    var metrics = (deps && deps.metrics) || mod('metrics');
    var progressApi = (deps && deps.progress) || mod('progress');
    var lessons = (deps && deps.lessons) || mod('lessons');
    var storageApi = (deps && deps.storage) || mod('storage');
    var persist = (deps && deps.persist) || storageApi.instance();
    var now = (deps && deps.now) || function () { return Date.now(); };

    var loaded = persist.load();

    var state = {
      route: { name: 'home', params: {} },
      progress: loaded,
      settings: loaded.settings,
      session: null,
      lesson: null,
      result: null,          // set when a session finishes; drives the dialog
      ui: {
        toast: null,
        toastId: 0,
        capsLock: false,
        degraded: persist.degraded,
        futureProgress: persist.futureDetected,
        corruptProgress: persist.corruptDetected,
        backspaceExplained: false,
        indentExplained: false
      }
    };

    var subscribers = [];
    var pendingEvents = [];
    var scheduled = false;

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      var flush = function () {
        scheduled = false;
        var events = pendingEvents;
        pendingEvents = [];
        subscribers.slice().forEach(function (fn) {
          try { fn(state, events); }
          catch (e) {
            // A broken renderer must not take the typing loop down with it.
            if (root.console) root.console.error('subscriber failed', e);
          }
        });
      };
      // Microtask: a burst of actions renders once, still within the frame.
      if (typeof Promise !== 'undefined') Promise.resolve().then(flush);
      else setTimeout(flush, 0);
    }

    function save() {
      state.progress.settings = state.settings;
      persist.save(state.progress);
      state.ui.degraded = persist.degraded;
    }

    function toast(message) {
      state.ui.toast = message;
      state.ui.toastId++;
    }

    /* --- session lifecycle ------------------------------------------------ */

    function startLesson(lessonId) {
      var lesson = lessons.get(lessonId);
      if (!lesson) { toast('No such lesson.'); return; }
      if (!progressApi.isUnlocked(state.progress, lesson, state.settings)) {
        toast('That lesson is locked. Settings has a switch that opens ' +
              'every lesson at once.');
        return;
      }
      state.lesson = lesson;
      state.session = engine.createSession(lesson, state.settings);
      state.result = null;
      state.ui.capsLock = false;
    }

    function finishSession() {
      if (!state.session || !state.lesson) return;
      var summary = metrics.summarize(state.session);
      var outcome = progressApi.recordResult(
        state.progress, state.lesson, summary, now()
      );
      state.progress = outcome.progress;
      state.settings = state.progress.settings;
      state.result = {
        summary: summary,
        verdict: outcome.verdict,
        record: outcome.record,
        lesson: state.lesson
      };
      save();
    }

    function handleSessionEvents(events) {
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.type === 'session-complete') finishSession();
        else if (e.type === 'paste-blocked') {
          toast('Paste is disabled — that is rather the point.');
        } else if (e.type === 'backspace-ignored' && !state.ui.backspaceExplained) {
          state.ui.backspaceExplained = true;
          toast('Backspace is not needed: a wrong key simply will not go in.');
        } else if (e.type === 'ignored' && e.reason === 'indent-supplied' &&
                   !state.ui.indentExplained) {
          state.ui.indentExplained = true;
          toast('The indentation is already typed for you.');
        }
      }
    }

    var SESSION_ACTIONS = {
      INPUT: 1, BACKSPACE: 1, PASTE: 1, BLUR: 1, FOCUS: 1,
      CAPS: 1, SKIP_LINE: 1, RESTART: 1
    };

    /* --- dispatch ---------------------------------------------------------- */

    function dispatch(action) {
      var events = [];

      if (SESSION_ACTIONS[action.type]) {
        if (!state.session) return;
        if (action.type === 'CAPS') state.ui.capsLock = !!action.on;
        var r = engine.reduce(state.session, action);
        state.session = r.state;
        events = r.events;
        handleSessionEvents(events);
      } else {
        switch (action.type) {
          case 'NAVIGATE':
            state.route = { name: action.name, params: action.params || {} };
            if (action.name !== 'lesson') {
              state.session = null;
              state.lesson = null;
            }
            break;

          case 'START_LESSON':
            startLesson(action.lessonId);
            break;

          case 'CLOSE_RESULT':
            state.result = null;
            break;

          case 'SET_SETTING':
            state.settings = Object.assign({}, state.settings);
            state.settings[action.key] = action.value;
            save();
            break;

          case 'SET_PROGRESS':
            state.progress = action.progress;
            state.settings = action.progress.settings;
            save();
            break;

          case 'RESET_PROGRESS':
            state.progress = persist.reset();
            state.settings = state.progress.settings;
            state.session = null;
            state.lesson = null;
            state.result = null;
            toast('Progress cleared.');
            break;

          case 'TOAST':
            toast(action.message);
            break;

          case 'DISMISS_NOTICE':
            state.ui[action.key] = false;
            break;

          case 'TICK':
            // Nothing to change; the live readout reads the clock itself.
            break;

          default:
            break;
        }
      }

      pendingEvents = pendingEvents.concat(events);
      schedule();
    }

    function subscribe(fn) {
      subscribers.push(fn);
      return function () {
        var i = subscribers.indexOf(fn);
        if (i !== -1) subscribers.splice(i, 1);
      };
    }

    return {
      getState: function () { return state; },
      dispatch: dispatch,
      subscribe: subscribe,
      save: save,
      persist: persist
    };
  }

  var store = { create: create };

  root.TT = root.TT || {};
  root.TT.store = store;
  if (typeof module !== 'undefined' && module.exports) module.exports = store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
