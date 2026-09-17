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
node --test toys/typing-tutor/test/run.node.js   # the unit suite
node toys/typing-tutor/test/browser.mjs          # browser checks (needs Playwright)
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

All four run in CI on any push or pull request that touches this folder, via
`.github/workflows/typing-tutor.yml`. The first three need no install at all;
the browser checks are a separate job so a failure there reads as "the browser
checks broke" rather than as "the build broke".

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

### Starting anywhere

Each lesson opens when the one before it is cleared, and three finished
attempts on a lesson reached in sequence open the next one regardless of score,
so nobody is walled in by a target they cannot hit.

That ladder is right for a learner and wrong for two other people: someone
reviewing the C++ track, who would otherwise have to clear twenty-one
fundamentals lessons to reach it, and someone who already types and came for
the code lines. **Open every lesson** in Settings suspends the order outright.
It is also offered on any track listing that has a locked lesson on it, which
is where the question actually comes up.

It gates what may be *started* and nothing else. The targets do not move, a
cleared lesson is still one whose targets were met, and switching it back off
restores the ladder with whatever was genuinely cleared still cleared.

Two rules follow from that, and both are stated here because both were bugs
first:

- **A lesson you have cleared is always startable again**, whatever the order
  says. Before the order could be suspended this went without saying — you
  could only clear what you could start, so cleared implied the prerequisite
  held. Without it, a lesson passed out of order comes back `LOCKED` the moment
  the order is restored, unreplayable, and locked against a target the same
  card is reporting a personal best for.
- **The three-attempts escape hatch requires the prerequisite.** It exists for
  a learner stuck *at* a lesson in sequence. A lesson reached by suspending the
  order has no position on the ladder to be stuck at, and without that
  condition three sloppy finishes on `sym-1` would open both code tracks
  permanently, with no fundamentals lesson typed.

The
lesson list keeps saying what the order would have been — an `OUT OF ORDER`
badge, and the prerequisite spelled out in the card's accessible name — so the
progression stays legible while it is bypassed.

Because it is a stored setting rather than a state of one screen, a `#/lesson/`
link to any lesson in any track works once it is on, which is the point for a
tester. A notice on the home screen says the order is suspended, and carries
the way back, so nobody who switched it on months ago concludes the tutor has
no progression at all.

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

Five tables ship. `us` and `uk` were written by hand against physical boards.
`fr` (AZERTY), `de` (QWERTZ) and `es` were not written from memory — that would
mean shipping plausible-looking wrong answers about which finger to use —
but derived mechanically from the X11 xkb data in `/usr/share/X11/xkb/symbols`:
each layout's `include` chain resolved, levels 1, 2 and 3 read off every key,
then everything outside ASCII 32–126 dropped along with every dead key. A dead
key produces no character on its own, so `^` on the German and Spanish tables
is absent rather than guessed at, and resolves to nothing. Anything else still
gets the detecting mode.

Those three need a third level. `[base, shifted]` became `[base, shifted,
altgr]`, which `us` and `uk` simply do not use; AltGr only ever fills gaps, so
a character some key produces plain or shifted is never taught as an AltGr
press. On all three the characters the C++ and Python tracks lean on — `{ } [ ]
\ | @ # ~` — live there, and the keyboard highlights AltRight for them.

Where a layout reaches the same character from two keys, the layout's own xkb
section outranks what it inherits from the shared `latin` base. Spanish is the
case in point: `symbols/es` defines `[ ] { }` itself, on the four keys right of
P and L, which is where a physical Spanish board prints them — while AltGr+7/8/
9/0 reaches the same four characters only because `es` includes `latin(type4)`.
Both are real; the printed one is the one worth teaching. That preference is
declared explicitly in `ES_PREFER` rather than left to the order the table
happens to be written in, and an observation from the learner's real keyboard
still outranks it.

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
- A lesson opened out of order carries the same information the other way:
  *"Opened out of order — the usual way in is to clear …"* The `OUT OF ORDER`
  badge is not the only place that is said.
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

`algocratic` (default) takes its palette from `MODULE1_ORIENTATION.html`, the
style reference in the repository this toy started in. That is provenance
rather than a dependency — the values are copied into `style.css` in full, so
the theme survives either file moving elsewhere. `amber` is a VT220 phosphor, monochrome enough that errors
have to lean on shape rather than hue. `dos` is Norton Commander; its
period-accurate dim cyan lands near the contrast floor, so `--fg-dim` is lifted
and verified rather than left authentic.

There is no webfont request. The stylesheet names JetBrains Mono and Orbitron
so they are used by anyone who has them installed locally, but the fallback
stack behind them is what the design was built and screenshotted against — so
what ships is what was tested, and the "no network call" promise above holds
literally.
