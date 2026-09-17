/* lessons.cpp.js — the C++ track.
 *
 * Modern C++ throughout: nullptr rather than NULL, range-for rather than index
 * arithmetic, smart pointers rather than raw new, and the algorithm header
 * rather than hand-rolled loops. A learner who meets these lines again in real
 * source should recognise them.
 *
 * THE ESCAPING TRAP: these lines are JavaScript string literals. A C++ line
 * containing "\n" must be written here as '\\n', or the backslash is eaten and
 * the lesson silently teaches the wrong thing. tools/lint-lessons.js checks
 * for both failure modes — a real newline that survived, and a lost backslash.
 */
(function (root) {
  'use strict';

  function L(spec) {
    return {
      id: spec.id,
      track: 'cpp',
      order: spec.order,
      title: spec.title,
      prereq: spec.prereq,
      newKeys: spec.newKeys || [],
      targetWpm: spec.targetWpm,
      targetAccuracy: spec.targetAccuracy,
      mode: 'code',
      language: 'cpp',
      requireEnter: true,
      note: spec.note,
      lines: spec.lines
    };
  }

  var lessons = [
    L({
      id: 'cpp-include', order: 1, prereq: 'sym-1',
      title: 'Includes',
      targetWpm: 17, targetAccuracy: 0.95,
      note: 'Hash on shifted 3, then angle brackets on shifted comma and ' +
            'period. Three shifted characters in a row, which is why this ' +
            'lesson comes first.',
      lines: [
        '#include <iostream>',
        '#include <vector>',
        '#include <string>',
        '#include <memory>',
        '#include <algorithm>',
        '#include <unordered_map>'
      ]
    }),

    L({
      id: 'cpp-main', order: 2, prereq: 'cpp-include',
      title: 'Namespaces and main',
      targetWpm: 17, targetAccuracy: 0.95,
      note: 'Braces are shifted square brackets. The right pinky does more ' +
            'work in C++ than in any other language you will meet.',
      lines: [
        'using namespace std;',
        'using std::cout;',
        'int main() {',
        '    return 0;',
        '}',
        'int main(int argc, char* argv[]) {'
      ]
    }),

    L({
      id: 'cpp-io', order: 3, prereq: 'cpp-main',
      title: 'Streams',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'The double angle bracket is the signature reach of C++: shift ' +
            'held, comma or period struck twice. Get it smooth here.',
      lines: [
        'std::cout << "Hello, world!\\n";',
        'std::cout << x << " " << y << std::endl;',
        'std::cin >> n;',
        'std::getline(std::cin, line);',
        'std::cerr << "error: " << message << \'\\n\';'
      ]
    }),

    L({
      id: 'cpp-loops', order: 4, prereq: 'cpp-io',
      title: 'Loops',
      targetWpm: 16, targetAccuracy: 0.95,
      note: 'Semicolons inside the parentheses, and the range-for that should ' +
            'replace most of them.',
      lines: [
        'for (int i = 0; i < n; ++i) {',
        '    sum += i;',
        '}',
        'while (index < size) {',
        'for (const auto& item : items) {',
        'for (size_t i = 0; i < v.size(); ++i) {'
      ]
    }),

    L({
      id: 'cpp-vector', order: 5, prereq: 'cpp-loops',
      title: 'Containers',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'Nested angle brackets and a great many colons. Two colons is one ' +
            'motion, not two.',
      lines: [
        'std::vector<int> v = {1, 2, 3};',
        'std::vector<std::string> names;',
        'names.push_back("ada");',
        'std::unordered_map<std::string, int> counts;',
        'points.emplace_back(x, y);',
        'v.reserve(1024);'
      ]
    }),

    L({
      id: 'cpp-class', order: 6, prereq: 'cpp-vector',
      title: 'Classes',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'Member initialiser lists put a colon where nothing else does. ' +
            'The trailing semicolon after the closing brace is the one ' +
            'everybody forgets.',
      lines: [
        'class Point {',
        'public:',
        '    Point(int x, int y) : x_(x), y_(y) {}',
        '    int x() const { return x_; }',
        'private:',
        '    int x_, y_;',
        '};'
      ]
    }),

    L({
      id: 'cpp-auto', order: 7, prereq: 'cpp-class',
      title: 'auto, lambdas and bindings',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'A lambda packs brackets, parentheses and braces into one line. ' +
            'Structured bindings put square brackets on the left of a colon.',
      lines: [
        'auto it = std::find(v.begin(), v.end(), 42);',
        'auto add = [](int a, int b) { return a + b; };',
        'for (const auto& [key, value] : counts) {',
        'auto n = static_cast<int>(v.size());',
        'auto* raw = ptr.get();'
      ]
    }),

    L({
      id: 'cpp-smartptr', order: 8, prereq: 'cpp-auto',
      title: 'Smart pointers',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'make_unique and make_shared rather than new. The arrow is a ' +
            'minus followed by a shifted period.',
      lines: [
        'auto widget = std::make_unique<Widget>();',
        'std::unique_ptr<Node> head;',
        'auto config = std::make_shared<Config>(path);',
        'head = std::move(next);',
        'if (ptr != nullptr) {',
        '    ptr->update();'
      ]
    }),

    L({
      id: 'cpp-algorithm', order: 9, prereq: 'cpp-smartptr',
      title: 'Algorithms',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'Begin and end, over and over, until your hands stop thinking ' +
            'about it.',
      lines: [
        'std::sort(v.begin(), v.end());',
        'std::sort(v.begin(), v.end(), std::greater<int>());',
        'std::reverse(text.begin(), text.end());',
        'auto count = std::count(v.begin(), v.end(), target);',
        'auto total = std::accumulate(v.begin(), v.end(), 0);'
      ]
    }),

    L({
      id: 'cpp-template', order: 10, prereq: 'cpp-algorithm',
      title: 'Templates and headers',
      targetWpm: 15, targetAccuracy: 0.94,
      note: 'The ternary, the template header, and the comment that tells a ' +
            'reader which namespace just ended.',
      lines: [
        '#pragma once',
        'template <typename T>',
        'T max_of(T a, T b) { return a > b ? a : b; }',
        'template <typename T, typename U>',
        'namespace util {',
        '}  // namespace util'
      ]
    })
  ];

  root.TT = root.TT || {};
  root.TT.lessonsCpp = lessons;
  if (typeof module !== 'undefined' && module.exports) module.exports = lessons;
})(typeof globalThis !== 'undefined' ? globalThis : this);
