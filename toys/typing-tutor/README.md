# Keystroke Compliance Terminal

A typing tutor in the lineage of GNU Typist and the 1980s Mavis Beacon. It
teaches touch-typing from the home keys outward, and then the motor patterns of
real code — common Python and common C++, as separate tracks.

Prose typing tutors never address the wall programmers actually hit: the
symbol-dense reaches (`{}`, `[]`, `::`, `->`, `<<`, `_`) and the shifted
characters prose barely uses. That gap is the point of this.

## Running it

Open `index.html`. That is the whole procedure — no install, no build, no
server, no network.

If you prefer a server (or want `localStorage` to behave exactly as it will on
a real deployment):

```
python3 -m http.server -d toys/typing-tutor
```

It also serves unchanged from GitHub Pages.

## Testing it

```
node --test toys/typing-tutor/test/run.node.js   # 59 unit cases
node toys/typing-tutor/test/browser.mjs          # 33 browser checks (needs Playwright)
node toys/typing-tutor/tools/lint-lessons.js     # lesson content invariants
node toys/typing-tutor/tools/check-contrast.js   # WCAG contrast, all three themes
```

The unit assertions live in `test/cases.js` as plain data. `run.node.js` wraps
them in `node:test` and `test/test.html` runs the same array in a browser, so
the two cannot drift. `test.html` opens by double-click like everything else.

`browser.mjs` covers what Node structurally cannot: `beforeinput` semantics,
focus behaviour, reduced motion, and the promise that the page works from a
`file://` URL. Playwright is not a dependency — the script skips cleanly if it
is absent.

## Keys

| Key | What it does |
|---|---|
| `Tab` | Leaves the typing area, normally. It is never intercepted. |
| `Esc` | Leaves the typing area **and pauses the clock**. |
| `Ctrl`/`Cmd` + `Enter` | Restarts the lesson. The only modified combination this app intercepts. |
| `Backspace` | Nothing. Under block-until-correct there is nothing wrong behind the cursor to erase. |

Everything else — find, reload, zoom, devtools — belongs to the browser and is
left alone.

## How it works

```
index.html          script order; pre-paint theme bootstrap
style.css           three themes as custom-property sets
app.js              bootstrap
src/
  engine.js         PURE — the session reducer
  metrics.js        PURE — WPM, accuracy, idle-adjusted elapsed
  progress.js       PURE — unlock rules and clear thresholds
  drills.js         PURE — the worst-key drill generator
  layouts.js        char -> key -> finger
  storage.js        persistence that never throws
  store.js          one state object, one dispatch
  theme.js          presentation settings
  input.js          the only module that touches keyboard events
  keyboard.js       the on-screen keyboard
  view.js           screens and the hash router
  lessons.*.js      track content
```

The four pure modules never touch the DOM and never call `Date.now()`: every
timestamp arrives on the action. That is what makes timing behaviour assertable
without waiting a millisecond.

### Classic scripts, not ES modules

`file://` pages get an opaque origin, so every `import` fails there. Requiring
a server would break the double-click promise. Each source file is therefore an
IIFE hanging its exports on a shared `TT` namespace, with a CommonJS tail so
Node can `require()` the pure modules under test. `<script defer>` preserves
document order and works from `file://`.

Routing is hash-based for the same reason: neither `file://` nor GitHub Pages
can rewrite URLs, so a History API route would 404 on refresh.

### Block until correct

A wrong keystroke never advances the cursor. Everything left of the cursor is
therefore verified correct, which gives the invariant the rest of the app leans
on:

```
cursor === indentEnd + lineCorrect
```

A 4000-keystroke seeded fuzz walk asserts it after every action.

A miss is tallied against the character that was **wanted**, never the key that
was pressed — the useful fact is "you miss semicolons," not "you pressed `l`".
A held wrong key collapses into one error; the screen still flashes each time.

### Supplied indentation

Leading whitespace in code lessons is filled in for you, as an editor would,
and excluded from the WPM denominator so code speed stays comparable regardless
of nesting depth. Pressing Space over it is forgiven three times, then compared
normally so someone genuinely lost is not silently swallowed. There is a
setting to turn it off and type every space.

### The speed formula

```
activeMs = (endedAt ?? now) - startedAt - idleDeductedMs
WPM      = (correctChars / 5) / (activeMs / 60000)
accuracy = correctChars / (correctChars + errorKeystrokes)
```

The clock starts on the first keystroke, right or wrong, and stops on the final
keystroke rather than at render. Gaps beyond three seconds are deducted; so is
the whole of any period the window is blurred.

Errors are **not** deducted from WPM. Under block-until-correct the finished
text is always perfect, so uncorrected errors are always zero and net speed
would equal gross by definition — and a mistake already costs you the seconds
you spent making it. Charging twice is double jeopardy.

Code WPM is not comparable to prose WPM, and the app says so rather than
pretending otherwise. Bests are tracked per lesson.

### Keyboard layouts

The engine compares characters and never key codes, so an AZERTY learner
producing `{` with AltGr+4 is simply correct. Only the on-screen keyboard can
be wrong, and a keyboard pointing at the wrong finger is worse than one
pointing at nothing — so an unresolved character highlights nothing and shows a
neutral chip instead.

Three sources of truth, best first: `navigator.keyboard.getLayoutMap()` where
the browser offers it; observation of real keystrokes, which corrects the map
within a lesson on any browser; and a hand-written table.

Only `us` and `uk` ship as tables. Writing AZERTY and QWERTZ from memory would
mean shipping plausible-looking wrong answers about which finger to use, so
those learners get the detecting mode instead.

### Storage

One key, `tt:progress`, and a contract: nothing in `storage.js` throws.

A blob written by a **newer** schema version is never clobbered — it is copied
aside and defaults are used. Unparseable JSON is set aside verbatim rather than
overwritten. Quota errors drop the confusions map and retry once. Every read
and write is individually guarded, because a backend that probes clean at boot
can still fail mid-session.

When persistence is unavailable — a private window, a blocked origin — the app
is fully functional and says so. Settings offers export and import as plain
text you can copy, because copy and paste works everywhere that downloads and
storage may not.

Nothing leaves your device. There is no network call in the running app.

## Adding a lesson

Edit the relevant `src/lessons.*.js`, then run the linter. It enforces seven
invariants, each tied to a concrete failure rather than to taste:

1. **ASCII only.** A curly quote pasted from a document is untypeable on a US
   keyboard and would soft-lock the lesson.
2. **No tabs.** Tab is deliberately never intercepted so keyboard users are
   never trapped in the typing area. A tab in the content would break that.
3. **No embedded newlines.** Enter is appended per line by the engine; an
   embedded newline desynchronises the cursor.
4. **Lines within 72 characters**, so nothing wraps at the default size.
5. **Indentation in multiples of four**, which is what auto-indent measures.
6. **A sound prerequisite graph.** A dangling or cyclic prereq hides a lesson
   with nothing on screen to explain why.
7. **Cumulative charset** in the fundamentals track: a lesson may never demand
   a key it has not taught.

It also watches for the escaping trap. Lesson lines are JavaScript string
literals, so a C++ line containing `"\n"` must be authored as `'\\n'`. Both
failure modes are checked — a real newline that survived, and a lost backslash.

A code line must be code you would actually write. Modern C++ (`nullptr`,
range-for, smart pointers) and Python 3 (f-strings, `pathlib`, type hints). The
learner should meet these lines again in real source and recognise them, which
is the entire reason not to use filler.

## Accessibility

- Tab is never swallowed, so native tab order simply works. This is bought by
  the no-tabs content rule.
- Locked lessons are `disabled` buttons whose accessible name carries the
  reason: *"Locked — clear "Anchors: F and J" at 90% accuracy and 8 wpm to
  unlock."* A padlock glyph alone tells a screen-reader user nothing.
- One polite live region announces line changes, completion and Caps Lock.
  Per-keystroke errors are **not** announced — a region firing on every mistype
  is unusable. There is an opt-in setting for those who want it.
- The on-screen keyboard is `aria-hidden`: it duplicates what the live region
  already carries, and sixty keycaps is noise.
- Error state never relies on colour alone. Green-on-red against a dark
  background is exactly the deuteranopia failure pair, so an error adds a wavy
  underline and an outline as well as a shake.
- `prefers-reduced-motion` is the default, not the ceiling: the settings offer
  system, always, and never.
- Theme tokens define `--fg`, `--fg-dim` and `--fg-faint` as independent
  hand-checked values rather than opacity derivations, because `opacity: 0.5`
  on a passing colour reliably produces a failing one. `check-contrast.js`
  verifies every pair in every theme.

## Themes

`algocratic` (default) inherits the palette from `MODULE1_ORIENTATION.html` at
the repository root. `amber` is a VT220 phosphor, monochrome enough that errors
have to lean on shape rather than hue. `dos` is Norton Commander; its
period-accurate dim cyan lands near the contrast floor, so `--fg-dim` is lifted
and verified rather than left authentic.

The Google Fonts import is an enhancement and never blocks. Offline, the local
monospace stack carries the whole design.
