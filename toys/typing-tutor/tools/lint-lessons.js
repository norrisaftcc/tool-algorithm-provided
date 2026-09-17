/* lint-lessons.js — content invariants for the lesson data.
 *
 *   node toys/typing-tutor/tools/lint-lessons.js
 *
 * Exits non-zero on any violation. The rules exist because each one has a
 * concrete failure mode in the running app:
 *
 *   1. ASCII only          — the engine compares single code points; a curly
 *                            quote pasted from a doc is untypeable on a US
 *                            keyboard and would soft-lock the lesson.
 *   2. No tabs             — Tab is deliberately never intercepted, so that a
 *                            keyboard user is never trapped in the typing
 *                            area. A tab in the content would break that.
 *   3. No real newlines    — Enter is appended by the engine per line. An
 *                            embedded newline would desynchronise the cursor.
 *   4. Length <= 72        — longer lines wrap at the default font size, and a
 *                            wrapped line makes the block cursor hard to find.
 *   5. Indent multiple of 4— auto-indent measures leading whitespace; ragged
 *                            indentation produces nonsense supplied prefixes.
 *   6. Prereq graph sound  — a dangling or cyclic prereq hides a lesson with
 *                            no explanation on screen.
 *   7. Charset cumulative  — a fundamentals lesson must never demand a key it
 *                            has not taught. This is the rule most easily
 *                            broken by editing content by hand.
 */
'use strict';

const path = require('path');
const lessons = require(path.join(__dirname, '..', 'src', 'lessons.js'));

const MAX_LEN = 72;
const problems = [];

function bad(where, msg) { problems.push(where + ': ' + msg); }

/* --- structural checks, shared with the runtime -------------------------- */

lessons.validate().forEach((p) => problems.push(p));

/* --- per-line checks ------------------------------------------------------ */

for (const lesson of lessons.all) {
  const allowed = lessons.cumulativeAllowed(lesson.id);

  lesson.lines.forEach((line, i) => {
    const where = `${lesson.id} line ${i + 1}`;

    for (const ch of line) {
      const code = ch.codePointAt(0);
      if (code < 32 || code > 126) {
        bad(where, `non-ASCII or control character U+${code
          .toString(16).toUpperCase().padStart(4, '0')} (${JSON.stringify(ch)})`);
      }
    }

    if (line.length > MAX_LEN) {
      bad(where, `${line.length} characters, over the ${MAX_LEN} limit`);
    }

    const indent = line.length - line.replace(/^ +/, '').length;
    if (indent % 4 !== 0) {
      bad(where, `indent of ${indent} is not a multiple of 4`);
    }

    if (/ $/.test(line)) {
      bad(where, 'trailing whitespace, which is invisible and untypeable');
    }

    if (allowed) {
      for (const ch of line) {
        if (!allowed[ch]) {
          bad(where, `uses ${JSON.stringify(ch)} before any lesson teaches it`);
        }
      }
    }
  });

  if (lesson.track !== 'fundamentals' && lesson.mode === 'code') {
    // The escaping trap: a C++ line holding a literal "\n" must be authored in
    // the source as '\\n'. If it survived as a real newline, rule 3 catches it;
    // if the backslash was dropped entirely, the line silently teaches the
    // wrong thing, so flag a lone 'n' following a quote-adjacent backslash gap.
    lesson.lines.forEach((line, i) => {
      if (/<<\s*"[^"]*[^\\]n"/.test(line)) {
        bad(`${lesson.id} line ${i + 1}`,
            'looks like a lost backslash before n in a string literal');
      }
    });
  }
}

/* --- report --------------------------------------------------------------- */

const counts = {};
for (const l of lessons.all) counts[l.track] = (counts[l.track] || 0) + 1;

if (problems.length) {
  console.error('lesson content problems:\n');
  problems.forEach((p) => console.error('  ' + p));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}

console.log('lesson content OK');
Object.keys(counts).forEach((t) => {
  const lines = lessons.byTrack[t].reduce((n, l) => n + l.lines.length, 0);
  console.log(`  ${t}: ${counts[t]} lessons, ${lines} lines`);
});
