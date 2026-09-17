// Parses the theme token blocks out of style.css and checks WCAG contrast for
// every theme at once. Run after touching any token:
//
//   node toys/typing-tutor/tools/check-contrast.js
//
// Exits non-zero on any failing pair, so it drops straight into CI if wanted.
const fs = require('fs');
const path = require('path');
const target = process.argv[2] || path.join(__dirname, '..', 'style.css');
const css = fs.readFileSync(target, 'utf8');

function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Grab each `:root...{ ... }` block and the theme id it carries.
const blocks = [];
const re = /:root([^{]*)\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const sel = m[1];
  const idm = sel.match(/data-theme="([a-z]+)"/);
  if (!idm && !/^,\s*$/.test(sel) && sel.trim() !== '') continue;
  blocks.push({ id: idm ? idm[1] : 'algocratic', body: m[2] });
}

const themes = {};
for (const b of blocks) {
  themes[b.id] = themes[b.id] || {};
  const tre = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let t;
  while ((t = tre.exec(b.body))) themes[b.id][t[1]] = t[2];
}

const PAIRS = [
  ['fg', 'bg', 4.5], ['fg', 'bg-elev', 4.5], ['fg', 'bg-sunken', 4.5], ['fg', 'bg-chrome', 4.5],
  ['fg-dim', 'bg', 4.5], ['fg-dim', 'bg-elev', 4.5], ['fg-dim', 'bg-sunken', 4.5],
  ['fg-faint', 'bg', 4.5], ['fg-faint', 'bg-elev', 4.5], ['fg-faint', 'bg-sunken', 4.5],
  ['accent', 'bg', 4.5], ['accent', 'bg-elev', 4.5], ['accent', 'bg-chrome', 4.5],
  ['accent-ink', 'accent', 4.5],
  ['err', 'bg-sunken', 4.5], ['warn', 'bg-elev', 4.5], ['ok', 'bg-elev', 4.5], ['info', 'bg-elev', 4.5],
  ['fg', 'heat-4', 4.5], ['fg', 'heat-5', 4.5],
  ['fg-dim', 'heat-1', 4.5], ['fg-dim', 'heat-2', 4.5], ['fg-dim', 'heat-3', 4.5],
  ['border-strong', 'bg-elev', 3.0], ['border', 'bg-elev', 1.5],
];

let fails = 0;
for (const [id, t] of Object.entries(themes)) {
  console.log('\n== ' + id + ' ==');
  for (const [fg, bg, min] of PAIRS) {
    // A missing token is a failure, not a curiosity: this is the gate, and a
    // deleted or misspelled variable must not slip through as "all pairs pass".
    if (!t[fg] || !t[bg]) {
      fails++;
      console.log(`  FAIL ${fg.padEnd(13)} on ${bg.padEnd(11)} token missing`);
      continue;
    }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok ' : 'FAIL'} ${fg.padEnd(13)} on ${bg.padEnd(11)} ${r.toFixed(2)} (need ${min})`);
  }
}
console.log('\n' + (fails ? fails + ' FAILING PAIR(S)' : 'all pairs pass'));
process.exit(fails ? 1 : 0);
