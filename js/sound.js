/* =========================================================
   Sound — local physical table samples with restrained Web-Audio cues.
   Every asset is bundled with the game and works directly from file://.
   ========================================================= */
(function (global) {
  "use strict";

  var ctx = null;
  var enabled = true;
  var master = null;     // dry+wet sum -> limiter -> out
  var reverbSend = null; // node sounds tap for spatial tail
  var channelBuses = {}; // independent dry/wet gains for cards, chips and table cues
  var built = false;
  var MASTER_OUTPUT = 0.9;
  var VOLUME_CHANNELS = ["master", "cards", "chips", "table"];
  var DEFAULT_VOLUMES = { master: 1, cards: 1, chips: 1, table: 1 };
  var volumes = { master: 1, cards: 1, chips: 1, table: 1 };
  var SAMPLE_PATHS = {
    card1: "assets/audio/card-slide-1.ogg",
    card2: "assets/audio/card-slide-2.ogg",
    flip: "assets/audio/card-flip.ogg",
    chip1: "assets/audio/chip-click-1.ogg",
    chip2: "assets/audio/chip-click-2.ogg",
    chipStack: "assets/audio/chip-stack.ogg",
    chipsPush: "assets/audio/chips-push.ogg",
    shuffle: "assets/audio/shuffle.ogg"
  };
  // Each sample also ships as AAC (.m4a) for Safari versions that cannot play
  // Ogg. The browser's own canPlayType decides once, on first use.
  var sampleExtension = null;
  var sampleTemplates = {};
  var activeSamples = [];
  var sampleTurn = 0;
  var sampleEpoch = 0;

  function clampVolume(value, fallback) {
    value = Number(value);
    if (!isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  function normalizedVolumes(value) {
    value = value && typeof value === "object" ? value : {};
    var result = {};
    VOLUME_CHANNELS.forEach(function (channel) {
      result[channel] = clampVolume(value[channel], DEFAULT_VOLUMES[channel]);
    });
    return result;
  }

  function sampleFormat() {
    if (sampleExtension) return sampleExtension;
    sampleExtension = ".ogg";
    try {
      var probe = new global.Audio();
      if (typeof probe.canPlayType === "function" &&
          !probe.canPlayType('audio/ogg; codecs="vorbis"') &&
          probe.canPlayType('audio/mp4; codecs="mp4a.40.2"')) sampleExtension = ".m4a";
    } catch (e) {}
    return sampleExtension;
  }

  function preloadSamples() {
    if (typeof global.Audio !== "function") return;
    var extension = sampleFormat();
    Object.keys(SAMPLE_PATHS).forEach(function (name) {
      if (sampleTemplates[name]) return;
      try {
        var audio = new global.Audio(SAMPLE_PATHS[name].replace(/\.ogg$/, extension));
        audio.preload = "auto";
        sampleTemplates[name] = audio;
      } catch (e) {}
    });
  }

  function playSample(name, channel, gain, rate, fallback) {
    if (!enabled || volumes.master <= 0 || volumes[channel] <= 0 || typeof global.Audio !== "function") return false;
    preloadSamples();
    var template = sampleTemplates[name];
    if (!template || typeof template.cloneNode !== "function") return false;
    try {
      var audio = template.cloneNode(true);
      audio._table21Channel = channel;
      audio._table21Gain = gain == null ? 1 : gain;
      audio.volume = Math.max(0, Math.min(1, MASTER_OUTPUT * volumes.master * volumes[channel] * audio._table21Gain));
      audio.playbackRate = Math.max(.8, Math.min(1.2, rate || 1));
      activeSamples.push(audio);
      var epoch = sampleEpoch;
      var finished = false;
      var release = function () {
        var index = activeSamples.indexOf(audio);
        if (index !== -1) activeSamples.splice(index, 1);
      };
      var failed = function (error) {
        if (finished) return;
        finished = true;
        release();
        // Do not turn an explicit mute or autoplay denial into another sound.
        if (epoch !== sampleEpoch || !enabled || (error && (error.name === "AbortError" || error.name === "NotAllowedError"))) return;
        if (fallback) { try { fallback(); } catch (e) {} }
      };
      audio.addEventListener("ended", function () { finished = true; release(); }, { once: true });
      audio.addEventListener("error", failed, { once: true });
      var playback = audio.play();
      if (playback && typeof playback.catch === "function") playback.catch(failed);
      return true;
    } catch (e) {
      var index = activeSamples.indexOf(audio);
      if (index !== -1) activeSamples.splice(index, 1);
      return e.name === "NotAllowedError" || e.name === "AbortError";
    }
  }

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    buildBus();
    return ctx;
  }

  function makeImpulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        // subtly coloured noise tail
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function buildBus() {
    if (built) return;
    built = true;

    // Soft limiter to keep things smooth and "produced"
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 26;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    // Gentle high shelf cut so synths never sound harsh
    var tone = ctx.createBiquadFilter();
    tone.type = "highshelf";
    tone.frequency.value = 6500;
    tone.gain.value = -6;

    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_OUTPUT * volumes.master : 0;

    master.connect(tone);
    tone.connect(limiter);
    limiter.connect(ctx.destination);

    // Reverb send
    var convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(1.6, 3.2);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.16;
    reverbSend.connect(convolver);
    convolver.connect(master);

    // Every category gets a dry and a wet gain. Keeping the send behind the
    // category gain means lowering "Cards" also lowers its reverb tail.
    ["cards", "chips", "table"].forEach(function (channel) {
      var dry = ctx.createGain();
      var wet = ctx.createGain();
      dry.gain.value = volumes[channel];
      wet.gain.value = volumes[channel];
      dry.connect(master);
      wet.connect(reverbSend);
      channelBuses[channel] = { dry: dry, wet: wet };
    });
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      var resumed = ctx.resume();
      if (resumed && resumed.catch) resumed.catch(function () {});
    }
  }
  function now() { return ctx.currentTime; }

  function setGain(node, value) {
    if (!node || !ctx) return;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setTargetAtTime(value, ctx.currentTime, 0.015);
  }

  function applyVolumes() {
    setGain(master, enabled ? MASTER_OUTPUT * volumes.master : 0);
    ["cards", "chips", "table"].forEach(function (channel) {
      var bus = channelBuses[channel];
      if (!bus) return;
      setGain(bus.dry, volumes[channel]);
      setGain(bus.wet, volumes[channel]);
    });
    activeSamples.slice().forEach(function (audio) {
      var channel = audio._table21Channel;
      var channelVolume = volumes[channel] == null ? 1 : volumes[channel];
      audio.volume = enabled
        ? Math.max(0, Math.min(1, MASTER_OUTPUT * volumes.master * channelVolume * audio._table21Gain))
        : 0;
    });
  }

  function stopActiveSamples() {
    sampleEpoch++;
    activeSamples.slice().forEach(function (audio) {
      try {
        audio.volume = 0;
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    activeSamples.length = 0;
  }

  function route(node, channel, send) {
    var bus = channelBuses[channel] || channelBuses.table;
    node.connect(bus.dry);
    if (send !== false) node.connect(bus.wet);
  }

  // A single shaped voice routed to dry master + reverb send.
  function voice(opts) {
    var channel = opts.channel || "table";
    if (!enabled || volumes.master <= 0 || volumes[channel] <= 0) return;
    var ac = ensure(); if (!ac) return; resume();
    var t0 = now() + (opts.when || 0);
    var osc = ac.createOscillator();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to != null) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);

    var g = ac.createGain();
    var peak = opts.gain || 0.14;
    var atk = opts.attack || 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    osc.connect(g);
    route(g, channel, opts.send);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  // Shaped noise (filtered) for tactile textures.
  function noise(opts) {
    var channel = opts.channel || "table";
    if (!enabled || volumes.master <= 0 || volumes[channel] <= 0) return;
    var ac = ensure(); if (!ac) return; resume();
    var t0 = now() + (opts.when || 0);
    var dur = opts.dur;
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;

    var filt = ac.createBiquadFilter();
    filt.type = opts.filter || "lowpass";
    filt.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.to != null) filt.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    filt.Q.value = opts.q || 0.7;

    var g = ac.createGain();
    g.gain.setValueAtTime(opts.gain || 0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filt); filt.connect(g); route(g, channel, opts.send === true);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }

  var Sound = {
    setEnabled: function (v) {
      enabled = !!v;
      if (enabled) { preloadSamples(); ensure(); }
      else stopActiveSamples();
      applyVolumes();
    },
    isEnabled: function () { return enabled; },
    unlock: function () { if (enabled) { preloadSamples(); ensure(); resume(); } },
    setVolumes: function (value) {
      volumes = normalizedVolumes(value);
      applyVolumes();
    },
    setVolume: function (channel, value) {
      if (VOLUME_CHANNELS.indexOf(channel) === -1) return;
      volumes[channel] = clampVolume(value, volumes[channel]);
      applyVolumes();
    },
    getVolumes: function () {
      return {
        master: volumes.master,
        cards: volumes.cards,
        chips: volumes.chips,
        table: volumes.table
      };
    },

    // Soft card sliding across felt.
    card: function () {
      sampleTurn++;
      var fallback = function () {
        noise({ channel: "cards", dur: 0.16, gain: 0.11, filter: "lowpass", freq: 3200, to: 520, q: 0.6 });
        noise({ channel: "cards", dur: 0.05, gain: 0.05, filter: "highpass", freq: 5200, when: 0.005 });
      };
      if (!playSample(sampleTurn % 2 ? "card1" : "card2", "cards", .82, .97 + (sampleTurn % 4) * .015, fallback)) fallback();
    },

    // Card flip / hole-card reveal.
    flip: function () {
      var fallback = function () {
        noise({ channel: "cards", dur: 0.12, gain: 0.12, filter: "bandpass", freq: 1800, q: 0.9 });
        voice({ channel: "cards", freq: 240, to: 170, dur: 0.1, type: "sine", gain: 0.05, send: false });
      };
      if (!playSample("flip", "cards", .9, .98, fallback)) fallback();
    },

    // Crisp chip clink — slight pitch drift so stacks sound natural.
    chip: function (i) {
      var k = 1 + ((i || 0) % 5) * 0.045;
      var fallback = function () {
        voice({ channel: "chips", freq: 2100 * k, dur: 0.07, type: "sine", gain: 0.08, attack: 0.002 });
        voice({ channel: "chips", freq: 3150 * k, dur: 0.05, type: "sine", gain: 0.045, attack: 0.002 });
        noise({ channel: "chips", dur: 0.04, gain: 0.06, filter: "highpass", freq: 4000 });
      };
      if (!playSample((i || 0) % 2 ? "chip2" : "chip1", "chips", .86, .96 + ((i || 0) % 5) * .018, fallback)) fallback();
    },

    // Several chips settling onto the felt.
    chipStack: function (n) {
      n = Math.min(n || 1, 5);
      var fallback = function () {
        for (var i = 0; i < n; i++) {
          voice({ channel: "chips", freq: 2000 * (1 + i * 0.05), dur: 0.06, type: "sine", gain: 0.07, when: i * 0.06 });
          noise({ channel: "chips", dur: 0.035, gain: 0.05, filter: "highpass", freq: 4200, when: i * 0.06 });
        }
      };
      if (!playSample("chipStack", "chips", .9, .98 + (n % 3) * .012, fallback)) fallback();
    },

    // Restrained two-note settlement cue.
    win: function () {
      voice({ channel: "table", freq: 392, dur: .28, type: "sine", gain: .055, attack: .018 });
      voice({ channel: "table", freq: 523.25, dur: .34, type: "sine", gain: .045, when: .09, attack: .018 });
    },

    // Slightly fuller, still quiet cue for a natural blackjack.
    blackjack: function () {
      var seq = [392, 493.88, 587.33];
      seq.forEach(function (f, i) {
        voice({ channel: "table", freq: f, dur: .34, type: "sine", gain: .052, when: i * .085, attack: .016 });
      });
    },

    // Muted low settlement cue.
    lose: function () {
      voice({ channel: "table", freq: 246.94, to: 220, dur: .38, type: "sine", gain: .055, attack: .025 });
    },

    // Neutral, calm tone.
    push: function () {
      voice({ channel: "table", freq: 349.23, dur: .28, type: "sine", gain: .045, attack: .025 });
    },

    // Soft muffled thud — no harsh buzz.
    bust: function () {
      voice({ channel: "table", freq: 150, to: 90, dur: 0.34, type: "sine", gain: 0.16, send: false });
      noise({ channel: "table", dur: 0.2, gain: 0.08, filter: "lowpass", freq: 500, to: 160 });
    },

    // Chips being pushed across to the winner.
    chipsPush: function () {
      var fallback = function () {
        noise({ channel: "chips", dur: 0.3, gain: 0.07, filter: "lowpass", freq: 900, to: 300, send: true });
        Sound.chipStack(3);
      };
      if (!playSample("chipsPush", "chips", .86, 1, fallback)) fallback();
    },

    // Cards being squared and placed in the acrylic discard tray.
    collect: function () {
      var fallback = function () { noise({ channel: "cards", dur: .24, gain: .08, filter: "lowpass", freq: 2200, to: 420 }); };
      if (!playSample("card2", "cards", .72, .86, fallback)) fallback();
    },

    // Dealer payment landing beside the original wager.
    payout: function () {
      var fallback = function () { Sound.chipStack(3); };
      if (!playSample("chipStack", "chips", .96, .94, fallback)) fallback();
    },

    // Physical shoe reset and riffle texture.
    shuffle: function () {
      var fallback = function () { noise({ channel: "cards", dur: .72, gain: .09, filter: "bandpass", freq: 1500, q: .55 }); };
      if (!playSample("shuffle", "cards", .84, 1, fallback)) fallback();
    }
  };

  global.Sound = Sound;
})(window);
