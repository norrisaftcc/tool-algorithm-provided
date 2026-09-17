/* view.js — screens, routing, and the one place that touches the document.
 *
 * Routing is hash-based. Both file:// and GitHub Pages serve static files with
 * no rewrite rules, so a History API route would 404 the moment anyone
 * refreshed the page.
 *
 * The typing screen builds one span per character of the current line exactly
 * once per line, then mutates classList on individual spans. No innerHTML in
 * the keystroke path.
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

  var M = {};
  ['theme', 'storage', 'layouts', 'engine', 'metrics', 'progress', 'drills',
   'lessons', 'store', 'input', 'keyboard'].forEach(function (n) {
    Object.defineProperty(M, n, { get: function () { return mod(n); } });
  });

  /* --- tiny DOM helpers ---------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function button(label, cls, onClick) {
    var b = el('button', cls || 'btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function tile(label, value, id) {
    var t = el('div', 'tile');
    t.appendChild(el('div', 'tile-label', label));
    var v = el('div', 'tile-value', value);
    if (id) v.id = id;
    t.appendChild(v);
    return t;
  }

  /* --- routing ------------------------------------------------------------- */

  function parseHash() {
    var raw = (root.location.hash || '#/').replace(/^#\/?/, '');
    var parts = raw.split('/').filter(function (p) { return p.length; });
    if (!parts.length) return { name: 'home', params: {} };
    switch (parts[0]) {
      case 'track':
        return { name: 'track', params: { id: decodeURIComponent(parts[1] || '') } };
      case 'lesson':
        return { name: 'lesson', params: { id: decodeURIComponent(parts[1] || '') } };
      case 'drill': return { name: 'drill', params: {} };
      case 'stats': return { name: 'stats', params: {} };
      case 'settings': return { name: 'settings', params: {} };
      default: return { name: 'home', params: {} };
    }
  }

  /* --- the application ----------------------------------------------------- */

  function start(screenEl) {
    var store = M.store.create();
    var live = document.getElementById('live');
    var toastEl = document.getElementById('toast');

    var app = {
      screen: screenEl,
      store: store,
      // Always read through app.resolver, never a captured local: importing or
      // resetting progress replaces it, and a stale capture would keep feeding
      // observations into a resolver nothing renders from any more.
      resolver: M.layouts.createResolver(
        store.getState().settings.layoutId,
        store.getState().settings.observedLayout
      ),
      lessonView: null,
      renderedRoute: null,
      lastToastId: 0,
      toastTimer: null,
      dialog: null,
      lastLaunchEl: null
    };

    /* --- announcements and toasts ---------------------------------------- */

    function announce(message) {
      if (!live) return;
      // Re-setting identical text does not re-announce, so clear first.
      live.textContent = '';
      root.setTimeout(function () { live.textContent = message; }, 30);
    }

    function showToast(message) {
      if (!toastEl) return;
      toastEl.textContent = message;
      toastEl.hidden = false;
      if (app.toastTimer) root.clearTimeout(app.toastTimer);
      app.toastTimer = root.setTimeout(function () { toastEl.hidden = true; }, 4200);
    }

    /**
     * Presentation and the layout resolver both live outside the store — one
     * on the document element, one on `app`. Anything that replaces the whole
     * settings object has to push them both, or the UI reports one thing and
     * behaves as another until a reload.
     */
    function applyPresentation(settings) {
      M.theme.applyTheme(settings.themeId);
      M.theme.applyMotion(settings.reduceMotion);
      M.theme.applyFontScale(settings.fontScale);
    }

    function rebuildResolver(settings) {
      app.resolver = M.layouts.createResolver(
        settings.layoutId, settings.observedLayout
      );
    }

    /* --- layout learning -------------------------------------------------- */

    function persistLayout() {
      store.dispatch({
        type: 'SET_SETTING', key: 'observedLayout', value: app.resolver.learned()
      });
    }

    // Source 1: ask the browser outright.
    var browserMap = M.layouts.readBrowserLayout();
    if (browserMap && typeof browserMap.then === 'function') {
      browserMap.then(function (map) {
        if (app.resolver.adoptLayoutMap(map)) {
          if (app.lessonView) app.lessonView.relabelKeyboard(app.resolver);
          persistLayout();
        }
      }, function () { /* permissions policy said no; observation still works */ });
    }

    // Source 2: watch real keystrokes. Cheap, works everywhere, and by the
    // end of a lesson the keyboard has corrected itself on any layout.
    var observedSinceSave = 0;
    document.addEventListener('keydown', function (e) {
      if (!e.code || !e.key) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (app.resolver.observe(e.code, e.key, e.shiftKey)) {
        observedSinceSave++;
        if (app.lessonView) app.lessonView.relabelKeyboard(app.resolver);
        if (observedSinceSave >= 12) { observedSinceSave = 0; persistLayout(); }
      }
    }, true);

    /* --- notices ---------------------------------------------------------- */

    function noticeBar() {
      var s = store.getState();
      var frag = document.createDocumentFragment();

      if (s.ui.futureProgress) {
        frag.appendChild(el('p', 'notice',
          'Progress saved by a newer version of this tutor was set aside ' +
          'rather than overwritten. You are starting from a clean slate here.'));
      }
      if (s.ui.corruptProgress) {
        frag.appendChild(el('p', 'notice',
          'Stored progress could not be read. The unreadable copy has been ' +
          'kept in case it is worth recovering.'));
      }
      if (s.ui.degraded) {
        var n = el('p', 'notice');
        var rowInner = el('div', 'notice-row');
        rowInner.appendChild(el('span', null,
          'Progress will not be saved in this context — a local file or ' +
          'a private window. Everything else works.'));
        rowInner.appendChild(button('Export instead', 'btn', function () {
          root.location.hash = '#/settings';
        }));
        n.appendChild(rowInner);
        frag.appendChild(n);
      }
      return frag;
    }

    /* --- home ------------------------------------------------------------- */

    function renderHome() {
      var s = store.getState();
      clear(app.screen);
      app.screen.appendChild(el('h1', null, 'Keystroke Compliance Terminal'));
      app.screen.appendChild(el('p', 'lede',
        'Home keys first, then the lines you actually write. Accuracy is the ' +
        'target; speed is what accuracy turns into.'));
      app.screen.appendChild(noticeBar());

      var grid = el('ul', 'grid');
      M.lessons.TRACKS.forEach(function (t) {
        var list = M.lessons.track(t.id);
        if (!list.length) return;
        var sum = M.progress.trackSummary(s.progress, list);
        var next = M.progress.nextLesson(s.progress, list);

        var li = el('li');
        var card = button('', 'card', function () {
          root.location.hash = '#/track/' + t.id;
        });
        card.appendChild(el('div', 'card-title', t.name));
        card.appendChild(el('div', 'card-desc', t.blurb));
        var meta = el('div', 'card-meta');
        meta.appendChild(el('span', null, sum.cleared + ' / ' + sum.total + ' cleared'));
        if (sum.bestWpm > 0) {
          meta.appendChild(el('span', null,
            'best ' + M.metrics.formatWpm(sum.bestWpm) + ' wpm'));
        }
        if (next) meta.appendChild(el('span', 'badge badge-new', 'NEXT: ' + next.title));
        card.appendChild(meta);
        card.setAttribute('aria-label',
          t.name + '. ' + sum.cleared + ' of ' + sum.total + ' lessons cleared.');
        li.appendChild(card);
        grid.appendChild(li);
      });
      app.screen.appendChild(grid);

      var worst = M.drills.worstKeys(s.progress.keyStats);
      if (worst.length) {
        app.screen.appendChild(el('h2', null, 'Targeted practice'));
        var p = el('p', 'lede',
          'Built from the keys you actually miss: ' +
          worst.map(function (w) { return '"' + w.char + '"'; }).join(' ') + '.');
        app.screen.appendChild(p);
        app.screen.appendChild(button('Drill my worst keys', 'btn btn-primary',
          function () { root.location.hash = '#/drill'; }));
      }
    }

    /* --- track listing ---------------------------------------------------- */

    function renderTrack(trackId) {
      var s = store.getState();
      var meta = M.lessons.trackMeta(trackId);
      var list = M.lessons.track(trackId);
      clear(app.screen);

      if (!meta || !list.length) {
        app.screen.appendChild(el('h1', null, 'No such track'));
        app.screen.appendChild(button('Back to tracks', 'btn', function () {
          root.location.hash = '#/';
        }));
        return;
      }

      app.screen.appendChild(el('h1', null, meta.name));
      app.screen.appendChild(el('p', 'lede', meta.blurb));

      var grid = el('ul', 'grid');
      list.forEach(function (lesson, i) {
        var st = M.progress.lessonState(s.progress, lesson, M.lessons);
        var li = el('li');
        var card = el('button', 'card');
        card.type = 'button';

        card.appendChild(el('div', 'card-title', (i + 1) + '. ' + lesson.title));
        if (lesson.newKeys && lesson.newKeys.length && lesson.newKeys.length <= 8) {
          card.appendChild(el('div', 'card-desc', 'New: ' +
            lesson.newKeys.map(function (k) {
              return k === '\n' ? 'Enter' : k === ' ' ? 'Space' : k;
            }).join('  ')));
        } else {
          card.appendChild(el('div', 'card-desc',
            lesson.lines.length + ' lines · target ' + lesson.targetWpm +
            ' wpm at ' + Math.round(lesson.targetAccuracy * 100) + '%'));
        }

        var metaRow = el('div', 'card-meta');
        if (!st.unlocked) {
          metaRow.appendChild(el('span', 'badge badge-locked', 'LOCKED'));
        } else if (st.cleared) {
          metaRow.appendChild(el('span', 'badge badge-cleared',
            st.byOverride ? 'PASSED OVER' : 'CLEARED'));
        }
        if (st.bestWpm > 0) {
          metaRow.appendChild(el('span', null,
            'best ' + M.metrics.formatWpm(st.bestWpm) + ' wpm · ' +
            M.metrics.formatAccuracy(st.bestAccuracy)));
        }
        card.appendChild(metaRow);

        if (!st.unlocked) {
          card.disabled = true;
          card.setAttribute('aria-disabled', 'true');
          // The reason belongs in the accessible name. A padlock glyph on its
          // own tells a screen-reader user nothing at all.
          card.setAttribute('aria-label',
            'Lesson ' + (i + 1) + ': ' + lesson.title + '. ' + st.lockReason);
        } else {
          card.setAttribute('aria-label',
            'Lesson ' + (i + 1) + ': ' + lesson.title +
            (st.cleared ? '. Cleared.' : '.'));
          card.addEventListener('click', function () {
            app.lastLaunchEl = card;
            root.location.hash = '#/lesson/' + encodeURIComponent(lesson.id);
          });
        }

        li.appendChild(card);
        grid.appendChild(li);
      });
      app.screen.appendChild(grid);
      app.screen.appendChild(button('← All tracks', 'btn', function () {
        root.location.hash = '#/';
      }));
    }

    /* --- the typing screen ------------------------------------------------ */

    function buildLessonView(lesson) {
      var view = {};
      var state = store.getState();
      clear(app.screen);

      var head = el('div', 'lesson-head');
      head.appendChild(el('h1', null, lesson.title));
      var backBtn = button('← Back', 'btn', function () {
        root.location.hash = lesson.generated
          ? '#/stats' : '#/track/' + lesson.track;
      });
      head.appendChild(backBtn);
      app.screen.appendChild(head);

      if (lesson.note) app.screen.appendChild(el('p', 'lede', lesson.note));

      var caps = el('div', 'caps-warning');
      caps.hidden = true;
      caps.appendChild(el('span', null, '⚠'));
      caps.appendChild(el('span', null,
        'Caps Lock appears to be on. That is almost certainly not what you want.'));
      app.screen.appendChild(caps);

      var hud = el('div', 'hud');
      hud.appendChild(tile('WPM', '0.0', 'hud-wpm'));
      hud.appendChild(tile('Accuracy', '—', 'hud-acc'));
      hud.appendChild(tile('Line', '1 / ' + lesson.lines.length, 'hud-line'));
      hud.appendChild(tile('Errors', '0', 'hud-err'));
      app.screen.appendChild(hud);

      var chip = el('div', 'next-chip');
      chip.hidden = true;
      app.screen.appendChild(chip);

      var stage = el('div', 'stage');
      var lineEl = el('div', 'line');
      var describedId = 'tt-current-line';
      var ghost = el('div', 'line-ghost');
      stage.appendChild(lineEl);
      stage.appendChild(ghost);
      app.screen.appendChild(stage);

      // The full line text for assistive technology, refreshed only when the
      // line changes — never per keystroke.
      var described = el('div', 'sr-only');
      described.id = describedId;
      app.screen.appendChild(described);

      var handle = M.input.mount(stage, store, {
        describedBy: describedId,
        onEscape: function () {
          if (app.lastLaunchEl && document.contains(app.lastLaunchEl)) {
            app.lastLaunchEl.focus();
          } else {
            backBtn.focus();
          }
          announce('Paused. Click the text or press Enter on Resume to carry on.');
        },
        onRestart: function () { announce('Lesson restarted.'); }
      });

      stage.addEventListener('mousedown', function (e) {
        if (e.target === handle.el) return;
        e.preventDefault();
        handle.focus();
      });

      var kbd = null;
      if (state.settings.showKeyboard) {
        kbd = M.keyboard.mount(app.screen, app.resolver);
      }

      var hint = el('p', 'hint');
      hint.appendChild(document.createTextNode('A wrong key will not go in. '));
      var kEsc = el('kbd', null, 'Esc');
      var kTab = el('kbd', null, 'Tab');
      var kCtrl = el('kbd', null, 'Ctrl');
      var kEnter = el('kbd', null, 'Enter');
      hint.appendChild(kEsc);
      hint.appendChild(document.createTextNode(' pauses and leaves the text. '));
      hint.appendChild(kTab);
      hint.appendChild(document.createTextNode(' moves on normally. '));
      hint.appendChild(kCtrl);
      hint.appendChild(document.createTextNode('+'));
      hint.appendChild(kEnter);
      hint.appendChild(document.createTextNode(' restarts.'));
      app.screen.appendChild(hint);

      var actions = el('div', 'dialog-actions');
      actions.appendChild(button('Restart', 'btn', function () {
        store.dispatch({ type: 'RESTART', t: Date.now() });
        handle.focus();
      }));
      actions.appendChild(button('Skip this line', 'btn', function () {
        store.dispatch({ type: 'SKIP_LINE', t: Date.now() });
        handle.focus();
      }));
      app.screen.appendChild(actions);

      /* --- incremental rendering ----------------------------------------- */

      var charEls = [];
      var renderedLine = -1;
      var errTimer = null;
      var ticker = null;
      var lastErrorSpoken = 0;

      function classFor(index, session) {
        if (index < session.indentEnd) return 'char char-supplied';
        if (index < session.cursor) return 'char char-typed';
        if (index === session.cursor) return 'char char-current';
        return 'char char-pending';
      }

      function decorate(node, ch) {
        if (ch === ' ') node.classList.add('char-space');
        if (ch === '\n') node.classList.add('char-newline');
      }

      function buildLine(session) {
        var target = M.engine.currentTarget(session);
        clear(lineEl);
        charEls = [];
        for (var i = 0; i < target.length; i++) {
          var ch = target.charAt(i);
          var span = el('span', classFor(i, session), ch === '\n' ? '⏎' : ch);
          decorate(span, ch);
          lineEl.appendChild(span);
          charEls.push(span);
        }
        renderedLine = session.lineIndex;

        var next = session.lines[session.lineIndex + 1];
        ghost.textContent = next === undefined
          ? '' : next.replace(/\n$/, '');

        described.textContent = 'Line ' + (session.lineIndex + 1) + ' of ' +
          session.lines.length + ': ' + target.replace(/\n$/, '');
        announce('Line ' + (session.lineIndex + 1) + ' of ' + session.lines.length);
      }

      function paintCursor(session) {
        for (var i = 0; i < charEls.length; i++) {
          var want = classFor(i, session);
          if (charEls[i].className.indexOf('char-err') !== -1) continue;
          if (charEls[i].className !== want) {
            charEls[i].className = want;
            decorate(charEls[i], M.engine.currentTarget(session).charAt(i));
          }
        }
      }

      function flashError(session) {
        var node = charEls[session.cursor];
        if (!node) return;
        node.classList.add('char-err');
        if (errTimer) root.clearTimeout(errTimer);
        errTimer = root.setTimeout(function () {
          node.classList.remove('char-err');
          paintCursor(store.getState().session || session);
        }, 200);
      }

      function describeChar(ch) {
        if (ch === ' ') return 'space';
        if (ch === '\n') return 'Enter';
        if (ch === undefined || ch === '') return 'nothing';
        return ch;
      }

      /**
       * Off by default, and throttled when on. A live region firing on every
       * mistype is unusable with a screen reader, which is why this is opt-in
       * rather than the default behaviour.
       */
      function maybeAnnounceError(s2, e) {
        if (!s2.settings.announceErrors) return;
        if (e.counted === false) return;
        var t = Date.now();
        if (t - lastErrorSpoken < 900) return;
        lastErrorSpoken = t;
        announce('Error. Expected ' + describeChar(e.expected) + '.');
      }

      function updateHud(session) {
        var wpmEl = document.getElementById('hud-wpm');
        var accEl = document.getElementById('hud-acc');
        var lineNo = document.getElementById('hud-line');
        var errEl = document.getElementById('hud-err');
        if (!wpmEl) return;
        var nowT = session.status === 'finished' ? undefined : Date.now();
        wpmEl.textContent = M.metrics.formatWpm(M.metrics.wpm(session, nowT));
        accEl.textContent = M.metrics.formatAccuracy(M.metrics.accuracy(session));
        lineNo.textContent = (session.lineIndex + 1) + ' / ' + session.lines.length;
        errEl.textContent = String(session.errorKeystrokes);
      }

      function updateNextKey(session) {
        if (!kbd) return;
        var ch = M.engine.currentChar(session);
        var res = kbd.setNext(ch);
        if (res.resolved || ch === null) {
          chip.hidden = true;
        } else {
          // Silence beats pointing at the wrong finger.
          chip.hidden = false;
          chip.textContent = 'next: ' + (ch === ' ' ? 'space' : ch) +
            ' — not found on this layout';
        }
      }

      function startTicker() {
        if (ticker) return;
        ticker = root.setInterval(function () {
          var s2 = store.getState();
          if (!s2.session || s2.session.status !== 'running') return;
          updateHud(s2.session);
        }, 250);
      }

      view.update = function (s2, events) {
        var session = s2.session;
        if (!session) return;

        if (session.lineIndex !== renderedLine) buildLine(session);
        else paintCursor(session);

        for (var i = 0; i < events.length; i++) {
          if (events[i].type === 'incorrect') {
            flashError(session);
            maybeAnnounceError(s2, events[i]);
          }
        }

        caps.hidden = !(s2.ui.capsLock || session.capsLockSuspected);
        updateHud(session);
        updateNextKey(session);
        if (session.status === 'running') startTicker();
      };

      view.relabelKeyboard = function (r) { if (kbd) kbd.relabel(r); };

      view.focus = function () { handle.focus(); };

      view.destroy = function () {
        if (ticker) root.clearInterval(ticker);
        if (errTimer) root.clearTimeout(errTimer);
        handle.detach();
        if (kbd) kbd.destroy();
      };

      var initial = store.getState();
      if (initial.session) {
        buildLine(initial.session);
        updateHud(initial.session);
        updateNextKey(initial.session);
      }
      handle.focus();
      return view;
    }

    /* --- results dialog ---------------------------------------------------- */

    function openResult(result) {
      closeResult(true);
      var previouslyFocused = document.activeElement;

      var backdrop = el('div', 'backdrop');
      var dialog = el('div', 'dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'result-title');

      var title = el('h2', null, result.verdict.passed ? 'Lesson cleared' : 'Not yet');
      title.id = 'result-title';
      dialog.appendChild(title);

      var verdict = el('p', 'verdict ' +
        (result.verdict.passed ? 'verdict-pass' : 'verdict-fail'));
      verdict.textContent = result.verdict.passed
        ? 'Both targets met. The next lesson is open.'
        : 'Short of the bar: ' + result.verdict.reasons.join('; ') + '.';
      dialog.appendChild(verdict);

      if (!result.verdict.passed && result.record.clearedByOverride) {
        dialog.appendChild(el('p', 'lede',
          'You have finished this lesson ' + result.record.attempts +
          ' times, so the next one is open anyway. Nobody gets stuck here.'));
      }

      var grid = el('div', 'result-grid');
      grid.appendChild(tile('WPM', M.metrics.formatWpm(result.summary.wpm)));
      grid.appendChild(tile('Accuracy',
        M.metrics.formatAccuracy(result.summary.accuracy)));
      grid.appendChild(tile('Time', M.metrics.formatDuration(result.summary.activeMs)));
      grid.appendChild(tile('Errors', String(result.summary.errorKeystrokes)));
      dialog.appendChild(grid);

      if (result.lesson.mode === 'code') {
        dialog.appendChild(el('p', 'hint',
          'Code speed is not comparable to prose speed. Supplied indentation ' +
          'is excluded, but the symbols are slower than words and always will be.'));
      }

      var actions = el('div', 'dialog-actions');
      var again = button('Try again', 'btn btn-primary', function () {
        closeResult();
        store.dispatch({ type: 'START_LESSON', lessonId: result.lesson.id });
        if (app.lessonView) app.lessonView.focus();
      });
      actions.appendChild(again);

      var nextLesson = M.lessons.all.filter(function (l) {
        return l.prereq === result.lesson.id;
      })[0];
      if (nextLesson && M.progress.isUnlocked(store.getState().progress, nextLesson)) {
        actions.appendChild(button('Next: ' + nextLesson.title, 'btn', function () {
          closeResult();
          root.location.hash = '#/lesson/' + encodeURIComponent(nextLesson.id);
        }));
      }
      actions.appendChild(button('Lesson list', 'btn', function () {
        closeResult();
        root.location.hash = result.lesson.generated
          ? '#/stats' : '#/track/' + result.lesson.track;
      }));
      dialog.appendChild(actions);

      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      function focusables() {
        return Array.prototype.slice.call(
          dialog.querySelectorAll('button, [href], select, textarea, input')
        ).filter(function (n) { return !n.disabled; });
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeResult(); return; }
        if (e.key !== 'Tab') return;
        var list = focusables();
        if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
      backdrop.addEventListener('keydown', onKey);

      app.dialog = {
        backdrop: backdrop,
        restore: previouslyFocused,
        onKey: onKey
      };
      again.focus();
      announce((result.verdict.passed ? 'Lesson cleared. ' : 'Lesson finished. ') +
        M.metrics.formatWpm(result.summary.wpm) + ' words per minute at ' +
        M.metrics.formatAccuracy(result.summary.accuracy) + ' accuracy.');
    }

    function closeResult(silent) {
      if (!app.dialog) return;
      var d = app.dialog;
      app.dialog = null;
      d.backdrop.removeEventListener('keydown', d.onKey);
      if (d.backdrop.parentNode) d.backdrop.parentNode.removeChild(d.backdrop);
      if (!silent) {
        store.dispatch({ type: 'CLOSE_RESULT' });
        if (d.restore && document.contains(d.restore)) d.restore.focus();
      }
    }

    /* --- stats ------------------------------------------------------------- */

    function renderStats() {
      var s = store.getState();
      clear(app.screen);
      app.screen.appendChild(el('h1', null, 'Statistics'));
      app.screen.appendChild(el('p', 'lede',
        'Everything here is computed from your own sessions and stored only ' +
        'on this device.'));

      var hud = el('div', 'hud');
      hud.appendChild(tile('Sessions', String(s.progress.totals.sessions)));
      hud.appendChild(tile('Characters', String(s.progress.totals.charsTyped)));
      hud.appendChild(tile('Time typing',
        M.metrics.formatDuration(s.progress.totals.activeMs)));
      app.screen.appendChild(hud);

      app.screen.appendChild(el('h2', null, 'By track'));
      var table = el('table', 'table');
      var thead = el('thead');
      var hrow = el('tr');
      ['Track', 'Cleared', 'Attempted', 'Best WPM'].forEach(function (h) {
        hrow.appendChild(el('th', null, h));
      });
      thead.appendChild(hrow);
      table.appendChild(thead);
      var tbody = el('tbody');
      M.lessons.TRACKS.forEach(function (t) {
        var list = M.lessons.track(t.id);
        if (!list.length) return;
        var sum = M.progress.trackSummary(s.progress, list);
        var tr = el('tr');
        tr.appendChild(el('td', null, t.name));
        tr.appendChild(el('td', null, sum.cleared + ' / ' + sum.total));
        tr.appendChild(el('td', null, String(sum.attempted)));
        tr.appendChild(el('td', null,
          sum.bestWpm ? M.metrics.formatWpm(sum.bestWpm) : '—'));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      app.screen.appendChild(table);

      app.screen.appendChild(el('h2', null, 'Where the mistakes are'));
      var worst = M.drills.worstKeys(s.progress.keyStats, { limit: 10 });
      if (!worst.length) {
        app.screen.appendChild(el('p', 'lede',
          'Not enough evidence yet. A key needs at least ' +
          M.keyboard.MIN_SAMPLES + ' attempts before its miss rate means ' +
          'anything — a key you have touched twice is unmeasured, not clean.'));
      } else {
        var kt = el('table', 'table');
        var kh = el('tr');
        ['Key', 'Missed', 'Attempts', 'Miss rate'].forEach(function (h) {
          kh.appendChild(el('th', null, h));
        });
        kt.appendChild(kh);
        worst.forEach(function (w) {
          var tr = el('tr');
          tr.appendChild(el('td', null, w.char === ' ' ? 'space' : w.char));
          tr.appendChild(el('td', null, String(w.miss)));
          tr.appendChild(el('td', null, String(w.total)));
          tr.appendChild(el('td', null, Math.round(w.rate * 100) + '%'));
          kt.appendChild(tr);
        });
        app.screen.appendChild(kt);

        app.screen.appendChild(button('Drill my worst keys', 'btn btn-primary',
          function () { root.location.hash = '#/drill'; }));
      }

      var heat = M.keyboard.mount(app.screen, app.resolver);
      heat.setHeat(s.progress.keyStats);
      var legend = el('div', 'legend');
      [['Clean', 'var(--bg-sunken)'], ['Some misses', 'var(--heat-2)'],
       ['Frequent misses', 'var(--heat-5)']].forEach(function (pair) {
        var item = el('span');
        var sw = el('span', 'legend-swatch');
        sw.style.background = pair[1];
        sw.style.border = '1px solid var(--border)';
        item.appendChild(sw);
        item.appendChild(document.createTextNode(pair[0]));
        legend.appendChild(item);
      });
      var hatched = el('span');
      var hsw = el('span', 'legend-swatch key-heat-none');
      hsw.style.border = '1px solid var(--border)';
      hatched.appendChild(hsw);
      hatched.appendChild(document.createTextNode('Too few attempts to judge'));
      legend.appendChild(hatched);
      app.screen.appendChild(legend);
    }

    /* --- settings ---------------------------------------------------------- */

    function settingRow(label, help, control) {
      var row = el('div', 'setting');
      var left = el('div');
      left.appendChild(el('div', 'setting-label', label));
      if (help) left.appendChild(el('div', 'setting-help', help));
      row.appendChild(left);
      row.appendChild(control);
      return row;
    }

    function selectControl(id, options, value, onChange) {
      var sel = el('select');
      sel.id = id;
      options.forEach(function (o) {
        var opt = el('option', null, o.name);
        opt.value = o.id;
        if (o.id === value) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { onChange(sel.value); });
      return sel;
    }

    function toggleControl(id, checked, onChange) {
      var wrap = el('label', 'switch');
      wrap.setAttribute('for', id);
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id;
      box.checked = !!checked;
      box.addEventListener('change', function () { onChange(box.checked); });
      wrap.appendChild(box);
      wrap.appendChild(el('span', null, checked ? 'On' : 'Off'));
      box.addEventListener('change', function () {
        wrap.lastChild.textContent = box.checked ? 'On' : 'Off';
      });
      return wrap;
    }

    function set(key, value) {
      store.dispatch({ type: 'SET_SETTING', key: key, value: value });
    }

    function renderSettings() {
      var s = store.getState();
      clear(app.screen);
      app.screen.appendChild(el('h1', null, 'Settings'));
      app.screen.appendChild(noticeBar());

      app.screen.appendChild(settingRow('Theme', null,
        selectControl('set-theme', M.theme.THEMES, s.settings.themeId, function (v) {
          M.theme.applyTheme(v);
          set('themeId', v);
        })));

      var layoutMeta = M.layouts.layoutMeta(s.settings.layoutId);
      app.screen.appendChild(settingRow('Keyboard layout',
        (layoutMeta && layoutMeta.note) ||
        'Only affects which key the on-screen keyboard points at. What counts ' +
        'as correct is the character, never the key, so any layout works.',
        selectControl('set-layout', M.layouts.LAYOUTS, s.settings.layoutId,
          function (v) {
            set('layoutId', v);
            rebuildResolver(store.getState().settings);
            renderRoute(true);
          })));

      app.screen.appendChild(settingRow('Supply indentation',
        'On: leading whitespace in code lessons is filled in for you, as an ' +
        'editor would, and is excluded from your speed. Off: type every space.',
        toggleControl('set-indent', s.settings.autoIndent, function (v) {
          set('autoIndent', v);
        })));

      app.screen.appendChild(settingRow('Require Enter at line ends',
        'Off skips the Return reach. The first two lessons ignore this either ' +
        'way, since the reach has not been taught yet.',
        toggleControl('set-enter', s.settings.requireEnter, function (v) {
          set('requireEnter', v);
        })));

      app.screen.appendChild(settingRow('Show the on-screen keyboard',
        'Turn it off if it is not helping — the lessons work either way.',
        toggleControl('set-kbd', s.settings.showKeyboard, function (v) {
          set('showKeyboard', v);
        })));

      app.screen.appendChild(settingRow('Announce every error',
        'Off by default. A screen reader firing on every mistype is unusable; ' +
        'turn this on only if you want it.',
        toggleControl('set-announce', s.settings.announceErrors, function (v) {
          set('announceErrors', v);
        })));

      var motionValue = s.settings.reduceMotion === true ? 'off'
        : s.settings.reduceMotion === false ? 'on' : 'os';
      app.screen.appendChild(settingRow('Motion',
        'Your system currently asks for ' +
        (M.theme.osPrefersReducedMotion() ? 'reduced motion' : 'full motion') +
        '. This overrides it in either direction.',
        selectControl('set-motion', [
          { id: 'os', name: 'Follow the system' },
          { id: 'on', name: 'Always animate' },
          { id: 'off', name: 'Never animate' }
        ], motionValue, function (v) {
          var val = v === 'on' ? false : v === 'off' ? true : null;
          M.theme.applyMotion(val);
          set('reduceMotion', val);
        })));

      var scaleRow = el('div', 'dialog-actions');
      scaleRow.appendChild(button('A−', 'btn', function () {
        var v = M.theme.applyFontScale(store.getState().settings.fontScale - 0.1);
        set('fontScale', v);
      }));
      scaleRow.appendChild(button('A+', 'btn', function () {
        var v = M.theme.applyFontScale(store.getState().settings.fontScale + 0.1);
        set('fontScale', v);
      }));
      app.screen.appendChild(settingRow('Text size',
        'The typing line never drops below 20 pixels whatever this says.',
        scaleRow));

      app.screen.appendChild(el('h2', null, 'Your progress'));
      app.screen.appendChild(el('p', 'lede',
        'Copy this out to keep it, or paste a previous copy back in. Plain ' +
        'text, because copy and paste works everywhere — including from a ' +
        'local file, where downloads and storage may not.'));

      var area = el('textarea');
      area.id = 'progress-json';
      area.value = store.persist.exportJSON();
      area.setAttribute('aria-label', 'Progress as JSON');
      app.screen.appendChild(area);

      var ioRow = el('div', 'dialog-actions');
      ioRow.appendChild(button('Import what is in the box', 'btn', function () {
        var res = store.persist.importJSON(area.value);
        if (!res.ok) { showToast(res.error); return; }
        store.dispatch({ type: 'SET_PROGRESS', progress: res.progress });
        applyPresentation(res.progress.settings);
        rebuildResolver(res.progress.settings);
        showToast('Progress imported.');
        renderRoute(true);
      }));
      ioRow.appendChild(button('Reset everything', 'btn', function () {
        if (!root.confirm(
          'Delete all progress, statistics and settings on this device? ' +
          'This cannot be undone.')) return;
        store.dispatch({ type: 'RESET_PROGRESS' });
        // Reset restores default settings, so the theme, motion, text size and
        // layout all have to follow. Without this the screen claims the
        // defaults while still wearing the old ones.
        applyPresentation(store.getState().settings);
        rebuildResolver(store.getState().settings);
        renderRoute(true);
      }));
      app.screen.appendChild(ioRow);
    }

    /* --- drill ------------------------------------------------------------- */

    function renderDrill() {
      var s = store.getState();
      var lesson = M.drills.buildDrillLesson(s.progress.keyStats, { seed: 7 });
      if (!lesson) {
        clear(app.screen);
        app.screen.appendChild(el('h1', null, 'Nothing to drill yet'));
        app.screen.appendChild(el('p', 'lede',
          'Finish a lesson or two first. A key needs at least ' +
          M.keyboard.MIN_SAMPLES + ' attempts before its miss rate is worth ' +
          'acting on.'));
        app.screen.appendChild(button('Back to tracks', 'btn', function () {
          root.location.hash = '#/';
        }));
        return;
      }
      M.lessons.byId[lesson.id] = lesson;
      store.dispatch({ type: 'START_LESSON', lessonId: lesson.id });
      app.lessonView = buildLessonView(lesson);
    }

    /* --- route rendering --------------------------------------------------- */

    function renderRoute(force) {
      var s = store.getState();
      var route = s.route;
      var key = route.name + ':' + (route.params.id || '');
      if (!force && key === app.renderedRoute) return;
      app.renderedRoute = key;

      if (app.lessonView) { app.lessonView.destroy(); app.lessonView = null; }
      closeResult(true);

      Array.prototype.forEach.call(
        document.querySelectorAll('.navlink'), function (a) {
          var target = a.getAttribute('href').replace('#/', '') || 'home';
          var isCurrent = (route.name === 'home' && target === 'home') ||
                          route.name === target;
          if (isCurrent) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        });

      switch (route.name) {
        case 'track': renderTrack(route.params.id); break;
        case 'stats': renderStats(); break;
        case 'settings': renderSettings(); break;
        case 'drill': renderDrill(); break;
        case 'lesson': {
          var lesson = M.lessons.get(route.params.id);
          if (!lesson) { root.location.hash = '#/'; return; }
          store.dispatch({ type: 'START_LESSON', lessonId: lesson.id });
          if (!store.getState().session) { root.location.hash = '#/track/' + lesson.track; return; }
          app.lessonView = buildLessonView(lesson);
          break;
        }
        default: renderHome();
      }
    }

    /* --- wiring ------------------------------------------------------------ */

    store.subscribe(function (s, events) {
      if (s.ui.toastId !== app.lastToastId) {
        app.lastToastId = s.ui.toastId;
        if (s.ui.toast) showToast(s.ui.toast);
      }
      if (s.result && !app.dialog) openResult(s.result);
      if (app.lessonView && s.session) app.lessonView.update(s, events);
    });

    function onHashChange() {
      var route = parseHash();
      store.dispatch({ type: 'NAVIGATE', name: route.name, params: route.params });
      renderRoute();
    }
    root.addEventListener('hashchange', onHashChange);

    // Apply stored presentation settings. The head bootstrap already did this
    // before first paint; doing it again keeps the two from drifting.
    var settings = store.getState().settings;
    M.theme.applyTheme(settings.themeId);
    M.theme.applyMotion(settings.reduceMotion);
    M.theme.applyFontScale(settings.fontScale);

    var problems = M.lessons.validate();
    if (problems.length && root.console) {
      root.console.warn('lesson content problems:\n' + problems.join('\n'));
    }

    onHashChange();
    return app;
  }

  var view = { start: start, parseHash: parseHash };

  root.TT = root.TT || {};
  root.TT.view = view;
  if (typeof module !== 'undefined' && module.exports) module.exports = view;
})(typeof globalThis !== 'undefined' ? globalThis : this);
