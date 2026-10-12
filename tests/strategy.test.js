/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Strategy = require("../js/strategy.js");

var UPS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
var ALL = { double: true, split: true, surrender: true };
var SHOE_S17 = { decks: 8, hitSoft17: false, dealerHoleCard: true, doubleAfterSplit: true };
var SHOE_H17 = { decks: 6, hitSoft17: true, dealerHoleCard: true, doubleAfterSplit: true };
var CODE = { H: "hit", S: "stand", D: "double", P: "split", R: "surrender" };

function hand(ranks) { return ranks.map(function (rank) { return { rank: rank }; }); }
function play(ranks, up, rules, allowed) {
  return Strategy.recommend(hand(ranks), up, rules, allowed || ALL).action;
}
// One chart row: ten letters for dealer 2..A.
function row(label, ranks, rules, letters, allowed) {
  test("4-8 deck chart: " + label, function () {
    UPS.forEach(function (up, index) {
      assert.equal(play(ranks, up, rules, allowed), CODE[letters[index]], label + " vs " + up);
    });
  });
}

// Standard multi-deck chart, dealer stands on soft 17, DAS, late surrender.
//                                       2 3 4 5 6 7 8 9 T A
row("hard 5", ["2", "3"], SHOE_S17,     "HHHHHHHHHH");
row("hard 8", ["5", "3"], SHOE_S17,     "HHHHHHHHHH");
row("hard 9", ["5", "4"], SHOE_S17,     "HDDDDHHHHH");
row("hard 10", ["6", "4"], SHOE_S17,    "DDDDDDDDHH");
row("hard 11", ["6", "5"], SHOE_S17,    "DDDDDDDDDH");
row("hard 12", ["10", "2"], SHOE_S17,   "HHSSSHHHHH");
row("hard 13", ["10", "3"], SHOE_S17,   "SSSSSHHHHH");
row("hard 14", ["10", "4"], SHOE_S17,   "SSSSSHHHHH");
row("hard 15", ["10", "5"], SHOE_S17,   "SSSSSHHHRH");
row("hard 16", ["10", "6"], SHOE_S17,   "SSSSSHHRRR");
row("hard 17", ["10", "7"], SHOE_S17,   "SSSSSSSSSS");
row("soft 13", ["A", "2"], SHOE_S17,    "HHHDDHHHHH");
row("soft 14", ["A", "3"], SHOE_S17,    "HHHDDHHHHH");
row("soft 15", ["A", "4"], SHOE_S17,    "HHDDDHHHHH");
row("soft 16", ["A", "5"], SHOE_S17,    "HHDDDHHHHH");
row("soft 17", ["A", "6"], SHOE_S17,    "HDDDDHHHHH");
row("soft 18", ["A", "7"], SHOE_S17,    "SDDDDSSHHH");
row("soft 19", ["A", "8"], SHOE_S17,    "SSSSSSSSSS");
row("soft 20", ["A", "9"], SHOE_S17,    "SSSSSSSSSS");
row("2,2", ["2", "2"], SHOE_S17,        "PPPPPPHHHH");
row("3,3", ["3", "3"], SHOE_S17,        "PPPPPPHHHH");
row("4,4", ["4", "4"], SHOE_S17,        "HHHPPHHHHH");
row("5,5", ["5", "5"], SHOE_S17,        "DDDDDDDDHH");
row("6,6", ["6", "6"], SHOE_S17,        "PPPPPHHHHH");
row("7,7", ["7", "7"], SHOE_S17,        "PPPPPPHHHH");
row("8,8", ["8", "8"], SHOE_S17,        "PPPPPPPPPP");
row("9,9", ["9", "9"], SHOE_S17,        "PPPPPSPPSS");
row("10,10", ["10", "10"], SHOE_S17,    "SSSSSSSSSS");
row("K,10", ["K", "10"], SHOE_S17,      "SSSSSSSSSS");
row("A,A", ["A", "A"], SHOE_S17,        "PPPPPPPPPP");

// Dealer hits soft 17: the published H17 differences.
row("H17 hard 11", ["6", "5"], SHOE_H17, "DDDDDDDDDD");
row("H17 hard 15", ["10", "5"], SHOE_H17, "SSSSSHHHRR");
row("H17 hard 17", ["10", "7"], SHOE_H17, "SSSSSSSSSR");
row("H17 soft 18", ["A", "7"], SHOE_H17, "DDDDDSSHHH");
row("H17 soft 19", ["A", "8"], SHOE_H17, "SSSSDSSSSS");
row("H17 8,8", ["8", "8"], SHOE_H17,     "PPPPPPPPPR");

// Without double after split the marginal splits disappear.
var NO_DAS = Object.assign({}, SHOE_S17, { doubleAfterSplit: false });
row("no-DAS 2,2", ["2", "2"], NO_DAS, "HHPPPPHHHH");
row("no-DAS 4,4", ["4", "4"], NO_DAS, "HHHHHHHHHH");
row("no-DAS 6,6", ["6", "6"], NO_DAS, "HPPPPHHHHH");

test("two decks: double 9 vs 2, double 11 vs Ace, split 6s vs 7, surrender 16 only vs 10/A", function () {
  var rules = { decks: 2, hitSoft17: false, dealerHoleCard: true, doubleAfterSplit: true };
  assert.equal(play(["5", "4"], "2", rules), "double");
  assert.equal(play(["6", "5"], "A", rules), "double");
  assert.equal(play(["6", "6"], "7", rules), "split");
  assert.equal(play(["7", "7"], "8", rules), "hit");
  assert.equal(play(["10", "6"], "9", rules), "hit");
  assert.equal(play(["10", "6"], "10", rules), "surrender");
  assert.equal(play(["A", "7"], "A", rules), "hit");
});

test("one deck: double 8 vs 5-6, soft 13 vs 4, soft 17 vs 2, stand soft 18 vs Ace", function () {
  var rules = { decks: 1, hitSoft17: false, dealerHoleCard: true, doubleAfterSplit: true };
  assert.equal(play(["5", "3"], "5", rules), "double");
  assert.equal(play(["5", "3"], "4", rules), "hit");
  assert.equal(play(["A", "2"], "4", rules), "double");
  assert.equal(play(["A", "6"], "2", rules), "double");
  assert.equal(play(["A", "7"], "A", rules), "stand");
  assert.equal(play(["A", "8"], "6", rules), "double");
  assert.equal(play(["3", "3"], "8", rules), "split");
  assert.equal(play(["4", "4"], "4", rules), "split");
  assert.equal(play(["7", "7"], "8", rules), "split");
});

test("no hole card: never risk extra stakes on 11, 8s or Aces against 10 or Ace", function () {
  var european = { decks: 6, hitSoft17: false, dealerHoleCard: false, doubleAfterSplit: true };
  var offered = { double: true, split: true, surrender: false };
  function play(ranks, up, rules) { return Strategy.recommend(hand(ranks), up, rules, offered).action; }
  assert.equal(play(["6", "5"], "10", european), "hit");
  assert.equal(play(["6", "5"], "A", european), "hit");
  assert.equal(play(["6", "5"], "9", european), "double");
  assert.equal(play(["8", "8"], "10", european), "hit");
  assert.equal(play(["8", "8"], "A", european), "hit");
  assert.equal(play(["8", "8"], "9", european), "split");
  assert.equal(play(["A", "A"], "A", european), "hit");
  assert.equal(play(["A", "A"], "10", european), "split");
});

test("unavailable plays fall back: Ds stands, D hits, R hits, Rp splits", function () {
  var none = { double: false, split: false, surrender: false };
  assert.equal(play(["A", "7"], "4", SHOE_S17, none), "stand");
  assert.equal(play(["6", "5"], "6", SHOE_S17, none), "hit");
  assert.equal(play(["10", "6"], "10", SHOE_S17, none), "hit");
  assert.equal(play(["8", "8"], "A", SHOE_H17, { double: true, split: true, surrender: false }), "split");
  assert.equal(play(["10", "7"], "A", SHOE_H17, none), "stand");
  // A pair that cannot be split is played on its total.
  assert.equal(play(["8", "8"], "10", SHOE_S17, { double: true, split: false, surrender: true }), "surrender");
  assert.equal(play(["A", "A"], "6", SHOE_S17, { double: true, split: false, surrender: false }), "hit");
});

test("multi-card hands use totals, and soft hands never surrender", function () {
  assert.equal(play(["A", "2", "4"], "5", SHOE_S17, { double: false, split: false, surrender: false }), "hit");
  assert.equal(play(["5", "6", "5"], "10", SHOE_S17, { double: false, split: false, surrender: false }), "hit");
  assert.equal(play(["A", "5"], "10", SHOE_S17), "hit");
  assert.equal(play(["A", "2", "3", "3"], "7", SHOE_S17), "stand");
  assert.equal(play(["2", "3", "A", "A", "9"], "7", SHOE_S17), "hit");
});

test("every recommendation is a play the table actually offers", function () {
  var ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var ruleSets = [];
  [1, 2, 6, 8].forEach(function (decks) {
    [false, true].forEach(function (hitSoft17) {
      [false, true].forEach(function (dealerHoleCard) {
        [false, true].forEach(function (doubleAfterSplit) {
          ruleSets.push({ decks: decks, hitSoft17: hitSoft17, dealerHoleCard: dealerHoleCard, doubleAfterSplit: doubleAfterSplit });
        });
      });
    });
  });
  var checked = 0;
  ruleSets.forEach(function (rules) {
    for (var mask = 0; mask < 8; mask++) {
      var allowed = { double: !!(mask & 1), split: !!(mask & 2), surrender: !!(mask & 4) };
      ranks.forEach(function (a) {
        ranks.forEach(function (b) {
          UPS.forEach(function (up) {
            var result = Strategy.recommend(hand([a, b]), up, rules, allowed);
            assert.ok(Strategy.ACTIONS.indexOf(result.action) !== -1);
            if (result.action === "double") assert.ok(allowed.double);
            if (result.action === "split") assert.ok(allowed.split);
            if (result.action === "surrender") assert.ok(allowed.surrender);
            if (result.kind === "hard" && result.total >= 18) assert.equal(result.action, "stand");
            if (result.kind === "soft" && result.total >= 20) assert.equal(result.action, "stand");
            if (result.kind === "pair") assert.notEqual(result.pairRank, "10");
            checked++;
          });
        });
      });
    }
  });
  assert.equal(checked, 32 * 8 * 13 * 13 * 10);
});

test("the coach always declines insurance and even money", function () {
  assert.equal(Strategy.takeInsurance(), false);
});

test("invalid input is rejected instead of guessed", function () {
  assert.throws(function () { Strategy.recommend([], "5", SHOE_S17, ALL); }, /needs cards/);
  assert.throws(function () { Strategy.recommend(hand(["5", "6"]), "1", SHOE_S17, ALL); }, /up-card/);
});

test("results describe the deciding chart for coach messages", function () {
  assert.deepEqual(Strategy.recommend(hand(["8", "8"]), "10", SHOE_S17, ALL), { total: 16, kind: "pair", pairRank: "8", action: "split" });
  assert.deepEqual(Strategy.recommend(hand(["K", "Q"]), "10", SHOE_S17, ALL), { total: 20, kind: "hard", pairRank: null, action: "stand" });
  assert.deepEqual(Strategy.recommend(hand(["A", "7"]), "9", SHOE_S17, ALL), { total: 18, kind: "soft", pairRank: null, action: "hit" });
});
