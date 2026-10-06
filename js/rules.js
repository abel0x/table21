/* =========================================================
   Table 21 rule presets
   Pure data and rule predicates shared by the UI and tests.
   ========================================================= */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TableRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PROFILE_IDS = ["lasVegas", "atlanticCity", "european"];
  var RULE_FIELDS = [
    "decks", "hitSoft17", "dealerHoleCard", "dealerPeeks",
    "surrender", "doubleRule", "doubleAfterSplit", "maxHands"
  ];

  // Each preset is intentionally explicit. Casino floors vary table by table;
  // these three profiles model recognizable, internally consistent rule sets.
  var PROFILES = {
    lasVegas: {
      decks: 6,
      hitSoft17: true,
      dealerHoleCard: true,
      dealerPeeks: true,
      surrender: false,
      doubleRule: "any",
      doubleAfterSplit: true,
      maxHands: 4
    },
    atlanticCity: {
      decks: 8,
      hitSoft17: false,
      dealerHoleCard: true,
      dealerPeeks: true,
      surrender: true,
      doubleRule: "any",
      doubleAfterSplit: true,
      maxHands: 4
    },
    european: {
      decks: 6,
      hitSoft17: false,
      dealerHoleCard: false,
      dealerPeeks: false,
      surrender: false,
      doubleRule: "hard9to11",
      doubleAfterSplit: true,
      maxHands: 2
    }
  };

  function isProfile(id) {
    return PROFILE_IDS.indexOf(id) !== -1;
  }

  function getProfile(id) {
    if (!isProfile(id)) return null;
    var copy = {};
    RULE_FIELDS.forEach(function (field) { copy[field] = PROFILES[id][field]; });
    return copy;
  }

  function applyProfile(target, id) {
    target = target && typeof target === "object" ? target : {};
    var profile = getProfile(id);
    if (!profile) return target;
    RULE_FIELDS.forEach(function (field) { target[field] = profile[field]; });
    target.ruleProfile = id;
    return target;
  }

  function matchesProfile(settings, id) {
    var profile = PROFILES[id];
    if (!profile || !settings || typeof settings !== "object") return false;
    return RULE_FIELDS.every(function (field) { return settings[field] === profile[field]; });
  }

  function detectProfile(settings) {
    for (var i = 0; i < PROFILE_IDS.length; i++) {
      if (matchesProfile(settings, PROFILE_IDS[i])) return PROFILE_IDS[i];
    }
    return "custom";
  }

  function canDouble(hand, settings, evaluateHand) {
    if (!hand || !Array.isArray(hand.cards) || hand.cards.length !== 2) return false;
    if (!settings || typeof settings !== "object" || typeof evaluateHand !== "function") return false;
    if (hand.splitAces || hand.doubled) return false;
    if (hand.fromSplit && settings.doubleAfterSplit === false) return false;
    if (settings.doubleRule === "any") return true;
    if (settings.doubleRule !== "hard9to11") return false;
    var value = evaluateHand(hand.cards);
    return !value.soft && value.total >= 9 && value.total <= 11;
  }

  return {
    PROFILE_IDS: PROFILE_IDS,
    RULE_FIELDS: RULE_FIELDS,
    PROFILES: PROFILES,
    isProfile: isProfile,
    getProfile: getProfile,
    applyProfile: applyProfile,
    matchesProfile: matchesProfile,
    detectProfile: detectProfile,
    canDouble: canDouble
  };
});
