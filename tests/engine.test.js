/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../js/engine.js");

function card(rank, suit) {
  suit = suit || "♠";
  return { rank: rank, suit: suit, color: suit === "♥" || suit === "♦" ? "red" : "black" };
}

test("ace values stay soft only while an ace can count as eleven", function () {
  assert.deepEqual(Engine.handValue([card("A"), card("6")]), { total: 17, soft: true });
  assert.deepEqual(Engine.handValue([card("A"), card("A"), card("9")]), { total: 21, soft: true });
  assert.deepEqual(Engine.handValue([card("A"), card("A"), card("9"), card("K")]), { total: 21, soft: false });
});

test("live soft totals show both counts; settled hands and soft 21 show one", function () {
  assert.equal(Engine.totalLabel([card("A"), card("6")], true), "7/17");
  assert.equal(Engine.totalLabel([card("A")], true), "1/11");
  assert.equal(Engine.totalLabel([card("A"), card("A")], true), "2/12");
  assert.equal(Engine.totalLabel([card("A"), card("6")], false), "17");
  assert.equal(Engine.totalLabel([card("A"), card("K")], true), "21");
  assert.equal(Engine.totalLabel([card("A"), card("5"), card("5")], true), "21");
  assert.equal(Engine.totalLabel([card("A"), card("6"), card("9")], true), "16");
  assert.equal(Engine.totalLabel([card("10"), card("6")], true), "16");
  assert.equal(Engine.totalLabel([card("10"), card("6"), card("9")], true), "25");
});

test("a shoe has the right composition and physical card ids", function () {
  var shoe = Engine.buildShoe(2);
  assert.equal(shoe.length, 104);
  assert.equal(new Set(shoe.map(function (item) { return item.id; })).size, 104);
  assert.equal(shoe.filter(function (item) { return item.rank === "A"; }).length, 8);
});

test("Fisher-Yates accepts a deterministic index source without losing cards", function () {
  var cards = [1, 2, 3, 4, 5];
  var shuffled = Engine.shuffle(cards.slice(), function () { return 0; });
  assert.deepEqual(shuffled, [2, 3, 4, 5, 1]);
  assert.deepEqual(shuffled.slice().sort(), cards);
});

test("natural blackjack pays 3:2 while split twenty-one pays 1:1", function () {
  var dealer = [card("K"), card("Q")];
  var natural = Engine.settleRound([{ cards: [card("A"), card("K")], bet: 100 }], dealer);
  assert.equal(natural.outcomes[0], "blackjack");
  assert.equal(natural.totalReturn, 250);
  assert.equal(natural.profit, 150);

  var splitTwentyOne = Engine.settleRound([
    { cards: [card("A"), card("K")], bet: 100, fromSplit: true }
  ], dealer);
  assert.equal(splitTwentyOne.outcomes[0], "win");
  assert.equal(splitTwentyOne.totalReturn, 200);
  assert.equal(splitTwentyOne.profit, 100);
});

test("dealer blackjack, bust, push, and ordinary comparisons resolve correctly", function () {
  assert.equal(Engine.resolveHand([card("10"), card("9")], [card("A"), card("K")]), "lose");
  assert.equal(Engine.resolveHand([card("K"), card("Q"), card("2")], [card("10"), card("8")]), "bust");
  assert.equal(Engine.resolveHand([card("10"), card("8")], [card("9"), card("9")]), "push");
  assert.equal(Engine.resolveHand([card("10"), card("9")], [card("K"), card("6"), card("8")]), "dealerBust");
});

test("insurance is included in the real round profit", function () {
  var covered = Engine.settleRound(
    [{ cards: [card("10"), card("9")], bet: 100 }],
    [card("A"), card("K")],
    { insuranceStake: 50 }
  );
  assert.equal(covered.mainReturn, 0);
  assert.equal(covered.insuranceReturn, 150);
  assert.equal(covered.totalStake, 150);
  assert.equal(covered.profit, 0);

  var wonHandLostInsurance = Engine.settleRound(
    [{ cards: [card("K"), card("Q")], bet: 100 }],
    [card("A"), card("8")],
    { insuranceStake: 50 }
  );
  assert.equal(wonHandLostInsurance.insuranceReturn, 0);
  assert.equal(wonHandLostInsurance.profit, 50);
});

test("even money guarantees a 1:1 blackjack profit with no extra bankroll", function () {
  [[card("A"), card("K")], [card("A"), card("8")]].forEach(function (dealer) {
    var result = Engine.settleRound(
      [{ cards: [card("A"), card("Q")], bet: 100 }],
      dealer,
      { evenMoney: true }
    );
    assert.equal(result.outcomes[0], "evenMoney");
    assert.equal(result.totalReturn, 200);
    assert.equal(result.profit, 100);
    assert.equal(result.counts.blackjacks, 1);
  });
});

test("surrender returns half the stake and accounts for odd wagers exactly", function () {
  assert.equal(Engine.payoutFor("surrender", 101), 50);
  var result = Engine.settleRound(
    [{ cards: [card("10"), card("6")], bet: 101, result: "surrender" }],
    [card("9"), card("7")]
  );
  assert.equal(result.profit, -51);
  assert.equal(result.counts.losses, 1);
});
