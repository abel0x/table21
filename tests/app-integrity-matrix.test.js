"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var root = path.resolve(__dirname, "..");
var read = function (file) { return fs.readFileSync(path.join(root, file), "utf8"); };
var runtimeTextFiles = [
  "index.html", "css/styles.css", "js/i18n.js", "js/sound.js", "js/engine.js",
  "js/rules.js", "js/chip-stack.js", "js/strategy.js", "js/game.js", "js/pwa.js", "sw.js", "manifest.json"
];

runtimeTextFiles.forEach(function (file) {
  test("runtime file is nonempty UTF-8 text: " + file, function () {
    var buffer = fs.readFileSync(path.join(root, file));
    assert.ok(buffer.length > 0);
    assert.notDeepEqual(Array.from(buffer.subarray(0, 3)), [0xef, 0xbb, 0xbf], "unexpected BOM");
    assert.doesNotMatch(buffer.toString("utf8"), /\uFFFD/, "invalid UTF-8 replacement character");
  });
});

[
  "js/i18n.js", "js/sound.js", "js/engine.js", "js/rules.js",
  "js/chip-stack.js", "js/strategy.js", "js/game.js", "js/pwa.js", "sw.js"
].forEach(function (file) {
  test("JavaScript parses successfully: " + file, function () {
    assert.doesNotThrow(function () { new vm.Script(read(file), { filename: file }); });
  });
});

test("every HTML id is unique", function () {
  var ids = Array.from(read("index.html").matchAll(/\bid=["']([^"']+)["']/g), function (match) { return match[1]; });
  var duplicates = ids.filter(function (id, index) { return ids.indexOf(id) !== index; });
  assert.deepEqual(duplicates, []);
});

test("every button declares a safe non-submit type", function () {
  var buttons = read("index.html").match(/<button\b[^>]*>/g) || [];
  assert.ok(buttons.length >= 25);
  buttons.forEach(function (button) {
    assert.match(button, /\btype=["']button["']/i, button);
  });
});

test("all label for attributes point to existing controls", function () {
  var html = read("index.html");
  var ids = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), function (match) { return match[1]; }));
  Array.from(html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/g), function (match) { return match[1]; })
    .forEach(function (target) { assert.ok(ids.has(target), "missing label target: " + target); });
});

test("runtime scripts load in dependency order", function () {
  var scripts = Array.from(read("index.html").matchAll(/<script\b[^>]*src=["']([^"']+)["']/g), function (match) {
    return match[1];
  });
  assert.deepEqual(scripts, [
    "js/i18n.js", "js/sound.js", "js/engine.js", "js/rules.js",
    "js/chip-stack.js", "js/strategy.js", "js/game.js", "js/pwa.js"
  ]);
});

test("the service-worker asset list has no duplicates", function () {
  var block = read("sw.js").match(/var ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block);
  var assets = Array.from(block[1].matchAll(/["']([^"']+)["']/g), function (match) { return match[1]; });
  assert.equal(new Set(assets).size, assets.length);
});

test("every service-worker asset resolves inside the project", function () {
  var block = read("sw.js").match(/var ASSETS = \[([\s\S]*?)\];/);
  var assets = Array.from(block[1].matchAll(/["']([^"']+)["']/g), function (match) { return match[1]; });
  assets.filter(function (asset) { return asset !== "./"; }).forEach(function (asset) {
    assert.match(asset, /^\.\/[A-Za-z0-9_./-]+$/);
    assert.doesNotMatch(asset, /\.\./);
    assert.ok(fs.existsSync(path.resolve(root, asset)), "missing cached file: " + asset);
  });
});

test("all local font references are in the offline cache", function () {
  var worker = read("sw.js");
  var fonts = Array.from(read("css/styles.css").matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g), function (match) {
    return path.posix.normalize("assets/" + match[1].split("assets/").pop());
  });
  assert.equal(fonts.length, 2);
  fonts.forEach(function (font) {
    assert.ok(fs.existsSync(path.join(root, font)));
    assert.ok(worker.includes('"./' + font + '"'));
  });
});

test("all local sound references are in the offline cache", function () {
  var worker = read("sw.js");
  var sounds = Array.from(read("js/sound.js").matchAll(/["'](assets\/audio\/[^"']+\.ogg)["']/g), function (match) {
    return match[1];
  });
  assert.equal(sounds.length, 8);
  sounds.forEach(function (sound) {
    assert.ok(fs.existsSync(path.join(root, sound)));
    assert.ok(worker.includes('"./' + sound + '"'));
  });
});

[
  "card-slide-1.ogg", "card-slide-2.ogg", "card-flip.ogg", "chip-click-1.ogg",
  "chip-click-2.ogg", "chip-stack.ogg", "chips-push.ogg", "shuffle.ogg"
].forEach(function (file) {
  test("bundled audio has an Ogg container header: " + file, function () {
    var buffer = fs.readFileSync(path.join(root, "assets/audio", file));
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "OggS");
    assert.ok(buffer.length > 1024);
  });
});

[
  "table21-sans-regular.woff2", "table21-sans-semibold.woff2"
].forEach(function (file) {
  test("bundled font has a WOFF2 header: " + file, function () {
    var buffer = fs.readFileSync(path.join(root, "assets/fonts", file));
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "wOF2");
    assert.ok(buffer.length > 1024);
  });
});

test("manifest remains a relative standalone offline application", function () {
  var manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.start_url, "./index.html");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.lang, "en");
});

test("manifest icons are local and available", function () {
  var manifest = JSON.parse(read("manifest.json"));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  manifest.icons.forEach(function (icon) {
    assert.doesNotMatch(icon.src, /^(?:https?:)?\/\//);
    assert.ok(fs.existsSync(path.resolve(root, icon.src)));
    assert.equal(icon.type, "image/svg+xml");
  });
});

test("the app icon is a self-contained scalable vector", function () {
  var icon = read("icon.svg");
  assert.match(icon, /^<svg\b/);
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.doesNotMatch(icon, /<(?:image|script|foreignObject)\b/i);
  assert.doesNotMatch(icon, /\b(?:href|src)=["'](?:https?:)?\/\//i);
});

test("PWA registration is limited to web protocols", function () {
  var pwa = read("js/pwa.js");
  assert.match(pwa, /location\.protocol === "http:" \|\| location\.protocol === "https:"/);
  assert.match(pwa, /if \(!\("serviceWorker" in navigator\) \|\| !isWeb\) return;/);
});

test("the service worker only handles same-origin GET requests", function () {
  var worker = read("sw.js");
  assert.match(worker, /e\.request\.method !== "GET"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
});

test("the service worker provides an offline navigation fallback", async function () {
  var handlers = {}, response;
  vm.runInNewContext(read("sw.js"), {
    URL: URL, Response: Response,
    self: { location: { origin: "https://table.test", href: "https://table.test/game/sw.js" }, addEventListener: function (name, callback) { handlers[name] = callback; } },
    caches: { open: async function () { return { match: async function (request) {
      return request === "https://table.test/game/index.html" ? new Response("local app shell") : undefined;
    } }; } },
    fetch: async function () { throw new Error("offline"); }
  });
  handlers.fetch({ request: { url: "https://table.test/game/route", method: "GET", mode: "navigate" }, respondWith: function (value) { response = value; } });
  assert.equal(await (await response).text(), "local app shell");
});

test("cache updates claim clients and retire older Table 21 caches", function () {
  var worker = read("sw.js");
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /k\.indexOf\(CACHE_PREFIX\) === 0 && k !== CACHE/);
});

test("HTML has no inline executable event handlers", function () {
  assert.doesNotMatch(read("index.html"), /\son[a-z]+\s*=/i);
});

test("runtime JavaScript avoids dynamic code execution", function () {
  ["js/i18n.js", "js/sound.js", "js/engine.js", "js/rules.js", "js/chip-stack.js", "js/strategy.js", "js/game.js", "js/pwa.js", "sw.js"]
    .forEach(function (file) {
      assert.doesNotMatch(read(file), /\beval\s*\(|\bnew\s+Function\b/, file);
    });
});

test("all stylesheet braces are balanced", function () {
  var css = read("css/styles.css").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  var depth = 0;
  Array.from(css).forEach(function (character) {
    if (character === "{") depth++;
    if (character === "}") depth--;
    assert.ok(depth >= 0, "closing brace without opener");
  });
  assert.equal(depth, 0);
});

test("every referenced CSS animation has a matching keyframe", function () {
  var css = read("css/styles.css");
  var keyframes = new Set(Array.from(css.matchAll(/@keyframes\s+([\w-]+)/g), function (match) { return match[1]; }));
  var references = Array.from(css.matchAll(/\banimation:\s*([\w-]+)/g), function (match) { return match[1]; });
  references.filter(function (name) { return name !== "none"; }).forEach(function (name) {
    assert.ok(keyframes.has(name), "missing keyframes: " + name);
  });
});

test("responsive rules cover phone width, short height, and reduced motion", function () {
  var css = read("css/styles.css");
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /@media \(max-width: 350px\)/);
  assert.match(css, /@media \(max-height: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("all visual themes define their own table and card-back palette", function () {
  var css = read("css/styles.css");
  ["midnight", "bordeaux"].forEach(function (theme) {
    var block = css.match(new RegExp('body\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\}'));
    assert.ok(block, theme);
    ["--felt-highlight", "--felt-1", "--felt-2", "--felt-edge", "--card-back-top", "--card-back-bottom"]
      .forEach(function (variable) { assert.ok(block[1].includes(variable + ":"), theme + " missing " + variable); });
  });
});

test("settings and insurance dialogs declare modal semantics", function () {
  var html = read("index.html");
  assert.match(html, /class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settingsTitle"/);
  assert.match(html, /class="ins-panel" role="dialog" aria-modal="true" aria-labelledby="insTitle" aria-describedby="insDesc"/);
});

test("settings switches and grouped controls have accessible names", function () {
  var html = read("index.html");
  assert.match(html, /<label for="setHitSoft17"[^>]*data-i18n="dealerHitsSoft17"/);
  assert.match(html, /<label for="setSound"[^>]*data-i18n="soundLabel"/);
  assert.match(html, /class="seg" role="group" aria-labelledby="settingsLanguageLabel"/);
  assert.match(html, /class="seg" role="group" aria-labelledby="deckCountLabel"/);
  ["Master", "Cards", "Chips", "Table"].forEach(function (name) {
    assert.match(html, new RegExp('id="sound' + name + '"[^>]*aria-labelledby="sound' + name + 'Label"'));
  });
});

test("all keyboard actions advertise their shortcuts", function () {
  var html = read("index.html");
  ["btnClear", "btnDeal", "btnRebet", "btnHit", "btnStand", "btnDouble", "btnSplit", "btnSurrender"]
    .forEach(function (id) {
      var button = html.match(new RegExp('<button\\b[^>]*id="' + id + '"[^>]*>'));
      assert.ok(button, id);
      assert.match(button[0], /aria-keyshortcuts=/, id);
    });
});

test("arbitrary whole-dollar deposits match exact chip settlement support", function () {
  var html = read("index.html");
  var game = read("js/game.js");
  assert.match(html, /id="depositAmount"[^>]*min="1" step="1"/);
  assert.match(game, /CHIP_DENOMS = \[25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1\]/);
});

test("per-hand high-limit stacks use a narrow row contract", function () {
  var game = read("js/game.js");
  var css = read("css/styles.css");
  assert.match(game, /maxColumnsPerRow: isHandStack \? 3 : 6/);
  assert.match(css, /\.hand-wager \.pile-dense \.pile-row/);
  assert.match(css, /--stack-w: 24px/);
  assert.match(game, /state\.hands\.length >= 3/);
  assert.match(game, /stackOptions\.exactChipLimit = 8/);
  assert.match(css, /\.hand-count-4 \.hand-wager \.pile-dense/);
});

test("split twenty-one is not presented as a natural blackjack", function () {
  var game = read("js/game.js");
  assert.match(game, /var split = state\.hands\.length > 1;/);
  assert.match(game, /naturalBlackjack = !split && !hand\.fromSplit && isBlackjack\(hand\.cards\)/);
  assert.match(game, /!state\.hands\[0\]\.fromSplit && isBlackjack\(state\.hands\[0\]\.cards\)/);
});

test("money messages contain no accidental double-space separators", function () {
  var game = read("js/game.js");
  var i18n = read("js/i18n.js");
  assert.doesNotMatch(game, /["']  [+-]\$/);
  assert.doesNotMatch(i18n, /  \+\$/);
});

test("persisted bankroll accepts legitimate wins above the deposit-era ceiling", function () {
  var game = read("js/game.js");
  assert.match(game, /MAX_BANKROLL = Number\.MAX_SAFE_INTEGER/);
  assert.doesNotMatch(game, /MAX_BANKROLL = 1e9/);
});

test("small shoes use a penetration-based reserve instead of reshuffling every hand", function () {
  var game = read("js/game.js");
  assert.match(game, /penetrationReserve = Math\.ceil\(needed \* \(1 - PENETRATION\)\)/);
  assert.match(game, /Math\.min\(ROUND_CARD_RESERVE, Math\.max\(12, penetrationReserve\)\)/);
  assert.doesNotMatch(game, /Math\.min\(ROUND_CARD_RESERVE, needed\)/);
});

test("live visual settings never persist an in-progress wager deduction", function () {
  var game = read("js/game.js");
  assert.match(game, /function persistSettings\(\)\s*\{\s*save\(KEYS\.settings, state\.settings\);\s*\}/);
  assert.match(game, /state\.settings\.theme = theme;\s*persistSettings\(\);/);
  assert.match(game, /state\.settings\.animationSpeed = speed;\s*persistSettings\(\);/);
  assert.match(game, /state\.settings\.hitSoft17 = e\.target\.checked;[\s\S]*?persistSettings\(\);/);
});

test("deposits are persisted independently and disabled throughout live rounds", function () {
  var game = read("js/game.js");
  assert.match(game, /function deposit\(amount\)\s*\{\s*if \(state\.phase !== "betting" \|\| state\.busy\) return false;/);
  assert.match(game, /state\.bankroll = nextBankroll;\s*persistBankroll\(\);/);
  assert.match(game, /var depositDisabled = !betting \|\| state\.busy;/);
  assert.match(game, /document\.querySelectorAll\("\[data-deposit\]"\)[\s\S]*?button\.disabled = depositDisabled;/);
});
