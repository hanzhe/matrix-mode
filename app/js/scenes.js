// The film's text scenes as timelines: given the seconds since a scene started,
// say which lines are on screen. Pure, so it can be tested without a DOM.
(function (root) {
  'use strict';

  var CURSOR_BLINK = 0.5;   // seconds on, then off
  var DIGIT_LOCK = 0.3;     // seconds between digits locking in the trace

  // Steps: {type: text} types it at cps characters a second; {show: text} prints it at once;
  // hold waits; clear empties the screen before the step. Lines add up until the next clear.
  var SCENES = {
    // The opening of the film, on Neo's computer.
    wake: [
      { type: 'Wake up, Neo...', cps: 7, hold: 2.5 },
      { type: 'The Matrix has you...', cps: 9, hold: 2.5, clear: true },
      { type: 'Follow the white rabbit.', cps: 9, hold: 2.5, clear: true },
      { show: 'Knock, knock, Neo.', hold: 3, clear: true }
    ],
    // The very first shot: a call being traced.
    trace: [
      { type: 'Call trans opt: received. 2-19-98 13:24:18 REC:Log>', cps: 30, hold: 0.6 },
      { type: 'Trace program: running', cps: 20, hold: 5.2 }
    ],
    // What Morpheus says once the call is answered.
    call: [
      { type: 'Hello, Neo.', cps: 12, hold: 1.4 },
      { type: 'Do you know who this is?', cps: 14, hold: 2 },
      { type: 'I\'ve been looking for you, Neo.', cps: 14, hold: 2, clear: true },
      { type: 'I don\'t know if you\'re ready to see what I want to show you...', cps: 16, hold: 2.5, clear: true },
      { type: 'They\'re coming for you, Neo.', cps: 12, hold: 2.2, clear: true },
      { show: '...', hold: 1.5, clear: true }
    ]
  };

  var TRACE_NUMBER = '(312) 555-0690';

  function stepLength(step) {
    var text = step.type || step.show || '';
    return (step.type ? text.length / step.cps : 0) + (step.hold || 0);
  }

  function duration(steps) {
    var total = 0;
    for (var i = 0; i < steps.length; i++) total += stepLength(steps[i]);
    return total;
  }

  // {lines, typing, cursor, done}: cursor says whether the block cursor shows right now.
  function frameAt(steps, t) {
    var lines = [];
    var start = 0;
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var text = s.type || s.show || '';
      if (s.clear) lines = [];
      var typed = s.type ? Math.floor((t - start) * s.cps) : text.length;
      if (typed < text.length) {
        lines.push(text.slice(0, Math.max(0, typed)));
        return { lines: lines, typing: true, cursor: true, done: false };
      }
      lines.push(text);
      start += stepLength(s);
      if (t < start) break;
    }
    var done = t >= duration(steps);
    return { lines: done ? [] : lines, typing: false, cursor: !done && blinkOn(t), done: done };
  }

  function blinkOn(t) { return Math.floor(t / CURSOR_BLINK) % 2 === 0; }

  // The traced number: digits spin until they lock in one by one, left to right,
  // starting after `delay` seconds. Punctuation is fixed.
  function traceDigits(t, delay, number, random) {
    var locked = Math.max(0, Math.floor((t - delay) / DIGIT_LOCK));
    var out = '';
    var digit = 0;
    for (var i = 0; i < number.length; i++) {
      var ch = number.charAt(i);
      if (!/[0-9]/.test(ch)) { out += ch; continue; }
      out += digit < locked ? ch : String(Math.floor(random() * 10));
      digit++;
    }
    return out;
  }

  function digitCount(number) { return number.replace(/[^0-9]/g, '').length; }

  var api = {
    SCENES: SCENES,
    TRACE_NUMBER: TRACE_NUMBER,
    DIGIT_LOCK: DIGIT_LOCK,
    frameAt: frameAt,
    duration: duration,
    traceDigits: traceDigits,
    digitCount: digitCount,
    blinkOn: blinkOn
  };
  root.Matrix = root.Matrix || {};
  root.Matrix.scenes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
