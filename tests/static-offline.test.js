"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var root = path.resolve(__dirname, "..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };

test("every runtime asset is local and present", function () {
  var html = read("index.html");
  var refs = [];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);

  refs.forEach(function (ref) {
    assert.doesNotMatch(ref, /^(?:https?:)?\/\//, "external runtime reference: " + ref);
    assert.ok(fs.existsSync(path.join(root, ref)), "missing runtime asset: " + ref);
  });
});

test("the service worker precaches the complete app shell", function () {
  var html = read("index.html");
  var worker = read("sw.js");
  var refs = ["index.html"];
  var pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"'#]+)["']/g;
  var match;
  while ((match = pattern.exec(html))) refs.push(match[1]);

  refs.forEach(function (ref) {
    assert.ok(worker.indexOf('"./' + ref + '"') !== -1, "not precached: " + ref);
  });
});

test("runtime files contain no remote fetch, script, stylesheet, or image URL", function () {
  ["index.html", "css/styles.css", "js/i18n.js", "js/sound.js", "js/engine.js", "js/rules.js", "js/chip-stack.js", "js/game.js", "js/pwa.js", "sw.js"].forEach(function (file) {
    // A plain <a href> only navigates when followed; it never loads anything.
    var source = read(file).replace(/<a\b[^>]*>/gi, "");
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, file);
    assert.doesNotMatch(source, /url\(\s*["']?https?:\/\//i, file);
    assert.doesNotMatch(source, /fetch\(\s*["']https?:\/\//i, file);
  });
});

test("the only outbound link is the source code, opened in a new tab", function () {
  var links = read("index.html").match(/<a\b[^>]*>/gi) || [];
  assert.equal(links.length, 1);
  assert.match(links[0], /href="https:\/\/github\.com\/abel0x\/table21"/);
  assert.match(links[0], /target="_blank"/);
  assert.match(links[0], /rel="noopener"/);
});

test("the settings dialog carries the disclaimer, version and license", function () {
  var html = read("index.html");
  var about = html.match(/<section class="about"[\s\S]*?<\/section>/);
  assert.ok(about, "about section");
  ["disclaimerTitle", "disclaimerPlayMoney", "disclaimerOdds", "disclaimerWarranty", "licenseNotice", "sourceCode"].forEach(function (key) {
    assert.match(about[0], new RegExp('data-i18n="' + key + '"'), key);
  });
  var version = JSON.parse(read("package.json")).version;
  assert.match(about[0], new RegExp("</span> " + version.replace(/\./g, "\\.") + "</span>"), "version matches package.json");
  assert.match(read("js/game.js"), /'a\[href\], button:not\(\[disabled\]\)/, "the dialog focus trap includes links");
});

test("GitHub Pages serves the files as they are, with a matching link preview", function () {
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")), "without .nojekyll Pages runs the site through Jekyll");
  var html = read("index.html");
  var homepage = JSON.parse(read("package.json")).homepage;
  var meta = function (property) {
    var match = html.match(new RegExp('<meta property="' + property + '" content="([^"]+)"'));
    assert.ok(match, property);
    return match[1];
  };
  assert.match(homepage, /^https:\/\/[^/]+\/[^/]+\/$/);
  assert.equal(meta("og:url"), homepage);
  var image = meta("og:image");
  assert.equal(image.indexOf(homepage), 0, "the preview image ships with the site");
  var jpeg = fs.readFileSync(path.join(root, image.slice(homepage.length)));
  assert.equal(jpeg.readUInt16BE(0), 0xffd8, "JPEG");
  var size = null;
  for (var offset = 2; offset < jpeg.length && !size; offset += 2 + jpeg.readUInt16BE(offset + 2)) {
    var marker = jpeg.readUInt16BE(offset);
    if (marker === 0xffc0 || marker === 0xffc2) size = jpeg.readUInt16BE(offset + 7) + "x" + jpeg.readUInt16BE(offset + 5);
  }
  assert.equal(size, meta("og:image:width") + "x" + meta("og:image:height"));
});

test("all DOM ids requested by game.js exist in index.html", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  var ids = new Set();
  var pattern = /\$\("([A-Za-z][\w-]*)"\)/g;
  var match;
  while ((match = pattern.exec(game))) ids.add(match[1]);

  ids.forEach(function (id) {
    assert.match(html, new RegExp('\\bid=["\']' + id + '["\']'), "missing id: " + id);
  });
});

test("every literal translation key resolves in English and Turkish", function () {
  var source = read("js/i18n.js").replace(
    "global.I18n = {",
    "global.I18n = { _testDictionary: DICT,"
  );
  var storage = {};
  var context = {
    document: {
      querySelectorAll: function () { return []; },
      documentElement: { setAttribute: function () {} },
      title: ""
    },
    localStorage: {
      getItem: function (key) { return storage[key] || null; },
      setItem: function (key, value) { storage[key] = String(value); }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    Object.keys(context.I18n._testDictionary.en).sort(),
    Object.keys(context.I18n._testDictionary.tr).sort(),
    "English and Turkish dictionaries must have identical keys"
  );
  assert.equal(context.I18n._testDictionary.tr.youLose, "KAYBETTİNİZ");
  assert.equal(context.I18n._testDictionary.tr.bustShort, "21'İ GEÇTİNİZ");
  assert.equal(context.I18n._testDictionary.tr.placeBetPrompt, "Bahsinizi yapın");
  assert.equal(context.I18n._testDictionary.tr.insuranceTitle, "Sigorta ister misiniz?");
  assert.equal(context.I18n._testDictionary.tr.tableTheme, "Masa ve kart arkası");
  assert.equal(context.I18n._testDictionary.tr.muteSound, "Sesi kapat");
  assert.equal(context.I18n._testDictionary.tr.unmuteSound, "Sesi aç");
  assert.doesNotMatch(
    JSON.stringify(context.I18n._testDictionary),
    /—|–/,
    "User-facing copy should use natural sentence punctuation instead of long dashes"
  );
  assert.doesNotMatch(
    JSON.stringify(context.I18n._testDictionary.tr),
    /battı|bahs(?:i|inizi) koy|sigorta al\?|özel yüksek limitli/i
  );

  var keys = new Set();
  var combined = read("index.html") + "\n" + read("js/game.js");
  var patterns = [
    /data-i18n(?:-title|-aria-label|-placeholder|-content)?=["']([^"']+)["']/g,
    /\bt\(["']([^"']+)["']/g,
    /I18n\.pick\(["']([^"']+)["']/g
  ];
  patterns.forEach(function (pattern) {
    var match;
    while ((match = pattern.exec(combined))) keys.add(match[1]);
  });

  ["en", "tr"].forEach(function (language) {
    context.I18n.setLanguage(language);
    keys.forEach(function (key) {
      assert.notEqual(context.I18n.t(key), key, language + " is missing: " + key);
    });
  });
});

test("all three table and card-back themes are available without assets", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");
  var themes = Array.from(html.matchAll(/data-set-theme=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();

  assert.deepEqual(themes, ["bordeaux", "emerald", "midnight"]);
  assert.match(game, /ALLOWED_THEMES\s*=\s*\["emerald", "midnight", "bordeaux"\]/);
  assert.match(css, /body\[data-theme="midnight"\]/);
  assert.match(css, /body\[data-theme="bordeaux"\]/);
});

test("number cards show exactly their value in the central pip field", function () {
  var game = read("js/game.js");
  var layoutMatch = game.match(/var PIP_LAYOUTS\s*=\s*(\{[\s\S]*?\n  \});/);
  assert.ok(layoutMatch, "pip layouts should be declared as a plain object");
  var layouts = vm.runInNewContext("(" + layoutMatch[1] + ")");

  for (var value = 2; value <= 10; value++) {
    assert.equal(layouts[value].length, value, value + " should render " + value + " central pips");
  }

  var cornerBlock = game.match(/var tl = document\.createElement[\s\S]*?front\.appendChild\(br\);/);
  assert.ok(cornerBlock, "corner-index rendering block should exist");
  assert.doesNotMatch(cornerBlock[0], /card\.suit/, "corner indices should not add extra suit glyphs");
});

test("the physical table uses a live shoe, cut card, discard tray, and payout pile", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");

  ["shoeCards", "shoeCount", "discardTray", "discardStack", "discardCount", "payoutStack", "tableProfile", "tableDecks", "tableDealerRule"].forEach(function (id) {
    assert.match(html, new RegExp("\\bid=[\"']" + id + "[\"']"), "missing physical table element: " + id);
  });
  assert.match(html, /class="cut-card"/);
  assert.match(css, /\.discard-tray/);
  assert.match(css, /\.bet-stack\.payout-stack\.arriving/);
  assert.match(game, /prepareCardForDiscard/);
  assert.match(game, /state\.discardTrayCount = state\.discarded/);
  assert.match(game, /renderPayoutStack\(sidePaymentAmount\)/);
  assert.match(game, /state\.pendingPayoutVisual = false;\s*renderBankroll\(\)/);
});

test("every player hand owns a physical wager and settlement stack", function () {
  var game = read("js/game.js");
  var css = read("css/styles.css");

  assert.match(game, /className = "hand-wager"/);
  assert.match(game, /"bet-stack hand-bet-stack"/);
  assert.match(game, /"bet-stack payout-stack hand-payout-stack"/);
  assert.match(game, /prepareHandSettlements/);
  assert.match(game, /moveHandSettlements/);
  assert.match(css, /\.hand-wager/);
  assert.match(css, /@keyframes wagerSplitRight/);
  assert.match(css, /@keyframes wagerDouble/);
});

test("settings expose three local rule profiles", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  var rules = read("js/rules.js");
  var profiles = Array.from(html.matchAll(/data-rule-profile=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();

  assert.deepEqual(profiles, ["atlanticCity", "european", "lasVegas"]);
  assert.match(rules, /dealerHoleCard: false/);
  assert.match(rules, /doubleRule: "hard9to11"/);
  assert.match(game, /Rules\.canDouble/);
  assert.match(game, /state\.settings\.dealerHoleCard/);
  assert.match(game, /state\.settings\.maxHands/);
});

test("court cards use distinct local vector portraits", function () {
  var game = read("js/game.js");
  var css = read("css/styles.css");
  assert.match(game, /function courtFigureMarkup/);
  assert.match(game, /rank === "J"/);
  assert.match(game, /rank === "Q"/);
  assert.match(game, /class="court-art"/);
  assert.doesNotMatch(game, /COURT_ICONS/);
  assert.match(css, /\.court-person-j/);
  assert.match(css, /\.court-center-rank/);
});

test("bundled fonts and physical sound samples are present and precached", function () {
  var worker = read("sw.js");
  var assets = [
    "assets/fonts/table21-sans-regular.woff2",
    "assets/fonts/table21-sans-semibold.woff2",
    "assets/audio/card-slide-1.ogg",
    "assets/audio/card-slide-2.ogg",
    "assets/audio/card-flip.ogg",
    "assets/audio/chip-click-1.ogg",
    "assets/audio/chip-click-2.ogg",
    "assets/audio/chip-stack.ogg",
    "assets/audio/chips-push.ogg",
    "assets/audio/shuffle.ogg",
    "assets/audio/card-slide-1.m4a",
    "assets/audio/card-slide-2.m4a",
    "assets/audio/card-flip.m4a",
    "assets/audio/chip-click-1.m4a",
    "assets/audio/chip-click-2.m4a",
    "assets/audio/chip-stack.m4a",
    "assets/audio/chips-push.m4a",
    "assets/audio/shuffle.m4a"
  ];

  assets.forEach(function (asset) {
    var fullPath = path.join(root, asset);
    assert.ok(fs.existsSync(fullPath), "missing bundled asset: " + asset);
    assert.ok(fs.statSync(fullPath).size > 1024, "bundled asset is unexpectedly empty: " + asset);
    assert.ok(worker.indexOf('"./' + asset + '"') !== -1, "bundled asset is not precached: " + asset);
  });
});

test("settings expose three animation speeds and four independent sound levels", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var game = read("js/game.js");
  var speeds = Array.from(html.matchAll(/data-set-animation=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();
  var soundLevels = Array.from(html.matchAll(/data-sound-level=["']([^"']+)["']/g), function (match) {
    return match[1];
  }).sort();

  assert.deepEqual(speeds, ["cinematic", "fast", "normal"]);
  assert.deepEqual(soundLevels, ["cards", "chips", "master", "table"]);
  assert.match(game, /ANIMATION_SCALES\s*=\s*\{ fast: 0\.65, normal: 1, cinematic: 1\.35 \}/);
  assert.match(css, /body\[data-animation-speed="fast"\]/);
  assert.match(css, /body\[data-animation-speed="cinematic"\]/);
});

test("the top bar uses the Table 21 lockup and a local stateful sound icon", function () {
  var html = read("index.html");
  var css = read("css/styles.css");
  var manifest = JSON.parse(read("manifest.json"));

  assert.match(html, /class="brand-word">TABLE<\/span><span class="brand-number"[^>]*>21<\/span>/);
  assert.match(html, /class="sound-glyph"[\s\S]*class="sound-slash"/);
  assert.doesNotMatch(html, /🔊|🔇|Private High-Limit Table|VIP Blackjack/);
  assert.match(css, /#soundToggle\[aria-pressed="false"\] \.sound-slash/);
  assert.equal(manifest.short_name, "Table 21");
});
