"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var source = fs.readFileSync(path.resolve(__dirname, "../js/sound.js"), "utf8");

function loadWithAudio() {
  var templates = [];
  var played = [];
  function MockAudio(src) {
    this.src = src;
    this.volume = 1;
    this.playbackRate = 1;
    this.currentTime = 0;
    this.paused = false;
    this.listeners = {};
    if (src) templates.push(this);
  }
  MockAudio.prototype.cloneNode = function () {
    var clone = new MockAudio();
    clone.src = this.src;
    return clone;
  };
  MockAudio.prototype.addEventListener = function (name, listener) {
    this.listeners[name] = listener;
  };
  MockAudio.prototype.play = function () {
    played.push(this);
    return Promise.resolve();
  };
  MockAudio.prototype.pause = function () { this.paused = true; };

  var context = { Audio: MockAudio };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { Sound: context.Sound, templates: templates, played: played };
}

[
  ["master below zero", "master", -1, 0],
  ["master above one", "master", 2, 1],
  ["cards numeric text", "cards", "0.4", 0.4],
  ["cards invalid text keeps prior value", "cards", "bad", 1],
  ["chips null becomes zero", "chips", null, 0],
  ["chips infinity keeps prior value", "chips", Infinity, 1],
  ["table exact zero", "table", 0, 0],
  ["table exact one", "table", 1, 1]
].forEach(function (entry) {
  test("individual sound-volume normalization: " + entry[0], function () {
    var loaded = loadWithAudio();
    loaded.Sound.setVolume(entry[1], entry[2]);
    assert.equal(loaded.Sound.getVolumes()[entry[1]], entry[3]);
  });
});

test("unknown sound channels are ignored", function () {
  var loaded = loadWithAudio();
  var before = loaded.Sound.getVolumes();
  loaded.Sound.setVolume("voice", 0);
  assert.deepEqual(loaded.Sound.getVolumes(), before);
});

test("enabling sound preloads each bundled sample once", function () {
  var loaded = loadWithAudio();
  loaded.Sound.setEnabled(true);
  loaded.Sound.setEnabled(true);
  assert.equal(loaded.templates.length, 8);
  assert.equal(new Set(loaded.templates.map(function (audio) { return audio.src; })).size, 8);
});

test("card playback alternates between the two slide samples", function () {
  var loaded = loadWithAudio();
  loaded.Sound.card();
  loaded.Sound.card();
  assert.equal(loaded.played.length, 2);
  assert.notEqual(loaded.played[0].src, loaded.played[1].src);
  assert.match(loaded.played[0].src, /card-slide-[12]\.ogg$/);
  assert.match(loaded.played[1].src, /card-slide-[12]\.ogg$/);
});

test("chip playback alternates between local click samples", function () {
  var loaded = loadWithAudio();
  loaded.Sound.chip(0);
  loaded.Sound.chip(1);
  assert.equal(loaded.played.length, 2);
  assert.match(loaded.played[0].src, /chip-click-1\.ogg$/);
  assert.match(loaded.played[1].src, /chip-click-2\.ogg$/);
});

test("sample playback volume combines master, channel, and cue gain", function () {
  var loaded = loadWithAudio();
  loaded.Sound.setVolumes({ master: 0.5, cards: 0.4, chips: 1, table: 1 });
  loaded.Sound.card();
  assert.equal(loaded.played.length, 1);
  assert.ok(Math.abs(loaded.played[0].volume - 0.9 * 0.5 * 0.4 * 0.82) < 1e-12);
});

test("changing master volume updates a sample already in flight", function () {
  var loaded = loadWithAudio();
  loaded.Sound.card();
  var sample = loaded.played[0];
  loaded.Sound.setVolume("master", 0.25);
  assert.ok(Math.abs(sample.volume - 0.9 * 0.25 * 1 * 0.82) < 1e-12);
});

test("changing category volume updates only its active sample level", function () {
  var loaded = loadWithAudio();
  loaded.Sound.card();
  var sample = loaded.played[0];
  loaded.Sound.setVolume("cards", 0.3);
  assert.ok(Math.abs(sample.volume - 0.9 * 1 * 0.3 * 0.82) < 1e-12);
});

test("muting pauses and rewinds every active sample immediately", function () {
  var loaded = loadWithAudio();
  loaded.Sound.card();
  loaded.Sound.chip(0);
  loaded.Sound.shuffle();
  var active = loaded.played.slice();
  loaded.Sound.setEnabled(false);
  active.forEach(function (sample) {
    assert.equal(sample.paused, true);
    assert.equal(sample.currentTime, 0);
    assert.equal(sample.volume, 0);
  });
});

test("muted sound never starts new samples", function () {
  var loaded = loadWithAudio();
  loaded.Sound.setEnabled(false);
  loaded.Sound.card();
  loaded.Sound.chip();
  loaded.Sound.shuffle();
  assert.equal(loaded.played.length, 0);
});

test("zero master volume suppresses sample playback", function () {
  var loaded = loadWithAudio();
  loaded.Sound.setVolume("master", 0);
  loaded.Sound.card();
  assert.equal(loaded.played.length, 0);
});

test("zero card volume suppresses only card samples", function () {
  var loaded = loadWithAudio();
  loaded.Sound.setVolume("cards", 0);
  loaded.Sound.card();
  loaded.Sound.chip();
  assert.equal(loaded.played.length, 1);
  assert.match(loaded.played[0].src, /chip-click-1\.ogg$/);
});

test("sample playback rates remain in the safe range", function () {
  var loaded = loadWithAudio();
  loaded.Sound.card();
  loaded.Sound.chip(99);
  loaded.Sound.shuffle();
  loaded.played.forEach(function (sample) {
    assert.ok(sample.playbackRate >= 0.8);
    assert.ok(sample.playbackRate <= 1.2);
  });
});
