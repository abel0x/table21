/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
/* =========================================================
   Table 21 — scalable bet-stack model
   Keeps small wagers literal and compresses very large piles gradually.
   ========================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BetChipStack = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EXACT_CHIP_LIMIT = 30;
  var GROWTH_PER_DOUBLING = 5;
  var MAX_COLUMNS_PER_ROW = 6;

  function normalizeDenominations(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).map(function (value) {
      return Math.floor(Number(value));
    }).filter(function (value) {
      if (!isFinite(value) || value <= 0 || seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort(function (a, b) { return b - a; });
  }

  function decompose(amount, denominations) {
    amount = Math.floor(Number(amount));
    if (!isFinite(amount) || amount <= 0) amount = 0;

    var remaining = amount;
    var groups = [];
    normalizeDenominations(denominations).forEach(function (value) {
      var count = Math.floor(remaining / value);
      if (count > 0) groups.push({ value: value, count: count });
      remaining -= count * value;
    });

    return {
      groups: groups,
      chipCount: groups.reduce(function (sum, group) { return sum + group.count; }, 0),
      remainder: remaining
    };
  }

  // Every chip remains visible for ordinary bets. Above that, the pile keeps
  // growing logarithmically instead of freezing at an arbitrary hard limit.
  function positiveOption(options, key, fallback) {
    var value = options && typeof options === "object" ? Number(options[key]) : NaN;
    return isFinite(value) && value > 0 ? value : fallback;
  }

  function visibleChipCount(chipCount, options) {
    chipCount = Math.max(0, Math.floor(Number(chipCount) || 0));
    var exactLimit = Math.max(1, Math.floor(positiveOption(options, "exactChipLimit", EXACT_CHIP_LIMIT)));
    var growthPerDoubling = positiveOption(options, "growthPerDoubling", GROWTH_PER_DOUBLING);
    if (chipCount <= exactLimit) return chipCount;
    return exactLimit + Math.ceil(
      Math.log(chipCount / exactLimit) / Math.LN2 * growthPerDoubling
    );
  }

  function allocateVisibleGroups(groups, targetCount) {
    var total = groups.reduce(function (sum, group) { return sum + group.count; }, 0);
    if (targetCount >= total) {
      return groups.map(function (group) { return { value: group.value, count: group.count }; });
    }

    // Preserve every denomination present in the real wager, then distribute
    // the remaining visible chips proportionally across the pile.
    var allocations = groups.map(function (group, index) {
      return { value: group.value, count: 1, sourceCount: group.count, index: index, fraction: 0 };
    });
    var slots = targetCount - allocations.length;
    var residualTotal = total - allocations.length;

    allocations.forEach(function (item) {
      var exact = residualTotal > 0 ? slots * (item.sourceCount - 1) / residualTotal : 0;
      var whole = Math.floor(exact);
      item.count += whole;
      item.fraction = exact - whole;
    });

    var used = allocations.reduce(function (sum, item) { return sum + item.count; }, 0);
    allocations.slice().sort(function (a, b) {
      return b.fraction - a.fraction || b.sourceCount - a.sourceCount || a.index - b.index;
    }).forEach(function (item) {
      if (used < targetCount && item.count < item.sourceCount) {
        allocations[item.index].count++;
        used++;
      }
    });

    return allocations.map(function (item) {
      return { value: item.value, count: item.count };
    });
  }

  function maxColumnsFrom(options) {
    var value = options && typeof options === "object" ? options.maxColumnsPerRow : options;
    value = Math.floor(Number(value));
    if (!isFinite(value) || value <= 0) return MAX_COLUMNS_PER_ROW;
    return Math.min(MAX_COLUMNS_PER_ROW, value);
  }

  function layoutFor(chipCount, options) {
    chipCount = Math.max(0, Math.floor(Number(chipCount) || 0));
    var maxColumnsPerRow = maxColumnsFrom(options);
    var perColumn = chipCount <= 15 ? 5 : (chipCount <= 36 ? 6 : 8);
    var density = chipCount <= 15 ? "natural" : (chipCount <= 36 ? "medium" : "dense");
    var columnCount = chipCount ? Math.ceil(chipCount / perColumn) : 0;
    var rowCount = columnCount ? Math.ceil(columnCount / maxColumnsPerRow) : 0;
    var rowColumnCounts = [];

    if (rowCount) {
      var base = Math.floor(columnCount / rowCount);
      var extra = columnCount % rowCount;
      for (var row = 0; row < rowCount; row++) {
        // Put the wider rows toward the player so the pile reads naturally.
        rowColumnCounts.push(base + (row >= rowCount - extra ? 1 : 0));
      }
    }

    var columnChipCounts = [];
    if (columnCount) {
      var baseHeight = Math.floor(chipCount / columnCount);
      var tallerColumns = chipCount % columnCount;
      for (var column = 0; column < columnCount; column++) {
        columnChipCounts.push(baseHeight + (column < tallerColumns ? 1 : 0));
      }
    }

    return {
      density: density,
      perColumn: perColumn,
      maxColumnsPerRow: maxColumnsPerRow,
      columnCount: columnCount,
      rowColumnCounts: rowColumnCounts,
      columnChipCounts: columnChipCounts
    };
  }

  function build(amount, denominations, options) {
    var physical = decompose(amount, denominations);
    var targetCount = Math.max(physical.groups.length, visibleChipCount(physical.chipCount, options));
    var visibleGroups = allocateVisibleGroups(physical.groups, targetCount);
    var chips = [];

    visibleGroups.forEach(function (group) {
      for (var index = 0; index < group.count; index++) chips.push(group.value);
    });

    return {
      chips: chips,
      actualChipCount: physical.chipCount,
      visibleChipCount: chips.length,
      compressed: chips.length < physical.chipCount,
      remainder: physical.remainder,
      layout: layoutFor(chips.length, options)
    };
  }

  return {
    build: build,
    decompose: decompose,
    visibleChipCount: visibleChipCount,
    layoutFor: layoutFor
  };
});
