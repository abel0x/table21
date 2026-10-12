# Table 21 🂡

A polished, **fully static & offline** blackjack game. No build step, no runtime dependencies, no network. Open and play.

**[Play Table 21 in your browser](https://abel0x.github.io/table21/)** · Version 1.0.0 · [GNU AGPL v3](LICENSE)

> Türkçe açıklama aşağıda. / Turkish notes below.

## Play

- **Online:** open https://abel0x.github.io/table21/ and play. Install it from the browser menu (or *Add to Home Screen* on iOS) to keep a copy that works offline.
- **Double‑click `index.html`** to play instantly (works from `file://`, completely offline), **or**
- Serve the folder for PWA install / service‑worker offline caching:
  ```bash
  cd table21
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
- **Insurance, done right**: the offer takes over the controls, not a checkbox and not a pop-up over the cards, so both hands stay readable while you decide.
- **Strategy coach**: optional basic-strategy coaching for the active rules (1, 2 or 4+ decks, S17/H17, double after split, late surrender, no-hole-card European play). *Feedback* names the better play after a different one, *Hints* also marks it on the buttons, and the statistics track your strategy accuracy either way. Insurance and even money are always declined.
- **Table-true reading**: live soft hands show both counts (`7/17`, a dealer Ace shows `1/11`), the double-down card lies sideways (across the hand when three or four hands crowd the felt), and each round ends with one clear verdict badge carrying the net amount. Split hands keep compact tags with their own net result, and the rules plaque steps aside while they share the felt.
- **Sincere, rotating moments**: bust out and the house re-stakes you with a different friendly line each time.
- **Professional local sound**: eight bundled samples cover card slides, the hole-card flip, chips, payouts, and shuffling. Each ships as Ogg Vorbis and as an AAC (`.m4a`) twin for Safari versions that cannot play Ogg; the browser's `canPlayType` picks one. A restrained Web Audio fallback remains available. Master, card, chip, and table-effect levels can be adjusted independently and saved locally.
- **Bundled typography**: the interface uses a locally packaged OFL-licensed WOFF2 family, with no font service or network dependency.
- **Internationalisation**: **English (primary)** and **Turkish**, including felt rules, dialogs, card names for assistive technology, and number formatting. The chosen language is **saved in the browser** (`localStorage`) and restored on every visit.
- **Persistent** bankroll, statistics (hands, wins, losses, pushes, blackjacks, win rate) and settings. Auto re‑stake when you bust out. Supporting browsers coordinate shared balances across tabs using Web Locks; without that API, each tab uses a separate session balance and displays a notice.
- **Unfinished hands survive**: a reload, a crash or a closed tab resumes the same hand with the same cards and the stake still on the table (another tab picks it up on its next deal). Refreshing can neither refund a bad hand nor replay its cards; a snapshot that cannot be trusted voids the round and returns its stake.
- **Safe updates and amounts**: PWA updates wait for an idle, unstaked table and do not force another open tab to reload. Amounts use whole dollars; fractional returns round down, as explained in settings. Wager limits reserve enough safe-integer headroom for settlement without reducing an existing valid balance.
- **Accessible & responsive**: keyboard focus is contained in dialogs, zoom remains available, reduced-motion is respected, and narrow mobile layouts show only the controls relevant to the current phase.
- **Keyboard shortcuts**: `D` deal/double · `H` hit · `S` stand · `P` split · `X` surrender · `R` rebet · `C` clear · `Y/N` insurance · `Esc` decline/close.

## Verify

The core test suite uses only Node's built-in test runner; there is nothing to install:

```bash
node --test tests        # same as: npm test
```

The suite currently executes **550 deterministic cases**. It covers exhaustive hand and payout matrices, every basic-strategy chart cell and rule variation, split naturals, insurance, even money, surrender, table-profile rules, scalable chip layouts, active-sound behavior, translation parity, persistence boundaries, accessibility contracts, local asset references, DOM integrity, responsive safeguards, the complete service-worker app shell, the disclaimer and license notice, and earlier behavior regressions.

The optional real-browser suite adds **162 Chromium tests**, including `file://` play, hands resumed after reloads and closed tabs, split-hand layouts from 320 px phones to desktop, offline PWA reloads, live updates, multiple tabs, keyboard use, language changes, and all 52 cards in both languages. Puppeteer is declared as a development-only dependency in `package.json`; the game itself never loads it:

```bash
npm install
npm run test:browser
```

## Files

```
index.html        markup + layout
css/styles.css    the complete Table 21 look
js/i18n.js         translations (EN/TR) + persistence
js/sound.js        local sample playback + Web Audio fallback
js/engine.js       pure, dependency-free rules and payout engine
js/rules.js        table profiles and profile-specific action rules
js/chip-stack.js   scalable high-limit bet-pile model
js/strategy.js     pure basic-strategy charts for the coach
js/round.js        pure snapshot capture/validation for unfinished rounds
js/game.js         game state, betting, rendering, and interactions
js/pwa.js          optional service-worker registration and safe updates
manifest.json     installable PWA metadata
sw.js              offline cache (only used when served over http)
icon.svg          app icon (apple-touch-icon.png: iOS home-screen PNG)
assets/audio/      local card, chip, payout, and shuffle sounds (Ogg + AAC)
assets/fonts/      local WOFF2 interface font + OFL license
assets/icons/      PNG install icons (192, 512 and a maskable 512)
assets/social-preview.jpg  1200×630 link-preview image
tools/             reproducible local audio generator
tests/             dependency-free rules, strategy, behavior and offline integrity tests
tests/browser/     optional real-browser suite (Puppeteer, development only)
package.json       test scripts + dev-only Puppeteer (not needed to play)
LICENSE            GNU Affero General Public License v3
```

## Disclaimer

Table 21 is a free game made for entertainment. Chips and balances are play money with no cash value: they cannot be bought, sold or exchanged for money or prizes, and the game offers no real-money gambling. Results here do not predict play at a real table. If gambling is causing problems for you or someone close to you, please seek help.

Table 21 is not affiliated with any casino; the Las Vegas, Atlantic City and European profiles only describe common rule sets. The software is provided as is, without warranty of any kind; see sections 15 and 16 of the license.

## License

Copyright (C) 2026 abel0x

Table 21 is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

The bundled interface font is licensed separately under the SIL Open Font License 1.1 ([`assets/fonts/OFL.txt`](assets/fonts/OFL.txt)).

---

## Türkçe

Özenli bir masa deneyimi sunan, **tamamen statik ve çevrimdışı** çalışan blackjack oyunu. Kurulum/derleme gerektirmez, internet kullanmaz.

- Tarayıcıda oynamak için: **https://abel0x.github.io/table21/**. Tarayıcı menüsünden yüklerseniz çevrimdışı da çalışır.
- Bilgisayarda oynamak için **`index.html` dosyasına çift tıklayın** (çevrimdışı, `file://` ile çalışır).
- Kartlar `crypto.getRandomValues` ile **tamamen rastgele** karılır.
- **Las Vegas, Atlantic City ve European** masa profilleri dağıtım, kapalı kart, peek, double, surrender ve split kurallarını birlikte değiştirir.
- **Hit, Stand, Double, Split, Surrender, Insurance**, garantili ödeme (even money) ve Rebet bulunur; Blackjack **3:2** öder.
- Yumuşak eller karar sürerken iki değeriyle gösterilir (`7/17`, krupiyenin As'ı `1/11`). Double kartı yan yatırılır; 3-4 el masayı doldurduğunda elin üzerine çapraz konur. Split ellerin etiketleri kompakttır ve her elin net sonucunu gösterir; eller masayı paylaşırken kural plakası çekilir. Sigorta teklifi kartların üstünü değil kontrol alanını kaplar. El sonunda net tutarı da gösteren tek bir sonuç rozeti çıkar.
- İsteğe bağlı **strateji koçu** etkin masa kurallarına göre temel stratejiyi bilir. *Uyarı* modu farklı bir hamleden sonra doğrusunu söyler, *İpucu* modu ayrıca doğru butonu işaretler. İstatistiklerde strateji doğruluğu yüzdesi tutulur.
- Dil ve üç masa/kart arkası temasından seçiminiz tarayıcıya kaydedilir ve her açılışta hatırlanır.
- Kartlar pabuçtan çıkar, seçili kurala göre kapalı kart fiziksel olarak açılır ve el bitince ıskarta tepsisine gider. Her split eli kendi gerçek jeton yığınına sahiptir; double olduğunda ilgili yığın büyür, ödeme ve toplama her el için ayrı yapılır.
- Masa plakası limitleri, deste sayısını, S17/H17 kuralını ve etkin masa profilini gösterir. Kısa yatay ekranlarda kartlarla çakışmaması için sadeleşir veya gizlenir; tüm kurallar ayarlardan okunabilir.
- Hızlı/Normal/Sinematik animasyon temposu ile ana ses, kart, jeton ve masa efekti düzeyleri ayrı ayrı ayarlanıp tarayıcıda saklanır.
- Kart, jeton, ödeme ve karıştırma sesleri yerel OGG dosyalarıdır; OGG çalamayan Safari sürümleri için AAC (`.m4a`) kopyaları da pakettedir. Arayüz fontu da yerel WOFF2 olarak paketlenmiştir.
- Yüksek limitli bahis yığınları miktarla beraber büyür; büyük tutarlarda kartlara taşmadan kompakt satırlara yerleşir.
- Dokulu keçe, ahşap/pirinç masa kenarı, gerçek A–10 sembol dizilimleri, farklı Vale/Kız/Papaz figürleri, dağıtım pabucu, ıskarta tepsisi ve pürüzsüz vektör jetonlar tamamen yerel HTML/CSS/SVG ile çizilir.
- Harici istek, paket veya CDN yoktur; `file://` kullanımı testlerle korunur.
- Destekleyen tarayıcılarda sekmeler ortak bakiye işlemlerini sıraya alır; bir sekmede el sürerken diğerinde bakiye değiştirilemez. Web Locks desteği yoksa ortak kaydı ezmek yerine sekmeye özel oturum bakiyesi kullanılır ve uyarı gösterilir.
- Yarım kalan el; sayfa yenilense, tarayıcı çökse ya da sekme kapansa bile aynı kartlarla ve masadaki bahisle kaldığı yerden devam eder. Yenilemek kötü giden bir eli geri almaz; güvenilmeyen bir kayıt eli iptal eder ve bahsi iade eder.
- Güncellemeler devam eden eli kesmez. Tutarlar tam dolar olarak tutulur, kesirli iadeler aşağı yuvarlanır; ayarlarda bu davranış açıklanır. Güvenli hesap sınırını aşacak yeni bahisler engellenir, mevcut geçerli bakiye korunur.
- **712 test** geçiyor (550 Node + 162 Chromium); komutlar yukarıdaki *Verify* bölümünde.

### Sorumluluk reddi

Table 21 eğlence amaçlı, ücretsiz bir oyundur. Jetonlar ve bakiye nakit değeri olmayan oyun parasıdır: satın alınamaz, satılamaz, paraya ya da ödüle çevrilemez; oyunda gerçek parayla kumar yoktur. Buradaki sonuçlar gerçek bir masada ne olacağını göstermez. Kumar sizin ya da bir yakınınız için sorun olmaya başladıysa lütfen yardım alın.

Table 21'in hiçbir kumarhaneyle bağlantısı yoktur; Las Vegas, Atlantic City ve European profilleri yalnızca yaygın kural setlerini tanımlar. Yazılım olduğu gibi, hiçbir garanti verilmeden sunulur.

### Lisans

Table 21, GNU Affero Genel Kamu Lisansı'nın 3. sürümü ya da (tercihinize göre) daha sonraki bir sürümü altında dağıtılan özgür yazılımdır; lisans metni [LICENSE](LICENSE) dosyasındadır. Arayüz fontu ayrıca SIL Open Font License 1.1 ile lisanslıdır.
