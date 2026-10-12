"use strict";

// Regression guards for earlier behavior fixes.
// Part of the core suite: node --test tests
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = file => fs.readFileSync(path.join(root, file), "utf8");

function engine(crypto) {
  const context = { module: { exports: {} }, crypto };
  vm.runInNewContext(source("js/engine.js"), context);
  return context.module.exports;
}

test("crypto rejection sampling discards the incomplete uint32 bucket", () => {
  const samples = [4294967295, 4294967294, 7];
  let calls = 0;
  const api = engine({ getRandomValues: buffer => { buffer[0] = samples[calls++]; } });
  assert.equal(api.randInt(6), 1);
  assert.equal(calls, 3);
});

test("crypto sampling accepts the complete uint32 range", () => {
  const api = engine({ getRandomValues: buffer => { buffer[0] = 4294967295; } });
  assert.equal(api.randInt(4294967296), 4294967295);
  assert.equal(api.randInt(1), 0);
});

for (const [sample, expected] of [[0, 0], [0.25, 13], [0.5, 26], [0.9999999999, 51]]) {
  test("non-crypto fallback bucket for " + sample, () => {
    assert.equal(engine(undefined).randInt(52, () => sample), expected);
  });
}

for (const sample of [-0.01, 1, Infinity, NaN, "invalid"]) {
  test("non-crypto fallback rejects " + String(sample), () => {
    assert.throws(() => engine(undefined).randInt(52, () => sample), /random source/);
  });
}

test("all Fisher-Yates choices produce each three-card permutation once", () => {
  const api = engine(undefined);
  const permutations = new Set();
  for (let first = 0; first < 3; first++) {
    for (let second = 0; second < 2; second++) {
      const choices = [first, second];
      permutations.add(api.shuffle(["A", "2", "3"], () => choices.shift()).join(""));
    }
  }
  assert.equal(permutations.size, 6);
});

function i18n(savedLanguage) {
  const context = {
    document: { querySelectorAll: () => [], documentElement: { setAttribute() {} } },
    localStorage: { getItem: () => savedLanguage || null, setItem() {} }
  };
  context.window = context;
  vm.runInNewContext(source("js/i18n.js").replace("global.I18n = {", "global.I18n = { dictionary: DICT,"), context);
  return context.I18n;
}

test("all translation values have matching types, array lengths and placeholders", () => {
  const dictionary = i18n().dictionary;
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.tr).sort());
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(dictionary.en)) {
    assert.equal(Array.isArray(dictionary.en[key]), Array.isArray(dictionary.tr[key]), key);
    const english = [].concat(dictionary.en[key]);
    const turkish = [].concat(dictionary.tr[key]);
    assert.equal(english.length, turkish.length, key);
    english.forEach((text, index) => assert.deepEqual(placeholders(text), placeholders(turkish[index]), key));
  }
});

for (const language of ["__proto__", "constructor", "toString"]) {
  test("unsupported inherited language key is rejected: " + language, () => {
    const api = i18n(language);
    assert.equal(api.get(), "en", "stored language must belong to I18n.available");
    api.setLanguage(language);
    assert.equal(api.get(), "en");
  });
}

function pwa(phase, hadController = true) {
  const callbacks = {};
  let reloads = 0;
  const context = {
    location: { protocol: "https:", reload: () => { reloads++; } },
    document: { body: { dataset: { phase }, getAttribute: () => phase } },
    navigator: { serviceWorker: { controller: hadController ? {} : null, addEventListener: (type, handler) => { callbacks[type] = handler; } } },
    window: { addEventListener() {} },
    setTimeout() {}, setInterval() {}
  };
  vm.runInNewContext(source("js/pwa.js"), context);
  return { update: () => callbacks.controllerchange(), reloads: () => reloads };
}

test("first service-worker control does not reload the app", () => {
  const app = pwa("player", false);
  app.update();
  assert.equal(app.reloads(), 0);
});

test("an idle app reloads only once for a new service-worker controller", () => {
  const app = pwa("betting");
  app.update(); app.update();
  assert.equal(app.reloads(), 1);
});

for (const phase of ["dealing", "insurance", "player", "dealer", "payout", "clearing"]) {
  test("service-worker update preserves an unfinished round during " + phase, () => {
    const app = pwa(phase);
    app.update();
    assert.equal(app.reloads(), 0, "update should wait until the hand is settled");
  });
}

function worker(options = {}) {
  const handlers = {};
  const context = {
    URL, Request, Response,
    self: { location: { origin: "https://table.test" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: options.caches || { match: async () => undefined, open: async () => ({ put: async () => {} }) },
    fetch: options.fetch || (async () => new Response("fresh", { status: 200 }))
  };
  vm.runInNewContext(source("sw.js"), context);
  return { async request(url, init) {
    let response;
    handlers.fetch({ request: new Request(url, init), respondWith: value => { response = value; } });
    return response;
  } };
}

test("service worker leaves third-party requests and POST requests alone", async () => {
  const app = worker();
  assert.equal(await app.request("https://outside.test/asset"), undefined);
  assert.equal(await app.request("https://table.test/action", { method: "POST" }), undefined);
});

test("successful network responses remain available when cache storage is full", async () => {
  const app = worker({ caches: {
    match: async () => undefined,
    open: async () => ({ put: async () => { throw new Error("QuotaExceededError"); } })
  } });
  const response = await app.request("https://table.test/js/new.js");
  assert.equal(response.status, 200, "a cache write failure must not discard a successful fetch");
  assert.equal(await response.text(), "fresh");
});

test("worker reads its own cache rather than an unrelated same-origin cache", async () => {
  const app = worker({ caches: {
    match: async () => new Response("unrelated cached content"),
    open: async () => ({ match: async () => new Response("current app shell"), put: async () => {} })
  } });
  assert.equal(await (await app.request("https://table.test/index.html")).text(), "current app shell");
});

function soundWithUnsupportedSamples(options = {}) {
  let synthSources = 0;
  const samples = [], pending = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = () => ({ gain: parameter(), frequency: parameter(), Q: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect() {}, start() {}, stop() {} });
  class AudioContext {
    constructor() { this.sampleRate = 100; this.currentTime = 0; this.state = "running"; this.destination = node(); }
    createDynamicsCompressor() { return node(); }
    createBiquadFilter() { return node(); }
    createGain() { return node(); }
    createConvolver() { return node(); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { synthSources++; return node(); }
    createOscillator() { synthSources++; return node(); }
  }
  class Audio {
    constructor() { this.listeners = {}; }
    cloneNode() { const sample = new Audio(); samples.push(sample); return sample; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    play() {
      const error = Object.assign(new Error(options.error || "NotSupportedError"), { name: options.error || "NotSupportedError" });
      if (options.defer) return new Promise((resolve, reject) => pending.push(() => reject(error)));
      if (options.sync) throw error;
      return Promise.reject(error);
    }
    pause() {}
  }
  const context = { Audio, AudioContext }; context.window = context;
  vm.runInNewContext(source("js/sound.js"), context);
  return { api: context.Sound, sources: () => synthSources, reject: () => pending.forEach(reject => reject()), mediaError: () => samples.at(-1).listeners.error({ type: "error" }) };
}

test("unsupported sample playback falls back to the available Web Audio synthesizer", async () => {
  const app = soundWithUnsupportedSamples();
  app.api.setEnabled(true);
  app.api.card();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(app.sources() > 0, "a rejected sample promise should invoke the fallback");
});

test("media error plus rejected playback promise runs a sample fallback only once", async () => {
  const app = soundWithUnsupportedSamples();
  app.api.setEnabled(true); app.api.card(); app.mediaError();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(app.sources(), 2);
});

test("a late rejected sample cannot restart sound after mute and unmute", async () => {
  const app = soundWithUnsupportedSamples({ defer: true });
  app.api.setEnabled(true); app.api.card(); app.api.setEnabled(false); app.api.setEnabled(true);
  app.reject(); await Promise.resolve(); await Promise.resolve();
  assert.equal(app.sources(), 0);
});

for (const error of ["NotAllowedError", "AbortError"]) {
  for (const sync of [false, true]) {
    test("sample fallback respects " + error + (sync ? " thrown synchronously" : " rejected asynchronously"), async () => {
      const app = soundWithUnsupportedSamples({ error, sync });
      app.api.setEnabled(true); app.api.card();
      await Promise.resolve(); await Promise.resolve();
      assert.equal(app.sources(), 0);
    });
  }
}

test("the maximum accepted all-in stake has a precisely representable blackjack return", () => {
  const api = engine(undefined);
  // The fix gives wagers an explicit limit; account savings retain their range.
  const returnAmount = api.payoutFor("blackjack", api.MAX_WAGER);
  assert.ok(Number.isSafeInteger(returnAmount), "the accepted wager range must leave room for settlement arithmetic");
  assert.equal(BigInt(returnAmount), BigInt(api.MAX_WAGER) * 5n / 2n);
  assert.throws(() => api.payoutFor("blackjack", Number.MAX_SAFE_INTEGER), /safe table limit/);
});
