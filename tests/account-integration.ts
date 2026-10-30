import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const open = process.env.TEST_EXPECT_PUBLIC_ACCESS === "true";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
// Exercise the provider's six-character boundary without complexity rules.
const password = Array.from(randomBytes(6), (v) =>
  String.fromCharCode(97 + (v % 26)),
).join("");
const newPassword = String(randomInt(100000, 1000000));
const owned = new Set<string>();

async function request(
  path: string,
  body?: unknown,
  cookie = "",
  origin = base,
) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  const setCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { status: response.status, data, cookie: setCookie || cookie };
}

try {
  const adminEmail = `qa-account-admin-${stamp}@example.com`;
  const admin = await db.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "Prueba cuenta administrador" },
  });
  assert.equal(admin.error, null);
  owned.add(admin.data.user!.id);
  const signedAdmin = await request("/api/session", {
    email: adminEmail,
    password,
  });
  assert.equal(signedAdmin.status, 200);
  const manualInput = {
    action: "create",
    officer_code: `${randomInt(100000, 999999)}-Q`,
    name: "Prueba cuenta manual",
    role: "officer",
    password,
  };
  const manual = await request(
    "/api/admin/users",
    manualInput,
    signedAdmin.cookie,
  );
  assert.equal(manual.status, 201);
  owned.add(manual.data.user.id);
  assert.equal(manual.data.user.pending, false);
  assert.equal(manual.data.user.must_change_password, true);
  assert.equal(manual.data.access_link, undefined);
  assert.equal(manual.data.password, undefined);
  const stored = await db.auth.admin.getUserById(manual.data.user.id);
  assert.ok(stored.data.user!.email_confirmed_at);
  assert.equal(
    (await request("/api/admin/users", manualInput, signedAdmin.cookie)).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/admin/users",
        { ...manualInput, password: "short" },
        signedAdmin.cookie,
      )
    ).status,
    400,
  );

  const officer = await request("/api/session", {
    identifier: manualInput.officer_code,
    password,
  });
  assert.equal(
    officer.status,
    200,
    "Manual account can sign in without any activation/email confirmation",
  );
  assert.equal(
    (await request("/api/account", undefined, officer.cookie)).data.user.id,
    manual.data.user.id,
  );
  if (!open)
    assert.equal(
      (await request("/api/admin/users", manualInput, officer.cookie)).status,
      403,
    );
  assert.equal((await request("/api/account")).status, 401);
  assert.equal(
    (
      await request("/api/account/password", {
        current_password: password,
        password: newPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: "incorrect-password", password: newPassword },
        officer.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: password, password: "short" },
        officer.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: password, password },
        officer.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        {
          current_password: password,
          password: newPassword,
          id: admin.data.user!.id,
        },
        officer.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: password, password: newPassword },
        officer.cookie,
        "https://untrusted.example",
      )
    ).status,
    403,
  );

  const changed = await request(
    "/api/account/password",
    { current_password: password, password: newPassword },
    officer.cookie,
  );
  assert.equal(changed.status, 200, changed.data.error);
  assert.equal(changed.data.sign_in_required, false);
  assert.equal(
    (await request("/api/account", undefined, changed.cookie)).data.user.id,
    manual.data.user.id,
  );
  assert.equal(
    (
      await request("/api/session", {
        identifier: manualInput.officer_code,
        password,
      })
    ).status,
    401,
  );
  const fresh = await request("/api/session", {
    identifier: manualInput.officer_code,
    password: newPassword,
  });
  assert.equal(
    fresh.status,
    200,
    "New password is effective immediately without OTP",
  );
  assert.equal(
    (await request("/api/session", { email: adminEmail, password })).status,
    200,
    "Another account is unchanged",
  );
  assert.equal(
    (
      await db.auth.admin.updateUserById(manual.data.user.id, {
        ban_duration: "24h",
      })
    ).error,
    null,
  );
  assert.ok(
    [401, 403].includes(
      (
        await request(
          "/api/account/password",
          { current_password: newPassword, password },
          fresh.cookie,
        )
      ).status,
    ),
  );
  console.log(
    `PASS (${open ? "temporal" : "autenticado"}): alta manual, ingreso inmediato, cambio sin correo, contraseña anterior inválida, sesión conservada, bloqueo anónimo, suspensión y aislamiento entre cuentas.`,
  );
} finally {
  for (const id of [...owned].reverse())
    assert.equal((await db.auth.admin.deleteUser(id)).error, null);
  await db.auth.stopAutoRefresh();
  console.log("Cuentas sintéticas de la prueba eliminadas.");
}
