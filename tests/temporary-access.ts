import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const id = crypto.randomUUID();
for (const route of [
  "/api/session",
  "/api/people",
  "/api/controls",
  "/api/admin/users",
  "/api/admin/statistics?from=2026-10-18&to=2026-10-18",
  "/api/account",
  "/api/account/statistics?from=2026-10-18&to=2026-10-18",
  `/api/controls/${id}/photo`,
  `/api/controls/${id}/document?format=pdf`,
]) {
  assert.equal((await fetch(base + route)).status, 401, route);
}
for (const route of [
  "/api/controls",
  "/api/admin/users",
  "/api/people/search",
]) {
  assert.equal(
    (
      await fetch(base + route, {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
    route,
  );
}
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
for (const table of [
  "persons",
  "controls",
  "person_summary",
  "staff_accounts",
]) {
  const result = await anon.from(table).select("*");
  assert.ok(result.error || result.data?.length === 0);
}
console.log(
  "PASS: ninguna ruta de datos permite acceso anónimo, aunque existan antiguas variables de acceso temporal.",
);
