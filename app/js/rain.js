// The code rain model: which glyph sits in each cell and how bright it is.
// A port of the "classic" version of Rezmason's matrix (MIT, github.com/Rezmason/matrix),
// moved from WebGL shaders to plain JS so it runs on a 2D canvas.
//
// The key idea from the original: glyphs never move. Each column has a brightness wave
// that travels down it, and that wave lights up the glyphs it passes. The brightest cell
// at the bottom of each wave is the "cursor", drawn near white.
(function (root) {
  'use strict';

  var SQRT_2 = Math.sqrt(2);
  var SQRT_5 = Math.sqrt(5);

  var DEFAULTS = {
    glyphs: 57,            // glyphs in the atlas (img/glyphs.svg)
    fallSpeed: 0.3,        // how fast the waves travel down
    raindropLength: 0.75,  // wave period; also how long a trail is
    screenSpan: 0.8,       // rain time covered by one screen height (80 rows x 0.01 in the original)
    cycleRate: 1.8,        // glyph changes per cell per second (0.03 per frame at 60 fps)
    baseContrast: 1.1,
    baseBrightness: -0.5,
    introSpeed: 0.375      // screens per second the opening streams fall (0.3 * 100 / 80)
  };

  function fract(x) { return x - Math.floor(x); }

  // Makes each drop speed up and slow down a little, so columns do not look mechanical.
  function wobble(x) { return x + 0.3 * Math.sin(SQRT_2 * x) + 0.2 * Math.sin(SQRT_5 * x); }

  // Brightness 0..1 of a cell, counting rows up from the bottom of the screen (as in GL).
  function waveAt(rowUp, columnTime, perRow, length) {
    return 1 - fract(wobble((rowUp * perRow + columnTime) / length));
  }

  // When each column starts falling in the opening, in seconds: the middle first, the edges last.
  function introOffset(c, cols, random) {
    if (c === Math.floor(cols / 2)) return -1;
    if (c === Math.floor(cols * 0.75)) return -2;
    return random() * -4 + (Math.sin(c / cols * Math.PI) - 1) * 2 - 2.5;
  }

  function newSymbol(previous, count, random) {
    var s = Math.floor(random() * count);
    return s === previous ? (s + 1) % count : s;
  }

  // The state lives in typed arrays and is updated in place: this runs every frame
  // on a slow phone, and allocating new arrays per frame would make the GC stutter.
  function createRain(cols, rows, options) {
    var o = {};
    var key;
    for (key in DEFAULTS) o[key] = DEFAULTS[key];
    for (key in options || {}) if (key !== 'random') o[key] = options[key];
    var random = (options && options.random) || Math.random;
    var n = cols * rows;
    var rain = {
      cols: cols, rows: rows, options: o, random: random, time: 0, intro: true, introEnd: 0,
      columnOffset: new Float64Array(cols),
      columnSpeed: new Float32Array(cols),
      introOffset: new Float32Array(cols),
      symbol: new Uint8Array(n),
      age: new Float32Array(n),
      level: new Float32Array(n),   // displayed brightness 0..1, after contrast; 0 = dark
      cursor: new Uint8Array(n)     // 1 where the cell is the bright head of a drop
    };
    for (var c = 0; c < cols; c++) {
      rain.columnOffset[c] = random() * 1000;
      rain.columnSpeed[c] = random() * 0.5 + 0.5;
      rain.introOffset[c] = introOffset(c, cols, random);
      // The opening is over once the last stream is past the bottom and its flash has faded.
      rain.introEnd = Math.max(rain.introEnd, 1.2 / o.introSpeed - rain.introOffset[c]);
    }
    for (var i = 0; i < n; i++) {
      rain.symbol[i] = Math.floor(random() * o.glyphs);
      rain.age[i] = random();
    }
    update(rain);
    return rain;
  }

  // Skip the opening and start with a screen full of rain.
  function skipIntro(rain) {
    rain.intro = false;
    update(rain);
  }

  // Start again from a black screen, with the opening streams.
  function restartIntro(rain) {
    rain.intro = true;
    rain.time = 0;
    update(rain);
  }

  // Advance by dt seconds. speed scales everything (1 = as in the film; 0 = frozen).
  function step(rain, dt, speed) {
    var t = dt * speed;
    rain.time += t;
    cycleGlyphs(rain, t);
    update(rain);
  }

  function cycleGlyphs(rain, t) {
    var o = rain.options;
    var add = t * o.cycleRate;
    for (var i = 0; i < rain.age.length; i++) {
      var a = rain.age[i] + add;
      if (a >= 1) {
        rain.symbol[i] = newSymbol(rain.symbol[i], o.glyphs, rain.random);
        a = fract(a);
      }
      rain.age[i] = a;
    }
  }

  // Recompute brightness and cursors for the current time.
  function update(rain) {
    var o = rain.options;
    var cols = rain.cols;
    var rows = rain.rows;
    var perRow = o.screenSpan / rows;
    for (var c = 0; c < cols; c++) {
      var columnTime = rain.columnOffset[c] + rain.time * o.fallSpeed * rain.columnSpeed[c];
      // How far down (0 = top, 1 = bottom) the opening stream of this column has reached.
      var introFront = rain.intro ? (rain.time + rain.introOffset[c]) * o.introSpeed : 2;
      var below = waveAt(-1, columnTime, perRow, o.raindropLength);  // just below the screen
      for (var r = rows - 1; r >= 0; r--) {
        var i = r * cols + c;
        var rowUp = rows - 1 - r;
        var wave = waveAt(rowUp, columnTime, perRow, o.raindropLength);
        var progress = introFront - r / rows;           // > 0 once the opening has passed this cell
        var activated = progress > 0;
        var activatedBelow = introFront - (r + 1) / rows > 0;
        var isCursor = wave > below;
        if (activated && !activatedBelow) isCursor = true;
        // The opening stream flashes as it passes, then settles into the normal rain.
        var base = wave + (activated ? Math.max(0, 1 - progress * 5) : 0);
        var level = activated ? base * o.baseContrast + o.baseBrightness : 0;
        rain.level[i] = level > 0 ? Math.min(level, 1) : 0;
        rain.cursor[i] = activated && isCursor ? 1 : 0;
        below = wave;
      }
    }
    if (rain.intro && rain.time > rain.introEnd) rain.intro = false;
  }

  var api = {
    DEFAULTS: DEFAULTS,
    createRain: createRain,
    step: step,
    skipIntro: skipIntro,
    restartIntro: restartIntro,
    waveAt: waveAt,
    wobble: wobble
  };
  root.Matrix = root.Matrix || {};
  root.Matrix.rain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
