/* lessons.python.js — the Python track.
 *
 * Every line is code someone would actually write: idiomatic Python 3 with
 * f-strings, pathlib and type hints. No invented spacing, no filler. The point
 * is that a learner meets these shapes again in real source and recognises the
 * motor pattern, so anything that is not real code is worse than nothing.
 *
 * Indentation is four spaces throughout, never a tab, which is what lets the
 * app leave the Tab key alone for focus.
 */
(function (root) {
  'use strict';

  function L(spec) {
    return {
      id: spec.id,
      track: 'python',
      order: spec.order,
      title: spec.title,
      prereq: spec.prereq,
      newKeys: spec.newKeys || [],
      targetWpm: spec.targetWpm,
      targetAccuracy: spec.targetAccuracy,
      mode: 'code',
      language: 'python',
      requireEnter: true,
      note: spec.note,
      lines: spec.lines
    };
  }

  var lessons = [
    L({
      id: 'py-imports', order: 1, prereq: 'sym-1',
      title: 'Imports',
      targetWpm: 18, targetAccuracy: 0.95,
      note: 'The first three lines of almost every file you will write. ' +
            'Underscores live on the right pinky, shifted.',
      lines: [
        'import os',
        'import sys',
        'import json',
        'from pathlib import Path',
        'from collections import defaultdict',
        'from dataclasses import dataclass, field'
      ]
    }),

    L({
      id: 'py-def', order: 2, prereq: 'py-imports',
      title: 'Functions and returns',
      targetWpm: 17, targetAccuracy: 0.95,
      note: 'The colon, the newline, the four spaces. The indentation is ' +
            'supplied for you; the shape is what you are learning.',
      lines: [
        'def add(a, b):',
        '    return a + b',
        'def greet(name: str) -> str:',
        '    return "Hello, " + name',
        'def is_even(n: int) -> bool:',
        '    return n % 2 == 0'
      ]
    }),

    L({
      id: 'py-for-in', order: 3, prereq: 'py-def',
      title: 'Loops',
      targetWpm: 17, targetAccuracy: 0.95,
      note: 'Python loops over things, not over indices. Reach for the second ' +
            'form far more often than the first.',
      lines: [
        'for i in range(10):',
        '    print(i)',
        'for key, value in counts.items():',
        '    total += value',
        'for index, item in enumerate(items, start=1):',
        '    print(index, item)'
      ]
    }),

    L({
      id: 'py-comprehension', order: 4, prereq: 'py-for-in',
      title: 'Comprehensions',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'Read them left to right: what comes out, what it loops over, ' +
            'what it keeps. Square brackets are an unshifted right-pinky reach.',
      lines: [
        'squares = [x * x for x in range(10)]',
        'evens = [n for n in nums if n % 2 == 0]',
        'names = [user.name for user in users]',
        'lookup = {item.id: item for item in items}',
        'unique = {word.lower() for word in words}',
        'flat = [value for row in grid for value in row]'
      ]
    }),

    L({
      id: 'py-with-open', order: 5, prereq: 'py-comprehension',
      title: 'Context managers',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'Always name the encoding. The default depends on the machine, ' +
            'which is how text breaks in production and not on your laptop.',
      lines: [
        'with open("data.txt", encoding="utf-8") as f:',
        '    text = f.read()',
        'with open(out_path, "w", encoding="utf-8") as f:',
        '    json.dump(payload, f, indent=2)',
        'with open(path) as f:',
        '    for line in f:'
      ]
    }),

    L({
      id: 'py-fstring', order: 6, prereq: 'py-with-open',
      title: 'Formatted strings',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'Braces inside quotes, and format specifiers after a colon. This ' +
            'is the densest punctuation in everyday Python.',
      lines: [
        'print(f"{name}: {score:.2f}")',
        'print(f"{index:>4}  {label:<20}")',
        'message = f"Found {count} matches in {elapsed:.1f}s"',
        'path = f"{base_dir}/{name}.json"',
        'label = f"{value:,.0f} bytes"',
        'print(f"{total=}")'
      ]
    }),

    L({
      id: 'py-main', order: 7, prereq: 'py-fstring',
      title: 'The entry point',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'Four underscores on each side of name and main. Your right pinky ' +
            'will remember this one whether you want it to or not.',
      lines: [
        'def main() -> int:',
        '    run()',
        '    return 0',
        'if __name__ == "__main__":',
        '    raise SystemExit(main())'
      ]
    }),

    L({
      id: 'py-class', order: 8, prereq: 'py-main',
      title: 'Classes',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'Eight spaces of indentation inside a method body, and the dunder ' +
            'names again. Both are supplied; the reaches are not.',
      lines: [
        'class Point:',
        '    def __init__(self, x: float, y: float) -> None:',
        '        self.x = x',
        '        self.y = y',
        '    def __repr__(self) -> str:',
        '        return f"Point({self.x}, {self.y})"'
      ]
    }),

    L({
      id: 'py-try', order: 9, prereq: 'py-class',
      title: 'Exceptions',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'Catch the exception you expect, name it, and say something useful ' +
            'about it. A bare except is a bug waiting for a quiet afternoon.',
      lines: [
        'try:',
        '    value = int(text)',
        'except ValueError as exc:',
        '    print(f"bad input: {exc}", file=sys.stderr)',
        '    raise',
        'finally:',
        '    handle.close()'
      ]
    }),

    L({
      id: 'py-idioms', order: 10, prereq: 'py-try',
      title: 'Everyday idioms',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'The lines you will type a thousand times: dict literals, ' +
            'generator sums, sort keys, unpacking, and a safe lookup.',
      lines: [
        'data = {"name": "ada", "year": 1843}',
        'total = sum(item.score for item in items)',
        'items.sort(key=lambda item: item.score, reverse=True)',
        'first, *rest = line.split(",")',
        'result = config.get("timeout", 30)',
        'if not items:',
        '    return None'
      ]
    })
  ];

  root.TT = root.TT || {};
  root.TT.lessonsPython = lessons;
  if (typeof module !== 'undefined' && module.exports) module.exports = lessons;
})(typeof globalThis !== 'undefined' ? globalThis : this);
