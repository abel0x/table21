/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function loadSound() {
  var context = {};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../js/sound.js"), "utf8"),
    context
  );
  return context.Sound;
}

test("sound levels normalize and clamp without requiring Web Audio", function () {
  var Sound = loadSound();
  Sound.setVolumes({ master: 0.35, cards: 2, chips: -1, table: "invalid" });

  assert.deepEqual(JSON.parse(JSON.stringify(Sound.getVolumes())), {
    master: 0.35,
    cards: 1,
    chips: 0,
    table: 1
  });

  Sound.setVolume("cards", 0.45);
  Sound.setVolume("master", 5);
  Sound.setVolume("unknown", 0);
  assert.deepEqual(JSON.parse(JSON.stringify(Sound.getVolumes())), {
    master: 1,
    cards: 0.45,
    chips: 0,
    table: 1
  });
});

test("every sound category remains safe when audio is unavailable or muted", function () {
  var Sound = loadSound();
  Sound.setEnabled(false);

  assert.doesNotThrow(function () {
    Sound.card();
    Sound.flip();
    Sound.chip();
    Sound.chipStack(3);
    Sound.win();
    Sound.blackjack();
    Sound.lose();
    Sound.push();
    Sound.bust();
    Sound.chipsPush();
    Sound.collect();
    Sound.payout();
    Sound.shuffle();
  });
});
