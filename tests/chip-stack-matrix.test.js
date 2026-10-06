"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var BetChipStack = require("../js/chip-stack.js");

var DENOMINATIONS = [25000, 5000, 1000, 500, 100, 50, 25, 10, 5, 1];

[
  1, 4, 5, 9, 10, 24, 25, 49, 50, 99, 100, 101, 149, 250, 999,
  1001, 12345, 25375, 99999, 1000000, 2500000001, 9007199254740991
].forEach(function (amount) {
  test("exact chip decomposition represents $" + amount, function () {
    var result = BetChipStack.decompose(amount, DENOMINATIONS);
    var represented = result.groups.reduce(function (sum, group) {
      return sum + group.value * group.count;
    }, 0);
    assert.equal(result.remainder, 0);
    assert.equal(represented, amount);
    assert.equal(result.chipCount, result.groups.reduce(function (sum, group) {
      return sum + group.count;
    }, 0));
  });
});

[
  ["zero", 0],
  ["negative", -10],
  ["not numeric", "chips"],
  ["infinity", Infinity],
  ["null", null],
  ["undefined", undefined]
].forEach(function (entry) {
  test("invalid chip amount becomes an empty pile: " + entry[0], function () {
    var result = BetChipStack.decompose(entry[1], DENOMINATIONS);
    assert.deepEqual(result, { groups: [], chipCount: 0, remainder: 0 });
  });
});

test("denominations are sorted, deduplicated, and sanitized", function () {
  var result = BetChipStack.decompose(188, [1, 25, 10, 25, 0, -5, "50", "bad", 5]);
  assert.deepEqual(result.groups, [
    { value: 50, count: 3 },
    { value: 25, count: 1 },
    { value: 10, count: 1 },
    { value: 1, count: 3 }
  ]);
  assert.equal(result.remainder, 0);
});

[
  [0, 0],
  [1, 1],
  [15, 15],
  [30, 30],
  [31, 31],
  [32, 31],
  [60, 35],
  [120, 40],
  [960, 55],
  [30000, 80]
].forEach(function (entry) {
  test("visible chip growth curve at " + entry[0] + " physical chips", function () {
    assert.equal(BetChipStack.visibleChipCount(entry[0]), entry[1]);
  });
});

[
  [0, "natural", 5, 0],
  [1, "natural", 5, 1],
  [15, "natural", 5, 3],
  [16, "medium", 6, 3],
  [30, "medium", 6, 5],
  [31, "medium", 6, 6],
  [36, "medium", 6, 6],
  [37, "dense", 8, 5],
  [82, "dense", 8, 11]
].forEach(function (entry) {
  test("pile layout matrix for " + entry[0] + " visible chips", function () {
    var layout = BetChipStack.layoutFor(entry[0]);
    assert.equal(layout.density, entry[1]);
    assert.equal(layout.perColumn, entry[2]);
    assert.equal(layout.columnCount, entry[3]);
    assert.equal(layout.columnChipCounts.reduce(function (sum, value) { return sum + value; }, 0), entry[0]);
    assert.ok(layout.columnChipCounts.every(function (value) { return value <= layout.perColumn; }));
    assert.ok(layout.rowColumnCounts.every(function (value) { return value <= 6; }));
  });
});

[
  ["one column", 1, 1],
  ["two columns", 2, 2],
  ["hand-sized three columns", 3, 3],
  ["default six columns", 6, 6],
  ["oversized request is capped", 99, 6],
  ["invalid request uses default", "invalid", 6]
].forEach(function (entry) {
  test("configurable row width: " + entry[0], function () {
    var layout = BetChipStack.layoutFor(82, { maxColumnsPerRow: entry[1] });
    assert.equal(layout.maxColumnsPerRow, entry[2]);
    assert.ok(layout.rowColumnCounts.every(function (count) { return count <= entry[2]; }));
    assert.equal(layout.rowColumnCounts.reduce(function (sum, count) { return sum + count; }, 0), layout.columnCount);
  });
});

test("narrow hand piles preserve all visible chips across more rows", function () {
  var stack = BetChipStack.build(1000000000, DENOMINATIONS, { maxColumnsPerRow: 3 });
  assert.equal(stack.remainder, 0);
  assert.equal(stack.visibleChipCount, 82);
  assert.equal(stack.layout.columnCount, 11);
  assert.deepEqual(stack.layout.rowColumnCounts, [2, 3, 3, 3]);
  assert.equal(stack.layout.columnChipCounts.reduce(function (sum, count) { return sum + count; }, 0), 82);
});

[
  ["two denominations", 25100, [25000, 100]],
  ["four low denominations", 91, [50, 25, 10, 5, 1]],
  ["every denomination", 31691, DENOMINATIONS],
  ["compressed mixed pile", 999981691, DENOMINATIONS]
].forEach(function (entry) {
  test("visible compressed pile preserves denominations: " + entry[0], function () {
    var stack = BetChipStack.build(entry[1], DENOMINATIONS);
    var visible = new Set(stack.chips);
    entry[2].forEach(function (denomination) {
      assert.ok(visible.has(denomination), "missing $" + denomination);
    });
    assert.equal(stack.remainder, 0);
  });
});

test("a build does not mutate its denomination input", function () {
  var denominations = [1, 100, 25, 5, 10];
  var before = denominations.slice();
  BetChipStack.build(141, denominations);
  assert.deepEqual(denominations, before);
});

test("every exact small pile retains its physical denomination order", function () {
  var stack = BetChipStack.build(1166, DENOMINATIONS);
  assert.deepEqual(stack.chips, [1000, 100, 50, 10, 5, 1]);
  assert.equal(stack.compressed, false);
});

test("compressed status changes only when visible chips are omitted", function () {
  assert.equal(BetChipStack.build(3000, [100]).compressed, false);
  assert.equal(BetChipStack.build(3100, [100]).compressed, false);
  assert.equal(BetChipStack.build(3200, [100]).compressed, true);
});

test("multi-hand compression keeps growing without flooding a small seat", function () {
  var amounts = [200000, 400000, 1000000, 10000000, 1000000000];
  var counts = amounts.map(function (amount) {
    return BetChipStack.build(amount, DENOMINATIONS, {
      maxColumnsPerRow: 2,
      exactChipLimit: 8,
      growthPerDoubling: 2
    }).visibleChipCount;
  });
  assert.deepEqual(counts, [8, 10, 13, 20, 33]);
  counts.slice(1).forEach(function (count, index) { assert.ok(count > counts[index]); });
});

test("compact compression never drops a represented denomination", function () {
  var stack = BetChipStack.build(31691, DENOMINATIONS, {
    maxColumnsPerRow: 2,
    exactChipLimit: 3,
    growthPerDoubling: 1
  });
  var visible = new Set(stack.chips);
  DENOMINATIONS.forEach(function (denomination) { assert.ok(visible.has(denomination)); });
  assert.ok(stack.layout.rowColumnCounts.every(function (columns) { return columns <= 2; }));
});
