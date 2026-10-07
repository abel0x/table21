/* =========================================================
   Table 21 unfinished-round snapshots
   Pure and dependency-free. game.js saves a snapshot whenever the table waits
   for the player or hands over to the dealer, and restores it after a reload
   or a closed tab, so refreshing can neither void nor replay a hand.

   Cards are stored by their physical id ("deck-suit-rank"), which also fixes
   their face, so a snapshot of an eight-deck shoe stays a few kilobytes.
   Anything inconsistent is rejected: the caller then voids the round, and
   because the saved balance is always the pre-round balance, that simply
   returns the stake.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 1;
  // deal: stake down, opening cards fixed but not all shown yet
  // insurance / player: waiting for the player
  // dealer / reveal: every decision made, the dealer is about to act
  var RESUME_MODES = ["deal", "insurance", "player", "dealer", "reveal"];
  var MAX_HAND_CARDS = 21;
  var CARD_ID = /^(\d{1,2})-([0-3])-(\d{1,2})$/;

  function isFlag(value) { return value === true || value === false; }
  function isCount(value) { return Number.isSafeInteger(value) && value >= 0; }
  function isStake(value, max) { return Number.isSafeInteger(value) && value > 0 && value <= max; }

  function capture(state, resume, ruleFields) {
    var ids = function (cards) { return cards.map(function (card) { return card.id; }); };
    var rules = {};
    ruleFields.forEach(function (field) { rules[field] = state.settings[field]; });
    return {
      v: VERSION,
      resume: resume,
      rules: rules,
      bet: state.bet,
      lastBet: state.lastBet,
      roundStakeLimit: state.roundStakeLimit,
      hands: state.hands.map(function (hand) {
        return {
          cards: ids(hand.cards),
          bet: hand.bet,
          done: !!hand.done,
          doubled: !!hand.doubled,
          splitAces: !!hand.splitAces,
          fromSplit: !!hand.fromSplit
        };
      }),
      active: state.active,
      dealer: { cards: ids(state.dealer.cards), hideHole: !!state.dealer.hideHole },
      pending: ids(state.pendingDeal || []),
      insurance: state.insurance,
      insuranceMode: state.insuranceMode || null,
      evenMoney: !!state.evenMoney,
      shoe: ids(state.shoe),
      discarded: state.discarded,
      discardTrayCount: state.discardTrayCount
    };
  }

  /**
   * raw      the parsed snapshot (anything; untrusted)
   * context  { rules, ruleFields, ranks, suits, maxWager }; suits as in
   *          BlackjackEngine.SUITS ({ s, c })
   *
   * Returns the round with real card objects and its total stake, or null.
   */
  function restore(raw, context) {
    if (!raw || typeof raw !== "object" || raw.v !== VERSION) return null;
    if (RESUME_MODES.indexOf(raw.resume) === -1) return null;
    var rules = context.rules;
    if (!raw.rules || typeof raw.rules !== "object") return null;
    for (var i = 0; i < context.ruleFields.length; i++) {
      var field = context.ruleFields[i];
      if (raw.rules[field] !== rules[field]) return null;
    }

    var seen = {};
    function card(id) {
      var match = typeof id === "string" && CARD_ID.exec(id);
      if (!match || seen[id]) return null;
      var deck = Number(match[1]);
      var suit = context.suits[Number(match[2])];
      var rank = context.ranks[Number(match[3])];
      if (deck >= rules.decks || !suit || !rank) return null;
      seen[id] = true;
      return { rank: rank, suit: suit.s, color: suit.c, id: id };
    }
    function cards(list, max) {
      if (!Array.isArray(list) || list.length > max) return null;
      var result = [];
      for (var c = 0; c < list.length; c++) {
        var next = card(list[c]);
        if (!next) return null;
        result.push(next);
      }
      return result;
    }

    var maxWager = context.maxWager;
    if (!isStake(raw.bet, maxWager) || !isStake(raw.lastBet, maxWager)) return null;
    if (!isCount(raw.roundStakeLimit) || !isCount(raw.insurance)) return null;
    if (!isFlag(raw.evenMoney) || !raw.dealer || !isFlag(raw.dealer.hideHole)) return null;
    if (!Array.isArray(raw.hands) || raw.hands.length < 1 || raw.hands.length > rules.maxHands) return null;
    if (!Number.isSafeInteger(raw.active) || raw.active < 0 || raw.active >= raw.hands.length) return null;

    var hands = [];
    var stake = raw.insurance;
    for (var h = 0; h < raw.hands.length; h++) {
      var hand = raw.hands[h];
      if (!hand || typeof hand !== "object") return null;
      var handCards = cards(hand.cards, MAX_HAND_CARDS);
      if (!handCards || !isStake(hand.bet, maxWager)) return null;
      if (!isFlag(hand.done) || !isFlag(hand.doubled) || !isFlag(hand.splitAces) || !isFlag(hand.fromSplit)) return null;
      if (hand.doubled && handCards.length !== 3) return null;
      stake += hand.bet;
      hands.push({
        cards: handCards, bet: hand.bet, done: hand.done, doubled: hand.doubled,
        splitAces: hand.splitAces, fromSplit: hand.fromSplit
      });
    }
    if (!Number.isSafeInteger(stake)) return null;

    var dealerCards = cards(raw.dealer.cards, 2);
    var pending = cards(raw.pending, 4);
    var shoe = cards(raw.shoe, rules.decks * 52);
    if (!dealerCards || !pending || !shoe) return null;
    if (!isCount(raw.discarded) || !isCount(raw.discardTrayCount) || raw.discardTrayCount > raw.discarded) return null;
    if (shoe.length + raw.discarded !== rules.decks * 52) return null;
    var onTable = pending.length + dealerCards.length;
    hands.forEach(function (item) { onTable += item.cards.length; });
    if (onTable > raw.discarded) return null;

    // Each resume point has one shape; anything else was not written by the game.
    var opening = rules.dealerHoleCard ? 2 : 1;
    if (raw.resume === "deal") {
      if (hands.length !== 1 || hands[0].cards.length || dealerCards.length) return null;
      if (pending.length !== opening + 2 || raw.insurance || raw.insuranceMode !== null) return null;
    } else {
      if (pending.length || dealerCards.length !== opening) return null;
      if (hands.some(function (item) { return item.cards.length < 1; })) return null;
      if (raw.resume === "insurance") {
        if (hands.length !== 1 || dealerCards[0].rank !== "A" || raw.insurance) return null;
        if (raw.insuranceMode !== "insurance" && raw.insuranceMode !== "evenMoney") return null;
      } else if (raw.insuranceMode !== null) return null;
      if (raw.resume === "player" && (hands[raw.active].cards.length < 2 || hands[raw.active].done)) return null;
    }
    if (raw.evenMoney && raw.resume !== "reveal") return null;

    return {
      resume: raw.resume,
      bet: raw.bet,
      lastBet: raw.lastBet,
      roundStakeLimit: raw.roundStakeLimit,
      hands: hands,
      active: raw.active,
      dealer: { cards: dealerCards, hideHole: raw.dealer.hideHole },
      pending: pending,
      insurance: raw.insurance,
      insuranceMode: raw.insuranceMode,
      evenMoney: raw.evenMoney,
      shoe: shoe,
      discarded: raw.discarded,
      discardTrayCount: raw.discardTrayCount,
      stake: stake
    };
  }

  return {
    VERSION: VERSION,
    RESUME_MODES: RESUME_MODES,
    capture: capture,
    restore: restore
  };
});
