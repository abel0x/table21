"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var Engine = require("../js/engine.js");
var Rules = require("../js/rules.js");
var RoundStore = require("../js/round.js");

function settings(profile) {
  return Rules.applyProfile({}, profile || "atlanticCity");
}
function context(rules) {
  return { rules: rules, ruleFields: Rules.RULE_FIELDS, ranks: Engine.RANKS, suits: Engine.SUITS, maxWager: Engine.MAX_WAGER };
}
function take(shoe, rank) {
  var index = shoe.findIndex(function (card) { return card.rank === rank; });
  return shoe.splice(index, 1)[0];
}

// A split, doubled round waiting for the second hand: the richest live state.
function liveState(profile) {
  var rules = settings(profile);
  var shoe = Engine.buildShoe(rules.decks);
  var drawn = 0;
  var draw = function (rank) { drawn++; return take(shoe, rank); };
  var state = {
    settings: rules,
    bet: 100,
    lastBet: 100,
    roundStakeLimit: 1000000,
    hands: [
      { cards: [draw("8"), draw("3"), draw("10")], bet: 200, done: true, doubled: true, splitAces: false, fromSplit: true },
      { cards: [draw("8"), draw("2")], bet: 100, done: false, doubled: false, splitAces: false, fromSplit: true }
    ],
    active: 1,
    dealer: { cards: rules.dealerHoleCard ? [draw("6"), draw("K")] : [draw("6")], hideHole: rules.dealerHoleCard },
    pendingDeal: [],
    insurance: 0,
    insuranceMode: null,
    evenMoney: false,
    shoe: shoe,
    discarded: drawn + 12,
    discardTrayCount: 12
  };
  // Twelve cards from earlier rounds sit in the discard tray.
  state.shoe.splice(0, 12);
  return state;
}
function roundTrip(state, mode) {
  return JSON.parse(JSON.stringify(RoundStore.capture(state, mode, Rules.RULE_FIELDS)));
}

test("a captured live round restores exactly, with its total stake", function () {
  var state = liveState();
  var raw = roundTrip(state, "player");
  var round = RoundStore.restore(raw, context(state.settings));
  assert.ok(round);
  assert.equal(round.resume, "player");
  assert.equal(round.stake, 300);
  assert.equal(round.active, 1);
  assert.deepEqual(round.hands.map(function (hand) { return hand.cards.map(function (card) { return card.rank; }); }), [["8", "3", "10"], ["8", "2"]]);
  assert.deepEqual(round.dealer.cards, state.dealer.cards);
  assert.deepEqual(round.shoe, state.shoe);
  assert.equal(round.discarded, state.discarded);
  assert.equal(round.hands[0].doubled, true);
});

test("an eight-deck snapshot stays small enough to write on every decision", function () {
  assert.ok(JSON.stringify(roundTrip(liveState(), "player")).length < 4500);
});

test("the opening deal is saved before any card is shown and restores the same cards", function () {
  var rules = settings();
  var shoe = Engine.buildShoe(rules.decks);
  var pending = [shoe.pop(), shoe.pop(), shoe.pop(), shoe.pop()];
  var state = {
    settings: rules, bet: 500, lastBet: 500, roundStakeLimit: 9000,
    hands: [{ cards: [], bet: 500, done: false, doubled: false, splitAces: false, fromSplit: false }],
    active: 0, dealer: { cards: [], hideHole: true }, pendingDeal: pending,
    insurance: 0, insuranceMode: null, evenMoney: false, shoe: shoe, discarded: 4, discardTrayCount: 0
  };
  var round = RoundStore.restore(roundTrip(state, "deal"), context(rules));
  assert.deepEqual(round.pending, pending);
  assert.equal(round.stake, 500);
  assert.equal(RoundStore.restore(Object.assign(roundTrip(state, "deal"), { pending: [pending[0].id] }), context(rules)), null);
});

test("an insurance offer restores only with an Ace up and one unsplit hand", function () {
  var rules = settings();
  var shoe = Engine.buildShoe(rules.decks);
  var state = {
    settings: rules, bet: 100, lastBet: 100, roundStakeLimit: 9000,
    hands: [{ cards: [take(shoe, "A"), take(shoe, "K")], bet: 100, done: false, doubled: false, splitAces: false, fromSplit: false }],
    active: 0, dealer: { cards: [take(shoe, "A"), take(shoe, "7")], hideHole: true }, pendingDeal: [],
    insurance: 0, insuranceMode: "evenMoney", evenMoney: false, shoe: shoe, discarded: 4, discardTrayCount: 0
  };
  assert.equal(RoundStore.restore(roundTrip(state, "insurance"), context(rules)).insuranceMode, "evenMoney");
  state.dealer.cards[0] = take(shoe, "9"); state.discarded++;
  assert.equal(RoundStore.restore(roundTrip(state, "insurance"), context(rules)), null);
});

test("a no-hole-card table saves the dealer's single up-card", function () {
  var state = liveState("european");
  assert.equal(state.dealer.cards.length, 1);
  assert.ok(RoundStore.restore(roundTrip(state, "dealer"), context(state.settings)));
});

[
  ["missing snapshot", function () { return null; }],
  ["a different version", function (raw) { raw.v = 2; }],
  ["an unknown resume point", function (raw) { raw.resume = "payout"; }],
  ["changed table rules", function (raw) { raw.rules.hitSoft17 = !raw.rules.hitSoft17; }],
  ["a card id from a deck the shoe does not have", function (raw) { raw.shoe[0] = "8-0-0"; }],
  ["a malformed card id", function (raw) { raw.hands[1].cards[0] = "Q of spades"; }],
  ["a duplicated card", function (raw) { raw.shoe[0] = raw.hands[0].cards[0]; }],
  ["a card missing from the shoe count", function (raw) { raw.shoe.pop(); }],
  ["a draw count that does not match the shoe", function (raw) { raw.discarded = 3; }],
  ["a tray holding more than was drawn", function (raw) { raw.discardTrayCount = raw.discarded + 1; }],
  ["the active hand out of range", function (raw) { raw.active = 2; }],
  ["a fractional stake", function (raw) { raw.hands[1].bet = 100.5; }],
  ["a stake above the table maximum", function (raw) { raw.hands[1].bet = Engine.MAX_WAGER + 1; }],
  ["a doubled hand without its third card", function (raw) { raw.shoe.push(raw.hands[0].cards.pop()); raw.discarded--; }],
  ["a waiting hand that is already finished", function (raw) { raw.hands[1].done = true; }],
  ["more hands than the table allows", function (raw) { raw.hands = raw.hands.concat(raw.hands, raw.hands); }],
  ["an insurance choice outside the insurance offer", function (raw) { raw.insuranceMode = "insurance"; }],
  ["even money outside the reveal", function (raw) { raw.evenMoney = true; }],
  ["a flag that is not a boolean", function (raw) { raw.hands[0].doubled = "yes"; }],
  ["a hidden pending deal mid-round", function (raw) { raw.pending = [raw.shoe.pop()]; raw.discarded++; }]
].forEach(function (entry) {
  test("a snapshot is rejected for " + entry[0], function () {
    var state = liveState();
    var raw = roundTrip(state, "player");
    var replaced = entry[1](raw);
    assert.equal(RoundStore.restore(replaced === undefined ? raw : replaced, context(state.settings)), null);
  });
});

test("every resume point the game writes is accepted", function () {
  RoundStore.RESUME_MODES.filter(function (mode) { return mode !== "deal" && mode !== "insurance"; }).forEach(function (mode) {
    var state = liveState();
    assert.ok(RoundStore.restore(roundTrip(state, mode), context(state.settings)), mode);
  });
});
