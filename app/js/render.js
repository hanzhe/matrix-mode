// Draws the rain on a 2D canvas: one pre-tinted glyph strip per brightness step, plus a bloom
// made by shrinking the frame and adding it back blurred (the phone has no fast blur).
(function (root) {
  'use strict';
  var Matrix = root.Matrix;

  var ATLAS_GRID = 8;          // glyphs.svg is an 8 x 8 grid
  var GREEN_STEPS = 24;
  var CURSOR_STEPS = 8;
  var GREEN = { h: 108, s: 0.9, maxL: 0.8 };            // palette: lightness follows brightness
  var CURSOR = { h: 120, s: 1, l: 0.85, intensity: 2 }; // the near-white, faintly green head of each drop
  var BLOOM_ALPHA = [0.45, 0.4];                        // quarter-size and eighth-size glow layers

  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var rgb = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
      hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    var m = l - c / 2;
    return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
  }

  function css(rgb) {
    return 'rgb(' + rgb.map(function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 255); }).join(',') + ')';
  }

  function greenAt(level) { return css(hslToRgb(GREEN.h, GREEN.s, Math.min(level, GREEN.maxL))); }

  function cursorAt(level) {
    var rgb = hslToRgb(CURSOR.h, CURSOR.s, CURSOR.l);
    return css(rgb.map(function (v) { return v * CURSOR.intensity * level; }));
  }

  function canvas(w, h) {
    var c = root.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // Cut the 8 x 8 SVG atlas into one horizontal strip of glyph masks, cw x ch each.
  function glyphStrip(img, count, cw, ch) {
    var sheet = canvas(cw * ATLAS_GRID, ch * ATLAS_GRID);
    sheet.getContext('2d').drawImage(img, 0, 0, sheet.width, sheet.height);
    var strip = canvas(cw * count, ch);
    var ctx = strip.getContext('2d');
    for (var i = 0; i < count; i++) {
      var sx = (i % ATLAS_GRID) * cw;
      var sy = Math.floor(i / ATLAS_GRID) * ch;
      ctx.drawImage(sheet, sx, sy, cw, ch, i * cw, 0, cw, ch);
    }
    return strip;
  }

  function tinted(strip, colour) {
    var c = canvas(strip.width, strip.height);
    var ctx = c.getContext('2d');
    ctx.drawImage(strip, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function tints(strip, steps, colourAt) {
    var out = [];
    for (var s = 0; s < steps; s++) out.push(tinted(strip, colourAt((s + 1) / steps)));
    return out;
  }

  // target: the visible canvas. img: a loaded glyphs.svg. cell: glyph size in pixels.
  function createRenderer(target, img, glyphCount, cell) {
    var w = target.width;
    var h = target.height;
    var ctx = target.getContext('2d');
    var strip = glyphStrip(img, glyphCount, cell, cell);
    var green = tints(strip, GREEN_STEPS, greenAt);
    var cursor = tints(strip, CURSOR_STEPS, cursorAt);
    var half = canvas(w >> 1, h >> 1);
    var quarter = canvas(w >> 2, h >> 2);
    var eighth = canvas(w >> 3, h >> 3);
    var bloomOn = true;

    function drawCells(rain) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      var cols = rain.cols;
      for (var i = 0; i < rain.level.length; i++) {
        var level = rain.level[i];
        if (level <= 0) continue;
        var isCursor = rain.cursor[i] === 1;
        var steps = isCursor ? CURSOR_STEPS : GREEN_STEPS;
        var step = Math.min(steps - 1, Math.round(level * steps) - 1);
        if (step < 0) continue;
        var src = (isCursor ? cursor : green)[step];
        ctx.drawImage(src, rain.symbol[i] * cell, 0, cell, cell,
          (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
      }
    }

    function shrink(from, to) {
      var c = to.getContext('2d');
      c.globalCompositeOperation = 'copy';
      c.drawImage(from, 0, 0, to.width, to.height);
    }

    function bloom() {
      shrink(target, half);
      shrink(half, quarter);
      shrink(quarter, eighth);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = BLOOM_ALPHA[0];
      ctx.drawImage(quarter, 0, 0, w, h);
      ctx.globalAlpha = BLOOM_ALPHA[1];
      ctx.drawImage(eighth, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function draw(rain) {
      drawCells(rain);
      if (bloomOn) bloom();
    }

    return {
      draw: draw,
      setBloom: function (on) { bloomOn = on; },
      bloom: function () { return bloomOn; }
    };
  }

  Matrix.render = { createRenderer: createRenderer, hslToRgb: hslToRgb, greenAt: greenAt, cursorAt: cursorAt };
})(this);
