/* app.js — bootstrap.
 *
 * Loads last. Hands off to the view layer once it exists; until then it paints
 * a static specimen of every themed component so the palettes can be judged.
 */
(function (root) {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* --- temporary: component specimen, removed once view.js lands ---------- */

  function specimenLine(screen) {
    var stage = el('div', 'stage');
    var line = el('div', 'line');

    var spec = [
      ['    ', 'char-supplied char-space'],
      ['return', 'char-typed'],
      [' ', 'char-typed char-space'],
      ['a', 'char-current'],
      [' ', 'char-pending char-space'],
      ['+', 'char-err'],
      [' b', 'char-pending']
    ];
    spec.forEach(function (pair) {
      for (var i = 0; i < pair[0].length; i++) {
        var s = el('span', 'char ' + pair[1], pair[0][i]);
        line.appendChild(s);
      }
    });
    line.appendChild(el('span', 'char char-newline', '⏎'));
    stage.appendChild(line);
    stage.appendChild(el('div', 'line-ghost', 'def main() -> int:'));
    screen.appendChild(stage);
  }

  function specimenKeyboard(screen) {
    var fingers = ['pinky', 'ring', 'middle', 'index', 'index',
                   'index', 'index', 'middle', 'ring', 'pinky'];
    var caps = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'];
    var kbd = el('div', 'kbd');
    var rows = el('div', 'kbd-rows');
    var row = el('div', 'kbd-row');
    caps.forEach(function (c, i) {
      var k = el('div', 'key', c);
      k.setAttribute('data-finger', fingers[i]);
      if (c === 'f' || c === 'j') k.classList.add('key-home');
      if (c === 'd') k.classList.add('key-next');
      if (c === ';') k.classList.add('key-heat-5');
      if (c === 'l') k.classList.add('key-heat-3');
      if (c === 'g') k.classList.add('key-heat-none');
      row.appendChild(k);
    });
    rows.appendChild(row);
    kbd.appendChild(rows);
    screen.appendChild(kbd);
  }

  function renderSpecimen(screen) {
    screen.textContent = '';
    screen.appendChild(el('h1', null, 'Component specimen'));
    screen.appendChild(el('p', 'lede',
      'Placeholder until the view layer lands. Every themed component appears ' +
      'once here so the three palettes can be judged side by side.'));

    var themes = el('div', 'dialog-actions');
    TT.theme.THEMES.forEach(function (t) {
      var b = el('button', 'btn', t.name);
      b.type = 'button';
      b.addEventListener('click', function () { TT.theme.applyTheme(t.id); });
      themes.appendChild(b);
    });
    screen.appendChild(themes);

    var notice = el('p', 'notice', 'Progress will not be saved in this context.');
    screen.appendChild(notice);

    var hud = el('div', 'hud');
    [['WPM', '38.4'], ['Accuracy', '96%'], ['Line', '3 / 8'], ['Errors', '5']]
      .forEach(function (pair) {
        var t = el('div', 'tile');
        t.appendChild(el('div', 'tile-label', pair[0]));
        t.appendChild(el('div', 'tile-value', pair[1]));
        hud.appendChild(t);
      });
    screen.appendChild(hud);

    var caps = el('div', 'caps-warning');
    caps.appendChild(el('span', null, '⚠'));
    caps.appendChild(el('span', null, 'Caps Lock is on.'));
    screen.appendChild(caps);

    specimenLine(screen);
    specimenKeyboard(screen);

    var hint = el('p', 'hint');
    hint.innerHTML = '<kbd>Esc</kbd> leaves and pauses. ' +
      '<kbd>Tab</kbd> moves on normally. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> restarts.';
    screen.appendChild(hint);

    var grid = el('ul', 'grid');
    [['Fundamentals', 'Home keys outward.', 'badge-cleared', 'CLEARED'],
     ['Python', 'Ten lessons of real Python.', 'badge-new', 'NEW'],
     ['C++', 'Ten lessons of modern C++.', 'badge-locked', 'LOCKED']]
      .forEach(function (row) {
        var li = el('li');
        var card = el('button', 'card');
        card.type = 'button';
        card.appendChild(el('div', 'card-title', row[0]));
        card.appendChild(el('div', 'card-desc', row[1]));
        var meta = el('div', 'card-meta');
        meta.appendChild(el('span', 'badge ' + row[2], row[3]));
        meta.appendChild(el('span', null, 'best 41 wpm'));
        card.appendChild(meta);
        li.appendChild(card);
        grid.appendChild(li);
      });
    screen.appendChild(grid);
  }

  /* ----------------------------------------------------------------------- */

  function boot() {
    var screen = document.getElementById('screen');
    if (!screen) return;

    if (root.TT && root.TT.view && typeof root.TT.view.start === 'function') {
      root.TT.view.start(screen);
      return;
    }
    renderSpecimen(screen);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
