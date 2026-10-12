/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Rules = require("../js/rules.js");
var Engine = require("../js/engine.js");

function card(rank) {
  return { rank: rank, suit: "♠", color: "black" };
}

test("the three table profiles expose distinct complete rule sets", function () {
  assert.deepEqual(Rules.PROFILE_IDS, ["lasVegas", "atlanticCity", "european"]);

  assert.equal(Rules.PROFILES.lasVegas.decks, 6);
  assert.equal(Rules.PROFILES.lasVegas.hitSoft17, true);
  assert.equal(Rules.PROFILES.lasVegas.surrender, false);

  assert.equal(Rules.PROFILES.atlanticCity.decks, 8);
  assert.equal(Rules.PROFILES.atlanticCity.hitSoft17, false);
  assert.equal(Rules.PROFILES.atlanticCity.surrender, true);

  assert.equal(Rules.PROFILES.european.dealerHoleCard, false);
  assert.equal(Rules.PROFILES.european.dealerPeeks, false);
  assert.equal(Rules.PROFILES.european.doubleRule, "hard9to11");
  assert.equal(Rules.PROFILES.european.maxHands, 2);
});

test("applying and detecting a profile remains deterministic", function () {
  var settings = { theme: "emerald" };
  Rules.applyProfile(settings, "atlanticCity");
  assert.equal(settings.ruleProfile, "atlanticCity");
  assert.equal(Rules.detectProfile(settings), "atlanticCity");

  settings.decks = 2;
  assert.equal(Rules.detectProfile(settings), "custom");
});

test("European doubling is restricted to hard totals from nine through eleven", function () {
  var european = Rules.getProfile("european");
  assert.equal(Rules.canDouble({ cards: [card("4"), card("5")] }, european, Engine.handValue), true);
  assert.equal(Rules.canDouble({ cards: [card("5"), card("5")] }, european, Engine.handValue), true);
  assert.equal(Rules.canDouble({ cards: [card("6"), card("5")] }, european, Engine.handValue), true);
  assert.equal(Rules.canDouble({ cards: [card("A"), card("8")] }, european, Engine.handValue), false);
  assert.equal(Rules.canDouble({ cards: [card("7"), card("5")] }, european, Engine.handValue), false);

  var vegas = Rules.getProfile("lasVegas");
  assert.equal(Rules.canDouble({ cards: [card("2"), card("3")] }, vegas, Engine.handValue), true);
});
