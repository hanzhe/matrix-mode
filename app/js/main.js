// Matrix mode: the trace opening, then the code rain; keys switch to the film's text scenes
// and a call from Morpheus.
(function (root) {
  'use strict';
  var Matrix = root.Matrix;
  var rainApi = Matrix.rain;
  var scenes = Matrix.scenes;
  var doc = root.document;

  var GLYPHS = 57;
  var SIZES = [10, 12, 14, 16];
  var SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];
  var MAX_DT = 0.1;            // seconds; longer gaps (app in background) are not caught up
  var HINT_MS = 1800;
  var RING = { on: 2, period: 6, tones: [440, 480], gain: 0.12 };  // a desk phone, as in the film
  var VIBRATE = [800, 400, 800];
  var SETTINGS_KEY = 'matrixmode.settings';
  var HELP = ['5  pause', '↑↓  speed', '*  glyph size', '#  glow',
              '1  wake up, Neo', '2  Morpheus calls', '3  trace'];

  var canvas = doc.getElementById('rain');
  var sceneEl = doc.getElementById('scene');
  var hintEl = doc.getElementById('hint');

  var settings = loadSettings();
  var img = null;
  var rain = null;
  var renderer = null;
  var paused = false;
  var mode = 'rain';           // rain | scene | ringing
  var scene = null;            // {name, steps, start}
  var last = 0;
  var hintTimer = null;
  var ringer = null;
  var wakeLock = null;

  // ---------- settings ----------

  function loadSettings() {
    var s = null;
    try { s = JSON.parse(root.localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { s = null; }
    s = s || {};
    return {
      size: SIZES.indexOf(s.size) >= 0 ? s.size : 12,
      speed: SPEEDS.indexOf(s.speed) >= 0 ? s.speed : 1,
      bloom: s.bloom !== false
    };
  }

  function saveSettings() {
    try { root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ }
  }

  function hint(lines) {
    hintEl.innerHTML = '';
    [].concat(lines).forEach(function (text) {
      var div = doc.createElement('div');
      div.textContent = text;
      hintEl.appendChild(div);
    });
    hintEl.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.hidden = true; }, HINT_MS * (lines.length > 1 ? 2 : 1));
  }

  // ---------- rain ----------

  function buildRain(withIntro) {
    var cell = settings.size;
    rain = rainApi.createRain(Math.ceil(canvas.width / cell), Math.ceil(canvas.height / cell), { glyphs: GLYPHS });
    if (!withIntro) rainApi.skipIntro(rain);
    renderer = Matrix.render.createRenderer(canvas, img, GLYPHS, cell);
    renderer.setBloom(settings.bloom);
  }

  function changeSpeed(dir) {
    var i = SPEEDS.indexOf(settings.speed) + dir;
    if (i < 0 || i >= SPEEDS.length) return;
    settings.speed = SPEEDS[i];
    saveSettings();
    hint('Speed ' + settings.speed + 'x');
  }

  function changeSize() {
    settings.size = SIZES[(SIZES.indexOf(settings.size) + 1) % SIZES.length];
    saveSettings();
    buildRain(false);
    hint('Glyphs ' + settings.size + ' px');
  }

  function toggleBloom() {
    settings.bloom = !settings.bloom;
    saveSettings();
    renderer.setBloom(settings.bloom);
    hint(settings.bloom ? 'Glow on' : 'Glow off');
  }

  // ---------- scenes ----------

  function startScene(name) {
    stopRinging();
    mode = 'scene';
    scene = { name: name, steps: scenes.SCENES[name], start: now() };
    canvas.style.visibility = 'hidden';
    sceneEl.className = 'scene-' + name;
    sceneEl.hidden = false;
    renderScene();
  }

  function endScene() {
    var wasTrace = scene && scene.name === 'trace';
    stopRinging();
    mode = 'rain';
    scene = null;
    sceneEl.hidden = true;
    sceneEl.innerHTML = '';
    canvas.style.visibility = '';
    // The film cuts from the trace into rain falling onto a black screen.
    if (wasTrace) rainApi.restartIntro(rain);
  }

  function line(text, cursor, cls) {
    var div = doc.createElement('div');
    div.className = cls || 'line';
    div.textContent = text;
    if (cursor) {
      var c = doc.createElement('span');
      c.className = 'cursor';
      div.appendChild(c);
    }
    return div;
  }

  function renderScene() {
    var t = (now() - scene.start) / 1000;
    var f = scenes.frameAt(scene.steps, t);
    if (f.done) { endScene(); return; }
    sceneEl.innerHTML = '';
    var box = doc.createElement('div');
    box.className = 'text';
    f.lines.forEach(function (text, i) {
      box.appendChild(line(text, f.cursor && i === f.lines.length - 1));
    });
    sceneEl.appendChild(box);
    if (scene.name === 'trace') {
      var typed = scenes.SCENES.trace;
      var delay = scenes.duration([typed[0]]) + typed[1].type.length / typed[1].cps;
      if (t > delay) sceneEl.appendChild(line(scenes.traceDigits(t, delay, scenes.TRACE_NUMBER, Math.random), false, 'number'));
    }
  }

  // ---------- Morpheus calling ----------

  function startRinging() {
    mode = 'ringing';
    canvas.style.visibility = 'hidden';
    sceneEl.className = 'scene-ringing';
    sceneEl.innerHTML = '';
    sceneEl.appendChild(line('Incoming call', false, 'call-label'));
    sceneEl.appendChild(line('Morpheus', false, 'call-name'));
    sceneEl.appendChild(line('Unknown number', false, 'call-label'));
    var soft = doc.createElement('div');
    soft.className = 'call-soft';
    soft.appendChild(line('Answer', false, 'call-answer'));
    soft.appendChild(line('Reject', false, 'call-reject'));
    sceneEl.appendChild(soft);
    sceneEl.hidden = false;
    ringer = createRinger();
  }

  function stopRinging() {
    if (ringer) ringer.stop();
    ringer = null;
  }

  // A two-tone ring (2 s on, 4 s off) plus vibration, until stopped.
  function createRinger() {
    var Ctx = root.AudioContext || root.webkitAudioContext;
    var ctx = null;
    var gain = null;
    try {
      ctx = new Ctx();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      RING.tones.forEach(function (hz) {
        var osc = ctx.createOscillator();
        osc.frequency.value = hz;
        osc.connect(gain);
        osc.start();
      });
    } catch (e) {
      ctx = null;  // no audio: vibration still works
    }
    function cycle() {
      if (ctx) {
        var t = ctx.currentTime;
        gain.gain.setValueAtTime(RING.gain, t);
        gain.gain.setValueAtTime(0, t + RING.on);
      }
      if (root.navigator.vibrate) root.navigator.vibrate(VIBRATE);
    }
    cycle();
    var timer = setInterval(cycle, RING.period * 1000);
    return {
      stop: function () {
        clearInterval(timer);
        if (root.navigator.vibrate) root.navigator.vibrate(0);
        if (ctx) { gain.gain.value = 0; try { ctx.close(); } catch (e) { /* already closed */ } }
      }
    };
  }

  // ---------- loop ----------

  function now() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }

  function frame() {
    root.requestAnimationFrame(frame);
    var t = now();
    var dt = Math.min(MAX_DT, (t - last) / 1000);
    last = t;
    if (doc.hidden) return;
    if (mode === 'scene') { renderScene(); return; }
    if (mode !== 'rain') return;
    if (!paused) rainApi.step(rain, dt, settings.speed);
    renderer.draw(rain);
  }

  // ---------- keys ----------

  function onRainKey(k) {
    switch (k) {
      case 'Enter': case '5': paused = !paused; hint(paused ? 'Paused' : 'Running'); return true;
      case 'ArrowUp': changeSpeed(1); return true;
      case 'ArrowDown': changeSpeed(-1); return true;
      case '*': changeSize(); return true;
      case '#': toggleBloom(); return true;
      case '0': hint(HELP); return true;
      case '1': startScene('wake'); return true;
      case '2': startRinging(); return true;
      case '3': startScene('trace'); return true;
      default: return false;  // Backspace closes the app
    }
  }

  function onKey(e) {
    var k = e.key;
    var handled = true;
    if (mode === 'rain') handled = onRainKey(k);
    else if (mode === 'ringing') {
      if (k === 'Enter' || k === 'Call' || k === 'SoftLeft') startScene('call');
      else if (k === 'Backspace' || k === 'EndCall' || k === 'SoftRight') endScene();
    } else if (k === 'Backspace' || k === 'Enter' || k === 'EndCall') endScene();
    if (handled) e.preventDefault();
  }

  function holdScreen() {
    if (doc.hidden) {
      if (wakeLock) { wakeLock.unlock(); wakeLock = null; }
      stopRinging();
      if (mode === 'ringing') endScene();
    } else if (!wakeLock && root.navigator.requestWakeLock) {
      wakeLock = root.navigator.requestWakeLock('screen');
    }
  }

  function start() {
    buildRain(true);
    root.addEventListener('keydown', onKey);
    doc.addEventListener('visibilitychange', holdScreen);
    holdScreen();
    startScene('trace');
    last = now();
    root.requestAnimationFrame(frame);
  }

  img = new root.Image();
  img.onload = start;
  img.onerror = function () { hint('Cannot load glyphs'); };
  img.src = 'img/glyphs.svg';
})(this);
