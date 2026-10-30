import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { compressControlPhoto } from "../src/lib/photo-compression";
import { PHOTO_BUCKET } from "../src/lib/photo-policy";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const unique = Date.now();
// Recovery and subsequent sign-in must accept six digits, with no symbols.
const password = String(randomInt(100000, 1000000));
const ownedUsers = new Set<string>();
let personId: string | undefined;
const ownPhotos: string[] = [];
const publicClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  origin?: string,
) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  const cookies = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  return { status: response.status, data, cookie: cookies };
}
async function create(role: string) {
  const email = `qa-admin-${role}-${unique}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: "Prueba temporal " + role },
  });
  assert.equal(error, null);
  ownedUsers.add(data.user!.id);
  const signed = await request("/api/session", { email, password });
  assert.equal(signed.status, 200);
  return { id: data.user!.id, email, cookie: signed.cookie };
}
try {
  const admin = await create("admin");
  const officer = await create("officer");
  for (const endpoint of [
    "/api/admin/users",
    "/api/admin/statistics?from=2026-07-01&to=2026-07-01",
  ]) {
    assert.equal((await request(endpoint)).status, 401);
    assert.equal(
      (await request(endpoint, undefined, officer.cookie)).status,
      403,
    );
  }
  assert.equal(
    (await request("/api/admin/users", { action: "create" }, officer.cookie))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/users",
        { action: "create" },
        admin.cookie,
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/statistics?from=2026-07-02&to=2026-07-01",
        undefined,
        admin.cookie,
      )
    ).status,
    400,
  );
  console.log("PASS: anonymous, officer, CSRF and invalid-period protections");

  const created = await request(
    "/api/admin/users",
    {
      action: "create",
      officer_code: `${randomInt(100000, 999999)}-T`,
      name: "Prueba de creación",
      role: "officer",
      password: randomBytes(24).toString("base64url"),
    },
    admin.cookie,
  );
  assert.equal(created.status, 201);
  const user = created.data.user;
  ownedUsers.add(user.id);
  assert.equal(user.must_change_password, true);
  const initialRecovery = await request(
    "/api/admin/users",
    { action: "access_link", id: user.id },
    admin.cookie,
  );
  const token = new URL(initialRecovery.data.access_link).hash.slice(
    "#token=".length,
  );
  assert.equal(
    (await request("/api/activate", { token, password: "short" })).status,
    400,
  );
  const activated = await request("/api/activate", { token, password });
  assert.equal(activated.status, 200);
  assert.equal(
    (await request("/api/activate", { token, password })).status,
    400,
  );
  assert.equal(
    (await request("/api/session", undefined, activated.cookie)).data.user.role,
    "officer",
  );
  assert.equal(
    (await request("/api/admin/users", undefined, activated.cookie)).status,
    403,
  );
  console.log(
    "PASS: user creation, activation, password validation and single-use link",
  );

  const change = (role: "admin" | "officer", active = true) =>
    request(
      "/api/admin/users",
      {
        action: "update",
        id: user.id,
        name: "Prueba de creación",
        role,
        active,
      },
      admin.cookie,
    );
  assert.equal((await change("admin")).status, 200);
  assert.equal(
    (await request("/api/admin/users", undefined, activated.cookie)).status,
    200,
  );
  assert.equal((await change("officer")).status, 200);
  assert.equal(
    (await request("/api/admin/users", undefined, activated.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/users",
        {
          action: "update",
          id: admin.id,
          name: "Prueba",
          role: "officer",
          active: true,
        },
        admin.cookie,
      )
    ).status,
    400,
  );
  console.log(
    "PASS: role changes take effect in existing sessions; self-demotion blocked",
  );

  const before = (
    await request(
      "/api/admin/statistics?from=2026-07-01&to=2026-07-01",
      undefined,
      admin.cookie,
    )
  ).data.statistics;
  const person = await db
    .from("persons")
    .insert({
      document_type: "Pasaporte",
      document_number: `ADMINQA${unique}`,
      issuing_country: "Chile",
      first_names: "Prueba",
      last_names: "Estadísticas",
      paternal_surname: "Estadísticas",
      maternal_surname: "",
      sex: "No especificado",
      nationality: "Chile",
      birth_date: "1990-01-01",
      address: "Calle de prueba 123",
      commune: "Santiago",
      phone: "+56 9 0000 0000",
    })
    .select("id")
    .single();
  assert.equal(person.error, null);
  personId = person.data!.id;
  const fixture = await compressControlPhoto(await photoFixture());
  for (let i = 0; i < 8; i++) {
    const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.webp`;
    assert.equal(
      (
        await db.storage
          .from(PHOTO_BUCKET)
          .upload(path, fixture.bytes, { contentType: "image/webp" })
      ).error,
      null,
    );
    ownPhotos.push(path);
  }
  const inserted = await db.from("controls").insert(
    [
      "2026-07-01T03:59:59Z",
      "2026-07-01T04:00:00Z",
      "2026-07-02T03:59:59Z",
      "2026-07-02T04:00:00Z",
    ].map((controlled_at, i) => ({
      person_id: personId,
      request_id: crypto.randomUUID(),
      controlled_at,
      photo_path: ownPhotos[i],
      photo_bytes: fixture.bytes.length,
      photo_width: fixture.width,
      photo_height: fixture.height,
      document_photo_path: ownPhotos[i + 4],
      document_photo_bytes: fixture.bytes.length,
      document_photo_width: fixture.width,
      document_photo_height: fixture.height,
      reason: "Control de identidad",
      art12bis: {
        lesions: "Sin lesiones",
        presented_document: "Documento sintético de prueba",
      },
      location: "Prueba automatizada temporal",
      officer: "Prueba estadísticas",
      created_by: admin.id,
    })),
  );
  assert.equal(inserted.error, null);
  const after = (
    await request(
      "/api/admin/statistics?from=2026-07-01&to=2026-07-01",
      undefined,
      admin.cookie,
    )
  ).data.statistics;
  assert.equal(after.period_controls, before.period_controls + 2);
  assert.equal(after.period_people, before.period_people + 1);
  assert.equal(after.repeated_people, before.repeated_people + 1);
  assert.equal(after.daily[0].count, before.daily[0].count + 2);
  assert.equal(after.total_controls, before.total_controls + 4);
  console.log(
    "PASS: aggregated counts, distinct/repeated people and Chile day boundaries",
  );

  const client = publicClient();
  assert.equal(
    (await client.auth.signInWithPassword({ email: user.email, password }))
      .error,
    null,
  );
  assert.equal(
    (await client.from("persons").select("id").eq("id", personId)).data?.length,
    0,
    "An officer cannot directly read people controlled only by the administrator",
  );
  assert.equal(
    (
      await client.rpc("admin_statistics", {
        from_date: "2026-07-01",
        to_date: "2026-07-01",
      })
    ).data,
    null,
  );
  assert.equal((await change("officer", false)).status, 200);
  assert.ok(
    [401, 403].includes(
      (await request("/api/people", undefined, activated.cookie)).status,
    ),
  );
  assert.equal(
    (await client.from("persons").select("id").eq("id", personId)).data?.length,
    0,
  );
  assert.equal(
    (await request("/api/session", { email: user.email, password })).status,
    401,
  );
  assert.equal((await change("officer", true)).status, 200);
  assert.equal(
    (await request("/api/session", { email: user.email, password })).status,
    200,
  );
  const recovery = await request(
    "/api/admin/users",
    { action: "access_link", id: user.id },
    admin.cookie,
  );
  assert.equal(recovery.status, 200);
  assert.ok(recovery.data.access_link);
  console.log(
    "PASS: suspension blocks existing session, direct RLS reads and login; reactivation and recovery work",
  );
} finally {
  if (personId) {
    const controls = await db
      .from("controls")
      .delete()
      .eq("person_id", personId);
    assert.equal(controls.error, null);
    const person = await db.from("persons").delete().eq("id", personId);
    assert.equal(person.error, null);
  }
  for (const id of ownedUsers) {
    const deleted = await db.auth.admin.deleteUser(id);
    assert.equal(deleted.error, null);
  }
  if (ownPhotos.length)
    assert.equal(
      (await db.storage.from(PHOTO_BUCKET).remove(ownPhotos)).error,
      null,
    );
  console.log("Temporary accounts and records removed.");
}
