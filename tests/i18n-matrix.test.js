"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var source = fs.readFileSync(path.resolve(__dirname, "../js/i18n.js"), "utf8").replace(
  "global.I18n = {",
  "global.I18n = { _testDictionary: DICT,"
);

function emptyDocument() {
  return {
    querySelectorAll: function () { return []; },
    documentElement: { setAttribute: function () {} },
    title: ""
  };
}

function loadI18n(options) {
  options = options || {};
  var storage = Object.assign({}, options.storage);
  var context = {
    document: options.document || emptyDocument(),
    localStorage: {
      getItem: function (key) {
        if (options.throwOnGet) throw new Error("storage unavailable");
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem: function (key, value) {
        if (options.throwOnSet) throw new Error("storage unavailable");
        storage[key] = String(value);
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { I18n: context.I18n, context: context, storage: storage };
}

[
  ["rankAce", "Ace", "Ası"],
  ["rankTwo", "Two", "İkilisi"],
  ["rankThree", "Three", "Üçlüsü"],
  ["rankFour", "Four", "Dörtlüsü"],
  ["rankFive", "Five", "Beşlisi"],
  ["rankSix", "Six", "Altılısı"],
  ["rankSeven", "Seven", "Yedilisi"],
  ["rankEight", "Eight", "Sekizlisi"],
  ["rankNine", "Nine", "Dokuzlusu"],
  ["rankTen", "Ten", "Onlusu"],
  ["rankJack", "Jack", "Valesi"],
  ["rankQueen", "Queen", "Kızı"],
  ["rankKing", "King", "Papazı"]
].forEach(function (entry) {
  test("localized card rank: " + entry[0], function () {
    var loaded = loadI18n();
    loaded.I18n.setLanguage("en");
    assert.equal(loaded.I18n.t(entry[0]), entry[1]);
    loaded.I18n.setLanguage("tr");
    assert.equal(loaded.I18n.t(entry[0]), entry[2]);
  });
});

[
  ["suitSpades", "spades", "Maça"],
  ["suitHearts", "hearts", "Kupa"],
  ["suitDiamonds", "diamonds", "Karo"],
  ["suitClubs", "clubs", "Sinek"]
].forEach(function (entry) {
  test("localized card suit: " + entry[0], function () {
    var loaded = loadI18n();
    loaded.I18n.setLanguage("en");
    assert.equal(loaded.I18n.t(entry[0]), entry[1]);
    loaded.I18n.setLanguage("tr");
    assert.equal(loaded.I18n.t(entry[0]), entry[2]);
  });
});

test("English card labels interpolate in natural order", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("cardLabel", { rank: "Six", suit: "clubs" }), "Six of clubs");
});

test("Turkish card labels interpolate in natural possessed form", function () {
  var loaded = loadI18n();
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.I18n.t("cardLabel", { rank: "Altılısı", suit: "Sinek" }), "Sinek Altılısı");
});

test("English uses a singular label for one deck", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("deckValue", { count: 1 }), "1 DECK");
});

test("English uses a plural label for multiple decks", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("decksValue", { count: 8 }), "8 DECKS");
});

test("Turkish deck labels remain grammatically invariant", function () {
  var loaded = loadI18n();
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.I18n.t("deckValue", { count: 1 }), "1 DESTE");
  assert.equal(loaded.I18n.t("decksValue", { count: 8 }), "8 DESTE");
});

test("a saved Turkish preference is restored on startup", function () {
  var loaded = loadI18n({ storage: { "vbj.lang": "tr" } });
  assert.equal(loaded.I18n.get(), "tr");
});

test("an invalid saved preference falls back to English", function () {
  var loaded = loadI18n({ storage: { "vbj.lang": "xx" } });
  assert.equal(loaded.I18n.get(), "en");
});

test("unavailable storage still starts in English", function () {
  var loaded = loadI18n({ throwOnGet: true });
  assert.equal(loaded.I18n.get(), "en");
});

test("setting a language persists the choice", function () {
  var loaded = loadI18n();
  loaded.I18n.setLanguage("tr");
  assert.equal(loaded.storage["vbj.lang"], "tr");
});

test("an unknown language request safely selects English", function () {
  var loaded = loadI18n();
  loaded.I18n.setLanguage("tr");
  loaded.I18n.setLanguage("unknown");
  assert.equal(loaded.I18n.get(), "en");
});

test("a storage write failure cannot prevent language changes", function () {
  var loaded = loadI18n({ throwOnSet: true });
  assert.doesNotThrow(function () { loaded.I18n.setLanguage("tr"); });
  assert.equal(loaded.I18n.get(), "tr");
});

test("missing translation keys return the key for diagnosability", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("doesNotExist"), "doesNotExist");
});

test("missing interpolation values remain visible", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("deposited", {}), "Added {amount} to your balance");
});

test("zero is accepted as an interpolation value", function () {
  var loaded = loadI18n();
  assert.equal(loaded.I18n.t("shoeCards", { count: 0 }), "0 cards in the shoe");
});

test("change listeners receive the resolved language", function () {
  var loaded = loadI18n();
  var received = [];
  loaded.I18n.onChange(function (language) { received.push(language); });
  loaded.I18n.setLanguage("tr");
  loaded.I18n.setLanguage("invalid");
  assert.deepEqual(received, ["tr", "en"]);
});

test("a failing listener does not prevent later listeners", function () {
  var loaded = loadI18n();
  var called = false;
  loaded.I18n.onChange(function () { throw new Error("listener failed"); });
  loaded.I18n.onChange(function () { called = true; });
  assert.doesNotThrow(function () { loaded.I18n.setLanguage("tr"); });
  assert.equal(called, true);
});

test("apply updates text, title, aria-label, placeholder, and metadata", function () {
  function node(key) {
    return {
      key: key,
      textContent: "",
      attributes: {},
      getAttribute: function () { return this.key; },
      setAttribute: function (name, value) { this.attributes[name] = value; }
    };
  }
  var textNode = node("settings");
  var titleNode = node("settings");
  var ariaNode = node("close");
  var placeholderNode = node("amount");
  var contentNode = node("appDescription");
  var root = {
    querySelectorAll: function (selector) {
      return {
        "[data-i18n]": [textNode],
        "[data-i18n-title]": [titleNode],
        "[data-i18n-aria-label]": [ariaNode],
        "[data-i18n-placeholder]": [placeholderNode],
        "[data-i18n-content]": [contentNode]
      }[selector] || [];
    }
  };
  var lang = "";
  var document = emptyDocument();
  document.documentElement.setAttribute = function (name, value) { if (name === "lang") lang = value; };
  var loaded = loadI18n({ document: document });
  loaded.I18n.apply(root);
  assert.equal(textNode.textContent, "Settings");
  assert.equal(titleNode.attributes.title, "Settings");
  assert.equal(ariaNode.attributes["aria-label"], "Close");
  assert.equal(placeholderNode.attributes.placeholder, "Amount");
  assert.equal(contentNode.attributes.content, "A polished blackjack game that works completely offline.");
  assert.equal(lang, "en");
  assert.equal(document.title, "Table 21: Offline Blackjack");
});

test("all user-facing strings avoid accidental repeated spaces", function () {
  var dictionary = loadI18n().I18n._testDictionary;
  Object.keys(dictionary).forEach(function (language) {
    Object.keys(dictionary[language]).forEach(function (key) {
      var values = Array.isArray(dictionary[language][key])
        ? dictionary[language][key]
        : [dictionary[language][key]];
      values.forEach(function (value) {
        assert.doesNotMatch(value, / {2,}/, language + "." + key);
      });
    });
  });
});

test("Turkish interface copy contains no stray English action words", function () {
  var dictionary = loadI18n().I18n._testDictionary.tr;
  [
    dictionary.profileLasVegasSummary,
    dictionary.profileAtlanticCitySummary,
    dictionary.profileEuropeanSummary,
    dictionary.ruleDoubleAny,
    dictionary.ruleDoubleHard,
    dictionary.youLose
  ].forEach(function (value) {
    assert.doesNotMatch(value, /\b(?:double|lose|bust|push|deal|hit|stand)\b/i);
  });
});

