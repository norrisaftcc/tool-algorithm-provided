/* browser.mjs — the checks Node structurally cannot make.
 *
 *   node toys/typing-tutor/test/browser.mjs
 *
 * Requires Playwright. The unit suite (test/run.node.js) covers the pure
 * modules; this covers the things that only exist in a real browser:
 * beforeinput semantics, focus behaviour, reduced motion, and the promise
 * that the page works when opened from a file:// URL with no server at all.
 *
 * It is deliberately not part of `node --test`: Playwright is not a
 * dependency of this toy, and the toy must keep working without it.
 */
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Playwright is not a dependency of this toy and must not become one. Try a
 * local install, then a global one, and skip rather than fail if neither is
 * present — a contributor without it should still be able to run everything
 * else.
 */
async function loadChromium() {
  for (const spec of ['playwright', 'playwright-core', '@playwright/test']) {
    try { return (await import(spec)).chromium; } catch { /* try the next */ }
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const url = pathToFileURL(path.join(root, 'playwright', 'index.mjs')).href;
    return (await import(url)).chromium;
  } catch { /* fall through to the skip below */ }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.log('skipped: Playwright is not installed.');
  console.log('  npm i -D playwright   (or install it globally)');
  console.log('Everything else still runs:');
  console.log('  node --test toys/typing-tutor/test/run.node.js');
  process.exit(0);
}

const PAGE = pathToFileURL(
  path.join(import.meta.dirname, '..', 'index.html')
).href;

const fails = [];
function check(name, cond, detail) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails.push(name);
}

/** Progress that unlocks the code tracks and gives the heatmap something to show. */
function seed() {
  const ids = ['home-1', 'home-2', 'home-3', 'home-4', 'home-5', 'top-1', 'top-2',
    'top-3', 'top-4', 'top-5', 'top-6', 'bot-1', 'bot-2', 'bot-3', 'bot-4',
    'bot-5', 'bot-6', 'shift-1', 'punct-1', 'num-1', 'sym-1',
    // far enough into C++ to reach an indented lesson
    'cpp-include', 'cpp-main', 'cpp-io'];
  const lessons = {};
  ids.forEach((id) => {
    lessons[id] = {
      cleared: true, clearedByOverride: false, attempts: 2, bestWpm: 34.2,
      bestAccuracy: 0.97, lastWpm: 33, lastAt: 1, totalMs: 60000
    };
  });
  localStorage.setItem('tt:progress', JSON.stringify({
    version: 2, updatedAt: 1, lessons,
    settings: {
      themeId: 'algocratic', layoutId: 'us', autoIndent: true, requireEnter: true,
      reduceMotion: null, fontScale: 1, sound: false, announceErrors: false,
      showKeyboard: true, observedLayouts: {}
    },
    keyStats: { ';': { hit: 120, miss: 41 }, '{': { hit: 60, miss: 17 } },
    confusions: {}, totals: { sessions: 24, charsTyped: 18320, activeMs: 2210000 }
  }));
}

const browser = await chromium.launch();

/* ── it runs from file:// with no server ──────────────────────────────── */
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // Any failed request is now a real defect: the page makes no network calls
  // at all, so nothing is excused here. A reintroduced webfont or CDN would
  // surface as a console error and fail this check, which is the point.
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file://') && !u.startsWith('data:')) {
      errors.push('unexpected network request: ' + u);
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await page.goto(PAGE);
  await page.waitForTimeout(400);

  check('boots from file://', /Keystroke/.test(await page.textContent('#screen h1')));
  check('three tracks listed',
    (await page.$$('#screen .card')).length === 3);

  await page.click('#screen .card');
  await page.waitForTimeout(250);
  check('fundamentals lists every lesson',
    (await page.$$('#screen .card')).length === 22);

  await page.click('#screen .card:not([disabled])');
  await page.waitForTimeout(300);
  check('a lesson opens and takes focus',
    (await page.evaluate(() => document.activeElement.className))
      .includes('tt-hidden-input'));
  check('the home bumps are on F and J',
    (await page.$$eval('.key-home', (ns) => ns.map((n) => n.dataset.code).join(',')))
      === 'KeyF,KeyJ');
  check('the next key is highlighted',
    (await page.$eval('.key-next', (n) => n.dataset.code)) === 'KeyF');

  /* block-until-correct */
  await page.keyboard.press('q');
  await page.waitForTimeout(120);
  check('a wrong key counts once', (await page.textContent('#hud-err')) === '1');
  check('a wrong key does not advance the cursor',
    (await page.$eval('.char-current', (n) => n.textContent)) === 'f');

  /* auto-repeat guard: a held key is one mistake */
  for (let i = 0; i < 25; i++) await page.keyboard.down('q');
  await page.keyboard.up('q');
  await page.waitForTimeout(150);
  const held = parseInt(await page.textContent('#hud-err'), 10);
  check('holding a wrong key does not rack up errors', held <= 3, String(held));

  await page.keyboard.type('fff jjj fff jjj', { delay: 10 });
  await page.waitForTimeout(250);
  check('finishing a line advances', (await page.textContent('#hud-line')) === '2 / 5');

  for (const l of ['fj fj jf jf fj', 'ffj jjf fjf jfj', 'jjj fff jfj fjf',
    'fj jf fj jf fj jf']) {
    await page.keyboard.type(l, { delay: 8 });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  check('the results dialog appears', !!(await page.$('.dialog[role="dialog"]')));
  check('it is modal', (await page.getAttribute('.dialog', 'aria-modal')) === 'true');
  check('focus moves into it',
    (await page.evaluate(() => document.activeElement.textContent)) === 'Try again');
  check('WPM renders as a number',
    /^\d+\.\d$/.test(await page.$eval('.result-grid .tile-value', (n) => n.textContent)));
  check('no unexpected page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* ── auto-supplied indentation ────────────────────────────────────────── */
{
  const page = await browser.newPage();
  await page.addInitScript(seed);
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/lesson/cpp-loops'; });
  await page.waitForTimeout(350);
  await page.keyboard.type('for (int i = 0; i < n; ++i) {\n', { delay: 4 });
  await page.waitForTimeout(200);

  check('the indent of the next line is supplied',
    (await page.$$('.char-supplied')).length === 4);
  check('and the cursor starts past it',
    (await page.evaluate(() => [...document.querySelectorAll('.line .char')]
      .findIndex((s) => s.classList.contains('char-current')))) === 4);
  await page.close();
}

/* ── the error heatmap ────────────────────────────────────────────────── */
{
  const page = await browser.newPage();
  await page.addInitScript(seed);
  await page.goto(PAGE);
  await page.evaluate(() => { location.hash = '#/stats'; });
  await page.waitForTimeout(350);

  const heat = await page.$$eval('.kbd .key', (ns) => Object.fromEntries(
    ns.filter((n) => /key-heat-\d/.test(n.className))
      .map((n) => [n.dataset.code, +n.className.match(/key-heat-(\d)/)[1]])));
  check('the missed key runs hot', heat.Semicolon >= 3, JSON.stringify(heat));
  check('a shifted miss also heats the opposite-hand Shift',
    heat.ShiftLeft > 0, JSON.stringify(heat));
  await page.close();
}

/* ── motion ───────────────────────────────────────────────────────────── */
{
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  const playState = () => page.evaluate(() =>
    getComputedStyle(document.querySelector('.scanlines')).animationPlayState);
  check('the system preference pauses ambient motion', (await playState()) === 'paused');
  await page.evaluate(() => TT.theme.applyMotion(false));
  check('and the learner can override it in either direction',
    (await playState()) === 'running');
  await page.close();
}

/* ── keyboard-only operation and input safety ─────────────────────────── */
{
  const page = await browser.newPage();
  await page.goto(PAGE);
  await page.waitForTimeout(300);

  let reached = false;
  for (let i = 0; i < 25 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = (await page.evaluate(() =>
      (document.activeElement.textContent || '').slice(0, 20))).includes('Fundamentals');
  }
  check('a track card is reachable by Tab alone', reached);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('Enter activates it', (await page.textContent('#screen h1')) === 'Fundamentals');

  const locked = await page.$$eval('#screen .card[disabled]', (ns) => ({
    ariaDisabled: ns[0].getAttribute('aria-disabled'),
    label: ns[0].getAttribute('aria-label')
  }));
  check('locked lessons are aria-disabled', locked.ariaDisabled === 'true');
  check('and the lock explains itself in words',
    /Locked.*clear.*Anchors.*%/.test(locked.label), locked.label);

  await page.evaluate(() => { location.hash = '#/lesson/home-1'; });
  await page.waitForTimeout(350);
  check('the live region announces the line',
    /Line 1 of 5/.test(await page.textContent('#live')));
  check('the whole line is exposed via aria-describedby',
    /Line 1 of 5: fff jjj fff jjj/.test(await page.evaluate(() => {
      const el = document.querySelector('.tt-hidden-input');
      return document.getElementById(el.getAttribute('aria-describedby')).textContent;
    })));
  check('the on-screen keyboard is hidden from assistive tech',
    (await page.getAttribute('.kbd', 'aria-hidden')) === 'true');

  // Tab must never be trapped. This is what the no-tabs content rule buys.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  check('Tab escapes the typing area',
    !(await page.evaluate(() => document.activeElement.className))
      .includes('tt-hidden-input'));

  await page.evaluate(() => {
    window.__prevented = null;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) window.__prevented = e.defaultPrevented;
    });
  });
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(120);
  check('Ctrl+F reaches the browser',
    (await page.evaluate(() => window.__prevented)) === false);

  await page.click('.stage');
  await page.waitForTimeout(100);
  await page.keyboard.type('ff');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('Esc leaves the typing area',
    !(await page.evaluate(() => document.activeElement.className))
      .includes('tt-hidden-input'));

  await page.click('.stage');
  await page.evaluate(() => {
    document.querySelector('.tt-hidden-input').dispatchEvent(new InputEvent('beforeinput', {
      inputType: 'insertFromPaste', data: 'fff jjj', bubbles: true, cancelable: true
    }));
  });
  await page.waitForTimeout(200);
  check('paste is refused and explained', /[Pp]aste/.test(await page.evaluate(() => {
    const t = document.getElementById('toast');
    return t.hidden ? '' : t.textContent;
  })));

  await page.setViewportSize({ width: 375, height: 700 });
  await page.waitForTimeout(200);
  check('no horizontal overflow at phone width',
    (await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await page.close();
}

/* ── starting anywhere ────────────────────────────────────────────────── */
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(300);

  // A clean profile. The last Python lesson is nine lessons and a whole track
  // away from anything this profile may start.
  await page.evaluate(() => { location.hash = '#/lesson/py-idioms'; });
  await page.waitForTimeout(350);
  check('a deep link to a gated lesson falls back to its track',
    (await page.textContent('#screen h1')) === 'Python');
  check('and the refusal says where the switch is',
    /Settings/.test(await page.evaluate(() => {
      const t = document.getElementById('toast');
      return t.hidden ? '' : t.textContent;
    })));

  // That switch is also on this screen, which is where the locks are met.
  const opener = await page.$('#screen .notice button:has-text("Open every lesson")');
  check('the track screen offers it too', !!opener);
  await opener.click();
  await page.waitForTimeout(250);
  check('nothing in the track is left locked',
    (await page.$$('#screen .card[disabled]')).length === 0);
  check('and the list still shows what the order would have been',
    (await page.$$eval('#screen .badge-open', (ns) => ns.length)) ===
    (await page.$$('#screen .card')).length);

  await page.evaluate(() => { location.hash = '#/lesson/py-idioms'; });
  await page.waitForTimeout(350);
  check('the same deep link now opens the lesson',
    (await page.textContent('#screen h1')) === 'Everyday idioms');

  await page.click('.stage');
  await page.keyboard.type('data', { delay: 10 });
  await page.waitForTimeout(200);
  check('and it runs live, like any other lesson',
    (await page.$$('.char-typed')).length === 4);
  check('with no errors of its own', (await page.textContent('#hud-err')) === '0');

  // It is a stored setting, not a state of this screen.
  await page.reload();
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = '#/lesson/cpp-template'; });
  await page.waitForTimeout(350);
  check('it survives a reload, and covers the other track as well',
    (await page.textContent('#screen h1')) === 'Templates and headers');

  // And it goes back. The notice carries the way out from any screen.
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(300);
  const restore = await page.$('#screen .notice button:has-text("Restore the order")');
  check('the home screen says the order is suspended', !!restore);
  await restore.click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { location.hash = '#/track/cpp'; });
  await page.waitForTimeout(300);
  check('and the gate comes back',
    (await page.$$('#screen .card[disabled]')).length === 10);
  check('with no lesson still claiming to be out of order',
    (await page.$$('#screen .badge-open')).length === 0);
  check('no unexpected page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

/* ── a lesson passed out of order stays yours ─────────────────────────── */
{
  const page = await browser.newPage();
  // home-2 cleared while home-1 is not: a state only this feature can produce.
  await page.addInitScript(() => {
    localStorage.setItem('tt:progress', JSON.stringify({
      version: 2, updatedAt: 1,
      lessons: {
        'home-2': {
          cleared: true, clearedByOverride: false, attempts: 1, bestWpm: 41.5,
          bestAccuracy: 1, lastWpm: 41.5, lastAt: 1, totalMs: 60000
        }
      },
      settings: {
        themeId: 'algocratic', layoutId: 'us', autoIndent: true,
        requireEnter: true, reduceMotion: null, fontScale: 1, sound: false,
        announceErrors: false, showKeyboard: true, unlockAll: false,
        observedLayouts: {}
      },
      keyStats: {}, confusions: {},
      totals: { sessions: 1, charsTyped: 80, activeMs: 60000 }
    }));
  });
  await page.goto(PAGE);
  await page.evaluate(() => { location.hash = '#/track/fundamentals'; });
  await page.waitForTimeout(350);

  const card = await page.$$eval('#screen .card', (ns) => ({
    disabled: ns[1].disabled,
    badges: [...ns[1].querySelectorAll('.badge')].map((b) => b.textContent),
    label: ns[1].getAttribute('aria-label')
  }));
  check('a lesson passed out of order is not locked once the order returns',
    card.disabled === false, JSON.stringify(card));
  check('it still reads as cleared',
    card.badges.indexOf('CLEARED') !== -1, JSON.stringify(card.badges));
  check('and still says it was taken out of order',
    card.badges.indexOf('OUT OF ORDER') !== -1, JSON.stringify(card.badges));
  check('nothing tells the learner to clear a lesson they have already passed',
    !/Locked/.test(card.label), card.label);

  const cards = await page.$$('#screen .card');
  await cards[1].click();
  await page.waitForTimeout(350);
  check('and it can be typed again',
    (await page.textContent('#screen h1')) === 'Outward: D K S L');
  await page.close();
}

/* ── the same switch from the Settings screen ─────────────────────────── */
{
  const page = await browser.newPage();
  await page.goto(PAGE);
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(350);

  check('the switch starts off', (await page.isChecked('#set-unlock')) === false);
  await page.click('#set-unlock');
  await page.waitForTimeout(250);
  check('it survives the re-render the notice forces',
    (await page.isChecked('#set-unlock')) === true);
  check('and keeps focus rather than dropping it at the top of the document',
    (await page.evaluate(() => document.activeElement.id)) === 'set-unlock');
  check('the screen says the order is now suspended',
    !!(await page.$('#screen .notice button:has-text("Restore the order")')));
  check('and the setting reached storage, not just the screen',
    (await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tt:progress')).settings.unlockAll)) === true);

  await page.evaluate(() => { location.hash = '#/lesson/cpp-class'; });
  await page.waitForTimeout(350);
  check('a gated lesson opens by this path too',
    (await page.textContent('#screen h1')) === 'Classes');

  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(300);
  check('the switch reads back on', (await page.isChecked('#set-unlock')) === true);
  await page.click('#set-unlock');
  await page.waitForTimeout(250);
  check('and turning it off sticks as well',
    (await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tt:progress')).settings.unlockAll)) === false);
  await page.close();
}

await browser.close();
console.log('\n' + (fails.length ? fails.length + ' FAILURE(S)' : 'all browser checks passed'));
process.exit(fails.length ? 1 : 0);
