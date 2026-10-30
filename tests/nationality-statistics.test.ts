import assert from "node:assert/strict";
import test from "node:test";
import { nationalityBreakdown } from "../src/lib/nationality-statistics";
import type { NationalityCounts } from "../src/lib/admin-domain";

const row = (nationality: string, count: number): NationalityCounts => ({
  nationality,
  day: count,
  week: count,
  month: count,
  year: count,
  historical: count,
});

test("nationality pie uses the selected period and excludes zero counts", () => {
  const input = [row("Perú", 2), { ...row("Chile", 0), historical: 8 }];
  const day = nationalityBreakdown(input, "day");
  assert.equal(day.total, 2);
  assert.deepEqual(day.slices, [{ label: "Perú", count: 2, start: 0, end: 1 }]);
  const historical = nationalityBreakdown(input, "historical");
  assert.equal(historical.total, 10);
  assert.equal(historical.slices[0].label, "Chile");
  assert.equal(historical.slices[0].end, 0.8);
  assert.equal(historical.slices[1].end, 1);
  assert.equal(input[0].nationality, "Perú");
});

test("nationality pie handles empty periods without invalid geometry", () => {
  assert.deepEqual(nationalityBreakdown([row("Chile", 0)], "day"), {
    total: 0,
    rows: [],
    slices: [],
    grouped: 0,
  });
});

test("nationality pie groups small categories but retains the complete breakdown", () => {
  const input = Array.from({ length: 12 }, (_, i) => row(`País ${i}`, i + 1));
  const chart = nationalityBreakdown(input, "year");
  assert.equal(chart.rows.length, 12);
  assert.equal(chart.slices.length, 8);
  assert.equal(chart.grouped, 5);
  assert.equal(chart.slices.at(-1)!.count, 15);
  assert.equal(
    chart.slices.reduce((sum, slice) => sum + slice.count, 0),
    chart.total,
  );
  assert.ok(Math.abs(chart.slices.at(-1)!.end - 1) < 1e-12);
  assert.equal(nationalityBreakdown(input.slice(0, 8), "day").grouped, 0);
});
