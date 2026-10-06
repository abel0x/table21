"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../js/engine.js");

function card(rank, suit) {
  suit = suit || "♠";
  return { rank: rank, suit: suit, color: suit === "♥" || suit === "♦" ? "red" : "black" };
}

[
  ["ace", "A", 11],
  ["two", "2", 2],
  ["three", "3", 3],
  ["four", "4", 4],
  ["five", "5", 5],
  ["six", "6", 6],
  ["seven", "7", 7],
  ["eight", "8", 8],
  ["nine", "9", 9],
  ["ten", "10", 10],
  ["jack", "J", 10],
  ["queen", "Q", 10],
  ["king", "K", 10]
].forEach(function (entry) {
  test("card value matrix: " + entry[0], function () {
    assert.equal(Engine.cardValue(entry[1]), entry[2]);
  });
});

[
  ["empty text", ""],
  ["one", "1"],
  ["eleven", "11"],
  ["partial numeric rank", "10junk"],
  ["lowercase ace", "a"],
  ["whitespace padded rank", " 9 "],
  ["null", null],
  ["undefined", undefined],
  ["not a number", NaN],
  ["object", { rank: "K" }]
].forEach(function (entry) {
  test("invalid card rank is worth zero: " + entry[0], function () {
    assert.equal(Engine.cardValue(entry[1]), 0);
  });
});

[
  ["empty hand", [], 0, false],
  ["single ace", ["A"], 11, true],
  ["two aces", ["A", "A"], 12, true],
  ["three aces", ["A", "A", "A"], 13, true],
  ["soft seventeen", ["A", "6"], 17, true],
  ["hard seventeen after downgrade", ["A", "6", "K"], 17, false],
  ["soft twenty-one with two aces", ["A", "A", "9"], 21, true],
  ["hard twenty-one with two aces", ["A", "A", "9", "K"], 21, false],
  ["soft twenty-one with three aces", ["A", "A", "A", "8"], 21, true],
  ["hard twenty-one with three aces", ["A", "A", "A", "8", "K"], 21, false],
  ["four aces", ["A", "A", "A", "A"], 14, true],
  ["blackjack total", ["A", "K"], 21, true],
  ["three-card twenty-one", ["7", "7", "7"], 21, false],
  ["hard twenty", ["K", "Q"], 20, false],
  ["hard twelve", ["2", "3", "7"], 12, false],
  ["five-card twenty-one", ["2", "3", "4", "5", "7"], 21, false],
  ["bust without ace", ["K", "Q", "2"], 22, false],
  ["bust after every ace downgrades", ["A", "A", "K", "K"], 22, false],
  ["invalid card object contributes zero", [null, "K"], 10, false],
  ["non-array input is an empty hand", null, 0, false]
].forEach(function (entry) {
  test("hand value matrix: " + entry[0], function () {
    var cards = Array.isArray(entry[1]) ? entry[1].map(function (rank) {
      return rank && typeof rank === "object" ? rank : card(rank);
    }) : entry[1];
    assert.deepEqual(Engine.handValue(cards), { total: entry[2], soft: entry[3] });
  });
});

[
  ["natural beats dealer twenty", ["A", "K"], ["K", "Q"], true, "blackjack"],
  ["matching naturals push", ["A", "K"], ["A", "Q"], true, "push"],
  ["split twenty-one beats dealer twenty", ["A", "K"], ["K", "Q"], false, "win"],
  ["three-card twenty-one loses to dealer natural", ["7", "7", "7"], ["A", "K"], true, "lose"],
  ["player bust takes precedence over dealer bust", ["K", "Q", "2"], ["K", "Q", "3"], true, "bust"],
  ["dealer bust awards a live hand", ["10", "8"], ["K", "6", "7"], true, "dealerBust"],
  ["twenty beats nineteen", ["K", "Q"], ["K", "9"], true, "win"],
  ["nineteen loses to twenty", ["K", "9"], ["K", "Q"], true, "lose"],
  ["equal hard totals push", ["10", "8"], ["9", "9"], true, "push"],
  ["equal soft and hard totals push", ["A", "7"], ["10", "8"], true, "push"],
  ["player twenty-one beats dealer twenty", ["7", "7", "7"], ["K", "Q"], true, "win"],
  ["dealer natural beats ordinary twenty-one", ["5", "6", "K"], ["A", "J"], true, "lose"],
  ["sixteen beats dealer bust", ["10", "6"], ["10", "6", "8"], true, "dealerBust"],
  ["seventeen ties dealer seventeen", ["10", "7"], ["9", "8"], true, "push"]
].forEach(function (entry) {
  test("hand resolution matrix: " + entry[0], function () {
    assert.equal(
      Engine.resolveHand(entry[1].map(card), entry[2].map(card), entry[3]),
      entry[4]
    );
  });
});

[
  ["blackjack even wager", "blackjack", 100, 250],
  ["blackjack odd wager rounds down to whole dollars", "blackjack", 101, 252],
  ["even money", "evenMoney", 125, 250],
  ["ordinary win", "win", 125, 250],
  ["dealer bust", "dealerBust", 125, 250],
  ["push", "push", 125, 125],
  ["even surrender", "surrender", 100, 50],
  ["odd surrender", "surrender", 101, 50],
  ["bust", "bust", 125, 0],
  ["loss", "lose", 125, 0],
  ["unknown result", "unknown", 125, 0],
  ["negative wager", "win", -100, 0],
  ["fractional wager is floored", "win", 100.99, 200],
  ["non-numeric wager", "win", "invalid", 0]
].forEach(function (entry) {
  test("payout matrix: " + entry[0], function () {
    assert.equal(Engine.payoutFor(entry[1], entry[2]), entry[3]);
  });
});

[1, 2, 6, 8].forEach(function (decks) {
  test("shoe composition matrix: " + decks + (decks === 1 ? " deck" : " decks"), function () {
    var shoe = Engine.buildShoe(decks);
    assert.equal(shoe.length, decks * 52);
    assert.equal(new Set(shoe.map(function (item) { return item.id; })).size, decks * 52);
    Engine.RANKS.forEach(function (rank) {
      assert.equal(shoe.filter(function (item) { return item.rank === rank; }).length, decks * 4);
    });
    Engine.SUITS.forEach(function (suit) {
      assert.equal(shoe.filter(function (item) { return item.suit === suit.s; }).length, decks * 13);
    });
  });
});

test("shuffle returns the same array instance", function () {
  var cards = [1, 2, 3, 4];
  assert.equal(Engine.shuffle(cards, function () { return 0; }), cards);
});

test("shuffle can produce the identity permutation", function () {
  var cards = [1, 2, 3, 4];
  assert.deepEqual(Engine.shuffle(cards.slice(), function (max) { return max - 1; }), cards);
});

test("shuffle rejects a negative random index", function () {
  assert.throws(function () { Engine.shuffle([1, 2], function () { return -1; }); }, RangeError);
});

test("shuffle rejects an index at the exclusive upper bound", function () {
  assert.throws(function () { Engine.shuffle([1, 2], function (max) { return max; }); }, RangeError);
});

test("shuffle rejects a fractional random index", function () {
  assert.throws(function () { Engine.shuffle([1, 2], function () { return 0.5; }); }, RangeError);
});

test("shuffle rejects a non-array input", function () {
  assert.throws(function () { Engine.shuffle(null); }, TypeError);
});

test("buildShoe rejects zero decks", function () {
  assert.throws(function () { Engine.buildShoe(0); }, RangeError);
});

test("buildShoe rejects a non-numeric deck count", function () {
  assert.throws(function () { Engine.buildShoe("many"); }, RangeError);
});

test("randInt rejects a zero upper bound", function () {
  assert.throws(function () { Engine.randInt(0); }, RangeError);
});

test("randInt rejects a bound larger than uint32", function () {
  assert.throws(function () { Engine.randInt(0x100000001); }, RangeError);
});

[
  ["ordinary win", [{ cards: ["K", "Q"], bet: 100 }], ["K", "9"], {}, "win", 200, 100],
  ["ordinary loss", [{ cards: ["K", "8"], bet: 100 }], ["K", "9"], {}, "lose", 0, -100],
  ["ordinary push", [{ cards: ["K", "8"], bet: 100 }], ["9", "9"], {}, "push", 100, 0],
  ["dealer bust", [{ cards: ["K", "8"], bet: 100 }], ["K", "6", "7"], {}, "dealerBust", 200, 100],
  ["player bust", [{ cards: ["K", "Q", "2"], bet: 100 }], ["K", "8"], {}, "bust", 0, -100],
  ["odd blackjack", [{ cards: ["A", "K"], bet: 101 }], ["K", "Q"], {}, "blackjack", 252, 151],
  ["split twenty-one", [{ cards: ["A", "K"], bet: 100, fromSplit: true }], ["K", "Q"], {}, "win", 200, 100],
  ["odd surrender", [{ cards: ["K", "6"], bet: 101, result: "surrender" }], ["9", "7"], {}, "surrender", 50, -51],
  ["winning insurance", [{ cards: ["K", "9"], bet: 100 }], ["A", "K"], { insuranceStake: 50 }, "lose", 150, 0],
  ["losing insurance with main win", [{ cards: ["K", "Q"], bet: 100 }], ["A", "8"], { insuranceStake: 50 }, "win", 200, 50],
  ["even money against dealer blackjack", [{ cards: ["A", "K"], bet: 100 }], ["A", "Q"], { evenMoney: true, insuranceStake: 50 }, "evenMoney", 200, 100],
  ["even money against non-blackjack", [{ cards: ["A", "K"], bet: 100 }], ["A", "8"], { evenMoney: true }, "evenMoney", 200, 100]
].forEach(function (entry) {
  test("round settlement matrix: " + entry[0], function () {
    var hands = entry[1].map(function (hand) {
      return Object.assign({}, hand, { cards: hand.cards.map(card) });
    });
    var round = Engine.settleRound(hands, entry[2].map(card), entry[3]);
    assert.equal(round.outcomes[0], entry[4]);
    assert.equal(round.totalReturn, entry[5]);
    assert.equal(round.profit, entry[6]);
    assert.equal(round.totalReturn - round.totalStake, round.profit);
  });
});

test("multi-hand settlement aggregates every outcome and stake", function () {
  var round = Engine.settleRound([
    { cards: [card("K"), card("8")], bet: 100 },
    { cards: [card("K"), card("6")], bet: 100 },
    { cards: [card("10"), card("7")], bet: 100 },
    { cards: [card("K"), card("Q"), card("2")], bet: 100 }
  ], [card("9"), card("8")]);
  assert.deepEqual(round.outcomes, ["win", "lose", "push", "bust"]);
  assert.deepEqual(round.counts, { hands: 4, wins: 1, losses: 2, pushes: 1, blackjacks: 0 });
  assert.equal(round.mainStake, 400);
  assert.equal(round.mainReturn, 300);
  assert.equal(round.profit, -100);
});

test("empty round settlement is a zero ledger", function () {
  var round = Engine.settleRound([], []);
  assert.deepEqual(round.outcomes, []);
  assert.deepEqual(round.counts, { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0 });
  assert.equal(round.totalStake, 0);
  assert.equal(round.totalReturn, 0);
  assert.equal(round.profit, 0);
});

test("malformed round inputs are normalized without throwing", function () {
  assert.doesNotThrow(function () { Engine.settleRound(null, null, { evenMoney: true }); });
  var round = Engine.settleRound([null], null, { insuranceStake: "bad" });
  assert.equal(round.totalStake, 0);
  assert.equal(round.totalReturn, 0);
  assert.equal(round.outcomes.length, 1);
});
