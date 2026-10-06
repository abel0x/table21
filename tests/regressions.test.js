"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Engine = require("../js/engine.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

for (const wager of [Engine.MAX_WAGER, Engine.MAX_WAGER - 1, 1000000001, 101]) {
  for (const [result, multiplier, divisor] of [["blackjack", 5n, 2n], ["win", 2n, 1n], ["surrender", 1n, 2n]]) {
    test("safe payout matches integer oracle: " + result + "/" + wager, () => {
      const actual = Engine.payoutFor(result, wager);
      assert.ok(Number.isSafeInteger(actual));
      assert.equal(BigInt(actual), BigInt(wager) * multiplier / divisor);
    });
  }
}

for (const amount of [Engine.MAX_WAGER + 1, Number.MAX_SAFE_INTEGER, 1e20]) {
  test("oversized wager is rejected before payout arithmetic: " + amount, () => {
    assert.throws(() => Engine.payoutFor("blackjack", amount), /safe table limit/);
    assert.throws(() => Engine.settleRound([], [], { insuranceStake: amount }), /safe table limit/);
  });
}

test("four maximum stakes and insurance stay inside the safe ledger range", () => {
  for (const dealer of [[{ rank: "9" }, { rank: "8" }], [{ rank: "A" }, { rank: "K" }]]) {
    const hands = Array.from({ length: 4 }, () => ({ cards: [{ rank: "K" }, { rank: "Q" }], bet: Engine.MAX_WAGER, fromSplit: true }));
    const round = Engine.settleRound(hands, dealer, { insuranceStake: Engine.MAX_WAGER });
    for (const key of ["mainStake", "mainReturn", "insuranceStake", "insuranceReturn", "totalStake", "totalReturn", "profit"]) assert.ok(Number.isSafeInteger(round[key]), key);
    assert.equal(round.totalReturn - round.totalStake, round.profit);
  }
});

test("an unbounded hand list cannot overflow the settlement ledger", () => {
  assert.throws(() => Engine.settleRound(Array(5).fill({ bet: Engine.MAX_WAGER, cards: [] }), []), /at most four hands/);
});

function pwa(initial, controlled = true) {
  const attributes = Object.assign({ "data-phase": "player", "data-busy": "false", "data-wager": "100" }, initial);
  const listeners = {};
  let observe, reloads = 0;
  vm.runInNewContext(read("js/pwa.js"), {
    location: { protocol: "https:", reload() { reloads++; } },
    navigator: { serviceWorker: { controller: controlled ? {} : null, addEventListener(name, callback) { listeners[name] = callback; } } },
    document: { body: { getAttribute(name) { return attributes[name] || null; } } },
    window: { addEventListener() {} },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {} }
  });
  return { update() { listeners.controllerchange(); }, set(next) { Object.assign(attributes, next); observe(); }, get reloads() { return reloads; } };
}

test("pending PWA update reloads once, only after the hand and wager clear", () => {
  const app = pwa();
  app.update();
  for (const phase of ["dealer", "payout", "clearing", "betting"]) {
    app.set({ "data-phase": phase });
    assert.equal(app.reloads, 0);
  }
  app.set({ "data-wager": "0" });
  assert.equal(app.reloads, 1);
  app.update(); app.set({ "data-wager": "0" });
  assert.equal(app.reloads, 1);
});

test("a staged bet prevents an otherwise idle PWA reload", () => {
  const app = pwa({ "data-phase": "betting" });
  app.update(); assert.equal(app.reloads, 0);
  app.set({ "data-wager": "0" }); assert.equal(app.reloads, 1);
});

test("an account operation prevents an otherwise idle PWA reload", () => {
  const app = pwa({ "data-phase": "betting", "data-wager": "0", "data-busy": "true" });
  app.update(); assert.equal(app.reloads, 0);
  app.set({ "data-busy": "false" }); assert.equal(app.reloads, 1);
});

test("first worker control is ignored but a later update still activates safely", () => {
  const app = pwa({ "data-phase": "betting", "data-wager": "0" }, false);
  app.update(); assert.equal(app.reloads, 0);
  app.update(); assert.equal(app.reloads, 1);
});

function worker(options = {}) {
  const callbacks = {}, opened = [], removed = [];
  let activations = 0;
  const context = {
    URL, Response,
    self: {
      location: { origin: "https://table.test", href: "https://table.test/one/sw.js" },
      clients: { claim: async () => {}, matchAll: async () => options.clients || [] },
      skipWaiting: async () => { activations++; },
      addEventListener(name, callback) { callbacks[name] = callback; }
    },
    caches: {
      keys: async () => options.keys || [],
      delete: async key => { removed.push(key); },
      open: async key => {
        opened.push(key);
        if (options.unavailable) throw new Error("storage denied");
        return { addAll: async () => {}, match: async request => options.cached && options.cached(request), put: async () => { if (options.full) throw new Error("QuotaExceededError"); } };
      },
      match: async () => { throw new Error("Unscoped cache access"); }
    },
    fetch: async () => {
      if (options.offline) throw new Error("offline");
      return new Response("network response", { status: options.status || 200 });
    }
  };
  vm.runInNewContext(read("sw.js"), context);
  return {
    opened, removed, cache: context.CACHE, prefix: context.CACHE_PREFIX,
    get activations() { return activations; },
    async install() { let done; callbacks.install({ waitUntil(value) { done = value; } }); await done; },
    async requestActivation(id, type = "TABLE21_ACTIVATE") {
      let done;
      callbacks.message({ data: { type }, source: { id }, waitUntil(value) { done = value; } });
      await done;
    },
    async fetch(mode = "cors") {
      let response;
      callbacks.fetch({ request: { url: "https://table.test/one/route", method: "GET", mode }, respondWith(value) { response = value; } });
      return response;
    },
    async activate() { let done; callbacks.activate({ waitUntil(value) { done = value; } }); await done; }
  };
}

test("unavailable cache storage still permits a successful network response", async () => {
  const app = worker({ unavailable: true });
  assert.equal(await (await app.fetch()).text(), "network response");
});

test("a full cache never turns an HTTP 200 into a false offline error", async () => {
  const app = worker({ full: true });
  assert.equal((await app.fetch()).status, 200);
});

test("a server error is preserved rather than cached or disguised", async () => {
  const app = worker({ status: 404 });
  assert.equal((await app.fetch()).status, 404);
});

test("offline navigation without any cached shell returns an explicit 503", async () => {
  const app = worker({ offline: true });
  assert.equal((await app.fetch("navigate")).status, 503);
});

test("offline subdirectory navigation uses that installation's own shell", async () => {
  const app = worker({ offline: true, cached: request => request === "https://table.test/one/index.html" ? new Response("one shell") : undefined });
  assert.equal(await (await app.fetch("navigate")).text(), "one shell");
  assert.ok(app.opened.every(key => key === app.cache));
});

test("cache cleanup cannot erase a different subdirectory's installation", async () => {
  const app = worker();
  const old = app.prefix + "v1", other = "vbj-%2Ftwo%2F-v1";
  const cleanup = worker({ keys: [old, app.cache, other, "unrelated-app"] });
  await cleanup.activate();
  assert.deepEqual(cleanup.removed, [old]);
});

test("installing a new worker never forces an older live page to upgrade", async () => {
  const app = worker({ clients: [{ id: "old", url: "https://table.test/one/index.html" }] });
  await app.install();
  assert.equal(app.activations, 0);
});

test("a single compatible idle page can activate a waiting worker", async () => {
  const app = worker({ clients: [{ id: "ready", url: "https://table.test/one/index.html" }] });
  await app.requestActivation("ready");
  assert.equal(app.activations, 1);
});

test("an update requested by one tab cannot interrupt a second tab", async () => {
  const app = worker({ clients: [{ id: "ready", url: "https://table.test/one/index.html" }, { id: "playing", url: "https://table.test/one/index.html" }] });
  await app.requestActivation("ready");
  assert.equal(app.activations, 0);
});

test("unrelated clients and unrelated messages cannot trigger activation", async () => {
  const app = worker({ clients: [{ id: "ready", url: "https://table.test/one/index.html" }] });
  await app.requestActivation("outsider"); await app.requestActivation("ready", "unrelated");
  assert.equal(app.activations, 0);
});

test("the insurance offer lives in the controls so it never covers either hand", () => {
  const html = read("index.html");
  const controls = html.slice(html.indexOf('<section class="controls"'), html.indexOf("</section>", html.indexOf('<section class="controls"')));
  assert.match(controls, /id="insuranceOverlay"/);
  assert.doesNotMatch(html.slice(html.indexOf('<div class="table-felt">'), html.indexOf('<section class="controls"')), /insuranceOverlay/);
});

test("hidden controls under the insurance offer return instantly, not via a transition", () => {
  const css = read("css/styles.css");
  const rule = css.match(/body\[data-phase="insurance"\] \.controls > :not\(\.ins-overlay\) \{([^}]*)\}/);
  assert.ok(rule, "insurance-phase controls rule");
  assert.doesNotMatch(rule[1], /visibility/);
  assert.match(rule[1], /pointer-events:\s*none/);
});

test("iOS gets a PNG home-screen icon that is also cached offline", () => {
  assert.match(read("index.html"), /<link rel="apple-touch-icon" href="apple-touch-icon\.png" \/>/);
  const png = fs.readFileSync(path.join(__dirname, "..", "apple-touch-icon.png"));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.match(read("sw.js"), /"\.\/apple-touch-icon\.png"/);
});

test("settlement shows one verdict: no money toast or dealer echo alongside the badge", () => {
  const game = read("js/game.js");
  const settle = game.slice(game.indexOf("function settle()"), game.indexOf("function prepareHandSettlements"));
  assert.doesNotMatch(settle, /moneyToast|toastKey|dealerSay/);
  assert.match(settle, /showResult\("win", "youWin", profit\)/);
});
