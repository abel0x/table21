/* =========================================================
   Table 21 basic strategy
   Pure and dependency-free: given a hand, the dealer's up-card and the active
   table rules, return the basic-strategy play. Used by the in-game coach and
   covered exhaustively by tests/strategy*.test.js.

   Charts follow the standard total-dependent basic strategy for each deck
   class (1 deck, 2 decks, 4+ decks), with the usual S17/H17, double-after-
   split and late-surrender variations. Tables without a hole card (European,
   ENHC) stop doubling 11 and splitting 8s against 10 or Ace, and stop
   splitting Aces against an Ace: the player would lose the extra stake to a
   dealer blackjack.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BlackjackStrategy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ACTIONS = ["hit", "stand", "double", "split", "surrender"];

  function rankValue(rank) {
    if (rank === "A") return 11;
    if (rank === "K" || rank === "Q" || rank === "J") return 10;
    var value = parseInt(rank, 10);
    return value >= 2 && value <= 10 ? value : 0;
  }

  function evaluate(cards) {
    var total = 0;
    var aces = 0;
    for (var i = 0; i < cards.length; i++) {
      total += rankValue(cards[i].rank);
      if (cards[i].rank === "A") aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0 };
  }

  // Inclusive range test on the dealer up-card value (2-10, Ace = 11).
  function within(up, low, high) { return up >= low && up <= high; }

  function deckClass(rules) {
    var decks = rules && rules.decks;
    if (decks === 1) return "single";
    if (decks === 2) return "double";
    return "multi";
  }

  /* ---------- Chart codes ----------
     H  hit            S  stand          P  split
     D  double, otherwise hit
     Ds double, otherwise stand
     Rh surrender, otherwise hit         Rp surrender, otherwise split
     null: no special play for this chart, use the next one. */

  function pairCode(pairValue, up, rules) {
    var decks = deckClass(rules);
    var das = rules.doubleAfterSplit !== false;
    var h17 = rules.hitSoft17 === true;
    var noHole = rules.dealerHoleCard === false;

    switch (pairValue) {
      case 11:
        if (noHole && up === 11) return null;
        return "P";
      case 10:
        return null;
      case 9:
        return within(up, 2, 6) || up === 8 || up === 9 ? "P" : null;
      case 8:
        if (noHole && (up === 10 || up === 11)) return null;
        if (h17 && up === 11 && decks === "multi") return "Rp";
        return "P";
      case 7:
        return within(up, 2, decks === "single" && das ? 8 : 7) ? "P" : null;
      case 6:
        if (decks === "multi") return within(up, das ? 2 : 3, 6) ? "P" : null;
        return within(up, 2, das ? 7 : 6) ? "P" : null;
      case 5:
        return null;
      case 4:
        if (!das) return null;
        return within(up, decks === "single" ? 4 : 5, 6) ? "P" : null;
      case 3:
        if (decks === "single" && das) return within(up, 2, 8) ? "P" : null;
        return within(up, das ? 2 : 4, 7) ? "P" : null;
      case 2:
        if (decks !== "multi" && !das) return within(up, 3, 7) ? "P" : null;
        return within(up, das ? 2 : 4, 7) ? "P" : null;
      default:
        return null;
    }
  }

  function surrenderCode(total, up, rules) {
    var decks = deckClass(rules);
    var h17 = rules.hitSoft17 === true;
    if (total === 16) {
      if (up === 10 || up === 11) return "Rh";
      if (up === 9 && (decks === "multi" || h17)) return "Rh";
      return null;
    }
    if (total === 15) {
      if (up === 10) return "Rh";
      if (up === 11 && h17) return "Rh";
      return null;
    }
    if (total === 17 && up === 11 && h17) return "Rs";
    return null;
  }

  function softCode(total, up, rules) {
    var decks = deckClass(rules);
    var h17 = rules.hitSoft17 === true;
    switch (total) {
      case 13:
      case 14:
        return within(up, decks === "single" ? 4 : 5, 6) ? "D" : "H";
      case 15:
      case 16:
        return within(up, 4, 6) ? "D" : "H";
      case 17:
        return within(up, decks === "single" ? 2 : 3, 6) ? "D" : "H";
      case 18:
        if (within(up, h17 ? 2 : 3, 6)) return "Ds";
        if (up === 2 || up === 7 || up === 8) return "S";
        if (up === 11 && decks === "single" && !h17) return "S";
        return "H";
      case 19:
        return up === 6 && (h17 || decks === "single") ? "Ds" : "S";
      default:
        return total <= 12 ? "H" : "S";
    }
  }

  function hardCode(total, up, rules) {
    var decks = deckClass(rules);
    var h17 = rules.hitSoft17 === true;
    var noHole = rules.dealerHoleCard === false;
    if (total <= 7) return "H";
    if (total === 8) return decks === "single" && within(up, 5, 6) ? "D" : "H";
    if (total === 9) return within(up, decks === "multi" ? 3 : 2, 6) ? "D" : "H";
    if (total === 10) return within(up, 2, 9) ? "D" : "H";
    if (total === 11) {
      if (noHole && (up === 10 || up === 11)) return "H";
      if (up === 11) return decks === "multi" && !h17 ? "H" : "D";
      return "D";
    }
    if (total === 12) return within(up, 4, 6) ? "S" : "H";
    if (total <= 16) return within(up, 2, 6) ? "S" : "H";
    return "S";
  }

  function resolve(code, allowed) {
    switch (code) {
      case "D": return allowed.double ? "double" : "hit";
      case "Ds": return allowed.double ? "double" : "stand";
      case "P": return "split";
      case "Rh": return allowed.surrender ? "surrender" : "hit";
      case "Rs": return allowed.surrender ? "surrender" : "stand";
      case "Rp": return allowed.surrender ? "surrender" : "split";
      case "S": return "stand";
      default: return "hit";
    }
  }

  /**
   * cards    the player's hand, e.g. [{ rank: "A" }, { rank: "6" }]
   * upRank   the dealer's up-card rank
   * rules    { decks, hitSoft17, dealerHoleCard, doubleAfterSplit }
   * allowed  which optional plays the table offers right now:
   *          { double, split, surrender } (all default to false)
   *
   * Returns { action, kind, total, pairRank } where kind is "pair", "soft"
   * or "hard" and describes the chart that decided the play.
   */
  function recommend(cards, upRank, rules, allowed) {
    if (!Array.isArray(cards) || cards.length === 0) throw new TypeError("A hand needs cards");
    var up = rankValue(upRank);
    if (!up) throw new TypeError("Unknown dealer up-card: " + upRank);
    rules = rules && typeof rules === "object" ? rules : {};
    allowed = allowed && typeof allowed === "object" ? allowed : {};
    allowed = { double: allowed.double === true, split: allowed.split === true, surrender: allowed.surrender === true };

    var value = evaluate(cards);
    var isPair = cards.length === 2 && rankValue(cards[0].rank) === rankValue(cards[1].rank);
    var base = { total: value.total, kind: value.soft ? "soft" : "hard", pairRank: null };

    if (value.total > 21) return Object.assign(base, { action: "stand" });

    if (isPair && allowed.split) {
      var pair = pairCode(rankValue(cards[0].rank), up, rules);
      if (pair) {
        return Object.assign(base, {
          action: resolve(pair, allowed),
          kind: "pair",
          pairRank: cards[0].rank === "A" ? "A" : String(rankValue(cards[0].rank))
        });
      }
    }

    if (allowed.surrender && !value.soft) {
      var surrender = surrenderCode(value.total, up, rules);
      if (surrender) return Object.assign(base, { action: resolve(surrender, allowed) });
    }

    var code = value.soft ? softCode(value.total, up, rules) : hardCode(value.total, up, rules);
    return Object.assign(base, { action: resolve(code, allowed) });
  }

  // Basic strategy declines insurance, and even money is the same bet.
  function takeInsurance() { return false; }

  return {
    ACTIONS: ACTIONS,
    rankValue: rankValue,
    recommend: recommend,
    takeInsurance: takeInsurance
  };
});
