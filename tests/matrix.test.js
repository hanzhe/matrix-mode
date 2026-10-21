'use strict';
var test = require('node:test');
var assert = require('node:assert');
var rain = require('../app/js/rain.js');
var scenes = require('../app/js/scenes.js');

// Deterministic random numbers (mulberry32).
function seeded(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lit(r) {
  var n = 0;
  for (var i = 0; i < r.level.length; i++) if (r.level[i] > 0) n++;
  return n;
}

test('the opening starts on a black screen and fills up', function () {
  var r = rain.createRain(20, 27, { random: seeded(1) });
  assert.strictEqual(lit(r), 0);
  for (var i = 0; i < 30 * 6; i++) rain.step(r, 1 / 30, 1);
  assert.ok(lit(r) > 0, 'streams have started');
  for (var j = 0; j < 30 * 15; j++) rain.step(r, 1 / 30, 1);
  assert.strictEqual(r.intro, false, 'the opening ends by itself');
});

test('after the opening about half the screen is lit, as in the film', function () {
  var r = rain.createRain(20, 27, { random: seeded(2) });
  rain.skipIntro(r);
  var share = lit(r) / r.level.length;
  assert.ok(share > 0.3 && share < 0.7, 'lit share ' + share);
});

test('each drop has one cursor at its bottom, the brightest cell of its trail', function () {
  var r = rain.createRain(20, 27, { random: seeded(3) });
  rain.skipIntro(r);
  for (var i = 0; i < 40; i++) rain.step(r, 1 / 30, 1);
  var cursors = 0;
  for (var c = 0; c < r.cols; c++) {
    for (var row = 1; row < r.rows; row++) {
      var idx = row * r.cols + c;
      if (!r.cursor[idx]) continue;
      cursors++;
      // Above a cursor the trail is lit and dimmer; the cell above is never also a cursor.
      var above = (row - 1) * r.cols + c;
      assert.strictEqual(r.cursor[above], 0);
      assert.ok(r.level[above] <= r.level[idx] + 1e-6);
    }
  }
  assert.ok(cursors >= 5, 'cursors ' + cursors);
});

test('drops move down over time', function () {
  var r = rain.createRain(1, 40, { random: seeded(4) });
  rain.skipIntro(r);
  function cursorRow() {
    for (var row = 0; row < r.rows; row++) if (r.cursor[row]) return row;
    return -1;
  }
  // Find a moment with a cursor on screen, then watch it fall.
  var guard = 0;
  while ((cursorRow() < 0 || cursorRow() > 20) && guard++ < 2000) rain.step(r, 1 / 30, 1);
  var before = cursorRow();
  rain.step(r, 0.5, 1);
  assert.ok(cursorRow() > before, before + ' -> ' + cursorRow());
});

test('glyphs change about twice a second, and not at all when frozen', function () {
  var r = rain.createRain(10, 10, { random: seeded(5) });
  var before = Array.prototype.slice.call(r.symbol);
  rain.step(r, 1, 0);
  assert.deepStrictEqual(Array.prototype.slice.call(r.symbol), before);
  rain.step(r, 1, 1);
  var changed = 0;
  for (var i = 0; i < before.length; i++) if (r.symbol[i] !== before[i]) changed++;
  assert.ok(changed > 80, 'changed ' + changed);
  for (var k = 0; k < r.symbol.length; k++) assert.ok(r.symbol[k] < 57);
});

test('scene text types out, holds, clears and ends', function () {
  var steps = scenes.SCENES.wake;
  var f = scenes.frameAt(steps, 1);
  assert.deepStrictEqual(f.lines, ['Wake up']);
  assert.strictEqual(f.typing, true);
  f = scenes.frameAt(steps, 3);
  assert.deepStrictEqual(f.lines, ['Wake up, Neo...']);
  assert.strictEqual(f.typing, false);
  f = scenes.frameAt(steps, 6.5);
  assert.strictEqual(f.lines.length, 1);
  assert.ok(/^The Matrix/.test(f.lines[0]));
  var end = scenes.duration(steps);
  assert.ok(/^Knock, knock/.test(scenes.frameAt(steps, end - 0.1).lines[0]));
  assert.strictEqual(scenes.frameAt(steps, end).done, true);
});

test('the traced number locks in digit by digit', function () {
  var n = scenes.TRACE_NUMBER;
  var zero = function () { return 0; };
  assert.strictEqual(scenes.traceDigits(0, 1, n, zero), '(000) 000-0000');
  assert.strictEqual(scenes.traceDigits(1 + 3 * scenes.DIGIT_LOCK, 1, n, zero), '(312) 000-0000');
  assert.strictEqual(scenes.traceDigits(1 + scenes.digitCount(n) * scenes.DIGIT_LOCK, 1, n, zero), n);
});
