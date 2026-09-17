/* theme.js — applies presentation settings to the document element.
 *
 * Deliberately knows nothing about persistence. The settings layer owns the
 * stored values and calls in here; that keeps this module trivially correct and
 * lets the pre-paint bootstrap in index.html do the same job without it.
 */
(function (root) {
  'use strict';

  var THEMES = [
    {
      id: 'algocratic',
      name: 'AlgoCratic',
      blurb: 'Green phosphor over near-black. The house palette.'
    },
    {
      id: 'amber',
      name: 'Amber CRT',
      blurb: 'VT220 amber. Monochrome, so errors lean on shape, not hue.'
    },
    {
      id: 'dos',
      name: 'DOS Commander',
      blurb: 'Cyan on blue, the way a 1988 file manager looked.'
    }
  ];

  var DEFAULT_THEME = 'algocratic';
  var MIN_SCALE = 0.85;
  var MAX_SCALE = 1.6;

  function isKnown(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return true;
    }
    return false;
  }

  /** Apply a theme id. Unknown ids fall back rather than leaving a broken page. */
  function applyTheme(id) {
    var chosen = isKnown(id) ? id : DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', chosen);
    return chosen;
  }

  /**
   * reduceMotion: true forces motion off, false forces it on, null follows the
   * OS. The OS preference is the default, not the ceiling — someone who wants
   * the scanline drift back can have it.
   */
  function applyMotion(reduceMotion) {
    var d = document.documentElement;
    if (reduceMotion === true) d.setAttribute('data-motion', 'off');
    else if (reduceMotion === false) d.setAttribute('data-motion', 'on');
    else d.removeAttribute('data-motion');
    return reduceMotion;
  }

  function clampScale(n) {
    var v = Number(n);
    if (!isFinite(v)) return 1;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
  }

  function applyFontScale(n) {
    var v = clampScale(n);
    document.documentElement.style.setProperty('--font-scale', String(v));
    return v;
  }

  /** True when the OS asks for reduced motion. Used only to label the UI. */
  function osPrefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  var theme = {
    THEMES: THEMES,
    DEFAULT_THEME: DEFAULT_THEME,
    MIN_SCALE: MIN_SCALE,
    MAX_SCALE: MAX_SCALE,
    isKnown: isKnown,
    applyTheme: applyTheme,
    applyMotion: applyMotion,
    applyFontScale: applyFontScale,
    clampScale: clampScale,
    osPrefersReducedMotion: osPrefersReducedMotion
  };

  root.TT = root.TT || {};
  root.TT.theme = theme;
  if (typeof module !== 'undefined' && module.exports) module.exports = theme;
})(typeof globalThis !== 'undefined' ? globalThis : this);
