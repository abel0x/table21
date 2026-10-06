"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Rules = require("../js/rules.js");
var Engine = require("../js/engine.js");

function card(rank) {
  return { rank: String(rank), suit: "♠", color: "black" };
}

Rules.PROFILE_IDS.forEach(function (profileId) {
  test("profile copies are isolated: " + profileId, function () {
    var first = Rules.getProfile(profileId);
    var second = Rules.getProfile(profileId);
    assert.notEqual(first, second);
    first.decks = 99;
    assert.notEqual(first.decks, second.decks);
    assert.equal(Rules.detectProfile(second), profileId);
  });
});

[
  ["Las Vegas id", "lasVegas", true],
  ["Atlantic City id", "atlanticCity", true],
  ["European id", "european", true],
  ["custom is not a preset", "custom", false],
  ["case-sensitive id", "LasVegas", false],
  ["null id", null, false]
].forEach(function (entry) {
  test("profile id validation: " + entry[0], function () {
    assert.equal(Rules.isProfile(entry[1]), entry[2]);
  });
});

Rules.PROFILE_IDS.forEach(function (profileId) {
  Rules.RULE_FIELDS.forEach(function (field) {
    test("profile detection rejects a changed " + profileId + " " + field, function () {
      var settings = Rules.getProfile(profileId);
      if (typeof settings[field] === "boolean") settings[field] = !settings[field];
      else if (typeof settings[field] === "number") settings[field] += 1;
      else settings[field] += "-changed";
      assert.equal(Rules.detectProfile(settings), "custom");
    });
  });
});

test("profile detection handles a missing settings object", function () {
  assert.equal(Rules.detectProfile(null), "custom");
});

test("applying a profile creates a target when needed", function () {
  var result = Rules.applyProfile(null, "european");
  assert.equal(result.ruleProfile, "european");
  assert.equal(result.dealerHoleCard, false);
  assert.equal(result.maxHands, 2);
});

test("applying an invalid profile preserves a valid target", function () {
  var target = { theme: "emerald" };
  assert.equal(Rules.applyProfile(target, "unknown"), target);
  assert.deepEqual(target, { theme: "emerald" });
});

test("getting an invalid profile returns null", function () {
  assert.equal(Rules.getProfile("unknown"), null);
});

for (var total = 4; total <= 20; total++) {
  (function (hardTotal) {
    test("European hard-total doubling decision at " + hardTotal, function () {
      var first = Math.min(10, hardTotal - 2);
      var second = hardTotal - first;
      var hand = { cards: [card(first), card(second)] };
      assert.equal(
        Rules.canDouble(hand, Rules.getProfile("european"), Engine.handValue),
        hardTotal >= 9 && hardTotal <= 11
      );
    });
  })(total);
}

[2, 3, 4, 5, 6, 7, 8, 9].forEach(function (secondRank) {
  test("European rules reject soft " + (11 + secondRank) + " for doubling", function () {
    var hand = { cards: [card("A"), card(secondRank)] };
    assert.equal(Rules.canDouble(hand, Rules.getProfile("european"), Engine.handValue), false);
  });
});

test("any-two rules allow a low hard total", function () {
  assert.equal(Rules.canDouble(
    { cards: [card(2), card(2)] }, Rules.getProfile("atlanticCity"), Engine.handValue
  ), true);
});

test("any-two rules allow a soft total", function () {
  assert.equal(Rules.canDouble(
    { cards: [card("A"), card(7)] }, Rules.getProfile("lasVegas"), Engine.handValue
  ), true);
});

test("doubling after a split follows the table flag", function () {
  var settings = Rules.getProfile("atlanticCity");
  settings.doubleAfterSplit = false;
  assert.equal(Rules.canDouble(
    { cards: [card(5), card(5)], fromSplit: true }, settings, Engine.handValue
  ), false);
});

test("doubling after a split remains available when enabled", function () {
  var settings = Rules.getProfile("atlanticCity");
  assert.equal(Rules.canDouble(
    { cards: [card(5), card(5)], fromSplit: true }, settings, Engine.handValue
  ), true);
});

test("split aces cannot be doubled", function () {
  assert.equal(Rules.canDouble(
    { cards: [card("A"), card(9)], splitAces: true }, Rules.getProfile("atlanticCity"), Engine.handValue
  ), false);
});

test("a previously doubled hand cannot double again", function () {
  assert.equal(Rules.canDouble(
    { cards: [card(5), card(5)], doubled: true }, Rules.getProfile("atlanticCity"), Engine.handValue
  ), false);
});

test("a one-card hand cannot double", function () {
  assert.equal(Rules.canDouble(
    { cards: [card(10)] }, Rules.getProfile("atlanticCity"), Engine.handValue
  ), false);
});

test("a three-card hand cannot double", function () {
  assert.equal(Rules.canDouble(
    { cards: [card(2), card(3), card(4)] }, Rules.getProfile("atlanticCity"), Engine.handValue
  ), false);
});

test("a missing hand cannot double", function () {
  assert.equal(Rules.canDouble(null, Rules.getProfile("atlanticCity"), Engine.handValue), false);
});

test("missing settings cannot authorize doubling", function () {
  assert.equal(Rules.canDouble({ cards: [card(5), card(5)] }, null, Engine.handValue), false);
});

test("missing evaluator cannot authorize doubling", function () {
  assert.equal(Rules.canDouble({ cards: [card(5), card(5)] }, Rules.getProfile("atlanticCity")), false);
});

test("an unknown doubling rule fails closed", function () {
  var settings = Rules.getProfile("atlanticCity");
  settings.doubleRule = "mystery";
  assert.equal(Rules.canDouble({ cards: [card(5), card(5)] }, settings, Engine.handValue), false);
});
