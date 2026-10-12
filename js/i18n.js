/* =========================================================
   i18n — English (default) + Turkish, persisted in browser
   ========================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "vbj.lang";
  var DEFAULT_LANG = "en";

  var DICT = {
    en: {
      appTitle: "Table 21: Offline Blackjack",
      appDescription: "A polished blackjack game that works completely offline.",
      brandName: "Table 21",
      subtitle: "Offline Blackjack",
      balance: "Balance",
      dealer: "Dealer",
      player: "You",
      betLabel: "BET",
      blackjackTable: "Blackjack table",
      controlsLabel: "Game controls",
      chipsLabel: "Betting chips",
      languageSelector: "Language selection",
      dealerHand: "Dealer hand",
      playerHands: "Player hands",
      close: "Close",
      amount: "Amount",
      quickAdd: "Quick add",
      allIn: "All in",

      deal: "Deal",
      hit: "Hit",
      stand: "Stand",
      double: "Double",
      split: "Split",
      surrender: "Surrender",
      clearBet: "Clear",
      rebet: "Rebet",
      takeInsurance: "Insure",
      declineOffer: "No, thanks",
      dealerName: "DEALER",
      dealerTag: "TABLE 21",

      settings: "Settings",
      language: "Language",
      tableTheme: "Table & card back",
      themeEmerald: "Emerald",
      themeMidnight: "Midnight",
      themeBordeaux: "Bordeaux",
      animationSpeed: "Animation speed",
      speedFast: "Fast",
      speedNormal: "Normal",
      speedCinematic: "Cinematic",
      ruleProfiles: "Table rules",
      profileLasVegas: "Las Vegas",
      profileAtlanticCity: "Atlantic City",
      profileEuropean: "European",
      profileCustom: "Custom",
      profileLasVegasSummary: "6 decks · H17 · Double any two · Double after split · No surrender",
      profileAtlanticCitySummary: "8 decks · S17 · Double any two · Double after split · Late surrender",
      profileEuropeanSummary: "6 decks · S17 · No hole card · Hard 9-11 only · One split",
      activeRules: "Active rules",
      ruleSummary: "{decks} · {dealer} · {hole} · {double} · {surrender} · {splits}",
      ruleHoleCard: "Hole card and peek",
      ruleNoHoleCard: "No hole card",
      ruleDoubleAny: "Double on any first two cards",
      ruleDoubleHard: "Double only on hard 9, 10, or 11",
      ruleSurrender: "Late surrender",
      ruleNoSurrender: "No surrender",
      ruleSplitLimit: "Up to {count} hands",
      profileApplied: "{profile} rules applied",
      dealerHitsSoft17: "Dealer hits on soft 17",
      deckCount: "Number of decks",
      soundLabel: "Sound",
      muteSound: "Mute sound",
      unmuteSound: "Turn sound on",
      soundMixer: "Sound levels",
      masterVolume: "Master",
      cardVolume: "Cards",
      chipVolume: "Chips",
      tableVolume: "Table effects",
      stats: "Statistics",
      handsPlayed: "Hands played",
      wins: "Wins",
      losses: "Losses",
      pushes: "Pushes",
      blackjacks: "Blackjacks",
      winRate: "Win rate",
      strategyAccuracy: "Strategy accuracy",
      coach: "Strategy coach",
      coachOff: "Off",
      coachFeedback: "Feedback",
      coachHints: "Hints",
      coachHint: "Basic strategy for the active table rules. Feedback flags a different play; Hints also mark the best one.",
      coachMiss: "Basic strategy: {play} on {situation}",
      coachHard: "hard {total} vs {up}",
      coachSoft: "soft {total} vs {up}",
      coachPair: "{rank},{rank} vs {up}",
      coachInsurance: "Basic strategy declines insurance and even money.",
      addFunds: "Add funds",
      deposit: "Deposit",
      deposited: "Added {amount} to your balance",
      invalidDeposit: "Enter a positive whole-number amount",
      accountBusy: "Another tab is using this balance. Finish its hand first.",
      temporaryAccount: "Shared storage protection is unavailable. This tab uses a separate session balance.",
      wagerLimit: "Maximum safe wager at this balance: {amount}",
      roundingHint: "Amounts use whole dollars. Fractional payouts are rounded down.",
      resetStats: "Reset stats",
      disclaimerTitle: "Disclaimer",
      disclaimerPlayMoney: "Table 21 is for entertainment only. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and no real-money gambling is offered.",
      disclaimerOdds: "Results here do not predict play at a real table. If gambling is causing problems for you or someone close to you, please seek help.",
      disclaimerWarranty: "Not affiliated with any casino. Provided as is, without warranty of any kind.",
      versionLabel: "Version",
      licenseNotice: "Free software under the GNU AGPL v3",
      sourceCode: "Source code",
      rulesChangeHint: "Profiles represent common table rules. Changes apply between rounds.",
      rulesLockedHint: "Table rules are locked until this round ends.",
      tableInformation: "Table information",
      tableLimitsLabel: "MIN BET",
      tableProfileLabel: "GAME",
      tableShoeLabel: "SHOE",
      tableDealerLabel: "DEALER",
      profileShortLasVegas: "VEGAS",
      profileShortAtlanticCity: "ATL CITY",
      profileShortEuropean: "EUROPE",
      profileShortCustom: "CUSTOM",
      deckValue: "{count} DECK",
      decksValue: "{count} DECKS",
      dealerRuleS17Short: "S17",
      dealerRuleH17Short: "H17",
      shoeCards: "{count} cards in the shoe",
      emptyDiscardTray: "Empty discard tray",
      discardTrayCards: "Discard tray with {count} cards",
      handWagerLabel: "Hand {hand} wager: ${amount}",

      // felt rules / accessible card names
      insuranceRule: "INSURANCE PAYS 2 TO 1",
      blackjackRule: "BLACKJACK PAYS 3 TO 2",
      dealerRuleStand17: "DEALER MUST STAND ON ALL 17S",
      dealerRuleHitSoft17: "DEALER HITS SOFT 17",
      faceDownCard: "Face-down card",
      cardLabel: "{rank} of {suit}",
      rankAce: "Ace",
      rankTwo: "Two",
      rankThree: "Three",
      rankFour: "Four",
      rankFive: "Five",
      rankSix: "Six",
      rankSeven: "Seven",
      rankEight: "Eight",
      rankNine: "Nine",
      rankTen: "Ten",
      rankJack: "Jack",
      rankQueen: "Queen",
      rankKing: "King",
      suitSpades: "spades",
      suitHearts: "hearts",
      suitDiamonds: "diamonds",
      suitClubs: "clubs",

      // banners / messages
      placeBetPrompt: "Place your wager",
      yourTurn: "Your decision",
      dealerTurn: "Dealer drawing…",
      clearing: "Cards to discard…",
      shuffling: "Shuffling cards…",
      settlingWager: "Settling wager…",
      insufficientFunds: "You don't have enough balance for that bet",
      minBet: "Place a bet first",
      insuranceTitle: "Take insurance?",
      insuranceLabel: "INSURANCE",
      insuranceDesc: "The dealer shows an Ace. Insurance pays 2 to 1.",
      insuranceLost: "Insurance lost: -${amount}",
      insuranceLostCoach: "Insurance lost: -${amount}. Basic strategy declines it.",
      roundRestored: "Your unfinished hand is back on the table.",
      roundVoided: "An unfinished hand could not be restored. Its stake was returned.",
      insuranceSaved: "Insurance covered the loss. You broke even.",
      insuranceNetLoss: "Insurance settled. Net loss",
      evenMoneyTitle: "Take even money?",
      evenMoneyLabel: "BLACKJACK",
      evenMoneyDesc: "Lock in a guaranteed 1 to 1 payout on your blackjack.",
      takeEvenMoney: "Take 1 to 1",

      // results
      blackjackWin: "Blackjack! Paid 3 to 2",
      playerWin: "Player wins",
      dealerWin: "Dealer wins",
      push: "Push. Your bet was returned.",
      bust: "Player busts",
      dealerBust: "Dealer busts. Player wins.",
      surrendered: "Surrendered. Half your bet was returned.",
      evenMoneyPaid: "Even money paid 1 to 1",
      youWin: "WIN",
      youLose: "LOSE",
      pushShort: "PUSH",
      bjShort: "BLACKJACK",
      evenMoneyShort: "EVEN MONEY",
      bustShort: "BUST",
      surrenderShort: "SURRENDER",
      handLabel: "Hand",

      // Rotating, sincere re-stake lines when a player busts out.
      restake: [
        "Balance restored to ${amount}.",
        "Table balance set to ${amount}."
      ],

      // Short remarks from the dealer — give the table a pulse.
      sayWelcome: ["Place your wager."],
      sayDeal: ["Cards in play."]
    },

    tr: {
      appTitle: "Table 21: Çevrimdışı Blackjack",
      appDescription: "Tamamen çevrimdışı çalışan, özenli bir blackjack oyunu.",
      brandName: "Table 21",
      subtitle: "Çevrimdışı Blackjack",
      balance: "Bakiye",
      dealer: "Krupiye",
      player: "Siz",
      betLabel: "BAHİS",
      blackjackTable: "Blackjack masası",
      controlsLabel: "Oyun kontrolleri",
      chipsLabel: "Bahis jetonları",
      languageSelector: "Dil seçimi",
      dealerHand: "Krupiyenin eli",
      playerHands: "Elleriniz",
      close: "Kapat",
      amount: "Tutar",
      quickAdd: "Hızlı bakiye ekle",
      allIn: "Tüm bakiyeyi yatır",

      deal: "Dağıt",
      hit: "Kart çek",
      stand: "Dur",
      double: "İkiye katla",
      split: "Böl",
      surrender: "Teslim ol",
      clearBet: "Bahsi kaldır",
      rebet: "Aynı bahis",
      takeInsurance: "Sigorta al",
      declineOffer: "Hayır, teşekkürler",
      dealerName: "KRUPİYE",
      dealerTag: "MASA 21",

      settings: "Ayarlar",
      language: "Dil",
      tableTheme: "Masa ve kart arkası",
      themeEmerald: "Zümrüt",
      themeMidnight: "Gece mavisi",
      themeBordeaux: "Bordo",
      animationSpeed: "Animasyon hızı",
      speedFast: "Hızlı",
      speedNormal: "Normal",
      speedCinematic: "Sinematik",
      ruleProfiles: "Masa kuralları",
      profileLasVegas: "Las Vegas",
      profileAtlanticCity: "Atlantic City",
      profileEuropean: "Avrupa",
      profileCustom: "Özel",
      profileLasVegasSummary: "6 deste · H17 · İlk iki kartta ikiye katlama · Bölme sonrası ikiye katlama · Teslim yok",
      profileAtlanticCitySummary: "8 deste · S17 · İlk iki kartta ikiye katlama · Bölme sonrası ikiye katlama · Geç teslim",
      profileEuropeanSummary: "6 deste · S17 · Kapalı kart yok · Yalnız sert 9, 10 veya 11'de ikiye katlama · Tek bölme",
      activeRules: "Geçerli kurallar",
      ruleSummary: "{decks} · {dealer} · {hole} · {double} · {surrender} · {splits}",
      ruleHoleCard: "Kapalı kart ve blackjack kontrolü",
      ruleNoHoleCard: "Kapalı kart yok",
      ruleDoubleAny: "İlk iki kartta ikiye katlama",
      ruleDoubleHard: "Yalnız sert 9, 10 veya 11'de ikiye katlama",
      ruleSurrender: "Geç teslim",
      ruleNoSurrender: "Teslim yok",
      ruleSplitLimit: "En fazla {count} el",
      profileApplied: "{profile} kuralları uygulandı",
      dealerHitsSoft17: "Krupiye yumuşak 17'de kart çeker",
      deckCount: "Deste sayısı",
      soundLabel: "Ses",
      muteSound: "Sesi kapat",
      unmuteSound: "Sesi aç",
      soundMixer: "Ses düzeyleri",
      masterVolume: "Ana ses",
      cardVolume: "Kartlar",
      chipVolume: "Jetonlar",
      tableVolume: "Masa sesleri",
      stats: "İstatistikler",
      handsPlayed: "Oynanan eller",
      wins: "Kazanılan eller",
      losses: "Kaybedilen eller",
      pushes: "Beraberlikler",
      blackjacks: "Blackjack sayısı",
      winRate: "Kazanma oranı",
      strategyAccuracy: "Strateji doğruluğu",
      coach: "Strateji koçu",
      coachOff: "Kapalı",
      coachFeedback: "Uyarı",
      coachHints: "İpucu",
      coachHint: "Etkin masa kurallarına göre temel strateji. Uyarı farklı bir hamleyi bildirir; İpucu ayrıca en iyi hamleyi işaretler.",
      coachMiss: "Temel strateji: {situation} → {play}",
      coachHard: "sert {total}, krupiye {up}",
      coachSoft: "yumuşak {total}, krupiye {up}",
      coachPair: "{rank},{rank} çifti, krupiye {up}",
      coachInsurance: "Temel strateji sigortayı da garantili ödemeyi de reddeder.",
      addFunds: "Bakiye ekle",
      deposit: "Ekle",
      deposited: "Bakiyenize {amount} eklendi",
      invalidDeposit: "Pozitif bir tam sayı tutarı girin",
      accountBusy: "Bu bakiye başka bir sekmede kullanılıyor. Önce oradaki eli bitirin.",
      temporaryAccount: "Ortak kayıt koruması kullanılamıyor. Bu sekme ayrı bir oturum bakiyesi kullanıyor.",
      wagerLimit: "Bu bakiyeyle güvenli en yüksek bahis: {amount}",
      roundingHint: "Tutarlar tam dolar olarak hesaplanır. Kesirli ödemeler aşağı yuvarlanır.",
      resetStats: "İstatistikleri sıfırla",
      disclaimerTitle: "Sorumluluk reddi",
      disclaimerPlayMoney: "Table 21 yalnızca eğlence amaçlıdır. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez. Gerçek parayla kumar sunulmaz.",
      disclaimerOdds: "Buradaki sonuçlar gerçek bir masada ne olacağını göstermez. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın.",
      disclaimerWarranty: "Hiçbir kumarhaneyle bağlantısı yoktur. Olduğu gibi, hiçbir garanti verilmeden sunulur.",
      versionLabel: "Sürüm",
      licenseNotice: "GNU AGPL v3 lisanslı özgür yazılım",
      sourceCode: "Kaynak kodu",
      rulesChangeHint: "Profiller yaygın masa kurallarını temsil eder. Değişiklikler eller arasında uygulanır.",
      rulesLockedHint: "Bu el bitene kadar masa kuralları değiştirilemez.",
      tableInformation: "Masa bilgileri",
      tableLimitsLabel: "MİN. BAHİS",
      tableProfileLabel: "OYUN",
      tableShoeLabel: "PABUÇ",
      tableDealerLabel: "KRUPİYE",
      profileShortLasVegas: "VEGAS",
      profileShortAtlanticCity: "ATL CITY",
      profileShortEuropean: "AVRUPA",
      profileShortCustom: "ÖZEL",
      deckValue: "{count} DESTE",
      decksValue: "{count} DESTE",
      dealerRuleS17Short: "S17",
      dealerRuleH17Short: "H17",
      shoeCards: "Pabuçta {count} kart var",
      emptyDiscardTray: "Iskarta tepsisi boş",
      discardTrayCards: "Iskarta tepsisinde {count} kart var",
      handWagerLabel: "{hand}. el bahsi: ${amount}",

      insuranceRule: "SİGORTA 1'E 2 ÖDER",
      blackjackRule: "BLACKJACK 2'YE 3 ÖDER",
      dealerRuleStand17: "KRUPİYE HER 17'DE DURUR",
      dealerRuleHitSoft17: "KRUPİYE YUMUŞAK 17'DE KART ÇEKER",
      faceDownCard: "Kapalı kart",
      cardLabel: "{suit} {rank}",
      rankAce: "Ası",
      rankTwo: "İkilisi",
      rankThree: "Üçlüsü",
      rankFour: "Dörtlüsü",
      rankFive: "Beşlisi",
      rankSix: "Altılısı",
      rankSeven: "Yedilisi",
      rankEight: "Sekizlisi",
      rankNine: "Dokuzlusu",
      rankTen: "Onlusu",
      rankJack: "Valesi",
      rankQueen: "Kızı",
      rankKing: "Papazı",
      suitSpades: "Maça",
      suitHearts: "Kupa",
      suitDiamonds: "Karo",
      suitClubs: "Sinek",

      placeBetPrompt: "Bahsinizi yapın",
      yourTurn: "Karar sizde",
      dealerTurn: "Krupiye kart çekiyor…",
      clearing: "Kartlar ıskartaya alınıyor…",
      shuffling: "Kartlar karılıyor…",
      settlingWager: "El sonuçlandırılıyor…",
      insufficientFunds: "Bu bahsi karşılayacak bakiyeniz yok",
      minBet: "Önce bir bahis yapın",
      insuranceTitle: "Sigorta ister misiniz?",
      insuranceLabel: "SİGORTA",
      insuranceDesc: "Krupiyenin açık kartı As. Krupiyede blackjack varsa her 1 birim sigorta bahsi 2 birim net kazanç sağlar.",
      insuranceLost: "Sigorta bahsi kaybedildi: -${amount}",
      insuranceLostCoach: "Sigorta bahsi kaybedildi: -${amount}. Temel strateji sigorta almaz.",
      roundRestored: "Yarım kalan eliniz masaya geri geldi.",
      roundVoided: "Yarım kalan el geri yüklenemedi. Bahsi iade edildi.",
      insuranceSaved: "Sigorta ana bahisteki kaybı karşıladı. Sonuç başa baş.",
      insuranceNetLoss: "Sigorta dahil net kayıp",
      evenMoneyTitle: "Garantili ödeme ister misiniz?",
      evenMoneyLabel: "BLACKJACK",
      evenMoneyDesc: "Blackjack eliniz için garantili 1'e 1 ödeme alın.",
      takeEvenMoney: "1'e 1 ödemeyi al",

      blackjackWin: "Blackjack! 2'ye 3 ödeme yapıldı",
      playerWin: "Oyuncu kazandı",
      dealerWin: "Krupiye kazandı",
      push: "Beraberlik. Bahsiniz iade edildi.",
      bust: "Oyuncu 21'i geçti",
      dealerBust: "Krupiye 21'i geçti. Oyuncu kazandı.",
      surrendered: "El teslim edildi. Bahsinizin yarısı iade edildi.",
      evenMoneyPaid: "Garantili 1'e 1 ödeme yapıldı",
      youWin: "KAZANDINIZ",
      youLose: "KAYBETTİNİZ",
      pushShort: "BERABERE",
      bjShort: "BLACKJACK",
      evenMoneyShort: "1'E 1 ÖDEME",
      bustShort: "21'İ GEÇTİNİZ",
      surrenderShort: "TESLİM OLDUNUZ",
      handLabel: "El",

      restake: [
        "Bakiye ${amount} olarak yenilendi.",
        "Masa bakiyesi ${amount} olarak ayarlandı."
      ],

      sayWelcome: ["Bahsinizi yapın."],
      sayDeal: ["Kartlar oyunda."]
    }
  };

  var current = DEFAULT_LANG;
  var listeners = [];

  function detectInitial() {
    // A previously saved choice always wins and is remembered across visits.
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved && Object.prototype.hasOwnProperty.call(DICT, saved)) return saved;
    // First-ever visit: English is the primary language.
    return DEFAULT_LANG;
  }

  function t(key, params) {
    var table = DICT[current] || DICT[DEFAULT_LANG];
    var str = table[key];
    if (str == null) str = (DICT[DEFAULT_LANG][key] != null ? DICT[DEFAULT_LANG][key] : key);
    if (params) {
      str = str.replace(/\{(\w+)\}/g, function (m, p) {
        return params[p] != null ? params[p] : m;
      });
    }
    return str;
  }

  // Pick a random line from an array-valued key (falls back to t()).
  function pick(key, params) {
    var table = DICT[current] || DICT[DEFAULT_LANG];
    var val = table[key] != null ? table[key] : DICT[DEFAULT_LANG][key];
    if (Array.isArray(val) && val.length) {
      var str = val[Math.floor(Math.random() * val.length)];
      if (params) str = str.replace(/\{(\w+)\}/g, function (m, p) { return params[p] != null ? params[p] : m; });
      return str;
    }
    return t(key, params);
  }

  function apply(root) {
    root = root || document;
    // textContent
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    // titles
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-content]").forEach(function (el) {
      el.setAttribute("content", t(el.getAttribute("data-i18n-content")));
    });
    document.documentElement.setAttribute("lang", current);
    document.title = t("appTitle");
  }

  function setLanguage(lang) {
    if (!Object.prototype.hasOwnProperty.call(DICT, lang)) lang = DEFAULT_LANG;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply(document);
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }

  function onChange(fn) { listeners.push(fn); }
  function get() { return current; }

  // Initialize current language (does not touch DOM yet).
  current = detectInitial();

  global.I18n = {
    t: t,
    pick: pick,
    apply: apply,
    setLanguage: setLanguage,
    onChange: onChange,
    get: get,
    DEFAULT: DEFAULT_LANG,
    available: Object.keys(DICT)
  };
})(window);
