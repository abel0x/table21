"use strict";

// Real-browser suite. Puppeteer is a development dependency only; the game never loads it.
// npm run test:browser  (or: BLACKJACK_PUPPETEER_PATH=/absolute/path/to/puppeteer node --test this-file)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const puppeteer = require(process.env.BLACKJACK_PUPPETEER_PATH || "puppeteer");
const root = path.resolve(__dirname, "../..");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "table21-browser-"));
const isFirefox = process.env.BLACKJACK_BROWSER === "firefox";
let browser, server, baseURL, workerRevision = 0, sceneIndex = 0;

test.before(async () => {
  server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      let body = fs.readFileSync(file);
      if (relative === "sw.js") body = Buffer.from(body.toString().replace(/vbj-v\d+/, "vbj-spec-" + workerRevision));
      const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseURL = "http://127.0.0.1:" + server.address().port + "/index.html";
  browser = await puppeteer.launch(isFirefox
    ? { browser: "firefox", executablePath: process.env.BLACKJACK_BROWSER_PATH || "/usr/bin/firefox", headless: true, protocolTimeout: 15000, extraPrefsFirefox: { "ui.prefersReducedMotion": 1 } }
    : { headless: true, protocolTimeout: 15000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log("Browser: " + await browser.version());
  console.log("Screenshots: " + artifacts);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function scene(options, run) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [], remote = [];
  let failed = false;
  const sceneId = ++sceneIndex;
  page.setDefaultTimeout(5000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(baseURL).origin + "/")) remote.push(request.url());
  });
  await page.setViewport({ width: options.width || 1280, height: options.height || 900 });
  if (!isFirefox) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: options.motion ? "no-preference" : "reduce" }]);
  await page.evaluateOnNewDocument(config => {
    // BiDi also invokes preloads in the initial, origin-less document.
    if (!["file:", "http:", "https:"].includes(location.protocol)) return;
    if (config.noLocks) Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    if (config.holdTimers) {
      // Lets a test pause the table mid-round: callbacks that come due while
      // held are parked and run, in order, once released.
      const nativeSetTimeout = window.setTimeout.bind(window);
      const parked = [];
      let held = false;
      window.setTimeout = function (callback, ms, ...args) {
        if (typeof callback !== "function") return nativeSetTimeout(callback, ms, ...args);
        const run = () => { if (held) parked.push(run); else callback(...args); };
        return nativeSetTimeout(run, ms);
      };
      window.holdTableTimers = value => {
        held = value;
        if (!held) parked.splice(0).forEach(run => nativeSetTimeout(run, 0));
      };
    }
    if (!sessionStorage.getItem("spec.initialized")) {
      localStorage.clear();
      localStorage.setItem("vbj.bankroll", JSON.stringify(config.bankroll == null ? 10000 : config.bankroll));
      localStorage.setItem("vbj.settings", JSON.stringify(Object.assign({ ruleProfile: "atlanticCity", theme: "emerald", animationSpeed: "fast" }, config.settings)));
      localStorage.setItem("vbj.lang", config.lang || "en");
      localStorage.setItem("vbj.sound", "false");
      sessionStorage.setItem("spec.initialized", "true");
    }
    Object.defineProperty(window, "BlackjackEngine", {
      configurable: true,
      set(api) {
        if (config.draw) {
          api.shuffle = function (shoe) {
            const selected = config.draw.map(spec => {
              const rank = typeof spec === "string" ? spec : spec.rank;
              const suit = typeof spec === "string" ? null : spec.suit;
              const index = shoe.findIndex(card => card.rank === rank && (!suit || card.suit === suit));
              if (index < 0) throw new Error("Invalid test shoe: missing " + rank);
              return shoe.splice(index, 1)[0];
            });
            return shoe.concat(selected.reverse());
          };
        }
        const settle = api.settleRound;
        api.settleRound = function () {
          const result = settle.apply(api, arguments);
          window.lastSettlement = JSON.parse(JSON.stringify(result));
          return result;
        };
        Object.defineProperty(window, "BlackjackEngine", { value: api, writable: true, configurable: true });
      }
    });
  }, options);
  try {
    await page.goto(options.web ? baseURL : pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
    await run(page);
    assert.deepEqual(errors, [], "browser runtime errors");
    assert.deepEqual(remote, [], "external requests");
  } catch (error) {
    failed = true;
    const screenshot = path.join(artifacts, "failure-" + sceneId + ".png");
    try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
    error.message += " [scene " + sceneId + ", " + screenshot + "]";
    throw error;
  } finally {
    try { await context.close(); }
    catch (error) { if (!failed) throw error; }
  }
}

async function phase(page, value) {
  await page.waitForFunction(expected => document.body.dataset.phase === expected, { timeout: 6000 }, value);
}
async function deal(page, chip = "100") {
  await page.click('.chip[data-value="' + chip + '"]');
  await page.click("#btnDeal");
}
async function reverseTab(page) {
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
}

for (const lang of ["en", "tr"]) {
  test(lang + ": visible translation bindings match the selected language", async () => {
    await scene({ lang }, async page => {
      const mismatch = await page.evaluate(() => [...document.querySelectorAll("[data-i18n]")].filter(node => node.textContent !== I18n.t(node.dataset.i18n)).map(node => ({ key: node.dataset.i18n, text: node.textContent })));
      assert.deepEqual(mismatch, []);
      assert.equal(await page.$eval("html", node => node.lang), lang);
    });
  });
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const names = lang === "tr"
    ? ["Ası", "İkilisi", "Üçlüsü", "Dörtlüsü", "Beşlisi", "Altılısı", "Yedilisi", "Sekizlisi", "Dokuzlusu", "Onlusu", "Valesi", "Kızı", "Papazı"]
    : ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King"];
  const suits = ["♠", "♥", "♦", "♣"];
  const suitNames = lang === "tr" ? ["Maça", "Kupa", "Karo", "Sinek"] : ["spades", "hearts", "diamonds", "clubs"];
  for (const [rankIndex, rank] of ranks.entries()) {
    for (const [suitIndex, suit] of suits.entries()) {
      test(lang + ": card matrix " + rank + suit + " has exact name, indices, color and artwork", async () => {
        await scene({ lang, draw: [{ rank, suit }, "6", "2", "10"] }, async page => {
          await deal(page); await phase(page, "player");
          const card = await page.$eval("#playerHands .card", node => ({
            name: node.getAttribute("aria-label"),
            corners: [...node.querySelectorAll(".corner")].map(corner => corner.textContent),
            red: node.classList.contains("red"),
            pips: [...node.querySelectorAll(".pip-mark")].map(pip => pip.textContent),
            court: [...node.querySelectorAll(".court-person")].map(person => person.getAttribute("class")),
            centerRanks: [...node.querySelectorAll(".court-center-rank")].map(label => label.textContent)
          }));
          const expectedName = lang === "tr" ? suitNames[suitIndex] + " " + names[rankIndex] : names[rankIndex] + " of " + suitNames[suitIndex];
          assert.equal(card.name, expectedName);
          assert.deepEqual(card.corners, [rank, rank]);
          assert.equal(card.red, suit === "♥" || suit === "♦");
          if (["J", "Q", "K"].includes(rank)) {
            assert.deepEqual(card.pips, []);
            assert.deepEqual(card.centerRanks, [rank]);
            assert.deepEqual(card.court, Array(2).fill("court-person court-person-" + rank.toLowerCase()));
          } else {
            assert.deepEqual(card.pips, Array(rank === "A" ? 1 : Number(rank)).fill(suit));
            assert.deepEqual(card.court, []);
          }
        });
      });
    }
  }
  test(lang + ": insurance dialog contains focus during forward and reverse tabbing", async () => {
    await scene({ lang, draw: ["10", "A", "7", "9"] }, async page => {
      await deal(page); await phase(page, "insurance");
      await page.focus("#btnInsNo"); await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "btnInsYes");
      await reverseTab(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), "btnInsNo");
      await page.keyboard.press("Escape"); await phase(page, "player");
      assert.equal(await page.$eval("#insuranceOverlay", node => node.hidden), true);
    });
  });
}

test("language changes translate a currently visible deposit notification", async () => {
  await scene({}, async page => {
    await page.click("#settingsBtn"); await page.click('[data-deposit="1000"]'); await page.click('[data-set-lang="tr"]');
    const toast = await page.$eval("#toast", node => node.textContent);
    assert.equal(toast, "Bakiyenize $1.000 eklendi");
  });
});

test("language change during settlement preserves the arriving payment stack", { skip: isFirefox && "This timing test requires per-page media emulation, unavailable through this BiDi adapter" }, async () => {
  await scene({ motion: true, draw: ["10", "9", "9", "8"] }, async page => {
    await deal(page); await phase(page, "player"); await page.click("#btnStand");
    await page.waitForSelector(".hand-payout-stack.arriving .stack-chip");
    const before = await page.$$eval(".hand-payout-stack .stack-chip", nodes => nodes.length);
    await page.click('[data-lang="tr"]');
    const after = await page.$$eval(".hand-payout-stack .stack-chip", nodes => nodes.length);
    assert.equal(after, before, "translating text must preserve a payment that is already visible");
  });
});

test("language change during card collection preserves the discard animation", { skip: isFirefox && "This timing test requires per-page media emulation, unavailable through this BiDi adapter" }, async () => {
  await scene({ motion: true, draw: ["10", "9", "7", "8"] }, async page => {
    await deal(page); await phase(page, "player"); await page.click("#btnStand");
    await page.waitForSelector(".card.collecting");
    const count = await page.$$eval(".card.collecting", nodes => nodes.length);
    await page.click('[data-lang="tr"]');
    assert.equal(await page.$$eval(".card.collecting", nodes => nodes.length), count);
  });
});

test("a language change while the bankroll counts up cannot rewind the balance", async () => {
  await scene({}, async page => {
    await page.click("#settingsBtn");
    await page.click('[data-deposit="100000"]');
    await page.waitForFunction(() => localStorage.getItem("vbj.bankroll") === "110000");
    const amounts = await page.evaluate(async () => {
      I18n.setLanguage("tr");
      const initial = document.querySelector("#bankroll").textContent;
      await new Promise(requestAnimationFrame);
      return { initial, next: document.querySelector("#bankroll").textContent };
    });
    assert.equal(amounts.next, amounts.initial);
  });
});

for (const [width, height] of [[844,390], [667,375], [568,320], [640,400], [320,568], [768,1024]]) {
  test("table and controls do not overlap at " + width + "x" + height, async () => {
    await scene({ width, height, lang: "tr" }, async page => {
      const geometry = await page.evaluate(() => ({ tableBottom: document.querySelector(".table-felt").getBoundingClientRect().bottom, controlsTop: document.querySelector(".controls").getBoundingClientRect().top, viewport: innerHeight }));
      assert.ok(geometry.tableBottom <= geometry.controlsTop + 1, JSON.stringify(geometry));
      assert.ok(geometry.tableBottom <= geometry.viewport, JSON.stringify(geometry));
    });
  });
}

for (const [width, height] of [[844,390], [667,375], [568,320], [640,400]]) {
  test("landscape live hand remains readable and playable at " + width + "x" + height, async () => {
    await scene({ width, height, lang: "tr", draw: ["10", "9", "7", "8"] }, async page => {
      await deal(page); await phase(page, "player");
      const clipped = await page.evaluate(() => {
        const felt = document.querySelector(".table-felt").getBoundingClientRect();
        return [...document.querySelectorAll(".card, .hand-tag, .hand-wager")].filter(node => {
          const box = node.getBoundingClientRect();
          return box.left < felt.left || box.right > felt.right || box.top < felt.top || box.bottom > felt.bottom;
        }).map(node => node.className);
      });
      assert.deepEqual(clipped, []);
      if (process.env.BLACKJACK_SCREENSHOTS) await page.screenshot({ path: path.join(artifacts, "landscape-" + width + "-" + height + ".png"), fullPage: true });
      await page.click("#btnStand"); await phase(page, "betting");
      assert.equal(await page.evaluate(() => lastSettlement.profit), 0);
    });
  });
}

test("all-in accepts the remaining sub-minimum top-up to an already valid wager", async () => {
  await scene({ bankroll: 101 }, async page => {
    await page.click('.chip[data-value="100"]');
    assert.equal(await page.$eval('.chip[data-value="allin"]', node => node.disabled), false, "the valid final wager is $101 even though its extra chip is $1");
  });
});

test("maximum accepted all-in wager survives a winning round and reload exactly", async () => {
  await scene({ bankroll: require(path.join(root, "js/engine.js")).MAX_WAGER, draw: ["10", "9", "9", "8"] }, async page => {
    await deal(page, "allin"); await phase(page, "player"); await page.click("#btnStand"); await phase(page, "betting");
    const before = await page.evaluate(() => localStorage.getItem("vbj.bankroll"));
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), before, "reload must not silently discard winnings");
  });
});

test("an existing maximum-safe account is preserved while unsafe wagers are disabled", async () => {
  await scene({ bankroll: Number.MAX_SAFE_INTEGER }, async page => {
    await page.waitForFunction(() => document.body.dataset.busy === "false");
    assert.equal(await page.$eval('.chip[data-value="allin"]', node => node.disabled), true);
    assert.equal(await page.$eval('.chip[data-value="100"]', node => node.disabled), true);
    assert.match(await page.$eval('.chip[data-value="allin"]', node => node.title), /Maximum safe wager/);
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), String(Number.MAX_SAFE_INTEGER));
  });
});

test("an invalid fractional deposit is rejected instead of silently rounded", async () => {
  await scene({}, async page => {
    await page.click("#settingsBtn"); await page.type("#depositAmount", "1.9");
    assert.equal(await page.$eval("#depositAmount", node => node.validity.stepMismatch), true);
    await page.click("#btnDeposit");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
  });
});

test("mouse and keyboard settings dialogs retain focus inside and restore it", async () => {
  await scene({}, async page => {
    await page.click("#settingsBtn"); await page.focus("#btnResetStats"); await page.keyboard.press("Tab");
    // The source link closes the dialog's tab order, then focus wraps to Close.
    assert.equal(await page.evaluate(() => document.activeElement.matches("#settingsModal .about-meta a")), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.matches("#settingsModal button[data-close]")), true);
    await reverseTab(page); assert.equal(await page.evaluate(() => document.activeElement.matches("#settingsModal .about-meta a")), true);
    await reverseTab(page); assert.equal(await page.evaluate(() => document.activeElement.id), "btnResetStats");
    await page.keyboard.press("Escape"); assert.equal(await page.evaluate(() => document.activeElement.id), "settingsBtn");
  });
});

for (const lang of ["en", "tr"]) {
  test(lang + ": the disclaimer and source link fit a 320px settings dialog", async () => {
    await scene({ lang, width: 320, height: 568 }, async page => {
      await page.click("#settingsBtn");
      await page.$eval("#settingsModal .about", node => node.scrollIntoView({ block: "end" }));
      const about = await page.$eval("#settingsModal .about", node => {
        const card = node.closest(".modal-card").getBoundingClientRect();
        const rects = [...node.querySelectorAll("h3, p, a")].map(child => child.getBoundingClientRect());
        return {
          inside: rects.every(rect => rect.left >= card.left && rect.right <= card.right && rect.width > 0),
          overflow: node.scrollWidth > node.clientWidth,
          link: node.querySelector("a").getBoundingClientRect().bottom <= innerHeight
        };
      });
      assert.deepEqual(about, { inside: true, overflow: false, link: true });
    });
  });
}

test("Enter on the focused Clear button clears the wager without starting a hand", async () => {
  await scene({ draw: ["10", "9", "7", "8"] }, async page => {
    await page.click('.chip[data-value="100"]'); await page.focus("#btnClear"); await page.keyboard.press("Enter");
    const state = await page.evaluate(() => ({ phase: document.body.dataset.phase, wager: document.querySelector("#currentBet").textContent }));
    assert.deepEqual(state, { phase: "betting", wager: "0" });
  });
});

test("Enter on the focused settings button does not also deal a pending wager", async () => {
  await scene({ draw: ["10", "9", "7", "8"] }, async page => {
    await page.click('.chip[data-value="100"]'); await page.focus("#settingsBtn"); await page.keyboard.press("Enter");
    const state = await page.evaluate(() => ({ phase: document.body.dataset.phase, hidden: document.querySelector("#settingsModal").hidden }));
    assert.deepEqual(state, { phase: "betting", hidden: false });
  });
});

test("two open tabs preserve both deposits to their shared bankroll", async () => {
  await scene({}, async page => {
    const second = await page.browserContext().newPage();
    try {
      await second.goto(page.url(), { waitUntil: "load" });
      second.setDefaultTimeout(5000);
      await page.bringToFront();
      await page.click("#settingsBtn"); await page.click('[data-deposit="1000"]');
      await second.bringToFront();
      await second.click("#settingsBtn"); await second.click('[data-deposit="5000"]');
      await second.waitForFunction(() => document.body.dataset.busy === "false");
      assert.equal(await second.evaluate(() => localStorage.getItem("vbj.bankroll")), "16000", "a stale tab must not overwrite another tab's deposit");
    } finally { await second.close(); }
  });
});

async function secondTab(page) {
  const second = await page.browserContext().newPage();
  second.setDefaultTimeout(5000);
  await second.goto(page.url(), { waitUntil: "load" });
  await second.waitForFunction(() => document.body.dataset.busy === "false");
  return second;
}

test("concurrent deposits in separate tabs are serialized without losing either one", async () => {
  await scene({}, async page => {
    const second = await secondTab(page);
    try {
      await Promise.all([
        page.evaluate(() => document.querySelector('[data-deposit="1000"]').click()),
        second.evaluate(() => document.querySelector('[data-deposit="5000"]').click())
      ]);
      await second.waitForFunction(() => localStorage.getItem("vbj.bankroll") === "16000");
      assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "16000");
    } finally { await second.close(); }
  });
});

test("another tab cannot deposit or deal over an unfinished hand, then can proceed after settlement", async () => {
  await scene({ draw: ["10", "9", "9", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    const second = await secondTab(page);
    try {
      await second.click("#settingsBtn"); await second.click('[data-deposit="5000"]');
      await second.waitForFunction(() => document.body.dataset.busy === "false");
      assert.equal(await second.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
      assert.match(await second.$eval("#toast", node => node.textContent), /Another tab/);
      await second.keyboard.press("Escape");
      await deal(second); await second.waitForFunction(() => document.body.dataset.busy === "false");
      assert.equal(await second.$eval("body", node => node.dataset.phase), "betting");
      await page.bringToFront(); await page.click("#btnStand"); await phase(page, "betting");
      await second.bringToFront(); await second.click("#settingsBtn"); await second.click('[data-deposit="5000"]');
      await second.waitForFunction(() => localStorage.getItem("vbj.bankroll") === "15100");
    } finally { await second.close(); }
  });
});

test("closing a tab with an unfinished hand releases the shared account lock", async () => {
  await scene({ draw: ["10", "9", "7", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    const second = await secondTab(page);
    try {
      await page.close();
      await second.click("#settingsBtn"); await second.click('[data-deposit="1000"]');
      await second.waitForFunction(() => localStorage.getItem("vbj.bankroll") === "11000");
    } finally { await second.close(); }
  });
});

test("without cross-tab locks the offline game keeps an isolated reloadable session balance", async () => {
  await scene({ noLocks: true, draw: ["10", "9", "9", "8"] }, async page => {
    await page.click("#settingsBtn"); await page.click('[data-deposit="1000"]');
    await page.waitForFunction(() => sessionStorage.getItem("table21.session.vbj.bankroll") === "11000");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "11,000");
    await deal(page); await phase(page, "player"); await page.click("#btnStand"); await phase(page, "betting");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("table21.session.vbj.bankroll")), "11100");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
  });
});

test("changing the live system reduced-motion setting updates game timing", { skip: isFirefox && "Live media emulation is unavailable through this BiDi adapter" }, async () => {
  await scene({ motion: true, draw: ["10", "9", "7", "8"] }, async page => {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    const started = Date.now(); await deal(page); await phase(page, "player");
    assert.ok(Date.now() - started < 1000, "CSS and JavaScript should both respect the current reduced-motion preference");
  });
});

test("European insurance still pays after the player busts", async () => {
  await scene({ settings: { ruleProfile: "european" }, draw: ["10", "A", "7", "K", "K"] }, async page => {
    await deal(page); await phase(page, "insurance"); await page.click("#btnInsYes"); await phase(page, "player"); await page.click("#btnHit"); await phase(page, "betting");
    const round = await page.evaluate(() => lastSettlement);
    assert.deepEqual(round.outcomes, ["bust"]); assert.equal(round.insuranceReturn, 150); assert.equal(round.profit, 0);
  });
});

test("European dealer blackjack collects both halves of a doubled wager", async () => {
  await scene({ settings: { ruleProfile: "european" }, draw: ["5", "10", "6", "10", "A"] }, async page => {
    await deal(page); await phase(page, "player"); await page.click("#btnDouble"); await phase(page, "betting");
    const round = await page.evaluate(() => lastSettlement);
    assert.deepEqual(round.outcomes, ["lose"]); assert.equal(round.profit, -200); assert.equal(round.dealerBlackjack, true);
  });
});

test("four split hands settle independently and preserve total stake", async () => {
  await scene({ draw: ["8", "9", "8", "8", "8", "8", "2", "3", "4", "5"] }, async page => {
    await deal(page); await phase(page, "player");
    for (let count = 2; count <= 4; count++) {
      await page.click("#btnSplit"); await page.waitForFunction(n => document.querySelectorAll(".player-hand").length === n && !document.querySelector("#btnStand").disabled, {}, count);
    }
    for (let i = 0; i < 4; i++) {
      await page.waitForFunction(() => !document.querySelector("#btnStand").disabled); await page.click("#btnStand");
    }
    await phase(page, "betting");
    const round = await page.evaluate(() => lastSettlement);
    assert.equal(round.counts.hands, 4); assert.equal(round.mainStake, 400); assert.equal(round.counts.wins + round.counts.losses + round.counts.pushes, 4);
  });
});

test("four split hands fit the shortest landscape table and remain playable", async () => {
  await scene({ width: 568, height: 320, lang: "tr", draw: ["8", "9", "8", "8", "8", "8", "2", "3", "4", "5"] }, async page => {
    await deal(page); await phase(page, "player");
    for (let count = 2; count <= 4; count++) {
      await page.click("#btnSplit");
      await page.waitForFunction(n => document.querySelectorAll(".player-hand").length === n && !document.querySelector("#btnStand").disabled, {}, count);
    }
    const clipped = await page.evaluate(() => {
      const felt = document.querySelector(".table-felt").getBoundingClientRect();
      return [...document.querySelectorAll(".card, .hand-tag, .hand-wager")].filter(node => {
        const box = node.getBoundingClientRect();
        return box.left < felt.left || box.right > felt.right || box.top < felt.top || box.bottom > felt.bottom;
      }).map(node => node.className);
    });
    assert.deepEqual(clipped, []);
    const coversHands = await page.evaluate(() => {
      const hands = [...document.querySelectorAll(".card, .hand-tag, .hand-wager")].map(node => node.getBoundingClientRect());
      // Only what is actually painted can cover a hand (both yield to split rows).
      const shown = node => { for (let item = node; item && item !== document.body; item = item.parentElement) { const s = getComputedStyle(item); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < .05) return false; } return true; };
      return [...document.querySelectorAll(".table-specs, .banner")].filter(node => {
        const box = node.getBoundingClientRect();
        return shown(node) && box.width > 0 && box.height > 0 && hands.some(hand => box.left < hand.right && box.right > hand.left && box.top < hand.bottom && box.bottom > hand.top);
      }).map(node => node.className);
    });
    assert.deepEqual(coversHands, []);
    if (process.env.BLACKJACK_SCREENSHOTS) await page.screenshot({ path: path.join(artifacts, "landscape-four-splits.png"), fullPage: true });
    for (let i = 0; i < 4; i++) {
      await page.waitForFunction(() => !document.querySelector("#btnStand").disabled); await page.click("#btnStand");
    }
    await phase(page, "betting");
    assert.equal(await page.evaluate(() => lastSettlement.counts.hands), 4);
  });
});

test("an offline PWA can reload and finish a complete deterministic hand", { skip: isFirefox && "Network-offline emulation is unavailable through this BiDi adapter" }, async () => {
  await scene({ web: true, draw: ["10", "9", "9", "8"] }, async page => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.setOfflineMode(true); await page.reload({ waitUntil: "load" });
    await deal(page); await phase(page, "player"); await page.click("#btnStand"); await phase(page, "betting");
    assert.equal(await page.evaluate(() => lastSettlement.profit), 100);
  });
});

test("installing a new real service worker preserves a live player decision", async () => {
  await scene({ web: true, draw: ["10", "9", "7", "8"] }, async page => {
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.reload({ waitUntil: "load" });
    await deal(page); await phase(page, "player");
    workerRevision++;
    const navigation = page.waitForNavigation({ waitUntil: "load", timeout: 2500 }).then(() => true, error => {
      if (error.name === "TimeoutError") return false;
      throw error;
    });
    await page.evaluate(() => { navigator.serviceWorker.getRegistration().then(registration => registration.update()); });
    assert.equal(await navigation, false, "a new worker reloaded the page during the player's decision");
    assert.equal(await page.evaluate(() => document.body.dataset.phase), "player");
    const safeReload = page.waitForNavigation({ waitUntil: "load", timeout: 10000 });
    await page.click("#btnStand");
    await safeReload;
    assert.equal(await page.evaluate(() => document.body.dataset.phase), "betting");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
  });
});

// Strategy coach (added 2026-10-06).
const stats = page => page.evaluate(() => JSON.parse(localStorage.getItem("vbj.stats")));

test("coach hints mark the basic-strategy play and feedback names it", async () => {
  await scene({ settings: { coach: "hints" }, draw: ["10", "10", "6", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    assert.deepEqual(await page.$$eval(".coach-pick", nodes => nodes.map(node => node.id)), ["btnSurrender"]);
    await page.click("#btnStand");
    assert.equal(await page.$eval("#toast", node => node.textContent), "Basic strategy: Surrender on hard 16 vs 10");
    await phase(page, "betting");
    assert.deepEqual(await page.$$eval(".coach-pick", nodes => nodes.map(node => node.id)), []);
    const saved = await stats(page);
    assert.equal(saved.strategyDecisions, 1); assert.equal(saved.strategyCorrect, 0);
  });
});

test("coach feedback speaks Turkish and stays quiet on the right play", async () => {
  await scene({ lang: "tr", settings: { coach: "feedback" }, draw: ["8", "6", "8", "10", "3", "K", "2", "9"] }, async page => {
    await deal(page); await phase(page, "player");
    assert.deepEqual(await page.$$eval(".coach-pick", nodes => nodes.map(node => node.id)), []);
    await page.click("#btnSplit");
    await page.waitForFunction(() => document.querySelectorAll(".player-hand").length === 2 && !document.querySelector("#btnStand").disabled);
    assert.equal(await page.$eval("#toast", node => node.hidden), true);
    await page.click("#btnHit");
    assert.equal(await page.$eval("#toast", node => node.textContent), "Temel strateji: sert 11, krupiye 6 → İkiye katla");
  });
});

test("taken insurance is flagged in the loss toast and counted as a miss", async () => {
  await scene({ settings: { coach: "feedback" }, draw: ["10", "A", "9", "7"] }, async page => {
    await deal(page); await phase(page, "insurance");
    await page.click("#btnInsYes"); await phase(page, "player");
    assert.equal(await page.$eval("#toast", node => node.textContent), "Insurance lost: -$50. Basic strategy declines it.");
    await page.click("#btnStand"); await phase(page, "betting");
    const saved = await stats(page);
    assert.equal(saved.strategyDecisions, 2); assert.equal(saved.strategyCorrect, 1);
  });
});

test("coach off never interrupts but the accuracy statistic still counts", async () => {
  await scene({ draw: ["10", "7", "2", "10"] }, async page => {
    await deal(page); await phase(page, "player");
    await page.click("#btnStand");
    assert.equal(await page.$eval("#toast", node => node.hidden), true);
    await phase(page, "betting");
    await page.click("#settingsBtn");
    assert.equal(await page.$eval("#stStrategy", node => node.textContent), "0% (1)");
    assert.equal(await page.$eval('[data-set-coach="off"]', node => node.getAttribute("aria-checked")), "true");
  });
});

// Split layouts (added 2026-10-07). Two to four doubled hands, one of them bust
// so the longest Turkish labels appear, must stay inside the felt's oval and
// clear of the rules plaque, the banner, the dealer's side and each other,
// from small phones to desktop. The 24 September suite only checked four
// undoubled hands at 568x320, where the plaque is hidden anyway.
const LAYOUT_VIEWPORTS = [
  [1440, 900], [1280, 800], [1024, 768], [768, 1024], [932, 430], [844, 390],
  [740, 360], [667, 375], [568, 320], [390, 844], [360, 640], [320, 568]
];
const SPLIT_SHOES = {
  1: ["10", "6", "3", "10", "K"],
  2: ["8", "6", "8", "10", "5", "10", "2", "9", "10"],
  3: ["8", "6", "8", "10", "8", "3", "10", "5", "10", "2", "9", "10"],
  4: ["8", "6", "8", "10", "8", "8", "3", "10", "5", "10", "2", "9", "4", "K", "10"]
};

// Runs in the page. Returns readable descriptions of every layout collision.
function splitLayoutProblems() {
  const felt = document.querySelector(".table-felt");
  const box = felt.getBoundingClientRect();
  const style = getComputedStyle(felt);
  const border = side => parseFloat(style["border" + side + "Width"]) || 0;
  const pad = { left: box.left + border("Left"), right: box.right - border("Right"), top: box.top + border("Top"), bottom: box.bottom - border("Bottom") };
  // overflow: hidden clips to the padding box with the border radii reduced by the border.
  const radius = (corner, xSide, ySide) => {
    const parts = style["border" + corner + "Radius"].split(" ");
    const length = (part, size) => part.endsWith("%") ? parseFloat(part) / 100 * size : parseFloat(part);
    return { rx: Math.max(1, length(parts[0], box.width) - border(xSide)), ry: Math.max(1, length(parts[1] || parts[0], box.height) - border(ySide)) };
  };
  const tl = radius("TopLeft", "Left", "Top"), tr = radius("TopRight", "Right", "Top");
  const br = radius("BottomRight", "Right", "Bottom"), bl = radius("BottomLeft", "Left", "Bottom");
  const beyond = (x, y, cx, cy, r) => ((x - cx) / r.rx) ** 2 + ((y - cy) / r.ry) ** 2 > 1;
  const inside = (x, y) => {
    if (x < pad.left || x > pad.right || y < pad.top || y > pad.bottom) return false;
    if (x < pad.left + tl.rx && y < pad.top + tl.ry && beyond(x, y, pad.left + tl.rx, pad.top + tl.ry, tl)) return false;
    if (x > pad.right - tr.rx && y < pad.top + tr.ry && beyond(x, y, pad.right - tr.rx, pad.top + tr.ry, tr)) return false;
    if (x > pad.right - br.rx && y > pad.bottom - br.ry && beyond(x, y, pad.right - br.rx, pad.bottom - br.ry, br)) return false;
    if (x < pad.left + bl.rx && y > pad.bottom - bl.ry && beyond(x, y, pad.left + bl.rx, pad.bottom - bl.ry, bl)) return false;
    return true;
  };
  const shown = node => {
    for (let item = node; item && item !== document.body; item = item.parentElement) {
      const s = getComputedStyle(item);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < .05) return false;
    }
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const kind = node => node.classList.contains("card") ? "card" : node.classList.contains("hand-tag") ? "tag" : "wager";
  const problems = [];
  const hands = [...document.querySelectorAll("#playerHands .player-hand")];
  const parts = hands.flatMap((hand, index) => [...hand.querySelectorAll(".card, .hand-tag, .hand-wager")].map(node => ({ node, index, rect: node.getBoundingClientRect(), name: "hand " + (index + 1) + " " + kind(node) })));
  parts.forEach(part => {
    const inset = Math.min(4, part.rect.width / 4, part.rect.height / 4);
    const { left, right, top, bottom } = part.rect;
    if (![[left + inset, top + inset], [right - inset, top + inset], [right - inset, bottom - inset], [left + inset, bottom - inset]].every(([x, y]) => inside(x, y))) problems.push("outside felt: " + part.name);
    hands.forEach((other, index) => { if (index !== part.index && overlap(part.rect, other.getBoundingClientRect())) problems.push(part.name + " enters hand " + (index + 1)); });
  });
  const obstacles = [".table-specs", ".banner", ".dealer-plate", "#dealerHand .card", ".discard-tray", ".shoe"];
  obstacles.forEach(selector => document.querySelectorAll(selector).forEach(node => {
    if (!shown(node)) return;
    const rect = node.getBoundingClientRect();
    parts.forEach(part => { if (overlap(rect, part.rect)) problems.push(selector + " covers " + part.name); });
  }));
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("horizontal scroll");
  if (document.documentElement.scrollHeight > innerHeight * 1.25) problems.push("page " + document.documentElement.scrollHeight + "px tall");
  return [...new Set(problems)];
}

async function sweepLayouts(page, moment) {
  const found = [];
  for (const [width, height] of LAYOUT_VIEWPORTS) {
    await page.setViewport({ width, height });
    // The resize reaches the renderer asynchronously and the layout can take a
    // few frames to settle; measure only once it has stopped moving.
    await page.waitForFunction((w, h) => innerWidth === w && innerHeight === h, {}, width, height);
    // Emulated resizes can show one frame of new widths with old viewport units.
    await new Promise(resolve => setTimeout(resolve, 80));
    await page.evaluate(() => { window.layoutKey = ""; window.layoutStill = 0; });
    await page.waitForFunction(() => {
      const key = [".table-felt", ".controls", "#playerHands"].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return [r.left, r.top, r.width, r.height].map(Math.round).join(",");
      }).join("|") + "|" + document.documentElement.scrollHeight;
      window.layoutStill = key === window.layoutKey ? window.layoutStill + 1 : 0;
      window.layoutKey = key;
      return window.layoutStill >= 3;
    }, { polling: "raf", timeout: 3000 });
    for (const problem of await page.evaluate(splitLayoutProblems)) found.push(width + "x" + height + " " + moment + ": " + problem);
  }
  return found;
}

for (const count of [1, 2, 3, 4]) {
  test(count + " doubled hand" + (count > 1 ? "s" : "") + " stay inside the felt and clear of the table furniture at every size", async () => {
    await scene({ lang: "tr", holdTimers: true, draw: SPLIT_SHOES[count] }, async page => {
      const ready = () => page.waitForFunction(() => document.body.dataset.phase === "player" && document.body.dataset.busy === "false");
      await deal(page); await ready();
      for (let hands = 2; hands <= count; hands++) {
        await page.click("#btnSplit");
        await page.waitForFunction(n => document.querySelectorAll(".player-hand").length === n && document.body.dataset.busy === "false", {}, hands);
      }
      for (let doubled = 1; doubled < count; doubled++) { await ready(); await page.click("#btnDouble"); }
      await ready();
      const problems = await sweepLayouts(page, "decision");
      await page.setViewport({ width: 1280, height: 900 });
      // Freeze the table the instant it settles, so results stay on the felt while measured.
      await page.evaluate(() => new MutationObserver((records, observer) => {
        if (document.body.dataset.phase !== "payout") return;
        window.holdTableTimers(true);
        observer.disconnect();
      }).observe(document.body, { attributes: true, attributeFilter: ["data-phase"] }));
      await page.click("#btnDouble");
      await phase(page, "payout");
      assert.equal(await page.$$eval(".double-card", nodes => nodes.length), count);
      problems.push(...await sweepLayouts(page, "payout"));
      await page.evaluate(() => window.holdTableTimers(false));
      await phase(page, "betting");
      assert.deepEqual(problems, []);
    });
  });
}

// Safari audio (added 2026-10-07): a browser that cannot play Ogg loads and
// plays the bundled AAC twins instead of falling back to synthesized cues.
test("a browser without Ogg support plays the bundled AAC samples", async () => {
  await scene({ web: true }, async page => {
    await page.evaluate(() => {
      HTMLMediaElement.prototype.canPlayType = type => /ogg/.test(type) ? "" : "probably";
      const NativeAudio = window.Audio;
      window.audioElements = [];
      window.Audio = function (src) { const audio = new NativeAudio(src); window.audioElements.push(audio); return audio; };
    });
    await page.click("#soundToggle");
    await page.click('.chip[data-value="100"]');
    const sources = await page.evaluate(() => window.audioElements.filter(audio => audio.src).map(audio => audio.src.split("/").pop()));
    assert.equal(sources.length >= 8, true, JSON.stringify(sources));
    sources.forEach(source => assert.match(source, /\.m4a$/));
    const loaded = await page.evaluate(() => Promise.all(window.audioElements.filter(audio => audio.src).map(audio => new Promise(resolve => {
      if (audio.readyState >= 3) return resolve("ok");
      audio.addEventListener("canplaythrough", () => resolve("ok"), { once: true });
      audio.addEventListener("error", () => resolve("error " + audio.error.code), { once: true });
      setTimeout(() => resolve("timeout " + audio.readyState), 4000);
    }))));
    assert.deepEqual([...new Set(loaded)], ["ok"]);
  });
});

// Unfinished rounds (added 2026-10-07): a reload, a crash or a closed tab
// resumes the same hand with the stake still on the table, so refreshing can
// neither refund a bad hand nor replay its cards.
const savedRound = page => page.evaluate(() => JSON.parse(localStorage.getItem("vbj.round")));
const ranks = (page, selector) => page.$$eval(selector, nodes => nodes.map(node => node.className.match(/\brank-(\w+)/)[1].toUpperCase()));
const reloadTable = async page => { await page.reload({ waitUntil: "load" }); await page.waitForFunction(() => document.body.dataset.busy === "false"); };

test("a reload during a decision resumes the hand and cannot refund a losing stake", async () => {
  await scene({ draw: ["10", "9", "6", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    assert.equal((await savedRound(page)).resume, "player");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10000");
    await reloadTable(page); await phase(page, "player");
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "9,900");
    assert.deepEqual(await ranks(page, "#playerHands .card"), ["10", "6"]);
    assert.equal(await page.$$eval("#dealerHand .card-inner.facedown", nodes => nodes.length), 1);
    assert.match(await page.$eval("#toast", node => node.textContent), /unfinished hand is back/);
    await page.click("#btnStand"); await phase(page, "betting");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "9900");
    assert.equal(await savedRound(page), null);
  });
});

test("an insurance offer comes back after a reload", async () => {
  await scene({ draw: ["10", "A", "9", "7"] }, async page => {
    await deal(page); await phase(page, "insurance");
    await reloadTable(page); await phase(page, "insurance");
    assert.equal(await page.$eval("#insuranceOverlay", node => node.hidden), false);
    await page.click("#btnInsNo"); await phase(page, "player");
    await page.click("#btnStand"); await phase(page, "betting");
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10100");
  });
});

test("split and doubled hands survive a reload and the dealer draws the same next card", async () => {
  await scene({ draw: ["8", "6", "8", "10", "3", "10", "2", "9"] }, async page => {
    const ready = () => page.waitForFunction(() => document.body.dataset.phase === "player" && document.body.dataset.busy === "false");
    await deal(page); await ready();
    await page.click("#btnSplit"); await ready();
    await page.click("#btnDouble"); await ready();
    await reloadTable(page); await ready();
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "9,700");
    assert.equal(await page.$$eval(".player-hand", nodes => nodes.length), 2);
    assert.equal(await page.$$eval(".player-hand:first-child .double-card", nodes => nodes.length), 1);
    assert.equal(await page.$eval(".player-hand.active", node => node === node.parentElement.children[1]), true);
    assert.deepEqual(await ranks(page, ".player-hand.active .card"), ["8", "2"]);
    await page.click("#btnStand"); await phase(page, "betting");
    const round = await page.evaluate(() => lastSettlement);
    assert.deepEqual(round.outcomes, ["dealerBust", "dealerBust"]);
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10300");
  });
});

test("a reload while the dealer plays finishes the same round", async () => {
  await scene({ holdTimers: true, draw: ["10", "6", "7", "10", "9"] }, async page => {
    await deal(page); await phase(page, "player");
    await page.evaluate(() => new MutationObserver((records, observer) => {
      if (document.body.dataset.phase !== "dealer") return;
      window.holdTableTimers(true);
      observer.disconnect();
    }).observe(document.body, { attributes: true, attributeFilter: ["data-phase"] }));
    await page.click("#btnStand"); await phase(page, "dealer");
    assert.equal((await savedRound(page)).resume, "dealer");
    await reloadTable(page); await phase(page, "betting");
    const round = await page.evaluate(() => lastSettlement);
    assert.equal(round.dealerTotal, 25);
    assert.deepEqual(round.outcomes, ["dealerBust"]);
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.bankroll")), "10100");
  });
});

test("a reload during the opening deal keeps the cards that were dealt", async () => {
  await scene({ holdTimers: true, draw: ["10", "9", "6", "8"] }, async page => {
    // Freeze the deal the moment its opening cards are saved.
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (key === "vbj.round" && JSON.parse(value).resume === "deal") window.holdTableTimers(true);
      };
    });
    await deal(page);
    await page.waitForFunction(() => document.querySelectorAll("#playerHands .card").length === 1);
    await reloadTable(page); await phase(page, "player");
    assert.deepEqual(await ranks(page, "#playerHands .card"), ["10", "6"]);
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "9,900");
  });
});

test("a tab closed mid-hand hands its round to the next deal in another tab", async () => {
  await scene({ draw: ["10", "9", "6", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    const second = await secondTab(page);
    try {
      await page.close();
      await deal(second); await phase(second, "player");
      assert.deepEqual(await ranks(second, "#playerHands .card"), ["10", "6"]);
      assert.equal(await second.$eval("#bankroll", node => node.textContent), "9,900");
      await second.click("#btnStand"); await phase(second, "betting");
      assert.equal(await second.evaluate(() => localStorage.getItem("vbj.bankroll")), "9900");
    } finally { await second.close(); }
  });
});

for (const [name, damage] of [
  ["a damaged snapshot", () => localStorage.setItem("vbj.round", JSON.stringify({ v: 1, resume: "player", hands: "broken" }))],
  ["changed table rules", () => localStorage.setItem("vbj.settings", JSON.stringify(Object.assign(JSON.parse(localStorage.getItem("vbj.settings")), { ruleProfile: "lasVegas" })))]
]) {
  test("an unfinished hand is voided, returning its stake, after " + name, async () => {
    await scene({ draw: ["10", "9", "6", "8"] }, async page => {
      await deal(page); await phase(page, "player");
      await page.evaluate(damage);
      await reloadTable(page);
      assert.equal(await page.evaluate(() => document.body.dataset.phase), "betting");
      assert.equal(await page.$eval("#bankroll", node => node.textContent), "10,000");
      assert.equal(await savedRound(page), null);
      assert.match(await page.$eval("#toast", node => node.textContent), /could not be restored/);
    });
  });
}

test("a deposit made while a hand waits in a closed tab is kept when the hand resumes", async () => {
  await scene({ draw: ["10", "9", "6", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    const second = await secondTab(page);
    try {
      await page.close();
      await second.click("#settingsBtn"); await second.click('[data-deposit="1000"]');
      await second.waitForFunction(() => localStorage.getItem("vbj.bankroll") === "11000");
      await second.keyboard.press("Escape");
      await deal(second); await phase(second, "player");
      assert.equal(await second.$eval("#bankroll", node => node.textContent), "10,900");
      await second.click("#btnStand"); await phase(second, "betting");
      assert.equal(await second.evaluate(() => localStorage.getItem("vbj.bankroll")), "10900");
    } finally { await second.close(); }
  });
});

test("without cross-tab locks a reload resumes the hand from the session account", async () => {
  await scene({ noLocks: true, draw: ["10", "9", "6", "8"] }, async page => {
    await deal(page); await phase(page, "player");
    assert.ok(await page.evaluate(() => sessionStorage.getItem("table21.session.vbj.round")));
    assert.equal(await page.evaluate(() => localStorage.getItem("vbj.round")), null);
    await reloadTable(page); await phase(page, "player");
    assert.equal(await page.$eval("#bankroll", node => node.textContent), "9,900");
    assert.equal(await page.$eval("#bannerText", node => node.getAttribute("data-i18n")), "yourTurn");
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.equal(await page.$eval("#dealerLine", node => node.getAttribute("data-i18n-pick")), null);
    await page.click("#btnStand"); await phase(page, "betting");
    assert.equal(await page.evaluate(() => sessionStorage.getItem("table21.session.vbj.bankroll")), "9900");
  });
});
