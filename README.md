# Table 21 🂡

A polished, **fully static & offline** blackjack game. No build step, no runtime dependencies, no network. Open and play.

> Türkçe açıklama aşağıda. / Turkish notes below.

## Play

- **Double‑click `index.html`** to play instantly (works from `file://`, completely offline), **or**
- Serve the folder for PWA install / service‑worker offline caching:
  ```bash
  cd blackjack
  python3 -m http.server 8000
  # open http://localhost:8000
  ```

## Features

- **Three real table profiles**: Las Vegas (6 decks, H17), Atlantic City (8 decks, S17 and late surrender), and European (6 decks, S17 and no hole card). Each preset changes dealing, peek, double, surrender, and split limits as one coherent ruleset; advanced deck/H17 edits are still available as a custom table.
- **Full action set**: Hit, Stand, Double Down, Split, Surrender where permitted, Insurance, Even Money, and Rebet. Blackjack pays **3:2**.
- **Truly random cards**: a multi‑deck shoe shuffled with **Fisher–Yates using `crypto.getRandomValues`** (unbiased), reshuffled at 75% penetration or before the reserve becomes too small for a full round. Configurable 1/2/6/8 decks.
- **Three saved table themes**: Emerald, Midnight, and Bordeaux each pair their own woven felt with a matching card back. The walnut/brass rail, authentic A–10 pip layouts, distinct mirrored Jack/Queen/King artwork, dealing shoe, discard tray, and anti-aliased vector clay chips are all rendered locally with HTML/CSS/SVG.
- **Physical table flow**: cards leave the shoe, the hole card is exposed when the selected rules use one, and settled cards move into the discard tray. Every split hand owns an independent physical wager; doubled stakes visibly grow in place, losing stacks are collected separately, and each hand's winnings arrive as denomination-correct chips. The balance display changes when the chips move, not before.
- **Visible table conditions**: a quiet plaque shows the table limits, number of decks, active S17/H17 dealer rule, and selected table profile. Short landscape layouts simplify or hide it to keep the cards and controls clear; the full rules remain available in settings.
- **Living table**: restrained dealer status lines react to each hand, progressively growing high-limit chip piles remain readable at large values, and Fast, Normal, or Cinematic animation pacing is available.
- **Insurance, done right**: presented on the felt like a real table — not a checkbox.
- **Sincere, rotating moments**: bust out and the house re-stakes you with a different friendly line each time.
- **Professional local sound**: eight bundled OGG samples cover card slides, the hole-card flip, chips, payouts, and shuffling. A restrained Web Audio fallback remains available. Master, card, chip, and table-effect levels can be adjusted independently and saved locally.
- **Bundled typography**: the interface uses a locally packaged OFL-licensed WOFF2 family, with no font service or network dependency.
- **Internationalisation**: **English (primary)** and **Turkish**, including felt rules, dialogs, card names for assistive technology, and number formatting. The chosen language is **saved in the browser** (`localStorage`) and restored on every visit.
- **Persistent** bankroll, statistics (hands, wins, losses, pushes, blackjacks, win rate) and settings. Auto re‑stake when you bust out. Supporting browsers coordinate shared balances across tabs using Web Locks; without that API, each tab uses a separate session balance and displays a notice.
- **Safe updates and amounts**: PWA updates wait for an idle, unstaked table and do not force another open tab to reload. Amounts use whole dollars; fractional returns round down, as explained in settings. Wager limits reserve enough safe-integer headroom for settlement without reducing an existing valid balance.
- **Accessible & responsive**: keyboard focus is contained in dialogs, zoom remains available, reduced-motion is respected, and narrow mobile layouts show only the controls relevant to the current phase.
- **Keyboard shortcuts**: `D` deal/double · `H` hit · `S` stand · `P` split · `X` surrender · `R` rebet · `C` clear · `Y/N` insurance · `Esc` decline/close.

## Verify

The core test suite uses only Node's built-in test runner; there is nothing to install:

```bash
node --test tests
```

The suite currently executes **417 deterministic cases**. It covers exhaustive hand and payout matrices, split naturals, insurance, even money, surrender, table-profile rules, scalable chip layouts, active-sound behavior, translation parity, persistence boundaries, accessibility contracts, local asset references, DOM integrity, responsive safeguards, and the complete service-worker app shell.

Include the additional behavior regressions for **452 Node tests** (`npm test` runs the same command):

```bash
node --test tests audits/2026-09-24/behavior.test.cjs
```

The optional real-browser suite adds **141 Chromium tests**, including `file://` play, offline PWA reloads, live updates, multiple tabs, keyboard use, language changes, and all 52 cards in both languages. Puppeteer is declared as a development-only dependency in `package.json`; the game itself never loads it:

```bash
npm install
npm run test:browser
``` See the [27 September fix and verification report](audits/2026-09-27/REPORT.md) for commands, Firefox cross-checks, and coverage limits.

## Files

```
index.html        markup + layout
css/styles.css    the complete Table 21 look
js/i18n.js         translations (EN/TR) + persistence
js/sound.js        local sample playback + Web Audio fallback
js/engine.js       pure, dependency-free rules and payout engine
js/rules.js        table profiles and profile-specific action rules
js/chip-stack.js   scalable high-limit bet-pile model
js/game.js         game state, betting, rendering, and interactions
js/pwa.js          optional service-worker registration and safe updates
manifest.json     installable PWA metadata
sw.js              offline cache (only used when served over http)
icon.svg          app icon
assets/audio/      local card, chip, payout, and shuffle sounds
assets/fonts/      local WOFF2 interface font + OFL license
tools/             reproducible local audio generator
tests/             dependency-free rule and offline integrity tests
audits/            dated findings and runnable behavior/browser regressions
package.json       test scripts + dev-only Puppeteer (not needed to play)
```

---

## Türkçe

Özenli bir masa deneyimi sunan, **tamamen statik ve çevrimdışı** çalışan blackjack oyunu. Kurulum/derleme gerektirmez, internet kullanmaz.

- Oynamak için **`index.html` dosyasına çift tıklayın** (çevrimdışı, `file://` ile çalışır).
- Kartlar `crypto.getRandomValues` ile **tamamen rastgele** karılır.
- **Las Vegas, Atlantic City ve European** masa profilleri dağıtım, kapalı kart, peek, double, surrender ve split kurallarını birlikte değiştirir.
- **Hit, Stand, Double, Split, Surrender, Insurance**, garantili ödeme (even money) ve Rebet bulunur; Blackjack **3:2** öder.
- Dil ve üç masa/kart arkası temasından seçiminiz tarayıcıya kaydedilir ve her açılışta hatırlanır.
- Kartlar pabuçtan çıkar, seçili kurala göre kapalı kart fiziksel olarak açılır ve el bitince ıskarta tepsisine gider. Her split eli kendi gerçek jeton yığınına sahiptir; double olduğunda ilgili yığın büyür, ödeme ve toplama her el için ayrı yapılır.
- Masa plakası limitleri, deste sayısını, S17/H17 kuralını ve etkin masa profilini gösterir. Kısa yatay ekranlarda kartlarla çakışmaması için sadeleşir veya gizlenir; tüm kurallar ayarlardan okunabilir.
- Hızlı/Normal/Sinematik animasyon temposu ile ana ses, kart, jeton ve masa efekti düzeyleri ayrı ayrı ayarlanıp tarayıcıda saklanır.
- Kart, jeton, ödeme ve karıştırma sesleri yerel OGG dosyalarıdır. Arayüz fontu da yerel WOFF2 olarak paketlenmiştir.
- Yüksek limitli bahis yığınları miktarla beraber büyür; büyük tutarlarda kartlara taşmadan kompakt satırlara yerleşir.
- Dokulu keçe, ahşap/pirinç masa kenarı, gerçek A–10 sembol dizilimleri, farklı Vale/Kız/Papaz figürleri, dağıtım pabucu, ıskarta tepsisi ve pürüzsüz vektör jetonlar tamamen yerel HTML/CSS/SVG ile çizilir.
- Harici istek, paket veya CDN yoktur; `file://` kullanımı testlerle korunur.
- Destekleyen tarayıcılarda sekmeler ortak bakiye işlemlerini sıraya alır; bir sekmede el sürerken diğerinde bakiye değiştirilemez. Web Locks desteği yoksa ortak kaydı ezmek yerine sekmeye özel oturum bakiyesi kullanılır ve uyarı gösterilir.
- Güncellemeler devam eden eli kesmez. Tutarlar tam dolar olarak tutulur, kesirli iadeler aşağı yuvarlanır; ayarlarda bu davranış açıklanır. Güvenli hesap sınırını aşacak yeni bahisler engellenir, mevcut geçerli bakiye korunur.
- Son doğrulamada **593 test geçti**; ayrıca seçili **31 Firefox testi** başarılı oldu. Bu sonuç bütün cihazlarda sıfır hata garantisi değildir. Ayrıntılar ve tekrar çalıştırma komutları [düzeltme raporunda](audits/2026-09-27/REPORT.md).
