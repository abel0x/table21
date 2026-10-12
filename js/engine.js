/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 21 — pure rules engine
   No DOM, storage, network, or third-party dependencies.
   Exposed as window.BlackjackEngine and CommonJS for tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory(root && root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BlackjackEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoSource) {
  "use strict";

  var SUITS = [
    { s: "♠", c: "black" },
    { s: "♥", c: "red" },
    { s: "♦", c: "red" },
    { s: "♣", c: "black" }
  ];
  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var UINT32_RANGE = 0x100000000;
  // Keep ample headroom for four hands, doubling and insurance arithmetic.
  var MAX_WAGER = Math.floor(Number.MAX_SAFE_INTEGER / 16);

  function asWager(value) {
    value = Math.floor(Number(value));
    if (isFinite(value) && value > MAX_WAGER) throw new RangeError("Wager exceeds the safe table limit");
    return isFinite(value) && value > 0 ? value : 0;
  }

  function randInt(maxExclusive, fallbackRandom) {
    maxExclusive = Math.floor(Number(maxExclusive));
    if (!isFinite(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError("maxExclusive must be between 1 and 2^32");
    }

    if (cryptoSource && typeof cryptoSource.getRandomValues === "function") {
      // Rejection sampling keeps every possible index exactly equiprobable.
      var limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
      var buffer = new Uint32Array(1);
      var value;
      do {
        cryptoSource.getRandomValues(buffer);
        value = buffer[0];
      } while (value >= limit);
      return value % maxExclusive;
    }

    var random = typeof fallbackRandom === "function" ? fallbackRandom : Math.random;
    var sample = Number(random());
    if (!isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("random source must return a number from 0 up to, but not including, 1");
    }
    return Math.floor(sample * maxExclusive);
  }

  function buildShoe(deckCount) {
    deckCount = Math.floor(Number(deckCount));
    if (!isFinite(deckCount) || deckCount < 1) throw new RangeError("deckCount must be positive");

    var shoe = [];
    for (var deck = 0; deck < deckCount; deck++) {
      for (var suitIndex = 0; suitIndex < SUITS.length; suitIndex++) {
        for (var rankIndex = 0; rankIndex < RANKS.length; rankIndex++) {
          shoe.push({
            rank: RANKS[rankIndex],
            suit: SUITS[suitIndex].s,
            color: SUITS[suitIndex].c,
            id: deck + "-" + suitIndex + "-" + rankIndex
          });
        }
      }
    }
    return shoe;
  }

  function shuffle(cards, randomIndex) {
    if (!Array.isArray(cards)) throw new TypeError("cards must be an array");
    for (var i = cards.length - 1; i > 0; i--) {
      var j = randomIndex ? randomIndex(i + 1) : randInt(i + 1);
      if (j < 0 || j > i || Math.floor(j) !== j) throw new RangeError("random index is out of bounds");
      var temporary = cards[i];
      cards[i] = cards[j];
      cards[j] = temporary;
    }
    return cards;
  }

  function cardValue(rank) {
    rank = String(rank);
    if (RANKS.indexOf(rank) === -1) return 0;
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    return Number(rank);
  }

  function handValue(cards) {
    cards = Array.isArray(cards) ? cards : [];
    var total = 0;
    var aces = 0;
    for (var i = 0; i < cards.length; i++) {
      var rank = cards[i] && cards[i].rank;
      total += cardValue(rank);
      if (rank === "A") aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total: total, soft: aces > 0 };
  }

  // Display total: a live soft hand shows both counts ("7/17"), the way players
  // read it at a real table. Settled hands and soft 21 show one number.
  function totalLabel(cards, live) {
    var value = handValue(cards);
    return live && value.soft && value.total < 21 ? (value.total - 10) + "/" + value.total : String(value.total);
  }

  function isBlackjack(cards) {
    return Array.isArray(cards) && cards.length === 2 && handValue(cards).total === 21;
  }

  function resolveHand(playerCards, dealerCards, naturalEligible) {
    var playerTotal = handValue(playerCards).total;
    var dealerTotal = handValue(dealerCards).total;
    var playerNatural = naturalEligible !== false && isBlackjack(playerCards);
    var dealerNatural = isBlackjack(dealerCards);

    if (playerTotal > 21) return "bust";
    if (playerNatural && !dealerNatural) return "blackjack";
    if (playerNatural && dealerNatural) return "push";
    if (dealerNatural) return "lose";
    if (dealerTotal > 21) return "dealerBust";
    if (playerTotal > dealerTotal) return "win";
    if (playerTotal < dealerTotal) return "lose";
    return "push";
  }

  function payoutFor(result, bet) {
    bet = asWager(bet);
    if (result === "blackjack") return bet + Math.floor(bet * 1.5);
    if (result === "evenMoney" || result === "win" || result === "dealerBust") return bet * 2;
    if (result === "push") return bet;
    if (result === "surrender") return Math.floor(bet / 2);
    return 0;
  }

  function settleRound(hands, dealerCards, options) {
    hands = Array.isArray(hands) ? hands : [];
    if (hands.length > 4) throw new RangeError("A round supports at most four hands");
    dealerCards = Array.isArray(dealerCards) ? dealerCards : [];
    options = options || {};
    var dealerBlackjack = isBlackjack(dealerCards);
    var insuranceStake = asWager(options.insuranceStake);
    var evenMoney = !!options.evenMoney && hands.length === 1 &&
      hands[0] && typeof hands[0] === "object" && isBlackjack(hands[0].cards);
    if (evenMoney) insuranceStake = 0;

    var mainStake = 0;
    var mainReturn = 0;
    var counts = { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0 };
    var outcomes = [];

    hands.forEach(function (hand, index) {
      hand = hand && typeof hand === "object" ? hand : {};
      var cards = Array.isArray(hand.cards) ? hand.cards : [];
      var bet = asWager(hand.bet);
      var result;
      if (hand.result === "surrender") {
        result = "surrender";
      } else if (evenMoney && index === 0) {
        result = "evenMoney";
      } else {
        result = resolveHand(cards, dealerCards, hands.length === 1 && !hand.fromSplit);
      }

      mainStake += bet;
      mainReturn += payoutFor(result, bet);
      outcomes.push(result);
      counts.hands++;

      if (result === "blackjack" || result === "evenMoney") {
        counts.wins++;
        counts.blackjacks++;
      } else if (result === "win" || result === "dealerBust") {
        counts.wins++;
      } else if (result === "push") {
        counts.pushes++;
      } else {
        counts.losses++;
      }
    });

    var insuranceReturn = dealerBlackjack ? insuranceStake * 3 : 0;
    var totalStake = mainStake + insuranceStake;
    var totalReturn = mainReturn + insuranceReturn;

    return {
      outcomes: outcomes,
      counts: counts,
      dealerTotal: handValue(dealerCards).total,
      dealerBlackjack: dealerBlackjack,
      dealerBust: handValue(dealerCards).total > 21,
      mainStake: mainStake,
      mainReturn: mainReturn,
      insuranceStake: insuranceStake,
      insuranceReturn: insuranceReturn,
      totalStake: totalStake,
      totalReturn: totalReturn,
      profit: totalReturn - totalStake,
      evenMoney: evenMoney
    };
  }

  return {
    MAX_WAGER: MAX_WAGER,
    SUITS: SUITS,
    RANKS: RANKS,
    randInt: randInt,
    buildShoe: buildShoe,
    shuffle: shuffle,
    cardValue: cardValue,
    handValue: handValue,
    totalLabel: totalLabel,
    isBlackjack: isBlackjack,
    resolveHand: resolveHand,
    payoutFor: payoutFor,
    settleRound: settleRound
  };
});
