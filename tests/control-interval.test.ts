import assert from "node:assert/strict";
import test from "node:test";
import { controlAvailability } from "../src/lib/control-interval";

test("eight hours are required, including across Chile's daylight-saving transition", () => {
  const last = "2026-09-06T03:59:59Z";
  assert.equal(
    controlAvailability(last, new Date("2026-09-06T11:59:58.999Z")).can_control,
    false,
  );
  assert.equal(
    controlAvailability(last, new Date("2026-09-06T11:59:59Z")).can_control,
    true,
  );
  assert.equal(
    controlAvailability(last, new Date("2026-09-06T12:00:00Z")).available_at,
    "2026-09-06T11:59:59.000Z",
  );
  assert.equal(controlAvailability(null).can_control, true);
});
