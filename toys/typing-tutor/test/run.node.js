/* run.node.js — wraps test/cases.js in node:test.
 *
 *   node --test toys/typing-tutor/test/run.node.js
 *
 * Name the file, not the directory: `node --test <dir>` tries to load the
 * directory itself, and its default globbing would also pick up cases.js,
 * which declares no tests of its own.
 *
 * The browser runner (test.html) consumes the same cases array.
 */
const { test } = require('node:test');
const { cases } = require('./cases.js');

if (!cases.length) throw new Error('no cases loaded');

for (const c of cases) {
  test(c.name, () => { c.fn(); });
}
