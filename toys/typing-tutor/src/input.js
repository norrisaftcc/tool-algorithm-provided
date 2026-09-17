/* input.js — the only module that touches keyboard events.
 *
 * Characters come from `beforeinput`, never from `keydown`. keydown is
 * structurally the wrong event for text:
 *
 *   - during IME composition it reports keyCode 229 / key "Process";
 *   - a dead key reports key "Dead", and the composed character never appears
 *     as a keydown at all;
 *   - AltGr on Windows arrives as ctrlKey && altKey, so a keydown-based
 *     reader has to reconstruct the layout by hand.
 *
 * beforeinput reports the text the user actually meant to insert, which is the
 * only thing the engine cares about. Because the engine compares characters
 * and never key codes, an AZERTY learner producing { with AltGr+4 is simply
 * correct, with no special case anywhere.
 *
 * The element is a TEXTAREA rather than an <input type="text">: Enter in a
 * single-line input fires no beforeinput at all, so the newline the lessons
 * ask for would never arrive.
 */
(function (root) {
  'use strict';

  /** Split on code points, so a non-BMP character is one keystroke, not two. */
  function codePoints(str) {
    return typeof Array.from === 'function' ? Array.from(str) : String(str).split('');
  }

  function mount(container, store, opts) {
    opts = opts || {};

    var el = document.createElement('textarea');
    el.className = 'tt-hidden-input';
    el.setAttribute('rows', '1');
    el.setAttribute('wrap', 'off');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('aria-label', 'Typing area');
    el.setAttribute('aria-keyshortcuts', 'Escape');
    if (opts.describedBy) el.setAttribute('aria-describedby', opts.describedBy);
    container.appendChild(el);

    var composing = false;
    var pendingRepeat = false;
    var detached = false;

    function now() { return Date.now(); }

    function send(char, repeat) {
      store.dispatch({ type: 'INPUT', char: char, t: now(), repeat: !!repeat });
    }

    function sendAll(text) {
      var chars = codePoints(text);
      for (var i = 0; i < chars.length; i++) {
        // Only the first character of a burst can be an auto-repeat.
        send(chars[i], i === 0 && pendingRepeat);
      }
      pendingRepeat = false;
    }

    /* --- beforeinput: the character source ------------------------------- */

    function onBeforeInput(e) {
      var type = e.inputType;

      switch (type) {
        case 'insertText':
          e.preventDefault();
          if (e.data) sendAll(e.data);
          break;

        case 'insertLineBreak':
        case 'insertParagraph':
          e.preventDefault();
          send('\n', pendingRepeat);
          pendingRepeat = false;
          break;

        case 'deleteContentBackward':
        case 'deleteWordBackward':
        case 'deleteSoftLineBackward':
          e.preventDefault();
          store.dispatch({ type: 'BACKSPACE', t: now() });
          break;

        case 'insertFromPaste':
        case 'insertFromDrop':
        case 'insertFromPasteAsQuotation':
          e.preventDefault();
          store.dispatch({ type: 'PASTE', t: now() });
          break;

        case 'insertReplacementText':
          // The OS autocorrect trying to rewrite what was typed. Not the
          // learner's intent, so it is dropped entirely.
          e.preventDefault();
          break;

        case 'insertCompositionText':
          // Handled once at compositionend. This event is not always
          // cancelable, which is why the value is also cleared there.
          break;

        default:
          if (e.cancelable) e.preventDefault();
          break;
      }
    }

    /* --- composition: dead keys and IMEs --------------------------------- */

    function onCompositionStart() { composing = true; }

    function onCompositionEnd(e) {
      composing = false;
      if (e.data) sendAll(e.data);
      // Whatever the browser managed to insert during a non-cancelable
      // composition goes away here, so the value is always empty.
      el.value = '';
    }

    /* --- keydown: modifiers and shortcuts only, never characters --------- */

    function onKeyDown(e) {
      pendingRepeat = !!e.repeat;
      reportCaps(e);

      // Ctrl/Cmd+Enter restarts. It is the ONLY modified combination this app
      // intercepts; find, reload, zoom, devtools and the rest stay the
      // browser's.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        store.dispatch({ type: 'RESTART', t: now() });
        if (opts.onRestart) opts.onRestart();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        store.dispatch({ type: 'BLUR', t: now() });
        if (opts.onEscape) opts.onEscape();
      }

      // Tab is deliberately untouched. It moves focus out of the typing area
      // exactly as a keyboard user expects, which is the whole reason no
      // lesson line is allowed to contain one.
    }

    function reportCaps(e) {
      if (!e.getModifierState) return;
      var on;
      try { on = e.getModifierState('CapsLock'); } catch (err) { return; }
      if (typeof on !== 'boolean') return;
      var state = store.getState();
      if (state.ui.capsLock !== on) store.dispatch({ type: 'CAPS', on: on, t: now() });
    }

    function onKeyUp(e) { reportCaps(e); }

    /* --- focus: the clock pauses when attention leaves -------------------- */

    function onFocus() { store.dispatch({ type: 'FOCUS', t: now() }); }
    function onBlur() { store.dispatch({ type: 'BLUR', t: now() }); }

    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);

    return {
      el: el,
      focus: function () {
        if (detached) return;
        try { el.focus({ preventScroll: true }); }
        catch (e) { el.focus(); }
      },
      isComposing: function () { return composing; },
      detach: function () {
        if (detached) return;
        detached = true;
        el.removeEventListener('beforeinput', onBeforeInput);
        el.removeEventListener('compositionstart', onCompositionStart);
        el.removeEventListener('compositionend', onCompositionEnd);
        el.removeEventListener('keydown', onKeyDown);
        el.removeEventListener('keyup', onKeyUp);
        el.removeEventListener('focus', onFocus);
        el.removeEventListener('blur', onBlur);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }

  var input = { mount: mount, codePoints: codePoints };

  root.TT = root.TT || {};
  root.TT.input = input;
  if (typeof module !== 'undefined' && module.exports) module.exports = input;
})(typeof globalThis !== 'undefined' ? globalThis : this);
