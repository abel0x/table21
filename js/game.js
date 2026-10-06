/* =========================================================
   Table 21 — game engine
   Pure client-side, offline. Cryptographically-shuffled shoe.
   ========================================================= */
(function () {
  "use strict";

  var global = window;
  var Engine = global.BlackjackEngine;
  if (!Engine) throw new Error("BlackjackEngine must load before game.js");
  var Rules = global.TableRules;
  if (!Rules) throw new Error("TableRules must load before game.js");
  var BetChipStack = global.BetChipStack;
  if (!BetChipStack) throw new Error("BetChipStack must load before game.js");
  var Strategy = global.BlackjackStrategy;
  if (!Strategy) throw new Error("BlackjackStrategy must load before game.js");

  var buildShoe = Engine.buildShoe;
  var shuffle = Engine.shuffle;
  var cardValue = Engine.cardValue;
  var handValue = Engine.handValue;
  var isBlackjack = Engine.isBlackjack;
  var payoutFor = Engine.payoutFor;

  /* ---------------- Persistence ---------------- */
  var KEYS = {
    bankroll: "vbj.bankroll",
    stats: "vbj.stats",
    settings: "vbj.settings",
    sound: "vbj.sound",
    audio: "vbj.audio"
  };
  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------------- State ---------------- */
  var DEFAULT_SETTINGS = Rules.applyProfile({
    theme: "emerald",
    animationSpeed: "normal",
    coach: "off"
  }, "atlanticCity");
  var DEFAULT_STATS = { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, strategyDecisions: 0, strategyCorrect: 0 };
  var START_BANKROLL = 10000;
  var MIN_BET = 100;            // smallest chip on this table
  var MAX_BANKROLL = Number.MAX_SAFE_INTEGER;
  var PENETRATION = 0.75;        // reshuffle once 75% of shoe is dealt
  var ROUND_CARD_RESERVE = 60;   // never begin a round close to exhausting the shoe
  var ALLOWED_DECKS = [1, 2, 6, 8];
  var ALLOWED_THEMES = ["emerald", "midnight", "bordeaux"];
  var ALLOWED_ANIMATION_SPEEDS = ["fast", "normal", "cinematic"];
  var ALLOWED_COACH_MODES = ["off", "feedback", "hints"];
  var ANIMATION_SCALES = { fast: 0.65, normal: 1, cinematic: 1.35 };
  var THEME_META_COLORS = { emerald: "#0b3d2e", midnight: "#102c49", bordeaux: "#4a1822" };

  function safeCount(value) {
    value = Math.floor(Number(value));
    return isFinite(value) && value >= 0 ? value : 0;
  }
  function normalizeBankroll(value) {
    value = Math.floor(Number(value));
    if (!isFinite(value) || value < MIN_BET) return START_BANKROLL;
    return Math.min(value, MAX_BANKROLL);
  }
  function normalizeSettings(value) {
    value = value && typeof value === "object" ? value : {};
    var decks = safeCount(value.decks);
    var theme = typeof value.theme === "string" ? value.theme : DEFAULT_SETTINGS.theme;
    var animationSpeed = typeof value.animationSpeed === "string" ? value.animationSpeed : DEFAULT_SETTINGS.animationSpeed;
    var explicitProfile = Rules.isProfile(value.ruleProfile) ? value.ruleProfile : null;
    var settings = {
      ruleProfile: "custom",
      hitSoft17: value.hitSoft17 === true,
      decks: ALLOWED_DECKS.indexOf(decks) !== -1 ? decks : DEFAULT_SETTINGS.decks,
      dealerHoleCard: value.dealerHoleCard !== false,
      dealerPeeks: value.dealerPeeks !== false,
      surrender: value.surrender !== false,
      doubleRule: value.doubleRule === "hard9to11" ? "hard9to11" : "any",
      doubleAfterSplit: value.doubleAfterSplit !== false,
      maxHands: value.maxHands === 2 ? 2 : 4,
      theme: ALLOWED_THEMES.indexOf(theme) !== -1 ? theme : DEFAULT_SETTINGS.theme,
      animationSpeed: ALLOWED_ANIMATION_SPEEDS.indexOf(animationSpeed) !== -1 ? animationSpeed : DEFAULT_SETTINGS.animationSpeed,
      coach: ALLOWED_COACH_MODES.indexOf(value.coach) !== -1 ? value.coach : DEFAULT_SETTINGS.coach
    };
    if (explicitProfile) Rules.applyProfile(settings, explicitProfile);
    // A no-hole-card table cannot perform an American peek. Keep malformed or
    // older saved preferences internally consistent before profile detection.
    if (!settings.dealerHoleCard) settings.dealerPeeks = false;
    if (!explicitProfile) settings.ruleProfile = Rules.detectProfile(settings);
    return settings;
  }
  function normalizeStats(value) {
    value = value && typeof value === "object" ? value : {};
    return {
      hands: safeCount(value.hands),
      wins: safeCount(value.wins),
      losses: safeCount(value.losses),
      pushes: safeCount(value.pushes),
      blackjacks: safeCount(value.blackjacks),
      strategyDecisions: safeCount(value.strategyDecisions),
      strategyCorrect: Math.min(safeCount(value.strategyCorrect), safeCount(value.strategyDecisions))
    };
  }

  var state = {
    bankroll: normalizeBankroll(load(KEYS.bankroll, START_BANKROLL)),
    stats: normalizeStats(load(KEYS.stats, DEFAULT_STATS)),
    settings: normalizeSettings(load(KEYS.settings, DEFAULT_SETTINGS)),
    shoe: [],
    discarded: 0,
    discardTrayCount: 0,
    bet: 0,
    lastBet: 0,
    phase: "betting",       // betting | dealing | insurance | player | dealer | payout
    dealer: { cards: [], hideHole: true },
    hands: [],              // [{cards, bet, done, doubled, splitAces, result, payoutAmount}]
    active: 0,
    insurance: 0,
    insuranceMode: null,
    evenMoney: false,
    pendingPayoutVisual: false,
    roundStakeLimit: 0,
    busy: false
  };

  // A round owns the shared account until its settlement is finished. Web Locks
  // work across tabs without a server, including file:// in supporting browsers.
  // If unavailable, use a separate session balance instead of unsafe shared writes.
  var sharedAccount = !!(navigator.locks && navigator.locks.request);
  var accountPending = false;
  var accountHeld = false;
  var releaseRoundAccount = null;
  function loadAccount(key, fallback) {
    if (sharedAccount) return load(key, fallback);
    try {
      var value = sessionStorage.getItem("table21.session." + key);
      return value == null ? fallback : JSON.parse(value);
    } catch (e) { return fallback; }
  }
  function saveAccount(key, value) {
    if (sharedAccount) save(key, value);
    else {
      try { sessionStorage.setItem("table21.session." + key, JSON.stringify(value)); } catch (e) {}
    }
  }
  function readAccountState() {
    state.bankroll = normalizeBankroll(loadAccount(KEYS.bankroll, state.bankroll));
    state.stats = normalizeStats(loadAccount(KEYS.stats, state.stats));
  }
  function syncIdleAccount() {
    if (state.phase !== "betting" || state.busy || accountHeld || accountPending) return;
    readAccountState();
    renderBankroll(true);
    renderStats();
    updateControls();
  }
  function withAccount(action, holdForRound) {
    if (accountHeld) return Promise.resolve(action());
    if (accountPending) return Promise.resolve(false);
    accountPending = true;
    updateControls();
    var started = false;
    var lockTimer = null;
    async function run(lock) {
      clearTimeout(lockTimer);
      accountPending = false;
      if (!lock) { toastKey("accountBusy", "lose"); updateControls(); return false; }
      started = true;
      accountHeld = true;
      readAccountState();
      var finished = holdForRound ? new Promise(function (resolve) { releaseRoundAccount = resolve; }) : null;
      try {
        var result = await action();
        if (finished && state.phase !== "betting") await finished;
        return result;
      } finally {
        releaseRoundAccount = null;
        accountHeld = false;
        updateControls();
      }
    }
    if (!sharedAccount) return run(true);
    // Brief writes queue normally. An unfinished hand in another tab yields a
    // visible, bounded refusal instead of leaving controls waiting indefinitely.
    var controller = new AbortController();
    lockTimer = setTimeout(function () { controller.abort(); }, 700);
    return navigator.locks.request("vbj.account", { signal: controller.signal }, run).catch(function (error) {
      clearTimeout(lockTimer);
      if (started) throw error;
      if (error.name === "AbortError") {
        accountPending = false;
        toastKey("accountBusy", "lose");
        updateControls();
        return false;
      }
      sharedAccount = false;
      toastKey("temporaryAccount", "");
      return run(true);
    });
  }

  /* ---------------- DOM ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    bankroll: $("bankroll"),
    currentBet: $("currentBet"),
    betStack: $("betStack"),
    payoutStack: $("payoutStack"),
    dealerHand: $("dealerHand"),
    dealerScore: $("dealerScore"),
    playerHands: $("playerHands"),
    playerScore: $("playerScore"),
    banner: $("banner"),
    bannerText: $("bannerText"),
    toast: $("toast"),
    insuranceOverlay: $("insuranceOverlay"),
    dealerLine: $("dealerLine"),
    resultBadge: $("resultBadge"),
    balancePill: $("balancePill"),
    shoe: document.querySelector(".shoe"),
    shoeCards: $("shoeCards"),
    shoeCount: $("shoeCount"),
    shoeMouth: document.querySelector(".shoe-mouth"),
    discardTray: $("discardTray"),
    discardStack: $("discardStack"),
    discardCount: $("discardCount"),
    tableFelt: document.querySelector(".table-felt"),
    btn: {
      clear: $("btnClear"), deal: $("btnDeal"), rebet: $("btnRebet"),
      hit: $("btnHit"), stand: $("btnStand"), double: $("btnDouble"),
      split: $("btnSplit"), surrender: $("btnSurrender"),
      insYes: $("btnInsYes"), insNo: $("btnInsNo")
    }
  };

  // Placed-bet chip palette. Kept BYTE-FOR-BYTE in sync with the .chip-* CSS
  // variables so a 100 chip in the tray and a 100 chip on the felt are identical.
  // body = clay colour · spot/spotAlt = edge blocks · ring = groove · inlay = centre · ink = value
  var CHIP_COLORS = {
    1:     { body: "#ece9df", spot: "#315b8a", ring: "#817b6b", inlay: "#f7f3e8", ink: "#25231f" },
    5:     { body: "#a8232d", spot: "#f0e6cf", ring: "#e0bd72", inlay: "#bc3039", ink: "#fff4dc" },
    10:    { body: "#235b96", spot: "#f1e7d2", ring: "#d8b85e", inlay: "#2e69a6", ink: "#fff6df" },
    25:    { body: "#24704e", spot: "#eee5cf", ring: "#d4b55c", inlay: "#2d805b", ink: "#fff5d9" },
    50:    { body: "#c7c8c3", spot: "#7e1f2c", ring: "#6e6653", inlay: "#e4e2d8", ink: "#28251f" },
    100:   { body: "#23232b", spot: "#ececf2", ring: "#cbb069", inlay: "#30303a", ink: "#f4efe2" },
    500:   { body: "#5e2a90", spot: "#f0cf63", ring: "#f0dca8", inlay: "#6e36a6", ink: "#fbf4ff" },
    1000:  { body: "#c9a23a", spot: "#2a1510", ring: "#5a3a10", inlay: "#ddb24e", ink: "#2a1c04" },
    5000:  { body: "#1a4775", spot: "#edf4f8", spotAlt: "#78b8d8", ring: "#c2d4df", inlay: "#245987", ink: "#f8fbfd" },
    25000: { body: "#0d674a", spot: "#ecd28a", spotAlt: "#f4efe1", ring: "#e0c36d", inlay: "#176e53", ink: "#fff4cb" }
  };
  var CHIP_DENOMS = [25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1];

  /* ---------------- Helpers ---------------- */
  var t = function (k, p) { return I18n.t(k, p); };
  function fmt(n) { return n.toLocaleString(I18n.get() === "tr" ? "tr-TR" : "en-US"); }
  function wagerLimit() {
    // The account itself can retain every safe integer. Only new wagers are
    // restricted when there is insufficient headroom for a winning return.
    return Math.max(0, Math.min(Engine.MAX_WAGER, Math.floor((MAX_BANKROLL - state.bankroll) / 2)));
  }
  function canFundStake(amount) {
    var committed = state.insurance;
    state.hands.forEach(function (hand) { committed += hand.bet; });
    return amount <= state.bankroll && committed + amount <= state.roundStakeLimit;
  }
  var motionPreference = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)");
  var reducedMotion = !!(motionPreference && motionPreference.matches);
  function updateMotionPreference(event) {
    reducedMotion = event.matches;
    if (reducedMotion) renderBankroll(true);
  }
  if (motionPreference) {
    if (motionPreference.addEventListener) motionPreference.addEventListener("change", updateMotionPreference);
    else if (motionPreference.addListener) motionPreference.addListener(updateMotionPreference);
  }
  function motionTime(ms) {
    if (reducedMotion) return 0;
    return Math.round(ms * (ANIMATION_SCALES[state.settings.animationSpeed] || 1));
  }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, motionTime(ms)); }); }

  function cardAriaLabel(card, faceDown) {
    if (faceDown) return t("faceDownCard");
    var rankKeys = {
      A: "rankAce", 2: "rankTwo", 3: "rankThree", 4: "rankFour", 5: "rankFive",
      6: "rankSix", 7: "rankSeven", 8: "rankEight", 9: "rankNine", 10: "rankTen",
      J: "rankJack", Q: "rankQueen", K: "rankKing"
    };
    var suitKeys = { "♠": "suitSpades", "♥": "suitHearts", "♦": "suitDiamonds", "♣": "suitClubs" };
    return t("cardLabel", {
      rank: rankKeys[card.rank] ? t(rankKeys[card.rank]) : card.rank,
      suit: t(suitKeys[card.suit])
    });
  }

  function setBanner(text, cls) {
    el.banner.classList.remove("flash-win", "flash-lose");
    if (cls) el.banner.classList.add(cls);
    el.bannerText.removeAttribute("data-i18n");
    el.bannerText.removeAttribute("data-i18n-pick");
    el.bannerText.removeAttribute("data-i18n-amount");
    el.bannerText.textContent = text;
  }
  function setBannerKey(key, cls) {
    setBanner(t(key), cls);
    el.bannerText.setAttribute("data-i18n", key);
  }
  function setRestakeBanner(amount) {
    setBanner(I18n.pick("restake", { amount: fmt(amount) }), "flash-win");
    el.bannerText.setAttribute("data-i18n-pick", "restake");
    el.bannerText.setAttribute("data-i18n-amount", String(amount));
  }

  // Dealer remarks — give the table a living, personal feel.
  var dealerTimer = null;
  function dealerSay(eventKey) {
    if (!el.dealerLine) return;
    var line = I18n.pick(eventKey);
    el.dealerLine.textContent = line;
    el.dealerLine.setAttribute("data-i18n-pick", eventKey);
    el.dealerLine.classList.add("show");
    clearTimeout(dealerTimer);
    dealerTimer = setTimeout(dealerQuiet, 3200);
  }
  function dealerQuiet() {
    clearTimeout(dealerTimer);
    if (el.dealerLine) el.dealerLine.classList.remove("show");
  }

  // Big centered outcome splash (BLACKJACK / WIN / PUSH / BUST / LOSE) with the
  // round's net amount. It is the single visual verdict: while it shows, the
  // banner below it is visually hidden (still announced) and the dealer stays quiet.
  function signedMoney(amount) {
    return (amount > 0 ? "+" : (amount < 0 ? "\u2212" : "")) + "$" + fmt(Math.abs(amount));
  }
  function renderResultAmount() {
    var amountNode = el.resultBadge && el.resultBadge.querySelector(".result-amount");
    if (amountNode) amountNode.textContent = signedMoney(parseInt(amountNode.getAttribute("data-amount"), 10));
  }
  function showResult(variant, translationKey, amount) {
    if (!el.resultBadge) return;
    el.resultBadge.hidden = false;
    el.resultBadge.innerHTML = '<span class="result-word" data-i18n="' + translationKey + '"></span>' +
      (amount ? '<span class="result-amount" data-amount="' + amount + '"></span>' : "");
    el.resultBadge.querySelector(".result-word").textContent = t(translationKey);
    renderResultAmount();
    dealerQuiet();
    el.resultBadge.className = "result-badge " + variant;
    void el.resultBadge.offsetWidth; // restart animation
    el.resultBadge.classList.add("show");
  }
  function flashBalance() {
    if (!el.balancePill) return;
    el.balancePill.classList.remove("win-flash");
    void el.balancePill.offsetWidth;
    el.balancePill.classList.add("win-flash");
  }
  function hideResult(immediate) {
    if (!el.resultBadge) return;
    if (immediate) {
      el.resultBadge.hidden = true;
      el.resultBadge.className = "result-badge";
      el.resultBadge.textContent = "";
      return;
    }
    el.resultBadge.classList.remove("show");
    el.resultBadge.classList.add("fade");
  }

  var toastTimer = null;
  var toastHideTimer = null;
  var toastContent = null;
  function renderToast() {
    if (toastContent && !el.toast.hidden) el.toast.textContent = toastContent();
  }
  function hideToast() {
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    el.toast.classList.remove("show");
    el.toast.hidden = true;
    toastContent = null;
  }
  function toast(text, cls) {
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    el.toast.hidden = false;
    toastContent = typeof text === "function" ? text : function () { return text; };
    renderToast();
    el.toast.className = "toast " + (cls || "");
    void el.toast.offsetWidth;
    el.toast.classList.add("show");
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("show");
      toastHideTimer = setTimeout(function () { el.toast.hidden = true; }, 300);
    }, 2200);
  }
  function toastKey(key, cls, params) {
    toast(function () {
      var localized = {};
      Object.keys(params || {}).forEach(function (name) {
        var value = params[name];
        localized[name] = typeof value === "function" ? value() : (typeof value === "number" ? fmt(value) : value);
      });
      return t(key, localized);
    }, cls);
  }
  function moneyToast(amount, cls, key) {
    toast(function () {
      return (key ? t(key) + " " : "") + (amount > 0 ? "+" : (amount < 0 ? "-" : "")) + "$" + fmt(Math.abs(amount));
    }, cls);
  }

  /* ---------------- Rendering ---------------- */
  // Traditional casino-card pip positions on a three-column, five-row field.
  // Keeping these as DOM glyphs makes the deck sharp at every size and fully offline.
  var PIP_LAYOUTS = {
    A: [8],
    2: [2, 14],
    3: [2, 8, 14],
    4: [1, 3, 13, 15],
    5: [1, 3, 8, 13, 15],
    6: [1, 3, 7, 9, 13, 15],
    7: [1, 3, 5, 7, 9, 13, 15],
    8: [1, 3, 5, 7, 9, 11, 13, 15],
    9: [1, 3, 4, 6, 8, 10, 12, 13, 15],
    10: [1, 3, 4, 5, 6, 10, 11, 12, 13, 15]
  };

  function courtFigureMarkup(rank, suit) {
    var headwear;
    var accessory;
    if (rank === "J") {
      headwear = '<path class="court-headwear" d="M21 14 Q31 4 43 12 L40 17 Q32 12 23 18 Z"/>' +
        '<path class="court-feather" d="M39 11 Q49 4 47 18 Q44 12 39 15 Z"/>';
      accessory = '<path class="court-weapon" d="M14 43 L48 8"/><path class="court-guard" d="M39 13 L48 22"/>';
    } else if (rank === "Q") {
      headwear = '<path class="court-crown" d="M21 14 L23 5 L29 11 L32 3 L36 11 L42 5 L43 15 Z"/>';
      accessory = '<path class="court-weapon" d="M45 12 L43 43"/>' +
        '<circle class="court-jewel" cx="45" cy="11" r="3"/><path class="court-flower" d="M45 8 l-4-3 m4 3 4-3"/>';
    } else {
      headwear = '<path class="court-crown" d="M19 15 L21 4 L28 11 L32 2 L37 11 L44 4 L45 16 Z"/>' +
        '<circle class="court-jewel" cx="32" cy="8" r="1.5"/>';
      accessory = '<path class="court-weapon" d="M15 9 L47 43"/><path class="court-guard" d="M14 15 L21 8"/>';
    }

    return '<g class="court-person court-person-' + rank.toLowerCase() + '">' +
      '<path class="court-robe court-robe-back" d="M8 48 Q10 31 22 27 L42 27 Q54 31 56 48 Z"/>' +
      '<path class="court-robe court-robe-front" d="M20 48 L24 28 L40 28 L45 48 Z"/>' +
      '<path class="court-collar" d="M22 27 L32 36 L42 27 L38 24 L26 24 Z"/>' +
      '<ellipse class="court-face-shape" cx="32" cy="19" rx="8" ry="9"/>' +
      '<path class="court-hair" d="M24 20 Q23 9 32 9 Q42 9 40 22 L37 18 L35 25 L30 25 L27 18 Z"/>' +
      '<path class="court-feature" d="M28 19 h2 M34 19 h2 M30 23 q2 1 4 0"/>' +
      headwear + accessory +
      '<text class="court-suit-glyph" x="17" y="42">' + suit + '</text>' +
      '</g>';
  }

  function cardVisualOffset(card) {
    var source = card.id || (card.rank + card.suit);
    var seed = 0;
    for (var i = 0; i < source.length; i++) seed = (seed * 31 + source.charCodeAt(i)) % 997;
    return {
      turn: (((seed % 9) - 4) * .24).toFixed(2) + "deg",
      lift: (((Math.floor(seed / 9) % 3) - 1) * .6).toFixed(1) + "px"
    };
  }

  function cardEl(card, faceDown, animate) {
    // Outer card: handles dealing motion + landing shadow.
    var d = document.createElement("div");
    d.className = "card " + card.color;
    d.setAttribute("role", "img");
    d.setAttribute("aria-label", cardAriaLabel(card, faceDown));
    // Only freshly-dealt cards play the deal-in animation; re-renders stay put.
    if (animate === false) d.classList.add("no-deal");
    else d.classList.add("deal-ready");
    var isFace = card.rank === "J" || card.rank === "Q" || card.rank === "K";
    if (isFace) d.classList.add("face");
    d.classList.add("rank-" + card.rank.toLowerCase());
    var offset = cardVisualOffset(card);
    d.style.setProperty("--card-turn", offset.turn);
    d.style.setProperty("--card-lift", offset.lift);

    // Inner: flips between the two faces in 3D.
    var inner = document.createElement("div");
    inner.className = "card-inner" + (faceDown ? " facedown" : "");
    inner.setAttribute("aria-hidden", "true");

    // Front face (the real card — built even when face-down, simply rotated away).
    var front = document.createElement("div");
    front.className = "card-face front";
    var tl = document.createElement("div");
    tl.className = "corner tl";
    // Keep corner indices value-only. Suit glyphs belong to the main artwork,
    // so a six always reads as six pips instead of six plus two corner marks.
    tl.innerHTML = '<span class="r">' + card.rank + "</span>";
    var br = document.createElement("div");
    br.className = "corner br";
    br.innerHTML = '<span class="r">' + card.rank + "</span>";
    front.appendChild(tl);
    front.appendChild(br);
    if (isFace) {
      var court = document.createElement("div");
      court.className = "court court-" + card.rank.toLowerCase();
      var portrait = courtFigureMarkup(card.rank, card.suit);
      court.innerHTML = '<svg class="court-art" viewBox="0 0 64 96" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<rect class="court-paper" x="1" y="1" width="62" height="94" rx="2"/>' +
        '<path class="court-diagonal court-diagonal-a" d="M2 66 L42 2 H62 V28 L22 94 H2 Z"/>' +
        '<path class="court-diagonal court-diagonal-b" d="M2 78 L50 2 H61 L13 94 H2 Z"/>' +
        portrait + '<g transform="rotate(180 32 48)">' + portrait + '</g>' +
        '<rect class="court-center-band" x="1" y="43" width="62" height="10"/>' +
        '<text class="court-center-rank" x="32" y="50.5">' + card.rank + '</text>' +
        '<rect class="court-frame" x="1" y="1" width="62" height="94" rx="2"/>' +
        '</svg>';
      front.appendChild(court);
    } else {
      var field = document.createElement("div");
      field.className = "pip-layout";
      (PIP_LAYOUTS[card.rank] || [8]).forEach(function (position) {
        var pip = document.createElement("span");
        pip.className = "pip-mark p" + position + (position >= 10 ? " inverted" : "");
        pip.textContent = card.suit;
        field.appendChild(pip);
      });
      front.appendChild(field);
    }

    // Back face (patterned).
    var back = document.createElement("div");
    back.className = "card-face back";

    inner.appendChild(front);
    inner.appendChild(back);
    d.appendChild(inner);
    return d;
  }

  // Measure the real shoe/card positions after layout, then animate from the
  // mouth of the shoe. This stays correct as the table changes size or shape.
  function startCardDeal(cardNode) {
    if (!cardNode) return;
    var target = cardNode.getBoundingClientRect();
    var mouth = el.shoeMouth && el.shoeMouth.getBoundingClientRect();
    var shoe = el.shoe && el.shoe.getBoundingClientRect();
    var sourceX;
    var sourceY;

    if (mouth && mouth.width > 0 && mouth.height > 0) {
      sourceX = mouth.left + mouth.width * .42;
      sourceY = mouth.top + mouth.height * .48;
    } else if (shoe && shoe.width > 0 && shoe.height > 0) {
      sourceX = shoe.left + shoe.width * .4;
      sourceY = shoe.top + shoe.height * .7;
    } else {
      var felt = el.tableFelt.getBoundingClientRect();
      sourceX = felt.left + felt.width * .78;
      sourceY = felt.top + felt.height * .17;
    }

    var dx = sourceX - (target.left + target.width * .5);
    var dy = sourceY - (target.top + target.height * .5);
    var arc = Math.min(18, Math.max(7, Math.abs(dy) * .06));
    var asPx = function (value) { return (Math.round(value * 10) / 10) + "px"; };
    cardNode.style.setProperty("--shoe-x", asPx(dx));
    cardNode.style.setProperty("--shoe-y", asPx(dy));
    cardNode.style.setProperty("--deal-x", asPx(dx));
    cardNode.style.setProperty("--deal-y", asPx(dy));
    cardNode.style.setProperty("--deal-mid-x", asPx(dx * .46));
    cardNode.style.setProperty("--deal-mid-y", asPx(dy * .46 - arc));
    if (!cardNode.classList.contains("deal-ready")) return;
    void cardNode.offsetWidth;
    cardNode.classList.remove("deal-ready");
    cardNode.classList.add("dealing");
  }

  function prepareCardForDiscard(cardNode, index) {
    if (!cardNode || !el.discardTray) return;
    var cardRect = cardNode.getBoundingClientRect();
    var trayRect = el.discardTray.getBoundingClientRect();
    var targetX = trayRect.left + trayRect.width * .5;
    var targetY = trayRect.top + trayRect.height * .48;
    var sourceX = cardRect.left + cardRect.width * .5;
    var sourceY = cardRect.top + cardRect.height * .5;
    var asPx = function (value) { return (Math.round(value * 10) / 10) + "px"; };
    cardNode.style.setProperty("--discard-x", asPx(targetX - sourceX));
    cardNode.style.setProperty("--discard-y", asPx(targetY - sourceY));
    cardNode.style.setProperty("--discard-mid-x", asPx((targetX - sourceX) * .52));
    cardNode.style.setProperty("--discard-mid-y", asPx((targetY - sourceY) * .52 - 12));
    cardNode.style.setProperty("--discard-turn", ((index % 3) - 1) * 2.2 + "deg");
  }

  function renderDealer() {
    el.dealerHand.innerHTML = "";
    state.dealer.cards.forEach(function (c, i) {
      var hidden = state.dealer.hideHole && i === 1;
      var animate = !c._shown; c._shown = true;
      var cardNode = cardEl(c, hidden, animate);
      cardNode.classList.add("dealer-card");
      if (i === 0) cardNode.classList.add("up-card");
      if (i === 1) {
        cardNode.classList.add("hole-card");
        cardNode.style.setProperty("--card-turn", "2.1deg");
        cardNode.style.setProperty("--card-lift", "3px");
      }
      el.dealerHand.appendChild(cardNode);
      startCardDeal(cardNode);
    });
    if (state.dealer.hideHole) {
      el.dealerScore.textContent = state.dealer.cards.length ? Engine.totalLabel([state.dealer.cards[0]], true) : "";
      el.dealerScore.className = "score-chip";
    } else {
      var v = handValue(state.dealer.cards);
      // A lone up-card (no-hole-card tables) is still a live soft count: "1/11".
      el.dealerScore.textContent = state.dealer.cards.length ? Engine.totalLabel(state.dealer.cards, state.dealer.cards.length === 1) : "";
      el.dealerScore.className = "score-chip" +
        (v.total > 21 ? " bust" : (isBlackjack(state.dealer.cards) ? " bj" : ""));
    }
  }

  function handIsLive(hand) {
    return state.phase !== "dealer" && state.phase !== "payout" && !hand.done && !hand.result;
  }

  function renderHandTag(tag, hand, idx) {
    var v = handValue(hand.cards);
    var label = state.hands.length > 1 ? (t("handLabel") + " " + (idx + 1) + " · ") : "";
    var naturalBlackjack = state.hands.length === 1 && !hand.fromSplit && isBlackjack(hand.cards);
    var scoreTxt = v.total > 21 ? t("bustShort") : (naturalBlackjack ? "BJ" : Engine.totalLabel(hand.cards, handIsLive(hand)));
    tag.innerHTML = '<span>' + label + scoreTxt + '</span><span class="htag-bet">$' + fmt(hand.bet) + '</span>';
    if (hand.result) {
      var rcls = handReturnsWager(hand.result) && hand.result !== "push" ? "win" : (hand.result === "push" ? "" : "lose");
      tag.innerHTML += '<span class="htag-res ' + rcls + '">' + resultShort(hand.result) + '</span>';
    }
  }

  // Once play leaves the player, soft totals collapse to a single number.
  function refreshHandTotals() {
    el.playerHands.querySelectorAll(".player-hand").forEach(function (wrap, index) {
      if (state.hands[index]) renderHandTag(wrap.querySelector(".hand-tag"), state.hands[index], index);
    });
  }

  // Translation never replaces cards or payment nodes: their in-flight CSS
  // classes, transforms and animation identity must survive a language change.
  function translateHands() {
    el.dealerHand.querySelectorAll(".card").forEach(function (node, index) {
      var card = state.dealer.cards[index];
      if (card) node.setAttribute("aria-label", cardAriaLabel(card, state.dealer.hideHole && index === 1));
    });
    el.playerHands.querySelectorAll(".player-hand").forEach(function (wrap, index) {
      var hand = state.hands[index];
      if (!hand) return;
      wrap.querySelectorAll(".card").forEach(function (node, cardIndex) {
        if (hand.cards[cardIndex]) node.setAttribute("aria-label", cardAriaLabel(hand.cards[cardIndex], false));
      });
      renderHandTag(wrap.querySelector(".hand-tag"), hand, index);
      wrap.querySelector(".hand-wager").setAttribute("aria-label", t("handWagerLabel", { hand: index + 1, amount: fmt(hand.bet) }));
    });
  }

  function renderPlayer() {
    document.body.setAttribute("data-hands", String(state.hands.length));
    el.playerHands.innerHTML = "";
    el.playerHands.className = "hands-row hand-count-" + state.hands.length;
    var cardsToPosition = [];
    state.hands.forEach(function (hand, idx) {
      var wrap = document.createElement("div");
      wrap.className = "player-hand" + (idx === state.active && state.phase === "player" ? " active" : "");

      var handRow = document.createElement("div");
      handRow.className = "hand";
      hand.cards.forEach(function (c, cardIndex) {
        var animate = !c._shown; c._shown = true;
        var ce = cardEl(c, false, animate);
        // The double-down card lies sideways, as dealt at a real table.
        if (hand.doubled && cardIndex === 2) {
          ce.classList.add("double-card");
          ce.style.setProperty("--card-turn", "90deg");
          ce.style.setProperty("--card-lift", "0px");
        }
        if (hand.result === "win" || hand.result === "blackjack" || hand.result === "evenMoney" || hand.result === "dealerBust") {
          ce.classList.add("win-glow");
        }
        handRow.appendChild(ce);
        cardsToPosition.push(ce);
      });

      var tag = document.createElement("div");
      tag.className = "hand-tag";
      renderHandTag(tag, hand, idx);

      var footer = document.createElement("div");
      footer.className = "hand-footer";
      var wager = document.createElement("div");
      var wagerMotion = hand.wagerMotion || (!hand.wagerShown ? "enter" : "");
      wager.className = "hand-wager" + (wagerMotion ? " wager-" + wagerMotion : "");
      wager.setAttribute("role", "img");
      wager.setAttribute("aria-label", t("handWagerLabel", { hand: idx + 1, amount: fmt(hand.bet) }));
      wager.setAttribute("data-hand-index", String(idx));
      var handBetStack = document.createElement("div");
      renderChipPile(handBetStack, hand.bet, "bet-stack hand-bet-stack");
      handBetStack.setAttribute("aria-hidden", "true");
      var handPayoutStack = document.createElement("div");
      handPayoutStack.className = "bet-stack payout-stack hand-payout-stack";
      handPayoutStack.setAttribute("aria-hidden", "true");
      wager.appendChild(handBetStack);
      wager.appendChild(handPayoutStack);
      footer.appendChild(wager);
      footer.appendChild(tag);
      hand.wagerShown = true;
      hand.wagerMotion = null;

      wrap.appendChild(handRow);
      wrap.appendChild(footer);
      el.playerHands.appendChild(wrap);
    });

    // All hands must be connected first: adding a split hand changes every
    // flex item's final position and therefore the vector from the shoe.
    cardsToPosition.forEach(startCardDeal);

    // Single-hand score chip near header
    if (state.hands.length === 1) {
      var hv = handValue(state.hands[0].cards);
      el.playerScore.textContent = state.hands[0].cards.length ? Engine.totalLabel(state.hands[0].cards, handIsLive(state.hands[0])) : "";
      el.playerScore.className = "score-chip" +
        (hv.total > 21 ? " bust" : (!state.hands[0].fromSplit && isBlackjack(state.hands[0].cards) ? " bj" : ""));
    } else {
      el.playerScore.textContent = "";
    }
  }

  function resultShort(r) {
    switch (r) {
      case "blackjack": return t("bjShort");
      case "evenMoney": return t("evenMoneyShort");
      case "win":
      case "dealerBust": return t("youWin");
      case "push": return t("pushShort");
      case "bust":
      case "lose": return t("youLose");
      case "surrender": return "½";
      default: return "";
    }
  }

  function handReturnsWager(result) {
    return result === "blackjack" || result === "evenMoney" || result === "win" ||
      result === "dealerBust" || result === "push";
  }

  function handPaymentAmount(hand) {
    var fullReturn = payoutFor(hand.result, hand.bet);
    return Math.max(0, fullReturn - (handReturnsWager(hand.result) ? hand.bet : 0));
  }

  // Bankroll number tweens toward its target for a satisfying count-up/down.
  var bankrollShown = state.bankroll;
  var bankrollRAF = null;
  function renderBankroll(instant) {
    var target = Math.max(0, Math.floor(state.bankroll));
    if (bankrollRAF) { cancelAnimationFrame(bankrollRAF); bankrollRAF = null; }
    if (instant) {
      bankrollShown = target;
      el.bankroll.textContent = fmt(target);
      return;
    }
    var from = bankrollShown;
    var start = (global.performance && performance.now) ? performance.now() : Date.now();
    var dur = 520;
    function step(now) {
      var t2 = Math.min(1, ((now || Date.now()) - start) / dur);
      var eased = 1 - Math.pow(1 - t2, 3);
      bankrollShown = Math.round(from + (target - from) * eased);
      el.bankroll.textContent = fmt(bankrollShown);
      if (t2 < 1) { bankrollRAF = requestAnimationFrame(step); }
      else { bankrollShown = target; el.bankroll.textContent = fmt(target); bankrollRAF = null; }
    }
    if (global.requestAnimationFrame) bankrollRAF = requestAnimationFrame(step);
    else { bankrollShown = target; el.bankroll.textContent = fmt(target); }
  }
  function renderBet() {
    el.currentBet.textContent = fmt(state.bet);
    renderBetStack();
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  function chipSvgShape(name, className, attributes) {
    var node = document.createElementNS(SVG_NS, name);
    node.setAttribute("class", className);
    Object.keys(attributes).forEach(function (key) {
      node.setAttribute(key, String(attributes[key]));
    });
    return node;
  }

  // Vector geometry keeps chip rings and edge inserts smooth on low-DPI screens.
  function createChipArt(className, label) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    svg.appendChild(chipSvgShape("circle", "chip-svg-base", { cx: 50, cy: 50, r: 48 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-spots spot-a", { cx: 50, cy: 50, r: 39 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-spots spot-b", { cx: 50, cy: 50, r: 39 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-body-ring", { cx: 50, cy: 50, r: 30.5 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-groove", { cx: 50, cy: 50, r: 25.5 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-inlay", { cx: 50, cy: 50, r: 22 }));
    svg.appendChild(chipSvgShape("circle", "chip-svg-innerline", { cx: 50, cy: 50, r: 18.5 }));
    svg.appendChild(chipSvgShape("ellipse", "chip-svg-shade", { cx: 50, cy: 70, rx: 27, ry: 12 }));
    svg.appendChild(chipSvgShape("ellipse", "chip-svg-shine", { cx: 39, cy: 27, rx: 23, ry: 10 }));
    if (label) {
      var value = chipSvgShape("text", "chip-svg-value", { x: 50, y: 52 });
      value.textContent = label;
      svg.appendChild(value);
    }
    return svg;
  }

  // A chip on the felt is not merely a squashed tray chip: this vector draws
  // the complete low cylinder (curved wall, edge inserts and perspective face).
  // Every layer gets one, so small offsets expose real surfaces instead of
  // rectangular CSS bands while the deterministic z-order prevents bleed.
  function createStackChipArt(label) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "stack-chip-art");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var wall = "M2 36 L2 63 C2 83 23 98 50 98 C77 98 98 83 98 63 L98 36 Z";
    svg.appendChild(chipSvgShape("path", "stack-svg-side", { d: wall }));
    [
      "M4 66 L16 72 L16 91 Q9 86 4 78 Z",
      "M28 78 Q34 81 40 82 L40 97 Q34 95 28 92 Z",
      "M60 82 Q66 81 72 78 L72 92 Q66 95 60 97 Z",
      "M84 72 L96 66 L96 78 Q91 86 84 91 Z"
    ].forEach(function (path, index) {
      svg.appendChild(chipSvgShape("path", "stack-svg-side-spot spot-" + (index % 2 ? "b" : "a"), { d: path }));
    });
    svg.appendChild(chipSvgShape("path", "stack-svg-side-shade", { d: wall }));
    svg.appendChild(chipSvgShape("path", "stack-svg-side-glint", {
      d: "M5 69 C17 87 34 95 50 95"
    }));
    svg.appendChild(chipSvgShape("path", "stack-svg-bottom-rim", {
      d: "M2 63 C2 83 23 98 50 98 C77 98 98 83 98 63"
    }));

    svg.appendChild(chipSvgShape("ellipse", "stack-svg-top", { cx: 50, cy: 38, rx: 48, ry: 36 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-spots spot-a", {
      cx: 50, cy: 38, rx: 39, ry: 28.5, pathLength: 100
    }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-spots spot-b", {
      cx: 50, cy: 38, rx: 39, ry: 28.5, pathLength: 100
    }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-body-ring", { cx: 50, cy: 38, rx: 30.5, ry: 22.5 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-groove", { cx: 50, cy: 38, rx: 25.5, ry: 18.8 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-inlay", { cx: 50, cy: 38, rx: 22, ry: 16 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-innerline", { cx: 50, cy: 38, rx: 18.5, ry: 13.2 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-face-shade", { cx: 50, cy: 52, rx: 27, ry: 11 }));
    svg.appendChild(chipSvgShape("ellipse", "stack-svg-face-shine", { cx: 39, cy: 19, rx: 22, ry: 8 }));
    if (label) {
      var value = chipSvgShape("text", "chip-svg-value stack-svg-value", { x: 50, y: 39 });
      value.textContent = label;
      svg.appendChild(value);
    }
    return svg;
  }

  function chipDisplayValue(value) {
    if (value >= 1000) return (value / 1000) + "K";
    return String(value);
  }

  function decorateTrayChips() {
    document.querySelectorAll(".chip").forEach(function (chip) {
      if (!chip.querySelector(".chip-art")) chip.insertBefore(createChipArt("chip-art"), chip.firstChild);
    });
  }

  function renderChipPile(target, amount, className) {
    target.className = className;
    target.innerHTML = "";
    target.removeAttribute("data-actual-chips");
    target.removeAttribute("data-visible-chips");
    target.removeAttribute("data-compressed");
    target.removeAttribute("data-amount");
    target.removeAttribute("data-remainder");
    target.removeAttribute("data-row-count");

    var isHandStack = /\bhand-(?:bet|payout)-stack\b/.test(className);
    var stackOptions = { maxColumnsPerRow: isHandStack ? 3 : 6 };
    if (isHandStack && state.hands.length >= 3) {
      stackOptions.maxColumnsPerRow = 2;
      stackOptions.exactChipLimit = 8;
      stackOptions.growthPerDoubling = 2;
    } else if (isHandStack && state.hands.length === 2) {
      stackOptions.exactChipLimit = 12;
      stackOptions.growthPerDoubling = 3;
    }
    var stack = BetChipStack.build(amount, CHIP_DENOMS, stackOptions);
    var chips = stack.chips;
    if (chips.length === 0) return;

    target.classList.add("pile-" + stack.layout.density);
    target.setAttribute("data-actual-chips", String(stack.actualChipCount));
    target.setAttribute("data-visible-chips", String(stack.visibleChipCount));
    target.setAttribute("data-compressed", String(stack.compressed));
    target.setAttribute("data-amount", String(Math.max(0, Math.floor(Number(amount) || 0))));
    target.setAttribute("data-remainder", String(stack.remainder));
    target.setAttribute("data-row-count", String(stack.layout.rowColumnCounts.length));

    // Build compact front/back rows. Small wagers remain literal; large wagers
    // gain both height and breadth without spilling across the cards or viewport.
    var chipOffset = 0;
    var columnIndex = 0;
    stack.layout.rowColumnCounts.forEach(function (rowColumnCount, rowIndex) {
      var row = document.createElement("div");
      row.className = "pile-row pile-row-" + rowIndex;
      row.style.zIndex = String(rowIndex + 1);

      for (var rowColumn = 0; rowColumn < rowColumnCount; rowColumn++) {
        var columnChipCount = stack.layout.columnChipCounts[columnIndex];
        var colChips = chips.slice(chipOffset, chipOffset + columnChipCount);
        var ci = columnIndex;
        chipOffset += columnChipCount;
        columnIndex++;

        var col = document.createElement("div");
        col.className = "chip-col stack-count-" + colChips.length;
        col.style.setProperty("--stack-count", String(colChips.length));
        colChips.forEach(function (d, idx) {
          var c = document.createElement("div");
          var isTop = idx === colChips.length - 1;
          c.className = "stack-chip stack-level-" + idx + (isTop ? " cap" : "");
          var color = CHIP_COLORS[d] || CHIP_COLORS[100];
          c.style.setProperty("--body", color.body);
          c.style.setProperty("--spot", color.spot);
          c.style.setProperty("--spot-alt", color.spotAlt || color.spot);
          c.style.setProperty("--ring", color.ring);
          c.style.setProperty("--inlay", color.inlay);
          c.style.setProperty("--ink", color.ink);
          c.style.zIndex = String(idx);                  // top chip paints above the rest
          var visualIndex = (ci * 2 + idx) % 5;
          var shifts = [0, -.75, .55, -.35, .8];
          var turns = [-.18, .28, -.22, .2, -.12];
          c.style.setProperty("--stack-shift", shifts[visualIndex] + "px");
          c.style.setProperty("--stack-chip-turn", turns[visualIndex] + "deg");
          c.appendChild(createStackChipArt(isTop ? chipDisplayValue(d) : ""));
          col.appendChild(c);
        });
        row.appendChild(col);
      }
      target.appendChild(row);
    });
  }

  function renderBetStack() {
    renderChipPile(el.betStack, state.bet, "bet-stack");
  }

  function renderPayoutStack(amount) {
    renderChipPile(el.payoutStack, amount, "bet-stack payout-stack");
  }

  function renderStats() {
    $("stHands").textContent = state.stats.hands;
    $("stWins").textContent = state.stats.wins;
    $("stLosses").textContent = state.stats.losses;
    $("stPushes").textContent = state.stats.pushes;
    $("stBj").textContent = state.stats.blackjacks;
    var decided = state.stats.wins + state.stats.losses;
    var rate = decided ? Math.round((state.stats.wins / decided) * 100) : 0;
    $("stRate").textContent = rate + "%";
    var decisions = state.stats.strategyDecisions;
    $("stStrategy").textContent = decisions
      ? Math.round((state.stats.strategyCorrect / decisions) * 100) + "% (" + fmt(decisions) + ")"
      : "\u2013";
  }

  /* ---------------- Strategy coach ---------------- */
  // Which optional plays the table offers for the active hand right now. The
  // buttons and the coach share this, so advice never names a disabled play.
  function availablePlays(hand) {
    var firstMove = hand.cards.length === 2 && !hand.doubled;
    return {
      double: firstMove && Rules.canDouble(hand, state.settings, handValue) &&
        canFundStake(hand.bet) && hand.bet * 2 <= Engine.MAX_WAGER,
      split: firstMove && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank) &&
        state.hands.length < state.settings.maxHands && canFundStake(hand.bet),
      // Late surrender: only on the very first decision of a single, unsplit hand
      surrender: state.settings.surrender && firstMove && state.hands.length === 1
    };
  }

  function strategyAdvice() {
    var hand = state.hands[state.active];
    if (!hand || !state.dealer.cards.length) return null;
    return Strategy.recommend(hand.cards, state.dealer.cards[0].rank, state.settings, availablePlays(hand));
  }

  function coachSituation(advice, upRank) {
    var up = upRank === "A" ? "A" : String(cardValue(upRank));
    if (advice.kind === "pair") return t("coachPair", { rank: advice.pairRank, up: up });
    return t(advice.kind === "soft" ? "coachSoft" : "coachHard", { total: advice.total, up: up });
  }

  // Score one decision before it is carried out. A different play gets a short,
  // localized note when the coach is on; the accuracy statistic always counts.
  function judgeDecision(action) {
    var advice = strategyAdvice();
    if (!advice) return;
    var upRank = state.dealer.cards[0].rank;
    state.stats.strategyDecisions++;
    if (action === advice.action) { state.stats.strategyCorrect++; return; }
    if (state.settings.coach === "off") return;
    toastKey("coachMiss", "coach", {
      play: function () { return t(advice.action); },
      situation: function () { return coachSituation(advice, upRank); }
    });
  }

  // Returns true when the coach should comment; the caller words the toast so
  // it can share it with the insurance result.
  function judgeInsurance(taken) {
    state.stats.strategyDecisions++;
    if (taken === Strategy.takeInsurance()) { state.stats.strategyCorrect++; return false; }
    return state.settings.coach !== "off";
  }

  function renderCoachHint(canAct) {
    var pick = null;
    if (state.settings.coach === "hints") {
      if (state.phase === "insurance") pick = el.btn.insNo;
      else if (canAct) {
        var advice = strategyAdvice();
        if (advice) pick = el.btn[advice.action];
      }
    }
    [el.btn.hit, el.btn.stand, el.btn.double, el.btn.split, el.btn.surrender, el.btn.insYes, el.btn.insNo].forEach(function (button) {
      button.classList.toggle("coach-pick", button === pick);
    });
  }

  /* ---------------- Controls availability ---------------- */
  function updateControls() {
    var p = state.phase;
    document.body.setAttribute("data-phase", p);
    document.body.setAttribute("data-busy", String(state.busy || accountPending));
    document.body.setAttribute("data-wager", String(state.bet));
    document.body.setAttribute("data-hands", String(state.hands.length));
    var betting = p === "betting" && !accountPending;
    var playing = p === "player";
    var hand = state.hands[state.active];

    // Betting controls
    el.btn.deal.disabled = !(betting && state.bet > 0 && state.bet <= state.bankroll && state.bet <= wagerLimit()) || state.busy;
    el.btn.clear.disabled = !betting || state.bet === 0 || state.busy;
    el.btn.rebet.disabled = !(betting && state.lastBet > 0 && state.bet === 0) || state.busy;

    // Deposits are deliberately limited to the interval between hands. A live
    // round is not persisted, so changing the stored balance mid-hand would
    // make a reload restore an ambiguous combination of bankroll and wager.
    var depositDisabled = !betting || state.busy;
    var depositInput = $("depositAmount");
    var depositButton = $("btnDeposit");
    if (depositInput) depositInput.disabled = depositDisabled;
    if (depositButton) depositButton.disabled = depositDisabled;
    document.querySelectorAll("[data-deposit]").forEach(function (button) {
      button.disabled = depositDisabled;
    });

    // Chips
    document.querySelectorAll(".chip").forEach(function (chip) {
      var raw = chip.getAttribute("data-value");
      if (raw === "allin") {
        // All-in is available whenever there's a balance left to wager.
        chip.disabled = !betting || state.busy || state.bankroll < MIN_BET || state.bankroll <= state.bet || state.bankroll > wagerLimit();
      } else {
        var v = parseInt(raw, 10);
        chip.disabled = !betting || state.busy || (state.bet + v) > Math.min(state.bankroll, wagerLimit());
      }
    });
    var limitHint = t("wagerLimit", { amount: "$" + fmt(wagerLimit()) });
    document.querySelectorAll(".chip").forEach(function (chip) { chip.title = limitHint; });

    // The insurance prompt is modal: keep pointer and keyboard focus out of the
    // top bar until the player accepts or declines it.
    document.querySelectorAll(".topbar button").forEach(function (button) {
      button.disabled = p === "insurance";
    });

    // Action controls
    var canAct = playing && hand && !state.busy;
    el.btn.hit.disabled = !canAct;
    el.btn.stand.disabled = !canAct;

    var plays = canAct ? availablePlays(hand) : { double: false, split: false, surrender: false };
    el.btn.double.disabled = !plays.double;
    el.btn.split.disabled = !plays.split;
    el.btn.surrender.disabled = !plays.surrender;
    renderCoachHint(canAct);

    if (p === "insurance") {
      var insuranceAmount = Math.min(Math.floor(state.hands[0].bet / 2), state.bankroll);
      el.btn.insYes.disabled = state.insuranceMode !== "evenMoney" && (insuranceAmount <= 0 || !canFundStake(insuranceAmount));
    } else el.btn.insYes.disabled = false;

    updateRuleAvailability();
  }

  function compactNumber(value) {
    if (value >= 1e9) return (value / 1e9) + "B";
    if (value >= 1e6) return (value / 1e6) + "M";
    if (value >= 1e3) return (value / 1e3) + "K";
    return String(value);
  }

  function profileDisplayName(profileId) {
    var key = {
      lasVegas: "profileLasVegas",
      atlanticCity: "profileAtlanticCity",
      european: "profileEuropean",
      custom: "profileCustom"
    }[profileId] || "profileCustom";
    return t(key);
  }

  function activeRulesText() {
    var profileId = Rules.detectProfile(state.settings);
    return profileDisplayName(profileId) + ": " + t("ruleSummary", {
      decks: t(state.settings.decks === 1 ? "deckValue" : "decksValue", { count: state.settings.decks }),
      dealer: t(state.settings.hitSoft17 ? "dealerRuleH17Short" : "dealerRuleS17Short"),
      hole: t(state.settings.dealerHoleCard ? "ruleHoleCard" : "ruleNoHoleCard"),
      double: t(state.settings.doubleRule === "hard9to11" ? "ruleDoubleHard" : "ruleDoubleAny"),
      surrender: t(state.settings.surrender ? "ruleSurrender" : "ruleNoSurrender"),
      splits: t("ruleSplitLimit", { count: state.settings.maxHands })
    });
  }

  function renderRuleProfileUI() {
    var profileId = Rules.detectProfile(state.settings);
    state.settings.ruleProfile = profileId;
    var buttons = [].slice.call(document.querySelectorAll("[data-rule-profile]"));
    buttons.forEach(function (button, index) {
      var active = button.getAttribute("data-rule-profile") === profileId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active || (profileId === "custom" && index === 0) ? 0 : -1;
    });
    var summary = $("activeRulesSummary");
    if (summary) summary.textContent = activeRulesText();
  }

  function chooseRuleProfile(profileId) {
    if (state.phase !== "betting" || state.busy || !Rules.isProfile(profileId)) return;
    var previousProfile = Rules.detectProfile(state.settings);
    Rules.applyProfile(state.settings, profileId);
    // Selecting a different ruleset represents moving to another table. Start
    // it with a fresh shoe even when both profiles happen to use six decks.
    if (profileId !== previousProfile) {
      state.shoe = [];
      state.discarded = 0;
      state.discardTrayCount = 0;
    }
    persistSettings();
    applySettingsUI();
    renderShoeStatus();
    toastKey("profileApplied", "", { profile: function () { return profileDisplayName(profileId); } });
    Sound.chip();
  }

  function renderTableSpecs() {
    var limits = $("tableLimits");
    var profile = $("tableProfile");
    var decks = $("tableDecks");
    var rule = $("tableDealerRule");
    if (limits) limits.textContent = "$" + compactNumber(MIN_BET);
    if (profile) {
      var profileId = Rules.detectProfile(state.settings);
      var profileKey = {
        lasVegas: "profileShortLasVegas",
        atlanticCity: "profileShortAtlanticCity",
        european: "profileShortEuropean",
        custom: "profileShortCustom"
      }[profileId];
      profile.textContent = t(profileKey);
      profile.setAttribute("title", profileDisplayName(profileId));
    }
    if (decks) decks.textContent = t(state.settings.decks === 1 ? "deckValue" : "decksValue", { count: state.settings.decks });
    if (rule) {
      var ruleKey = state.settings.hitSoft17 ? "dealerRuleH17Short" : "dealerRuleS17Short";
      var fullRuleKey = state.settings.hitSoft17 ? "dealerRuleHitSoft17" : "dealerRuleStand17";
      rule.textContent = t(ruleKey);
      rule.setAttribute("title", t(fullRuleKey));
    }
  }

  function renderShoeStatus() {
    var total = state.settings.decks * 52;
    var untouched = state.shoe.length === 0 && state.discarded === 0;
    var remaining = untouched ? total : state.shoe.length;
    var fill = total ? remaining / total : 1;
    var depletion = Math.round((1 - Math.max(.08, fill)) * 24);

    if (el.shoeCards) el.shoeCards.style.setProperty("--shoe-depletion", depletion + "px");
    if (el.shoe) {
      el.shoe.style.setProperty("--shoe-depletion", depletion + "px");
      el.shoe.classList.toggle("cut-near", fill <= .34 && remaining > 0);
      el.shoe.setAttribute("aria-label", t("shoeCards", { count: remaining }));
    }
    if (el.shoeCount) el.shoeCount.textContent = String(remaining);

    var trayCount = Math.max(0, state.discardTrayCount);
    if (el.discardTray) {
      el.discardTray.classList.toggle("has-cards", trayCount > 0);
      el.discardTray.style.setProperty("--discard-depth", Math.min(10, Math.ceil(trayCount / Math.max(1, total) * 18)) + "px");
      el.discardTray.setAttribute("aria-label", trayCount
        ? t("discardTrayCards", { count: trayCount })
        : t("emptyDiscardTray"));
    }
    if (el.discardCount) el.discardCount.textContent = String(trayCount);
    renderTableSpecs();
  }

  function animateShuffleHardware(hadDiscard) {
    if (el.shoe) {
      el.shoe.classList.remove("shuffling");
      void el.shoe.offsetWidth;
      el.shoe.classList.add("shuffling");
    }
    if (hadDiscard && el.discardTray) {
      el.discardTray.classList.remove("returning");
      void el.discardTray.offsetWidth;
      el.discardTray.classList.add("returning");
    }
    Sound.shuffle();
    setTimeout(function () {
      if (el.shoe) el.shoe.classList.remove("shuffling");
      if (el.discardTray) el.discardTray.classList.remove("returning");
    }, Math.max(20, motionTime(760)));
  }

  /* ---------------- Shoe management ---------------- */
  function ensureShoe() {
    var needed = state.settings.decks * 52;
    // Small shoes must still reach the advertised 75% penetration. A fixed
    // sixty-card reserve would otherwise reshuffle one deck after every hand
    // and two decks far too early. Emergency reshuffling remains available for
    // the rare exceptionally long round.
    var penetrationReserve = Math.ceil(needed * (1 - PENETRATION));
    var reserve = Math.min(ROUND_CARD_RESERVE, Math.max(12, penetrationReserve));
    if (state.shoe.length < reserve || state.discarded / needed >= PENETRATION) {
      var hadDiscard = state.discardTrayCount > 0;
      state.shoe = shuffle(buildShoe(state.settings.decks));
      state.discarded = 0;
      state.discardTrayCount = 0;
      renderShoeStatus();
      animateShuffleHardware(hadDiscard);
      return true;
    }
    return false;
  }

  function emergencyReshuffle() {
    // The reserve above should make this unreachable. If an unusually long round
    // does exhaust the shoe, recycle only cards that are not currently on the table.
    var inPlay = {};
    state.dealer.cards.forEach(function (card) { inPlay[card.id] = true; });
    state.hands.forEach(function (hand) {
      hand.cards.forEach(function (card) { inPlay[card.id] = true; });
    });
    state.shoe = shuffle(buildShoe(state.settings.decks).filter(function (card) {
      return !inPlay[card.id];
    }));
    state.discarded = Object.keys(inPlay).length;
    state.discardTrayCount = 0;
    renderShoeStatus();
    animateShuffleHardware(true);
  }

  function draw() {
    if (state.shoe.length === 0) emergencyReshuffle();
    if (state.shoe.length === 0) throw new Error("No cards remain outside the active hand");
    state.discarded++;
    var card = state.shoe.pop();
    renderShoeStatus();
    return card;
  }

  /* ---------------- Betting ---------------- */
  var betClicks = 0;
  function addChip(value) {
    if (state.phase !== "betting" || state.busy || accountPending) return;
    syncIdleAccount();
    if (value === "allin") {
      if (state.bankroll < MIN_BET) { toastKey("insufficientFunds", "lose"); return; }
      if (state.bankroll > wagerLimit()) { toastKey("wagerLimit", "lose", { amount: function () { return "$" + fmt(wagerLimit()); } }); return; }
      state.bet = state.bankroll;        // wager everything
      Sound.chipStack(4);
      renderBet();
      updateControls();
      return;
    }
    value = Math.floor(Number(value));
    if (!isFinite(value) || value <= 0) return;
    if (state.bet + value > wagerLimit()) { toastKey("wagerLimit", "lose", { amount: function () { return "$" + fmt(wagerLimit()); } }); return; }
    if (state.bet + value > state.bankroll) {
      toastKey("insufficientFunds", "lose");
      return;
    }
    state.bet += value;
    Sound.chip(betClicks++);
    renderBet();
    updateControls();
  }
  function clearBet() {
    if (state.phase !== "betting") return;
    state.bet = 0;
    renderBet();
    updateControls();
  }
  function rebet() {
    if (state.phase !== "betting" || state.lastBet <= 0) return;
    syncIdleAccount();
    var target = Math.min(state.lastBet, state.bankroll, wagerLimit());
    if (target < MIN_BET) return;
    state.bet = target;
    Sound.chip();
    renderBet();
    updateControls();
  }

  // Load a chosen amount onto the table between hands. Keeping this out of live
  // rounds makes the intentionally fail-safe reload balance deterministic.
  function deposit(amount) {
    if (state.phase !== "betting" || state.busy) return false;
    amount = Number(amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) { toastKey("invalidDeposit", "lose"); return false; }
    return withAccount(function () {
      var nextBankroll = state.bankroll + Math.min(amount, MAX_BANKROLL - state.bankroll);
      var added = nextBankroll - state.bankroll;
      if (added <= 0) return false;
      state.bankroll = nextBankroll;
      persistBankroll();
      renderBankroll();
      flashBalance();
      updateControls();
      Sound.chipStack(2);
      toastKey("deposited", "win", { amount: function () { return "$" + fmt(added); } });
      return true;
    });
  }

  /* ---------------- Deal ---------------- */
  function bindText(node, key) {
    node.setAttribute("data-i18n", key);
    node.textContent = t(key);
  }

  function openInsurance(evenMoneyOffer) {
    state.phase = "insurance";
    state.insuranceMode = evenMoneyOffer ? "evenMoney" : "insurance";
    bindText($("insEyebrow"), evenMoneyOffer ? "evenMoneyLabel" : "insuranceLabel");
    bindText($("insTitle"), evenMoneyOffer ? "evenMoneyTitle" : "insuranceTitle");
    bindText($("insDesc"), evenMoneyOffer ? "evenMoneyDesc" : "insuranceDesc");
    bindText(el.btn.insYes, evenMoneyOffer ? "takeEvenMoney" : "takeInsurance");
    bindText(el.btn.insNo, "declineOffer");
    el.insuranceOverlay.hidden = false;
    updateControls();
    setTimeout(function () { (el.btn.insYes.disabled ? el.btn.insNo : el.btn.insYes).focus(); }, 0);
  }

  function closeInsurance() {
    el.insuranceOverlay.hidden = true;
  }

  async function deal() {
    if (state.phase !== "betting" || state.busy) return;
    return withAccount(dealRound, true);
  }

  async function dealRound() {
    if (state.bet < MIN_BET) { toastKey("minBet", "lose"); return; }
    if (state.bet > state.bankroll) { toastKey("insufficientFunds", "lose"); return; }
    if (state.bet > wagerLimit()) { toastKey("wagerLimit", "lose", { amount: function () { return "$" + fmt(wagerLimit()); } }); return; }

    // Preserve the pre-hand balance on reload; other tabs cannot overwrite it
    // while this tab owns the account lock.
    persistBankroll();
    persistStats();

    state.busy = true;
    hideToast();
    state.phase = "dealing";
    updateControls();
    if (ensureShoe()) {
      setBannerKey("shuffling");
      await delay(760);
    }
    state.roundStakeLimit = Math.floor((MAX_BANKROLL - state.bankroll) / 2);
    state.bankroll -= state.bet;
    state.lastBet = state.bet;
    renderBankroll();
    Sound.chipStack(2);

    state.insurance = 0;
    state.evenMoney = false;
    state.dealer = { cards: [], hideHole: state.settings.dealerHoleCard };
    state.hands = [{
      cards: [], bet: state.bet, done: false, doubled: false,
      splitAces: false, fromSplit: false, result: null, payoutAmount: 0
    }];
    state.active = 0;
    el.banner.classList.remove("flash-win", "flash-lose");
    setBannerKey("yourTurn");
    updateControls();

    // American tables deal a hole card now. European no-hole-card tables wait
    // until every player decision is complete before taking the second card.
    var hand = state.hands[0];
    hand.cards.push(draw()); renderPlayer(); Sound.card(); await delay(440);
    state.dealer.cards.push(draw()); renderDealer(); Sound.card(); await delay(440);
    hand.cards.push(draw()); renderPlayer(); Sound.card(); await delay(440);
    if (state.settings.dealerHoleCard) {
      state.dealer.cards.push(draw()); renderDealer(); Sound.card(); await delay(520);
    }

    state.busy = false;
    dealerSay("sayDeal");

    var dealerUp = state.dealer.cards[0];
    var playerBJ = isBlackjack(hand.cards);

    // A natural blackjack always gets the even-money choice; ordinary insurance
    // is offered only when its half-bet stake is affordable.
    if (dealerUp.rank === "A" && (playerBJ || state.bankroll >= Math.floor(state.bet / 2))) {
      openInsurance(playerBJ);
      return;
    }

    // Dealer peeks for blackjack on A or 10-value
    if (state.settings.dealerPeeks && (dealerUp.rank === "A" || cardValue(dealerUp.rank) === 10)) {
      if (isBlackjack(state.dealer.cards)) { return revealAndSettle(); }
    }

    if (playerBJ) { return revealAndSettle(); }

    state.phase = "player";
    updateControls();
  }

  function takeInsurance(yes) {
    if (state.phase !== "insurance") return;
    if (yes && el.btn.insYes.disabled) return;
    var coachNote = judgeInsurance(yes);
    if (coachNote) toastKey("coachInsurance", "coach");
    var evenMoneyOffer = state.insuranceMode === "evenMoney";
    closeInsurance();

    if (evenMoneyOffer && yes) {
      state.evenMoney = true;
      state.insuranceMode = null;
      return revealAndSettle();
    }

    if (yes) {
      var amt = Math.floor(state.hands[0].bet / 2);
      amt = Math.min(amt, state.bankroll);
      state.insurance = amt;
      state.bankroll -= amt;
      renderBankroll();
      Sound.chipStack(1);
    }
    state.insuranceMode = null;
    // Hole-card games check now. ENHC insurance remains live until the dealer
    // takes the second card after every player decision.
    if (state.settings.dealerPeeks && isBlackjack(state.dealer.cards)) { return revealAndSettle(); }
    // No dealer blackjack -> insurance (if any) is lost; continue
    if (state.insurance > 0 && state.settings.dealerPeeks) {
      toastKey(coachNote ? "insuranceLostCoach" : "insuranceLost", "lose", { amount: state.insurance });
    }
    if (isBlackjack(state.hands[0].cards)) { return revealAndSettle(); }
    state.phase = "player";
    updateControls();
    el.btn.hit.focus();
  }

  /* ---------------- Player actions ---------------- */
  async function hit() {
    if (state.phase !== "player" || state.busy) return;
    var hand = state.hands[state.active];
    judgeDecision("hit");
    state.busy = true;
    updateControls();          // lock the table the instant the action starts
    hand.cards.push(draw());
    renderPlayer();
    Sound.card();
    await delay(360);
    var v = handValue(hand.cards);
    if (v.total > 21) {
      hand.done = true;
      Sound.bust();
      state.busy = false;
      await advanceHand();
    } else if (v.total === 21) {
      hand.done = true;
      state.busy = false;
      await advanceHand();
    } else {
      state.busy = false;
      updateControls();
    }
  }

  async function stand() {
    if (state.phase !== "player" || state.busy) return;
    judgeDecision("stand");
    state.hands[state.active].done = true;
    await advanceHand();
  }

  async function doubleDown() {
    if (state.phase !== "player" || state.busy) return;
    var hand = state.hands[state.active];
    if (!Rules.canDouble(hand, state.settings, handValue) || !canFundStake(hand.bet) || hand.bet * 2 > Engine.MAX_WAGER) return;
    judgeDecision("double");
    state.busy = true;
    updateControls();          // lock the table the instant the action starts
    state.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.wagerMotion = "double";
    renderBankroll();
    Sound.chip();
    hand.cards.push(draw());
    renderPlayer();
    Sound.card();
    await delay(360);
    if (handValue(hand.cards).total > 21) Sound.bust();
    hand.done = true;
    state.busy = false;
    await advanceHand();
  }

  async function split() {
    if (state.phase !== "player" || state.busy) return;
    var hand = state.hands[state.active];
    if (hand.cards.length !== 2) return;
    if (cardValue(hand.cards[0].rank) !== cardValue(hand.cards[1].rank)) return;
    if (!canFundStake(hand.bet) || state.hands.length >= state.settings.maxHands) return;
    judgeDecision("split");

    state.busy = true;
    updateControls();          // lock the table the instant the action starts
    state.bankroll -= hand.bet;
    renderBankroll();
    Sound.chip();

    var moved = hand.cards.pop();
    hand.fromSplit = true;
    hand.wagerMotion = "split-left";
    var newHand = {
      cards: [moved], bet: hand.bet, done: false, doubled: false,
      splitAces: hand.cards[0].rank === "A", fromSplit: true, result: null,
      payoutAmount: 0, wagerMotion: "split-right"
    };
    if (hand.cards[0].rank === "A") hand.splitAces = true;
    state.hands.splice(state.active + 1, 0, newHand);

    // Deal one card to current hand
    hand.cards.push(draw());
    renderPlayer();
    Sound.card();
    await delay(360);

    // Split aces receive exactly one card each and auto-stand
    if (hand.splitAces) {
      hand.done = true;
      // newHand will also receive one card when it becomes active
    }
    state.busy = false;

    if (hand.splitAces) {
      await advanceHand();
    } else if (handValue(hand.cards).total === 21) {
      // A split hand that reaches 21 auto-stands and we move on.
      hand.done = true;
      await advanceHand();
    } else {
      renderPlayer();
      updateControls();
    }
  }

  async function surrender() {
    if (state.phase !== "player" || state.busy) return;
    if (!state.settings.surrender) return;
    if (state.hands.length !== 1) return;
    var hand = state.hands[0];
    if (hand.cards.length !== 2 || hand.doubled) return;
    judgeDecision("surrender");
    hand.result = "surrender";
    hand.done = true;
    var refund = Math.floor(hand.bet / 2);
    var loss = hand.bet - refund;
    hand.payoutAmount = refund;
    state.bankroll += refund;
    state.pendingPayoutVisual = refund > 0;
    state.stats.hands++;
    state.stats.losses++;
    persistAll();
    renderStats();
    state.phase = "payout";
    renderPlayer();
    setBannerKey("surrendered", "flash-lose");
    Sound.lose();
    showResult("lose", "surrenderShort", -loss);
    finishRound(-loss, refund, { sidePaymentAmount: 0 });
  }

  // Move to next hand needing action, dealing the first card to freshly-split hands.
  async function advanceHand() {
    // If current active hand was just split and needs its second card:
    var cur = state.hands[state.active];
    if (cur && cur.cards.length === 1) {
      state.busy = true;
      updateControls();        // lock while the freshly-split hand draws
      cur.cards.push(draw());
      renderPlayer();
      Sound.card();
      await delay(360);
      if (cur.splitAces || handValue(cur.cards).total === 21) cur.done = true;
      state.busy = false;
    }

    // Find next not-done hand
    var next = -1;
    for (var i = state.active + 1; i < state.hands.length; i++) {
      if (!state.hands[i].done) { next = i; break; }
    }
    // Re-scan from start in case earlier hands exist (shouldn't, but safe)
    if (next === -1) {
      for (var j = 0; j < state.hands.length; j++) {
        if (!state.hands[j].done) { next = j; break; }
      }
    }

    if (next !== -1) {
      state.active = next;
      var nh = state.hands[next];
      // freshly split hand with a single card needs a draw
      if (nh.cards.length === 1) {
        state.busy = true;
        updateControls();      // lock while the next split hand draws
        nh.cards.push(draw());
        renderPlayer();
        Sound.card();
        await delay(360);
        if (nh.splitAces || handValue(nh.cards).total === 21) {
          nh.done = true;
          state.busy = false;
          return advanceHand();
        }
        state.busy = false;
      }
      renderPlayer();
      updateControls();
      return;
    }

    // All hands done -> dealer plays
    await dealerPlay();
  }

  /* ---------------- Dealer ---------------- */
  function revealHole() {
    if (!state.settings.dealerHoleCard || state.dealer.cards.length < 2) return;
    state.dealer.hideHole = false;
    // Flip the existing hole card in place for a real 3D reveal (no rebuild).
    var holeNode = el.dealerHand.children[1];
    var inner = holeNode && holeNode.querySelector ? holeNode.querySelector(".card-inner") : null;
    if (inner) {
      holeNode.classList.add("hole-reveal-motion");
      inner.classList.remove("facedown");
      inner.classList.add("revealing");
      holeNode.setAttribute("aria-label", cardAriaLabel(state.dealer.cards[1], false));
    } else {
      // Fallback (e.g. headless tests): just re-render face-up.
      renderDealer();
    }
    // Update the dealer score to reflect the full hand.
    var v = handValue(state.dealer.cards);
    el.dealerScore.textContent = state.dealer.cards.length ? String(v.total) : "";
    el.dealerScore.className = "score-chip" +
      (v.total > 21 ? " bust" : (isBlackjack(state.dealer.cards) ? " bj" : ""));
    Sound.flip();
  }

  async function revealAndSettle() {
    state.busy = true;
    state.phase = "dealer";
    setBannerKey("dealerTurn");
    updateControls();
    refreshHandTotals();
    if (state.settings.dealerHoleCard) {
      revealHole();
      await delay(700);
    } else {
      state.dealer.cards.push(draw());
      renderDealer();
      Sound.card();
      await delay(620);
    }
    state.busy = false;
    settle();
  }

  async function dealerPlay() {
    // If every hand busted/surrendered, dealer need not draw — but still reveal.
    state.phase = "dealer";
    setBannerKey("dealerTurn");
    updateControls();
    refreshHandTotals();
    state.busy = true;
    if (state.settings.dealerHoleCard) {
      revealHole();
      await delay(820);
    } else {
      state.dealer.cards.push(draw());
      renderDealer();
      Sound.card();
      await delay(620);
    }

    var anyLive = state.hands.some(function (h) {
      return handValue(h.cards).total <= 21 && h.result !== "surrender";
    });

    if (anyLive) {
      while (true) {
        var v = handValue(state.dealer.cards);
        var mustHit = v.total < 17 || (v.total === 17 && v.soft && state.settings.hitSoft17);
        if (!mustHit) break;
        await delay(360);          // brief beat before the dealer commits to a card
        state.dealer.cards.push(draw());
        renderDealer();
        Sound.card();
        await delay(620);
      }
      if (handValue(state.dealer.cards).total > 21) Sound.bust();
    }

    state.busy = false;
    settle();
  }

  /* ---------------- Settlement ---------------- */
  function settle() {
    state.phase = "payout";
    var summaryKey = null;
    var summaryClass = "";
    var round = Engine.settleRound(state.hands, state.dealer.cards, {
      insuranceStake: state.insurance,
      evenMoney: state.evenMoney
    });
    var hadInsurance = round.insuranceStake > 0;

    state.hands.forEach(function (hand, index) {
      hand.result = round.outcomes[index];
      hand.payoutAmount = handPaymentAmount(hand);
    });
    Object.keys(round.counts).forEach(function (key) {
      state.stats[key] += round.counts[key];
    });

    state.bankroll += round.totalReturn;
    state.pendingPayoutVisual = round.totalReturn > 0;
    state.insurance = 0;
    state.evenMoney = false;
    renderDealer();
    renderPlayer();
    persistAll();
    renderStats();

    var profit = round.profit;

    // Banner + sound + dealer remark + centered result splash
    if (state.hands.length === 1) {
      var r = state.hands[0].result;
      if (r === "evenMoney") {
        summaryKey = "evenMoneyPaid";
        summaryClass = "flash-win";
        Sound.blackjack(); showResult("bj", "evenMoneyShort", profit);
      } else if (hadInsurance) {
        // Present the real net result, not just the main hand. A winning insurance
        // bet normally offsets a dealer blackjack exactly.
        if (profit > 0) {
          summaryKey = "playerWin"; summaryClass = "flash-win";
          Sound.win(); showResult("win", "youWin", profit);
        } else if (profit < 0) {
          summaryKey = "insuranceNetLoss"; summaryClass = "flash-lose";
          Sound.lose(); showResult("lose", "youLose", profit);
        } else {
          summaryKey = "insuranceSaved";
          Sound.push(); showResult("push", "pushShort");
        }
      } else {
        switch (r) {
          case "blackjack": summaryKey = "blackjackWin"; summaryClass = "flash-win"; Sound.blackjack(); showResult("bj", "bjShort", profit); break;
          case "win": summaryKey = "playerWin"; summaryClass = "flash-win"; Sound.win(); showResult("win", "youWin", profit); break;
          case "dealerBust": summaryKey = "dealerBust"; summaryClass = "flash-win"; Sound.win(); showResult("win", "youWin", profit); break;
          case "push": summaryKey = "push"; summaryClass = ""; Sound.push(); showResult("push", "pushShort"); break;
          case "bust": summaryKey = "bust"; summaryClass = "flash-lose"; showResult("lose", "bustShort", profit); break;
          case "lose": summaryKey = "dealerWin"; summaryClass = "flash-lose"; Sound.lose(); showResult("lose", "youLose", profit); break;
        }
      }
    } else {
      // Multi-hand: summarise net
      if (profit > 0) { summaryKey = "playerWin"; summaryClass = "flash-win"; Sound.win(); showResult("win", "youWin", profit); }
      else if (profit < 0) { summaryKey = "dealerWin"; summaryClass = "flash-lose"; Sound.lose(); showResult("lose", "youLose", profit); }
      else { summaryKey = "push"; summaryClass = ""; Sound.push(); showResult("push", "pushShort"); }
    }
    if (summaryKey) setBannerKey(summaryKey, summaryClass);
    finishRound(profit, round.totalReturn, { sidePaymentAmount: round.insuranceReturn });
  }

  function prepareHandSettlements() {
    var hasPayment = false;
    state.hands.forEach(function (hand, index) {
      var wager = el.playerHands.querySelector('.hand-wager[data-hand-index="' + index + '"]');
      if (!wager) return;
      var payout = wager.querySelector(".hand-payout-stack");
      if (!payout || hand.payoutAmount <= 0) return;
      renderChipPile(payout, hand.payoutAmount, "bet-stack payout-stack hand-payout-stack");
      void payout.offsetWidth;
      payout.classList.add("arriving");
      hasPayment = true;
    });
    return hasPayment;
  }

  function moveHandSettlements() {
    var moved = false;
    state.hands.forEach(function (hand, index) {
      var wager = el.playerHands.querySelector('.hand-wager[data-hand-index="' + index + '"]');
      if (!wager) return;
      var original = wager.querySelector(".hand-bet-stack");
      var payout = wager.querySelector(".hand-payout-stack");
      var returns = handReturnsWager(hand.result);
      if (original) {
        original.classList.remove("to-player", "to-dealer", "to-push");
        original.classList.add(returns ? "to-player" : "to-dealer");
        moved = true;
      }
      if (payout && hand.payoutAmount > 0) {
        payout.classList.remove("arriving");
        payout.classList.add("to-player");
        moved = true;
      }
    });
    return moved;
  }

  // Sweep all cards on the table into the discard tray.
  function collectCards() {
    var nodes = [];
    if (el.dealerHand.querySelectorAll) {
      nodes = nodes.concat([].slice.call(el.dealerHand.querySelectorAll(".card")));
      nodes = nodes.concat([].slice.call(el.playerHands.querySelectorAll(".card")));
    }
    nodes.forEach(function (c, i) {
      prepareCardForDiscard(c, i);
      c.style.animationDelay = (motionTime(i * 40) / 1000) + "s";
      c.classList.add("collecting");
    });
    if (nodes.length) {
      Sound.collect();
      setTimeout(function () {
        state.discardTrayCount = state.discarded;
        renderShoeStatus();
      }, motionTime(420 + nodes.length * 40));
    }
  }

  // Round end: hold the result, then clear the table before betting reopens.
  function finishRound(profit, totalReturn, visual) {
    visual = visual || {};
    state.phase = "payout";
    updateControls(); // betting stays locked until the table is clear

    // Let the result register before the dealer physically settles the wager.
    setTimeout(function () {
      state.phase = "clearing";
      updateControls();
      setBannerKey("settlingWager");

      var sidePaymentAmount = Math.max(0, Math.floor(visual.sidePaymentAmount || 0));
      var hasHandPayment = prepareHandSettlements();
      if (sidePaymentAmount > 0) {
        renderPayoutStack(sidePaymentAmount);
        void el.payoutStack.offsetWidth;
        el.payoutStack.classList.add("arriving");
      }
      if (hasHandPayment || sidePaymentAmount > 0) Sound.payout();

      setTimeout(function () {
        // The balance changes only when the chips actually leave the table.
        state.pendingPayoutVisual = false;
        renderBankroll();
        if (totalReturn > 0) flashBalance();

        if (moveHandSettlements()) Sound.chipsPush();
        if (sidePaymentAmount > 0) {
          el.payoutStack.classList.remove("arriving");
          el.payoutStack.classList.add("to-player");
        }

        setTimeout(function () {
          collectCards();
          hideResult();
          setBannerKey("clearing");
        }, motionTime(120));

        // Clear the settled layout only after cards have reached the discard tray.
        setTimeout(function () {
          el.dealerHand.innerHTML = "";
          el.playerHands.innerHTML = "";
          el.playerHands.className = "hands-row hand-count-0";
          el.dealerScore.textContent = ""; el.dealerScore.className = "score-chip";
          el.playerScore.textContent = ""; el.playerScore.className = "score-chip";
          hideResult(true);
          state.dealer = { cards: [], hideHole: true };
          state.hands = [];
          state.phase = "betting";
          state.bet = 0;
          state.insurance = 0;
          state.insuranceMode = null;
          state.evenMoney = false;
          el.insuranceOverlay.hidden = true;
          renderPayoutStack(0);
          renderBet();

          if (state.bankroll < MIN_BET) {
            state.bankroll = START_BANKROLL;
            renderBankroll(true);
            persistAll();
            setRestakeBanner(START_BANKROLL);
            moneyToast(START_BANKROLL, "win");
          } else {
            setBannerKey("placeBetPrompt");
          }
          if (releaseRoundAccount) releaseRoundAccount();
          updateControls();
        }, motionTime(1250));
      }, motionTime(hasHandPayment || sidePaymentAmount > 0 ? 730 : 90));
    }, reducedMotion ? 520 : motionTime(1300));
  }

  /* ---------------- Settings & persistence ---------------- */
  function persistBankroll() {
    saveAccount(KEYS.bankroll, state.bankroll);
  }

  function persistStats() {
    saveAccount(KEYS.stats, state.stats);
  }

  function persistSettings() {
    save(KEYS.settings, state.settings);
  }

  function persistAll() {
    persistBankroll();
    persistStats();
    persistSettings();
  }

  function applySettingsUI() {
    $("setHitSoft17").checked = !!state.settings.hitSoft17;
    applySoundUI();
    document.querySelectorAll("[data-set-decks]").forEach(function (b) {
      var active = parseInt(b.getAttribute("data-set-decks"), 10) === state.settings.decks;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-set-lang") === I18n.get());
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === I18n.get()));
    });
    applyTheme();
    applyAnimationSpeed();
    applyCoachUI();
    renderRuleProfileUI();
    renderTableRules();
    updateRuleAvailability();
  }

  function applyTheme() {
    document.body.setAttribute("data-theme", state.settings.theme);
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", THEME_META_COLORS[state.settings.theme]);
    document.querySelectorAll("[data-set-theme]").forEach(function (button) {
      var active = button.getAttribute("data-set-theme") === state.settings.theme;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function applyAnimationSpeed() {
    document.body.setAttribute("data-animation-speed", state.settings.animationSpeed);
    document.querySelectorAll("[data-set-animation]").forEach(function (button) {
      var active = button.getAttribute("data-set-animation") === state.settings.animationSpeed;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function applyCoachUI() {
    document.querySelectorAll("[data-set-coach]").forEach(function (button) {
      var active = button.getAttribute("data-set-coach") === state.settings.coach;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function applySoundUI() {
    var soundEnabled = Sound.isEnabled();
    $("setSound").checked = soundEnabled;
    $("soundMixer").classList.toggle("muted", !soundEnabled);
    var soundButton = $("soundToggle");
    if (soundButton) {
      var soundKey = soundEnabled ? "muteSound" : "unmuteSound";
      soundButton.setAttribute("aria-pressed", String(soundEnabled));
      soundButton.setAttribute("aria-label", t(soundKey));
      soundButton.setAttribute("title", t(soundKey));
      soundButton.setAttribute("data-i18n-aria-label", soundKey);
      soundButton.setAttribute("data-i18n-title", soundKey);
    }
    var levels = Sound.getVolumes();
    document.querySelectorAll("[data-sound-level]").forEach(function (input) {
      var channel = input.getAttribute("data-sound-level");
      var percent = Math.round((levels[channel] == null ? 1 : levels[channel]) * 100);
      input.value = percent;
      input.style.setProperty("--fill", percent + "%");
      input.setAttribute("aria-valuetext", percent + "%");
      var output = $(input.id + "Value");
      if (output) output.textContent = percent + "%";
    });
  }

  function renderTableRules() {
    var dealerRule = $("feltDealerRule");
    if (dealerRule) bindText(dealerRule, state.settings.hitSoft17 ? "dealerRuleHitSoft17" : "dealerRuleStand17");
    renderTableSpecs();
  }

  function updateRuleAvailability() {
    var canChange = state.phase === "betting" && !state.busy;
    var soft17 = $("setHitSoft17");
    if (soft17) soft17.disabled = !canChange;
    document.querySelectorAll("[data-set-decks]").forEach(function (button) {
      button.disabled = !canChange;
      button.setAttribute("aria-disabled", String(!canChange));
    });
    document.querySelectorAll("[data-rule-profile]").forEach(function (button) {
      button.disabled = !canChange;
      button.setAttribute("aria-disabled", String(!canChange));
    });
    var hint = $("rulesHint");
    if (hint) bindText(hint, canChange ? "rulesChangeHint" : "rulesLockedHint");
  }

  /* ---------------- Language UI ---------------- */
  function syncLangButtons() {
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      var active = b.getAttribute("data-lang") === I18n.get();
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }

  /* ---------------- Dialog focus management ---------------- */
  var settingsReturnFocus = null;

  function focusableElements(container) {
    return [].slice.call(container.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (node) { return !node.hidden && node.tabIndex >= 0; });
  }

  function trapFocus(container, event) {
    var focusable = focusableElements(container);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openSettings(modal) {
    settingsReturnFocus = document.activeElement;
    applySettingsUI();
    renderStats();
    modal.hidden = false;
    var focusable = focusableElements(modal);
    if (focusable.length) focusable[0].focus();
  }

  function closeSettings(modal) {
    if (modal.hidden) return;
    modal.hidden = true;
    if (settingsReturnFocus && typeof settingsReturnFocus.focus === "function") settingsReturnFocus.focus();
    settingsReturnFocus = null;
  }

  /* ---------------- Wire up ---------------- */
  function init() {
    // Apply the persisted visual theme before the table is rendered.
    document.body.setAttribute("data-theme", state.settings.theme);
    document.body.setAttribute("data-animation-speed", state.settings.animationSpeed);
    // Apply saved language to DOM
    I18n.apply(document);
    syncLangButtons();
    decorateTrayChips();

    // Sound preference
    var soundOn = load(KEYS.sound, true);
    if (typeof soundOn !== "boolean") soundOn = true;
    Sound.setVolumes(load(KEYS.audio, null));
    Sound.setEnabled(soundOn);
    var st = $("soundToggle");
    st.setAttribute("aria-pressed", String(soundOn));

    renderBankroll(true);
    renderBet();
    renderStats();
    renderShoeStatus();
    applySettingsUI();
    updateControls();
    persistSettings();
    withAccount(function () { persistBankroll(); persistStats(); renderBankroll(true); renderStats(); });
    if (!sharedAccount) toastKey("temporaryAccount", "");
    window.addEventListener("storage", function (event) {
      if (event.key === KEYS.bankroll || event.key === KEYS.stats || event.key === null) syncIdleAccount();
    });
    window.addEventListener("focus", syncIdleAccount);
    window.addEventListener("pageshow", syncIdleAccount);

    // Unlock audio on first user gesture
    var unlock = function () { Sound.unlock(); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock);

    // Chips
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var raw = chip.getAttribute("data-value");
        addChip(raw === "allin" ? "allin" : parseInt(raw, 10));
      });
    });

    // Buttons
    el.btn.clear.addEventListener("click", clearBet);
    el.btn.rebet.addEventListener("click", rebet);
    el.btn.deal.addEventListener("click", deal);
    el.btn.hit.addEventListener("click", hit);
    el.btn.stand.addEventListener("click", stand);
    el.btn.double.addEventListener("click", doubleDown);
    el.btn.split.addEventListener("click", split);
    el.btn.surrender.addEventListener("click", surrender);
    el.btn.insYes.addEventListener("click", function () { takeInsurance(true); });
    el.btn.insNo.addEventListener("click", function () { takeInsurance(false); });

    // Language switch (topbar)
    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        I18n.setLanguage(b.getAttribute("data-lang"));
      });
    });
    I18n.onChange(function () {
      syncLangButtons();
      applySettingsUI();
      // re-render dynamic text that isn't data-i18n bound
      if (!state.pendingPayoutVisual) renderBankroll(true);
      else el.bankroll.textContent = fmt(bankrollShown);
      el.currentBet.textContent = fmt(state.bet);
      translateHands();
      renderToast();
      renderResultAmount();
      renderStats();
      renderShoeStatus();
      var dealerKey = el.dealerLine && el.dealerLine.getAttribute("data-i18n-pick");
      if (dealerKey) el.dealerLine.textContent = I18n.pick(dealerKey);
      var bannerPick = el.bannerText.getAttribute("data-i18n-pick");
      if (bannerPick === "restake") {
        var restakeAmount = parseInt(el.bannerText.getAttribute("data-i18n-amount"), 10);
        el.bannerText.textContent = I18n.pick("restake", { amount: fmt(restakeAmount) });
      }
    });

    // Sound toggle
    st.addEventListener("click", function () {
      var on = !Sound.isEnabled();
      Sound.setEnabled(on);
      save(KEYS.sound, on);
      st.setAttribute("aria-pressed", String(on));
      applySoundUI();
      if (on) Sound.chip();
    });

    // Settings modal
    var modal = $("settingsModal");
    $("settingsBtn").addEventListener("click", function () {
      openSettings(modal);
    });
    modal.querySelectorAll("[data-close]").forEach(function (c) {
      c.addEventListener("click", function () { closeSettings(modal); });
    });
    var ruleProfileButtons = [].slice.call(document.querySelectorAll("[data-rule-profile]"));
    ruleProfileButtons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        chooseRuleProfile(button.getAttribute("data-rule-profile"));
      });
      button.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % ruleProfileButtons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + ruleProfileButtons.length) % ruleProfileButtons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = ruleProfileButtons.length - 1;
        else return;
        event.preventDefault();
        ruleProfileButtons[next].click();
        ruleProfileButtons[next].focus();
      });
    });
    $("setHitSoft17").addEventListener("change", function (e) {
      if (state.phase !== "betting" || state.busy) { applySettingsUI(); return; }
      state.settings.hitSoft17 = e.target.checked;
      state.settings.ruleProfile = Rules.detectProfile(state.settings);
      persistSettings();
      applySettingsUI();
    });
    $("setSound").addEventListener("change", function (e) {
      Sound.setEnabled(e.target.checked);
      save(KEYS.sound, e.target.checked);
      st.setAttribute("aria-pressed", String(e.target.checked));
      applySoundUI();
      if (e.target.checked) Sound.push();
    });
    document.querySelectorAll("[data-sound-level]").forEach(function (input) {
      input.addEventListener("input", function () {
        var channel = input.getAttribute("data-sound-level");
        Sound.setVolume(channel, Number(input.value) / 100);
        save(KEYS.audio, Sound.getVolumes());
        applySoundUI();
      });
      input.addEventListener("change", function () {
        if (!Sound.isEnabled()) return;
        var channel = input.getAttribute("data-sound-level");
        if (channel === "cards") Sound.card();
        else if (channel === "chips") Sound.chipStack(2);
        else Sound.push();
      });
    });
    document.querySelectorAll("[data-set-decks]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.phase !== "betting" || state.busy) return;
        state.settings.decks = parseInt(b.getAttribute("data-set-decks"), 10);
        state.settings.ruleProfile = Rules.detectProfile(state.settings);
        state.shoe = []; // force reshuffle with new deck count next round
        state.discarded = 0;
        state.discardTrayCount = 0;
        persistSettings();
        applySettingsUI();
        renderShoeStatus();
      });
    });
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.addEventListener("click", function () {
        I18n.setLanguage(b.getAttribute("data-set-lang"));
      });
    });
    var themeButtons = [].slice.call(document.querySelectorAll("[data-set-theme]"));
    themeButtons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        var theme = button.getAttribute("data-set-theme");
        if (ALLOWED_THEMES.indexOf(theme) === -1) return;
        state.settings.theme = theme;
        persistSettings();
        applyTheme();
      });
      button.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % themeButtons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + themeButtons.length) % themeButtons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = themeButtons.length - 1;
        else return;
        event.preventDefault();
        themeButtons[next].click();
        themeButtons[next].focus();
      });
    });
    var animationButtons = [].slice.call(document.querySelectorAll("[data-set-animation]"));
    animationButtons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        var speed = button.getAttribute("data-set-animation");
        if (ALLOWED_ANIMATION_SPEEDS.indexOf(speed) === -1) return;
        state.settings.animationSpeed = speed;
        persistSettings();
        applyAnimationSpeed();
      });
      button.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % animationButtons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + animationButtons.length) % animationButtons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = animationButtons.length - 1;
        else return;
        event.preventDefault();
        animationButtons[next].click();
        animationButtons[next].focus();
      });
    });
    var coachButtons = [].slice.call(document.querySelectorAll("[data-set-coach]"));
    coachButtons.forEach(function (button, index) {
      button.addEventListener("click", function () {
        var mode = button.getAttribute("data-set-coach");
        if (ALLOWED_COACH_MODES.indexOf(mode) === -1) return;
        state.settings.coach = mode;
        persistSettings();
        applyCoachUI();
        updateControls();
      });
      button.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % coachButtons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + coachButtons.length) % coachButtons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = coachButtons.length - 1;
        else return;
        event.preventDefault();
        coachButtons[next].click();
        coachButtons[next].focus();
      });
    });
    // Deposit: load any amount onto the balance (replaces the old hard reset).
    var depositInput = $("depositAmount");
    async function commitDeposit() {
      if (await deposit(depositInput.value)) depositInput.value = "";
      depositInput.focus();
    }
    $("btnDeposit").addEventListener("click", commitDeposit);
    depositInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commitDeposit(); }
    });
    document.querySelectorAll("[data-deposit]").forEach(function (b) {
      b.addEventListener("click", function () {
        deposit(parseInt(b.getAttribute("data-deposit"), 10));
      });
    });
    $("btnResetStats").addEventListener("click", function () {
      withAccount(function () {
        state.stats = Object.assign({}, DEFAULT_STATS);
        persistStats(); renderStats();
      });
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
      if (modal.hidden === false) {
        if (e.key === "Escape") closeSettings(modal);
        else if (e.key === "Tab") trapFocus(modal, e);
        return;
      }
      if (state.phase === "insurance") {
        if (e.key === "Escape") { e.preventDefault(); takeInsurance(false); }
        else if (e.key === "Tab") trapFocus(el.insuranceOverlay, e);
        else {
          var insuranceKey = e.key.toLowerCase();
          if (insuranceKey === "y") takeInsurance(true);
          else if (insuranceKey === "n") takeInsurance(false);
        }
        return;
      }
      var target = e.target;
      if (target && target.closest && target.closest('button, input, select, textarea, a[href], [contenteditable="true"], [role="button"]')) return;
      var k = e.key.toLowerCase();
      if (state.phase === "betting") {
        if (k === "enter" || k === "d") { if (!el.btn.deal.disabled) deal(); }
        else if (k === "r") { if (!el.btn.rebet.disabled) rebet(); }
        else if (k === "c") { if (!el.btn.clear.disabled) clearBet(); }
      } else if (state.phase === "player") {
        if (k === "h") { if (!el.btn.hit.disabled) hit(); }
        else if (k === "s") { if (!el.btn.stand.disabled) stand(); }
        else if (k === "d") { if (!el.btn.double.disabled) doubleDown(); }
        else if (k === "p") { if (!el.btn.split.disabled) split(); }
        else if (k === "x") { if (!el.btn.surrender.disabled) surrender(); }
      }
    });

    setBannerKey("placeBetPrompt");
    setTimeout(function () { dealerSay("sayWelcome"); }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
