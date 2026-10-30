import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function testSession(db: SupabaseClient, base: string) {
  const password = randomBytes(24).toString("base64url");
  const result = await db.auth.admin.createUser({
    email: `qa-${crypto.randomUUID()}@example.com`,
    password,
    email_confirm: true,
    app_metadata: { role: "officer", must_change_password: false },
    user_metadata: { full_name: "Prueba temporal de integración" },
  });
  assert.ifError(result.error);
  const id = result.data.user!.id;
  try {
    const signed = await fetch(base + "/api/session", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email: result.data.user!.email, password }),
    });
    assert.equal(signed.status, 200);
    const cookie = signed.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    return {
      cookie,
      cleanup: async () =>
        assert.ifError((await db.auth.admin.deleteUser(id)).error),
    };
  } catch (error) {
    await db.auth.admin.deleteUser(id);
    throw error;
  }
}
