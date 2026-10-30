import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { PHOTO_BUCKET } from "../src/lib/photo-policy";
import { documentFixture } from "./document-fixture";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { ageSyntheticControls } from "./control-time-fixture";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ownedUsers = new Set<string>(),
  ownedPeople = new Set<string>(),
  photos = new Set<string>();
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const code = () => `${randomInt(100000, 999999)}-Z`;
const initial = randomBytes(24).toString("base64url"),
  personal = randomBytes(24).toString("base64url");
const fixture = await photoFixture();
const name = `Prueba funcionario ${stamp}`;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
}).format(new Date());
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const period = `from=${weekAgo}&to=${today}`;
async function request(path: string, body?: unknown, cookie = "") {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return {
    status: response.status,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  };
}
async function create(officer_code: string, cookie: string) {
  const result = await request(
    "/api/admin/users",
    {
      action: "create",
      role: "officer",
      officer_code,
      officer_grade: "Sargento 2°",
      name,
      password: initial,
    },
    cookie,
  );
  if (result.data.user?.id) ownedUsers.add(result.data.user.id);
  return result;
}
async function save(
  cookie: string,
  personId?: string,
  art12bis: unknown = documentFixture.art12bis,
) {
  const form = new FormData();
  form.set(
    "payload",
    JSON.stringify({
      request_id: crypto.randomUUID(),
      ...(personId
        ? { person_id: personId }
        : {
            identity: {
              document_type: "Pasaporte",
              document_number: `QACODE${Date.now()}`,
              issuing_country: "Chile",
            },
            personal: {
              first_names: "Prueba temporal",
              last_names: "Código funcionario",
              paternal_surname: "Código funcionario",
              maternal_surname: "",
              sex: "No especificado",
              nationality: "Chile",
              birth_date: "1990-01-01",
              address: "Calle de prueba 123",
              commune: "Santiago",
              phone: "+56 9 0000 0000",
            },
          }),
      control: {
        art12bis,
        reason: "Control de identidad",
        location: "Prueba técnica",
        notes:
          "Prueba ficticia de estadísticas personales; se elimina al finalizar.",
      },
    }),
  );
  form.set(
    "photo",
    new Blob([new Uint8Array(fixture)], { type: "image/jpeg" }),
    "test.jpg",
  );
  form.set("photo_confirmed", "true");
  form.set(
    "document_photo",
    new Blob([new Uint8Array(await photoFixture())], { type: "image/jpeg" }),
    "document.jpg",
  );
  form.set("document_photo_confirmed", "true");
  const response = await fetch(base + "/api/controls", {
    method: "POST",
    headers: { Origin: base, Cookie: cookie },
    body: form,
  });
  const data = await response.json();
  if (data.control?.person_id) ownedPeople.add(data.control.person_id);
  if (data.control?.photo_path) photos.add(data.control.photo_path);
  if (data.control?.document_photo_path)
    photos.add(data.control.document_photo_path);
  assert.equal(response.status, 201, JSON.stringify(data));
  return data.control;
}
try {
  const seed = await db.auth.admin.createUser({
    email: `qa-officer-admin-${stamp}@example.com`,
    password: initial,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "Administrador de prueba" },
  });
  assert.ifError(seed.error);
  const admin = seed.data.user!;
  ownedUsers.add(admin.id);
  const adminLogin = await request("/api/session", {
    email: admin.email,
    password: initial,
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.cookie;
  assert.equal(
    (await request("/api/admin/users", undefined, adminCookie)).status,
    200,
  );
  const codeA = code(),
    codeB = code();
  const a = await create(codeA.replace("-", "").toLowerCase(), adminCookie),
    b = await create(codeB, adminCookie);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(b.status, 201, JSON.stringify(b.data));
  assert.equal(a.data.user.officer_code, codeA);
  assert.equal(a.data.user.officer_grade, "Sargento 2°");
  assert.equal(a.data.user.must_change_password, true);
  assert.equal(a.data.access_link, undefined);
  assert.equal(a.data.password, undefined);
  assert.equal((await create(codeA, adminCookie)).status, 409);
  assert.equal((await create(codeA.replace("-", ""), adminCookie)).status, 409);
  assert.equal((await create("11111-M", adminCookie)).status, 400);
  assert.equal(
    (
      await request(
        "/api/admin/users",
        {
          action: "create",
          role: "officer",
          name,
          email: "qa@example.com",
          password: initial,
        },
        adminCookie,
      )
    ).status,
    400,
  );
  const login = await request("/api/session", {
    identifier: codeA.replace("-", "").toLowerCase(),
    password: initial,
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.must_change_password, true);
  assert.equal(
    (await request("/api/account", undefined, login.cookie)).data.user
      .must_change_password,
    true,
  );
  for (const path of [
    "/api/people",
    "/api/controls",
    "/api/admin/users",
    `/api/account/statistics?${period}`,
  ])
    assert.equal(
      (await request(path, undefined, login.cookie)).status,
      403,
      path,
    );
  assert.equal((await request("/api/controls", {}, login.cookie)).status, 403);
  assert.equal(
    (await request(`/api/account/statistics?${period}`)).status,
    401,
  );
  const direct = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  assert.ifError(
    (
      await direct.auth.signInWithPassword({
        email: a.data.user.email,
        password: initial,
      })
    ).error,
  );
  assert.equal((await direct.rpc("is_active_staff")).data, false);
  await direct.auth.updateUser({
    data: {
      must_change_password: false,
      officer_code: codeB,
      officer_grade: "Grado falso",
    },
  });
  assert.equal(
    (await direct.auth.getUser()).data.user?.app_metadata.must_change_password,
    true,
  );
  assert.ok((await direct.from("staff_accounts").select("*")).error);
  assert.ok(
    (
      await direct.rpc("officer_statistics", {
        account_id: b.data.user.id,
        from_date: today,
        to_date: today,
      })
    ).error,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: initial, password: initial },
        login.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/account/password",
        { current_password: "incorrecta", password: personal },
        login.cookie,
      )
    ).status,
    400,
  );
  const changed = await request(
    "/api/account/password",
    { current_password: initial, password: personal },
    login.cookie,
  );
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.sign_in_required, false);
  assert.equal(
    (await request("/api/account", undefined, changed.cookie)).data.user
      .must_change_password,
    false,
  );
  assert.equal(
    (await request("/api/session", { identifier: codeA, password: initial }))
      .status,
    401,
  );
  const signedA = await request("/api/session", {
    identifier: codeA,
    password: personal,
  });
  const cookieA = signedA.cookie;
  assert.equal(signedA.status, 200);
  assert.equal(signedA.data.must_change_password, false);
  assert.equal(
    (await request("/api/session", undefined, cookieA)).data.user.role,
    "officer",
  );
  assert.equal(
    (await request("/api/admin/users", undefined, cookieA)).status,
    403,
  );
  assert.equal(
    (await request(`/api/admin/statistics?${period}`, undefined, cookieA))
      .status,
    403,
  );
  const signedB = await request("/api/session", {
    identifier: codeB,
    password: initial,
  });
  const changedB = await request(
    "/api/account/password",
    { current_password: initial, password: personal },
    signedB.cookie,
  );
  assert.equal(changedB.status, 200, JSON.stringify(changedB.data));
  const cookieB = changedB.cookie;
  const accessPath = `/api/admin/users/${a.data.user.id}/accesses`;
  assert.equal((await request(accessPath)).status, 401);
  assert.equal((await request(accessPath, undefined, cookieB)).status, 403);
  assert.equal(
    (await request(accessPath + "?page=0", undefined, adminCookie)).status,
    400,
  );
  const accesses = await request(accessPath, undefined, adminCookie);
  assert.equal(accesses.status, 200, JSON.stringify(accesses.data));
  assert.ok(accesses.data.count >= 2);
  assert.ok(
    accesses.data.accesses.every(
      (entry: { role: string; method: string }) =>
        entry.role === "officer" && entry.method === "password",
    ),
  );
  assert.ok((await direct.from("user_access_events").select("*")).error);
  assert.equal(
    (
      await request("/api/admin/users", {
        action: "delete",
        id: a.data.user.id,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/admin/users",
        { action: "delete", id: a.data.user.id },
        cookieB,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/users",
        { action: "delete", id: admin.id },
        adminCookie,
      )
    ).status,
    400,
  );
  console.log(
    "PASS: cuentas separadas, código único, primer cambio obligatorio, sin correo y sin bypass de permisos.",
  );

  const first = await save(cookieA, undefined, {
    ...documentFixture.art12bis,
    officer_grade: "Grado falso",
  });
  assert.equal(first.created_by, a.data.user.id);
  assert.equal(first.officer_code, codeA);
  assert.equal(first.officer, name);
  assert.equal(first.art12bis.officer_grade, "Sargento 2°");
  assert.equal(first.acta_version, 1);
  await ageSyntheticControls(db, first.person_id);
  const withoutSelection = await save(cookieA, first.person_id);
  assert.equal(withoutSelection.acta_version, 1);
  assert.equal(withoutSelection.art12bis.officer_grade, "Sargento 2°");
  await ageSyntheticControls(db, first.person_id);
  const other = await save(cookieB, first.person_id);
  assert.equal(other.created_by, b.data.user.id);
  assert.equal(other.officer_code, codeB);
  assert.equal(other.acta_version, 1);
  assert.equal(other.art12bis.officer_grade, "Sargento 2°");
  for (const endpoint of [
    "/api/session",
    "/api/controls",
    "/api/people",
    "/api/admin/users",
    `/api/admin/statistics?${period}`,
  ]) {
    assert.equal(
      (await request(endpoint)).status,
      401,
      `Anonymous access denied: ${endpoint}`,
    );
  }
  assert.equal((await request("/api/controls", {})).status, 401);
  assert.equal((await request("/api/people", undefined, cookieA)).status, 403);
  for (const [cookie, id, count] of [
    [cookieA, a.data.user.id, 2],
    [cookieB, b.data.user.id, 1],
  ] as const) {
    const listed = await request(
      `/api/controls?person_id=${first.person_id}&created_by=${admin.id}`,
      undefined,
      cookie,
    );
    assert.equal(listed.status, 200);
    assert.equal(listed.data.count, count);
    assert.ok(
      listed.data.controls.every(
        (control: { created_by: string }) => control.created_by === id,
      ),
    );
  }
  const allControls = await request(
    `/api/controls?person_id=${first.person_id}`,
    undefined,
    adminCookie,
  );
  assert.equal(
    allControls.data.count,
    3,
    "Administrator can see every officer's controls",
  );
  assert.equal(
    (await request("/api/people", undefined, adminCookie)).status,
    200,
  );
  const sharedLookup = await request(
    "/api/people/search",
    {
      type: "Pasaporte",
      country: "Chile",
      query: first.acta_person.document_number,
    },
    cookieB,
  );
  assert.equal(sharedLookup.status, 200);
  assert.equal(
    sharedLookup.data.people[0].id,
    first.person_id,
    "Document lookup still reuses shared identities",
  );
  assert.ifError(
    (
      await direct.auth.signInWithPassword({
        email: a.data.user.email,
        password: personal,
      })
    ).error,
  );
  const directControls = await direct
    .from("controls")
    .select("id,created_by")
    .eq("person_id", first.person_id);
  assert.ifError(directControls.error);
  assert.equal(directControls.data!.length, 2);
  assert.ok(directControls.data!.every((c) => c.created_by === a.data.user.id));
  const summary = await direct
    .from("person_summary")
    .select("control_count")
    .eq("id", first.person_id)
    .single();
  assert.ifError(summary.error);
  assert.equal(
    summary.data!.control_count,
    2,
    "Direct summary follows own-control RLS",
  );
  for (const suffix of ["photo", "document", "document?format=pdf"]) {
    assert.equal(
      (await fetch(`${base}/api/controls/${first.id}/${suffix}`)).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${base}/api/controls/${first.id}/${suffix}`, {
          headers: { Cookie: cookieB },
        })
      ).status,
      404,
      "Other officers cannot read a known control ID",
    );
    assert.equal(
      (
        await fetch(`${base}/api/controls/${first.id}/${suffix}`, {
          headers: { Cookie: adminCookie },
        })
      ).status,
      200,
      "Administrator can access all attachments",
    );
    const own = await fetch(`${base}/api/controls/${first.id}/${suffix}`, {
      headers: { Cookie: cookieA },
    });
    assert.equal(own.status, 200);
    if (suffix.endsWith("pdf")) {
      assert.match(own.headers.get("content-type")!, /application\/pdf/);
      const bytes = new Uint8Array(await own.arrayBuffer());
      assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
      await mkdir("test-results/acta", { recursive: true });
      await writeFile("test-results/acta/portal-download.pdf", bytes);
    }
  }
  const wrongAdmin = await request("/api/session", {
    identifier: codeB,
    password: personal,
    portal: "admin",
  });
  assert.equal(wrongAdmin.status, 403);
  const wrongOfficer = await request("/api/session", {
    email: admin.email,
    password: initial,
    portal: "officer",
  });
  assert.equal(wrongOfficer.status, 403);
  console.log(
    "PASS: portales separados, historial y adjuntos propios, administrador completo, PDF y RLS por autor.",
  );
  const statsA = await request(
    `/api/account/statistics?${period}`,
    undefined,
    cookieA,
  );
  const statsB = await request(
    `/api/account/statistics?${period}`,
    undefined,
    cookieB,
  );
  assert.equal(statsA.status, 200, JSON.stringify(statsA.data));
  assert.equal(statsB.status, 200);
  for (const [stats, count] of [
    [statsA.data.statistics, 2],
    [statsB.data.statistics, 1],
  ] as const) {
    assert.equal(stats.period_controls, count);
    assert.equal(stats.total_controls, count);
    assert.equal(stats.period_people, 1);
    assert.equal(stats.new_people, 1);
    assert.equal(
      stats.daily.reduce(
        (sum: number, day: { count: number }) => sum + day.count,
        0,
      ),
      count,
    );
    assert.deepEqual(stats.officers, []);
  }
  assert.equal(statsA.data.statistics.repeated_people, 1);
  assert.equal(statsB.data.statistics.repeated_people, 0);
  assert.equal(
    (
      await request(
        `/api/account/statistics?${period}&account_id=${b.data.user.id}`,
        undefined,
        cookieA,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/api/account/statistics?from=2030-01-02&to=2030-01-01`,
        undefined,
        cookieA,
      )
    ).status,
    400,
  );
  const changedCode = code();
  const updated = await request(
    "/api/admin/users",
    {
      action: "update",
      id: a.data.user.id,
      name,
      role: "officer",
      active: true,
      officer_code: changedCode.replace("-", "").toLowerCase(),
      officer_grade: "Sargento 1°",
    },
    adminCookie,
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(
    (await request("/api/session", { identifier: codeA, password: personal }))
      .status,
    401,
  );
  const renamed = await request("/api/session", {
    identifier: changedCode.replace("-", "").toLowerCase(),
    password: personal,
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(
    (await request("/api/session", undefined, renamed.cookie)).data.user
      .officer_grade,
    "Sargento 1°",
  );
  assert.equal(
    (
      await request(
        `/api/account/statistics?${period}`,
        undefined,
        renamed.cookie,
      )
    ).data.statistics.total_controls,
    2,
  );
  assert.equal(
    (
      await db
        .from("controls")
        .select("officer_code")
        .eq("id", first.id)
        .single()
    ).data?.officer_code,
    codeA,
  );
  assert.equal(
    (await db.from("controls").select("art12bis").eq("id", first.id).single())
      .data?.art12bis.officer_grade,
    "Sargento 2°",
  );
  await ageSyntheticControls(db, first.person_id);
  const promoted = await save(renamed.cookie, first.person_id);
  assert.equal(promoted.art12bis.officer_grade, "Sargento 1°");
  assert.equal(promoted.officer_code, changedCode);
  assert.equal(
    (
      await request(
        "/api/admin/users",
        {
          action: "update",
          id: a.data.user.id,
          name,
          role: "officer",
          active: false,
          officer_code: changedCode,
        },
        adminCookie,
      )
    ).status,
    200,
  );
  assert.ok(
    [401, 403].includes(
      (
        await request(
          `/api/account/statistics?${period}`,
          undefined,
          renamed.cookie,
        )
      ).status,
    ),
  );
  console.log(
    "PASS: estadísticas propias aisladas por cuenta, atribución automática, fechas, cambio de código y suspensión.",
  );
  const deleted = await request(
    "/api/admin/users",
    { action: "delete", id: a.data.user.id },
    adminCookie,
  );
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  ownedUsers.delete(a.data.user.id);
  assert.equal(
    (
      await request("/api/session", {
        identifier: changedCode,
        password: personal,
      })
    ).status,
    401,
  );
  assert.ok(
    [401, 403].includes(
      (await request("/api/controls", undefined, renamed.cookie)).status,
    ),
  );
  assert.ok((await db.auth.admin.getUserById(a.data.user.id)).error);
  const preserved = await db
    .from("controls")
    .select("created_by,officer_code,officer,photo_path,art12bis,acta_person")
    .eq("id", first.id)
    .single();
  assert.ifError(preserved.error);
  assert.equal(preserved.data.created_by, a.data.user.id);
  assert.equal(preserved.data.officer, name);
  assert.equal(preserved.data.officer_code, codeA);
  assert.equal(preserved.data.art12bis.officer_grade, "Sargento 2°");
  assert.ok(preserved.data.acta_person);
  assert.equal(
    (
      await fetch(`${base}/api/controls/${first.id}/document?format=pdf`, {
        headers: { Cookie: adminCookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/controls/${first.id}/photo`, {
        headers: { Cookie: adminCookie },
      })
    ).status,
    200,
  );
  assert.equal((await request(accessPath, undefined, adminCookie)).status, 404);
  assert.equal(
    (
      await db
        .from("user_access_events")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", a.data.user.id)
    ).count,
    0,
  );
  console.log(
    "PASS: accesos reales protegidos, eliminación administrativa, sesión revocada y controles/fotos/PDF conservados.",
  );
} finally {
  if (ownedPeople.size) {
    assert.ifError(
      (
        await db
          .from("controls")
          .delete()
          .in("person_id", [...ownedPeople])
      ).error,
    );
    assert.ifError(
      (
        await db
          .from("persons")
          .delete()
          .in("id", [...ownedPeople])
      ).error,
    );
  }
  if (photos.size)
    assert.ifError(
      (await db.storage.from(PHOTO_BUCKET).remove([...photos])).error,
    );
  for (const id of ownedUsers)
    assert.ifError((await db.auth.admin.deleteUser(id)).error);
  console.log("Cuentas, controles y fotos ficticios eliminados.");
}
