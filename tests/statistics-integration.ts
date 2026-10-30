import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ControlPeriodSummary } from "../src/lib/admin-domain";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const timedFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(30000) });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch },
  },
);
const accounts: {
  id: string;
  cookie: string;
  code: string;
  email: string;
  password: string;
}[] = [];
let personId: string | undefined;
const personIds: string[] = [];
let originalUsed = false;
async function account(role: "admin" | "officer", name: string) {
  const password = randomBytes(24).toString("base64url"),
    email = `qa-statistics-${randomUUID()}@example.com`,
    code = `${randomInt(100000, 999999)}-Q`;
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role,
      must_change_password: false,
      ...(role === "officer" ? { officer_code: code } : {}),
    },
    user_metadata: { full_name: name },
  });
  assert.ifError(created.error);
  const record = {
    id: created.data.user!.id,
    code,
    email,
    password,
    cookie: "",
  };
  accounts.push(record);
  const login = await timedFetch(base + "/api/session", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, portal: role }),
  });
  assert.equal(login.status, 200);
  record.cookie = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  return record;
}
async function summary(kind: "account" | "admin", cookie: string, extra = "") {
  const result = await timedFetch(
    `${base}/api/${kind}/statistics/summary${extra}`,
    {
      headers: { Cookie: cookie },
    },
  );
  const data = await result.json();
  return {
    status: result.status,
    data: data.summary as ControlPeriodSummary,
    headers: result.headers,
  };
}
async function rpc(id: string, reference_day: string) {
  const result = await db.rpc("control_period_statistics", {
    account_id: id,
    reference_day,
  });
  assert.ifError(result.error);
  return result.data as ControlPeriodSummary;
}
async function controls(id: string, dates: string[]) {
  // Separate people permit exact calendar-boundary fixtures while respecting
  // the production rule of one control per person every eight hours.
  const template = await db
    .from("persons")
    .select("*")
    .eq("id", personId!)
    .single();
  assert.ifError(template.error);
  const controlPeople: string[] = [];
  for (const _date of dates) {
    if (!originalUsed) {
      originalUsed = true;
      controlPeople.push(personId!);
    } else {
      const { id: _id, created_at: _created, ...fields } = template.data;
      const cloned = await db
        .from("persons")
        .insert({
          ...fields,
          document_number: `QASTATS${randomUUID().replaceAll("-", "").slice(0, 23).toUpperCase()}`,
        })
        .select("id")
        .single();
      assert.ifError(cloned.error);
      personIds.push(cloned.data!.id);
      controlPeople.push(cloned.data!.id);
    }
  }
  const result = await db.from("controls").insert(
    dates.map((controlled_at, index) => ({
      person_id: controlPeople[index],
      request_id: randomUUID(),
      created_by: id,
      controlled_at,
      reason: "Control de identidad",
      location: "Prueba de límites de estadísticas",
      officer: "Prueba temporal",
      art12bis: {
        lesions: "Sin lesiones",
        presented_document: "Documento sintético de prueba",
      },
      // This aggregation fixture never downloads images: valid unique metadata
      // avoids creating unnecessary storage objects for a database-only test.
      photo_path: `${randomUUID()}/${randomUUID()}.webp`,
      photo_bytes: 1000,
      photo_width: 640,
      photo_height: 480,
      document_photo_path: `${randomUUID()}/${randomUUID()}.webp`,
      document_photo_bytes: 1000,
      document_photo_width: 1200,
      document_photo_height: 800,
    })),
  );
  assert.ifError(result.error);
}
async function nationality(value: string) {
  assert.ifError(
    (
      await db
        .from("persons")
        .update({ nationality: value })
        .in("id", personIds)
    ).error,
  );
}
function assertNationalityTotals(summary: ControlPeriodSummary) {
  for (const period of ["day", "week", "month", "year", "historical"] as const)
    assert.equal(
      summary.nationalities.reduce((sum, row) => sum + row[period], 0),
      summary.totals[period],
    );
}
try {
  const admin = await account("admin", "QA resumen administrador");
  const a = await account("officer", "QA mismo nombre");
  const b = await account("officer", "QA mismo nombre");
  const zero = await account("officer", "QA sin controles");
  const person = await db
    .from("persons")
    .insert({
      document_type: "Pasaporte",
      document_number: `QASTATS${Date.now()}`,
      issuing_country: "Chile",
      first_names: "Prueba",
      last_names: "Estadísticas",
      paternal_surname: "Estadísticas",
      maternal_surname: "",
      sex: "No especificado",
      nationality: "Chile",
      birth_date: "1990-01-01",
      address: "Dirección de prueba",
      commune: "Santiago",
      phone: "00000000",
    })
    .select("id")
    .single();
  assert.ifError(person.error);
  personId = person.data!.id;
  personIds.push(personId!);
  await controls(a.id, [
    "2025-12-31T22:00:00Z",
    "2026-01-01T03:00:00Z",
    "2026-06-30T23:59:59Z",
    "2026-07-01T04:00:00Z",
    "2026-07-06T03:59:59Z",
    "2026-07-06T04:00:00Z",
    "2026-07-08T03:59:59Z",
    "2026-07-08T04:00:00Z",
    "2026-07-09T03:59:59Z",
  ]);
  await nationality("Perú");
  await controls(a.id, [
    "2026-07-09T04:00:00Z",
    "2026-09-06T03:59:59Z",
    "2026-09-06T04:00:00Z",
    "2026-09-07T02:59:59Z",
    "2026-09-07T03:00:00Z",
    new Date().toISOString(),
  ]);
  await nationality("Colombia");
  await controls(b.id, [new Date().toISOString()]);
  await nationality("Ecuador");
  const july = await rpc(a.id, "2026-07-08");
  assert.deepEqual(july.totals, {
    day: 2,
    week: 4,
    month: 6,
    year: 8,
    historical: 15,
  });
  assert.equal(july.week_start, "2026-07-06");
  assertNationalityTotals(july);
  assert.deepEqual(july.nationalities, [
    { nationality: "Chile", day: 2, week: 4, month: 6, year: 8, historical: 9 },
    { nationality: "Perú", day: 0, week: 0, month: 0, year: 0, historical: 6 },
  ]);
  const january = await rpc(a.id, "2026-01-01");
  assert.equal(january.totals.day, 1);
  assert.equal(january.totals.week, 2);
  assert.equal(january.totals.year, 1);
  assertNationalityTotals(january);
  assert.equal(
    january.nationalities.find((n) => n.nationality === "Chile")!.year,
    1,
  );
  const summerTime = await rpc(a.id, "2026-09-06");
  assert.equal(summerTime.totals.day, 2);
  assertNationalityTotals(summerTime);
  assert.equal(
    summerTime.nationalities.find((n) => n.nationality === "Perú")!.day,
    2,
  );
  console.log(
    "PASS: límites de día, lunes, mes, año e histórico; cambio horario de Chile.",
  );
  const own = await summary("account", a.cookie);
  assert.equal(own.status, 200);
  assert.equal(own.data.totals.historical, 15);
  assert.deepEqual(own.data.users, []);
  assertNationalityTotals(own.data);
  assert.equal(own.data.nationalities.length, 2);
  assert.ok(!own.data.nationalities.some((n) => n.nationality === "Colombia"));
  assert.match(own.headers.get("Cache-Control")!, /no-store/);
  assert.deepEqual(
    (
      await summary(
        "account",
        a.cookie,
        `?account_id=${b.id}&reference_day=2026-07-08`,
      )
    ).data,
    own.data,
  );
  assert.equal((await summary("account", b.cookie)).data.totals.historical, 1);
  assert.equal(
    (await summary("account", b.cookie)).data.nationalities[0].nationality,
    "Colombia",
  );
  assert.deepEqual(
    (await summary("account", zero.cookie)).data.nationalities,
    [],
  );
  assert.deepEqual((await summary("account", zero.cookie)).data.totals, {
    day: 0,
    week: 0,
    month: 0,
    year: 0,
    historical: 0,
  });
  assert.equal((await summary("admin", a.cookie)).status, 403);
  assert.equal((await summary("admin", "")).status, 401);
  assert.equal((await summary("account", "")).status, 401);
  const all = await summary("admin", admin.cookie);
  assert.equal(all.status, 200);
  assertNationalityTotals(all.data);
  assert.equal(all.data.users.find((u) => u.user_id === a.id)!.historical, 15);
  assert.equal(all.data.users.find((u) => u.user_id === b.id)!.historical, 1);
  assert.equal(
    all.data.users.find((u) => u.user_id === zero.id)!.historical,
    0,
  );
  assert.ok(all.data.users.some((u) => u.user_id === admin.id));
  for (const key of ["day", "week", "month", "year", "historical"] as const)
    assert.equal(
      all.data.users.reduce((sum, u) => sum + u[key], 0),
      all.data.totals[key],
    );
  const changed = await db.auth.admin.updateUserById(a.id, {
    app_metadata: { officer_code: `${randomInt(100000, 999999)}-W` },
  });
  assert.ifError(changed.error);
  assert.equal((await summary("account", a.cookie)).data.totals.historical, 15);
  console.log(
    "PASS: acceso propio, ceros, tabla completa y cambio de código; verificando conservación al eliminar una cuenta de prueba.",
  );
  assert.ifError((await db.auth.admin.deleteUser(b.id)).error);
  const preserved = await summary("admin", admin.cookie);
  assert.ok(
    preserved.data.users.some(
      (u) =>
        u.historical_account && u.officer_code === b.code && u.historical === 1,
    ),
  );
  assert.equal(preserved.data.totals.historical, all.data.totals.historical);
  assert.deepEqual(preserved.data.nationalities, all.data.nationalities);
  // Legacy controls can lack a snapshot nationality. Fall back to the person,
  // or count an explicit missing category; never drop controls from the pie.
  const legacy = await db
    .from("controls")
    .select("id,acta_person")
    .eq("person_id", personId!)
    .eq("created_by", a.id)
    .order("controlled_at")
    .limit(1)
    .single();
  assert.ifError(legacy.error);
  assert.ifError(
    (
      await db
        .from("controls")
        .update({
          acta_person: { ...legacy.data!.acta_person, nationality: " " },
        })
        .eq("id", legacy.data!.id)
    ).error,
  );
  const fallback = await rpc(a.id, "2026-07-08");
  assertNationalityTotals(fallback);
  assert.equal(
    fallback.nationalities.find((n) => n.nationality === "Ecuador")!.historical,
    1,
  );
  await nationality("");
  const missing = await rpc(a.id, "2026-07-08");
  assertNationalityTotals(missing);
  assert.equal(
    missing.nationalities.find(
      (n) => n.nationality === "Sin nacionalidad registrada",
    )!.historical,
    1,
  );
  console.log(
    "PASS: nacionalidades por período, instantánea histórica, datos antiguos, totales y aislamiento entre cuentas.",
  );
  console.log(
    "PASS: estadísticas propias por cuenta, tabla completa con ceros, códigos editables e historial conservado.",
  );
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: timedFetch },
    },
  );
  assert.ok((await anon.rpc("control_period_statistics")).error);
  const signed = await anon.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  });
  assert.ifError(signed.error);
  assert.ok(
    (await anon.rpc("control_period_statistics", { account_id: admin.id }))
      .error,
  );
  assert.ifError(
    (await db.auth.admin.updateUserById(a.id, { ban_duration: "24h" })).error,
  );
  assert.ok([401, 403].includes((await summary("account", a.cookie)).status));
  console.log(
    "PASS: sin acceso anónimo, RPC restringida y cuentas suspendidas bloqueadas.",
  );
} finally {
  if (personIds.length) {
    assert.ifError(
      (await db.from("controls").delete().in("person_id", personIds)).error,
    );
    assert.ifError(
      (await db.from("persons").delete().in("id", personIds)).error,
    );
  }
  for (const account of accounts) {
    const result = await db.auth.admin.deleteUser(account.id);
    if (result.error && result.error.code !== "user_not_found")
      throw result.error;
  }
  console.log("Cuentas y controles sintéticos de estadísticas eliminados.");
}
