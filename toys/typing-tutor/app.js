/* app.js — bootstrap. Loads last, starts the view, and says so plainly if it
 * cannot. A blank page with an error only in the console helps nobody.
 */
(function (root) {
  'use strict';

  function fail(screen, message) {
    screen.textContent = '';
    var h = document.createElement('h1');
    h.textContent = 'This did not start';
    var p = document.createElement('p');
    p.className = 'notice';
    p.textContent = message;
    screen.appendChild(h);
    screen.appendChild(p);
  }

  function boot() {
    var screen = document.getElementById('screen');
    if (!screen) return;

    if (!root.TT || !root.TT.view) {
      fail(screen, 'A script did not load. If you opened this from a file, ' +
        'check that the src/ folder sits next to index.html.');
      return;
    }

    try {
      root.TT.view.start(screen);
    } catch (e) {
      fail(screen, 'Something went wrong starting up: ' +
        ((e && e.message) || String(e)));
      if (root.console) root.console.error(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
