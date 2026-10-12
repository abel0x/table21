/* Table 21 · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var BetChipStack = require("../js/chip-stack.js");

var DENOMINATIONS = [25000, 5000, 1000, 500, 100];

test("ordinary wagers render every physical chip", function () {
  var stack = BetChipStack.build(375000, DENOMINATIONS);
  assert.equal(stack.actualChipCount, 15);
  assert.equal(stack.visibleChipCount, 15);
  assert.equal(stack.compressed, false);
  assert.equal(stack.layout.columnCount, 3);
});

test("large wager piles keep growing beyond the former fifteen-chip ceiling", function () {
  var amounts = [375000, 500000, 1000000, 10000000, 100000000, 1000000000];
  var visibleCounts = amounts.map(function (amount) {
    return BetChipStack.build(amount, DENOMINATIONS).visibleChipCount;
  });

  assert.deepEqual(visibleCounts, [15, 20, 33, 49, 66, 82]);
  visibleCounts.slice(1).forEach(function (count, index) {
    assert.ok(count > visibleCounts[index], "the visible pile must continue growing");
  });
});

test("compressed piles retain every denomination and stay inside compact rows", function () {
  var stack = BetChipStack.build(999981600, DENOMINATIONS);
  var visibleValues = new Set(stack.chips);

  DENOMINATIONS.forEach(function (value) { assert.ok(visibleValues.has(value)); });
  assert.equal(stack.compressed, true);
  assert.ok(stack.layout.rowColumnCounts.every(function (columns) { return columns <= 6; }));
  assert.equal(
    stack.layout.columnChipCounts.reduce(function (sum, count) { return sum + count; }, 0),
    stack.visibleChipCount
  );
});
