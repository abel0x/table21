# Changelog

All notable changes to Table 21 are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-12

First public release.

- Las Vegas, Atlantic City and European table profiles, each with its own dealing, peek, double, split and surrender rules; 1, 2, 6 or 8 decks shuffled with `crypto.getRandomValues`.
- Hit, stand, double, split up to four hands, late surrender, insurance and even money; blackjack pays 3:2.
- Optional basic-strategy coach with feedback or hints, and a strategy-accuracy statistic.
- Unfinished hands survive reloads, crashes and closed tabs with the same cards and stake.
- Plays offline from `file://` or as an installable PWA, in English and Turkish.
- Play money only, with a disclaimer in the game and in the README.
- Licensed under the GNU AGPL v3 or later.

[1.0.0]: https://github.com/abel0x/table21/releases/tag/v1.0.0
