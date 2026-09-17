/* lessons.core.js — the fundamentals track.
 *
 * Ordering follows the shape GNU Typist and the old Mavis Beacon courses use:
 * anchor the index fingers first, then introduce keys in pairs — one per hand
 * where the geometry allows — and consolidate with real words every few
 * lessons. Every line draws only on keys already introduced, which
 * tools/lint-lessons.js enforces rather than trusting.
 *
 * Space arrives in lesson one. It is the thumb, it is unmissable, and without
 * it there is nothing to separate a drill into. Enter arrives in lesson four,
 * once there is a reason to end a line.
 */
(function (root) {
  'use strict';

  function L(spec) {
    return {
      id: spec.id,
      track: 'fundamentals',
      order: spec.order,
      title: spec.title,
      prereq: spec.prereq,
      newKeys: spec.newKeys || [],
      targetWpm: spec.targetWpm,
      targetAccuracy: spec.targetAccuracy,
      mode: 'prose',
      language: null,
      requireEnter: spec.requireEnter,
      note: spec.note,
      lines: spec.lines
    };
  }

  var lessons = [
    L({
      id: 'home-1', order: 1, prereq: null,
      title: 'Anchors: F and J',
      newKeys: ['f', 'j', ' '],
      targetWpm: 8, targetAccuracy: 0.9,
      requireEnter: false,
      note: 'Find the two bumps. Left index on F, right index on J. Both ' +
            'thumbs rest on the space bar. Do not look down — the bumps are ' +
            'there so you never have to.',
      lines: [
        'fff jjj fff jjj',
        'fj fj jf jf fj',
        'ffj jjf fjf jfj',
        'jjj fff jfj fjf',
        'fj jf fj jf fj jf'
      ]
    }),

    L({
      id: 'home-2', order: 2, prereq: 'home-1',
      title: 'Outward: D K S L',
      newKeys: ['d', 'k', 's', 'l'],
      targetWpm: 10, targetAccuracy: 0.9,
      requireEnter: false,
      note: 'Middle fingers take D and K, ring fingers take S and L. Each ' +
            'finger returns to its own home key after every stroke.',
      lines: [
        'ddd kkk sss lll',
        'dk sl dk sl dk',
        'dsk lkd sdl kls',
        'sdf klj sdf klj',
        'lksd jfds klsd'
      ]
    }),

    L({
      id: 'home-3', order: 3, prereq: 'home-2',
      title: 'The full home row: A and semicolon',
      newKeys: ['a', ';'],
      targetWpm: 12, targetAccuracy: 0.92,
      requireEnter: false,
      note: 'The pinkies come last because they are the weakest. A on the ' +
            'left, semicolon on the right. Now all eight fingers have a home.',
      lines: [
        'aaa ;;; aaa ;;;',
        'a; ;a a; ;a a;',
        'asdf jkl; asdf jkl;',
        'sad lads ask dads',
        'a flask; all salads;'
      ]
    }),

    L({
      id: 'home-4', order: 4, prereq: 'home-3',
      title: 'The inward reach: G and H',
      newKeys: ['g', 'h', '\n'],
      targetWpm: 13, targetAccuracy: 0.92,
      requireEnter: true,
      note: 'The index fingers stretch inward for G and H, then come straight ' +
            'back. Enter joins here too: right pinky reaches over, and returns.',
      lines: [
        'ggg hhh ggg hhh',
        'gh hg gh hg gh',
        'gash hash slag flag',
        'a glad lad had half',
        'dash; gall; shall;'
      ]
    }),

    L({
      id: 'home-5', order: 5, prereq: 'home-4',
      title: 'Home row consolidation',
      newKeys: [],
      targetWpm: 16, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'Real words, no new keys. Aim for an even rhythm rather than ' +
            'bursts of speed.',
      lines: [
        'dad has a glass flask',
        'all gals shall dash',
        'a sad lad had a salad',
        'ask dad; add a flag',
        'half a hall; a glad gash'
      ]
    }),

    L({
      id: 'top-1', order: 6, prereq: 'home-5',
      title: 'Top row: E and I',
      newKeys: ['e', 'i'],
      targetWpm: 17, targetAccuracy: 0.93,
      requireEnter: true,
      note: 'The two most common vowels first. Middle fingers reach up, then ' +
            'straight back to D and K.',
      lines: [
        'eee iii eee iii',
        'ei ie ei ie ei',
        'die lie his kid said',
        'she had a file',
        'she likes his ideas'
      ]
    }),

    L({
      id: 'top-2', order: 7, prereq: 'top-1',
      title: 'Top row: R and U',
      newKeys: ['r', 'u'],
      targetWpm: 18, targetAccuracy: 0.93,
      requireEnter: true,
      note: 'Index fingers reach up and slightly inward. F to R, J to U.',
      lines: [
        'rrr uuu rrr uuu',
        'ru ur ru ur ru',
        'sure her sir rush',
        'she irks; a rare fur',
        'guard a false hurdle'
      ]
    }),

    L({
      id: 'top-3', order: 8, prereq: 'top-2',
      title: 'Top row: T and Y',
      newKeys: ['t', 'y'],
      targetWpm: 19, targetAccuracy: 0.93,
      requireEnter: true,
      note: 'The long index reaches. T belongs to the left index, Y to the ' +
            'right. Neither is a middle-finger key, however close it feels.',
      lines: [
        'ttt yyy ttt yyy',
        'ty yt ty yt ty',
        'the that they this',
        'try a dusty street',
        'say it; the lady stayed'
      ]
    }),

    L({
      id: 'top-4', order: 9, prereq: 'top-3',
      title: 'Top row: W and O',
      newKeys: ['w', 'o'],
      targetWpm: 20, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'Ring fingers up. S to W on the left, L to O on the right.',
      lines: [
        'www ooo www ooo',
        'wo ow wo ow wo',
        'word work world how',
        'two hours of slow work',
        'we wrote it out with joy'
      ]
    }),

    L({
      id: 'top-5', order: 10, prereq: 'top-4',
      title: 'Top row: Q and P',
      newKeys: ['q', 'p'],
      targetWpm: 20, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'The pinkies again, and the hardest reach so far. Move the whole ' +
            'hand as little as you can manage.',
      lines: [
        'qqq ppp qqq ppp',
        'qp pq qp pq qp',
        'quit quite quote equal',
        'paper prop help what',
        'a quiet trip past the top'
      ]
    }),

    L({
      id: 'top-6', order: 11, prereq: 'top-5',
      title: 'Home and top consolidation',
      newKeys: [],
      targetWpm: 24, targetAccuracy: 0.95,
      requireEnter: true,
      note: 'Two full rows, real sentences. If your eyes drop to the keyboard, ' +
            'slow down instead.',
      lines: [
        'she typed a short quiet letter',
        'a plate of fresh apple pie',
        'you should try that quiet path',
        'we walked past the old wheat field',
        'the water was still where the air was soft'
      ]
    }),

    L({
      id: 'bot-1', order: 12, prereq: 'top-6',
      title: 'Bottom row: V and N',
      newKeys: ['v', 'n'],
      targetWpm: 21, targetAccuracy: 0.93,
      requireEnter: true,
      note: 'Index fingers down and inward. The hand pivots; it does not slide.',
      lines: [
        'vvv nnn vvv nnn',
        'vn nv vn nv vn',
        'van vine oven never',
        'an event in the van',
        'seven nervous vans went north'
      ]
    }),

    L({
      id: 'bot-2', order: 13, prereq: 'bot-1',
      title: 'Bottom row: B and M',
      newKeys: ['b', 'm'],
      targetWpm: 21, targetAccuracy: 0.93,
      requireEnter: true,
      note: 'B is the left index stretching furthest of all. M is the right ' +
            'index, down and in. Resist letting the right hand take B.',
      lines: [
        'bbb mmm bbb mmm',
        'bm mb bm mb bm',
        'bomb numb amber tumble',
        'my brother made a bed',
        'both members must be here somehow'
      ]
    }),

    L({
      id: 'bot-3', order: 14, prereq: 'bot-2',
      title: 'Bottom row: C and comma',
      newKeys: ['c', ','],
      targetWpm: 22, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'Middle fingers down. The comma is a letter key as far as your ' +
            'hands are concerned.',
      lines: [
        'ccc ,,, ccc ,,,',
        'c, ,c c, ,c c,',
        'once, twice, and once more',
        'cats, dogs, and cows',
        'choose a can, then act on it'
      ]
    }),

    L({
      id: 'bot-4', order: 15, prereq: 'bot-3',
      title: 'Bottom row: X and period',
      newKeys: ['x', '.'],
      targetWpm: 22, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'Ring fingers down. One space after a period is plenty.',
      lines: [
        'xxx ... xxx ...',
        'x. .x x. .x x.',
        'six boxes. exact text.',
        'fix the box. next, relax.',
        'an extra example. that is the end.'
      ]
    }),

    L({
      id: 'bot-5', order: 16, prereq: 'bot-4',
      title: 'Bottom row: Z and slash',
      newKeys: ['z', '/'],
      targetWpm: 22, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'The last two bottom-row keys, both on the pinkies. Every key on ' +
            'the board now has a finger.',
      lines: [
        'zzz /// zzz ///',
        'z/ /z z/ /z z/',
        'zero zone lazy buzz',
        'a dozen quiz prizes',
        'and/or, size/shape, then/now'
      ]
    }),

    L({
      id: 'bot-6', order: 17, prereq: 'bot-5',
      title: 'Every letter: pangrams',
      newKeys: [],
      targetWpm: 28, targetAccuracy: 0.95,
      requireEnter: true,
      note: 'Each of these uses all twenty-six letters. If one of them keeps ' +
            'breaking, the stats screen will tell you which key is at fault.',
      lines: [
        'pack my box with five dozen liquor jugs',
        'the quick brown fox jumps over a lazy dog',
        'how vexingly quick daft zebras jump',
        'sphinx of black quartz, judge my vow',
        'jackdaws love my big sphinx of quartz'
      ]
    }),

    L({
      id: 'shift-1', order: 18, prereq: 'bot-6',
      title: 'Capitals: the opposite-hand rule',
      newKeys: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
                'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
      targetWpm: 26, targetAccuracy: 0.95,
      requireEnter: true,
      note: 'Shift with the hand that is NOT typing the letter. Capital A is ' +
            'right Shift; capital P is left Shift. Using the same hand twists ' +
            'the wrist and costs you speed forever after.',
      lines: [
        'Ada Lovelace wrote the first program.',
        'Grace Hopper found the first bug.',
        'Alan Turing asked if machines can think.',
        'The Nile, the Amazon, and the Danube.',
        'Send the draft to Dr. Chen on Friday.'
      ]
    }),

    L({
      id: 'punct-1', order: 19, prereq: 'shift-1',
      title: 'Punctuation',
      newKeys: ['\'', '"', ':', '?', '!', '-'],
      targetWpm: 26, targetAccuracy: 0.95,
      requireEnter: true,
      note: 'Quote and apostrophe live on the right pinky. Colon, question ' +
            'mark and the double quote are shifted; keep using the far hand.',
      lines: [
        'Don\'t stop; it isn\'t over!',
        'She asked: "Are you ready?"',
        'It\'s a well-known trade-off.',
        'Why not? Because it\'s risky!',
        'The answer: forty-two.'
      ]
    }),

    L({
      id: 'num-1', order: 20, prereq: 'punct-1',
      title: 'The number row',
      newKeys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      targetWpm: 22, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'Reach from the home row, do not move the hand. Left: 1 2 3 4 5. ' +
            'Right: 6 7 8 9 0. Expect this lesson to be slower than the last.',
      lines: [
        '1234567890 0987654321',
        '11 22 33 44 55 66 77 88 99 00',
        'In 1969 we landed; in 1977 we launched.',
        'Call 555-0134 before 9:30 today.',
        'Add 12 and 30 to get 42.'
      ]
    }),

    L({
      id: 'sym-1', order: 21, prereq: 'num-1',
      title: 'Symbols: the gateway to code',
      newKeys: ['(', ')', '[', ']', '{', '}', '<', '>', '=', '+', '*', '|',
                '\\', '&', '%', '$', '#', '@', '_', '^', '~', '`'],
      targetWpm: 18, targetAccuracy: 0.94,
      requireEnter: true,
      note: 'This is the lesson that prose typing never teaches and code ' +
            'demands constantly. Both code tracks open once you clear it.',
      lines: [
        '(){} [] <> (){} []',
        '= + - * / % = + - * /',
        '& | ^ ~ ! @ # $ _ \\',
        'x = (a + b) * 2;',
        'if (n % 2 == 0) { total += n; }',
        'path = "~/src/main.py"'
      ]
    }),

    L({
      id: 'speed-1', order: 22, prereq: 'sym-1',
      title: 'Speed trial',
      newKeys: [],
      targetWpm: 40, targetAccuracy: 0.97,
      requireEnter: true,
      note: 'No new keys, a high bar. Forty words a minute at ninety-seven ' +
            'percent. Accuracy first: speed follows it, never the reverse.',
      lines: [
        'The best way to go fast is to stop making mistakes.',
        'Waltz, bad nymph, for quick jigs vex.',
        'A program is read far more often than it is written.',
        'Type the whole word, then look at what you typed.',
        'Glib jocks quiz nymph to vex dwarf.',
        'Steady hands beat quick ones over any real distance.'
      ]
    })
  ];

  root.TT = root.TT || {};
  root.TT.lessonsCore = lessons;
  if (typeof module !== 'undefined' && module.exports) module.exports = lessons;
})(typeof globalThis !== 'undefined' ? globalThis : this);
