import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { PHOTO_BUCKET } from "../src/lib/photo-policy";
import { CONTROL_INTERVAL_MS } from "../src/lib/control-interval";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const timedFetch: typeof fetch = (url, init = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
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
  email: string;
  password: string;
}[] = [];
const prefixes = new Set<string>();
let personId: string | undefined;
const doc = `QAINTERVAL${Date.now()}`;
const fixture = await photoFixture();
const initial = {
  request_id: randomUUID(),
  identity: {
    document_type: "Pasaporte",
    document_number: doc,
    issuing_country: "Chile",
  },
  personal: {
    first_names: "Prueba temporal",
    last_names: "Intervalo de control",
    paternal_surname: "Intervalo de control",
    maternal_surname: "",
    sex: "No especificado",
    nationality: "Chile",
    birth_date: "1990-01-01",
    address: "Calle de prueba 123",
    commune: "Santiago",
    phone: "00000000",
  },
  control: {
    reason: "Fiscalización migratoria",
    location: "Prueba de intervalo",
    art12bis: {
      lesions: "Sin lesiones",
      presented_document: "Documento sintético",
    },
  },
};
async function account(role: "admin" | "officer") {
  const email = `qa-interval-${randomUUID()}@example.com`,
    password = randomBytes(24).toString("base64url");
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role,
      must_change_password: false,
      ...(role === "officer"
        ? { officer_code: `${randomInt(100000, 999999)}-Q` }
        : {}),
    },
    user_metadata: { full_name: `Prueba intervalo ${role}` },
  });
  assert.ifError(created.error);
  const result = { id: created.data.user!.id, email, password, cookie: "" };
  accounts.push(result);
  const login = await timedFetch(base + "/api/session", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, portal: role }),
  });
  assert.equal(login.status, 200);
  result.cookie = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  return result;
}
async function save(cookie: string, payload: unknown) {
  prefixes.add((payload as { request_id: string }).request_id);
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const key of ["photo", "document_photo"]) {
    form.set(
      key,
      new Blob([new Uint8Array(fixture)], { type: "image/jpeg" }),
      `${key}.jpg`,
    );
    form.set(`${key}_confirmed`, "true");
  }
  const response = await timedFetch(base + "/api/controls", {
    method: "POST",
    headers: { Cookie: cookie, Origin: base },
    body: form,
  });
  const data = await response.json();
  if (data.control) personId = data.control.person_id;
  return { status: response.status, data };
}
async function remove(id: string, cookie: string, origin = base) {
  const response = await timedFetch(`${base}/api/controls/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: origin },
  });
  return { status: response.status, data: await response.json() };
}
async function availability(cookie: string) {
  const response = await timedFetch(
    `${base}/api/people/${personId}/availability`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  return (await response.json()).availability;
}
async function ownTotal(cookie: string) {
  const response = await timedFetch(`${base}/api/account/statistics/summary`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const { summary } = await response.json();
  assert.equal(
    summary.nationalities.reduce(
      (sum: number, row: { historical: number }) => sum + row.historical,
      0,
    ),
    summary.totals.historical,
  );
  return summary.totals.historical;
}
try {
  const admin = await account("admin"),
    a = await account("officer"),
    b = await account("officer");
  const firstResult = await save(a.cookie, initial);
  assert.equal(firstResult.status, 201, JSON.stringify(firstResult.data));
  const first = firstResult.data.control;
  assert.equal((await save(a.cookie, initial)).data.control.id, first.id);
  const blocked = await save(b.cookie, {
    request_id: randomUUID(),
    person_id: personId,
    control: initial.control,
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "CONTROL_INTERVAL");
  assert.equal(
    Date.parse(blocked.data.available_at) - Date.parse(first.controlled_at),
    CONTROL_INTERVAL_MS,
  );
  assert.equal((await availability(b.cookie)).can_control, false);
  assert.equal((await remove(first.id, "")).status, 401);
  assert.equal((await remove(first.id, a.cookie)).status, 403);
  assert.equal((await remove(first.id, b.cookie)).status, 403);
  assert.equal(
    (await remove(first.id, admin.cookie, "https://invalid.example")).status,
    403,
  );
  assert.equal((await remove(randomUUID(), admin.cookie)).status, 404);
  assert.equal(
    (
      await db.rpc("delete_control_for_correction", {
        target_id: first.id,
        administrator_id: a.id,
      })
    ).error?.code,
    "PT403",
  );
  console.log(
    "PASS: restricción entre funcionarios, hora de disponibilidad, reintento idempotente y eliminación solo administrativa.",
  );

  // Exercise the exact database boundary without waiting; every row belongs to
  // this synthetic person and uses unique image metadata.
  const older = new Date(Date.now() - CONTROL_INTERVAL_MS - 3600000);
  assert.ifError(
    (
      await db
        .from("controls")
        .update({ controlled_at: older.toISOString() })
        .eq("id", first.id)
    ).error,
  );
  const { id: _id, ...fields } = first;
  const boundary = {
    ...fields,
    request_id: randomUUID(),
    photo_path: `${randomUUID()}/${randomUUID()}.webp`,
    document_photo_path: `${randomUUID()}/${randomUUID()}.webp`,
    controlled_at: new Date(
      older.getTime() + CONTROL_INTERVAL_MS - 1,
    ).toISOString(),
  };
  assert.equal(
    (await db.from("controls").insert(boundary)).error?.code,
    "PT409",
  );
  const exact = await db
    .from("controls")
    .insert({
      ...boundary,
      controlled_at: new Date(
        older.getTime() + CONTROL_INTERVAL_MS,
      ).toISOString(),
    })
    .select("id")
    .single();
  assert.ifError(exact.error);
  assert.ifError(
    (await db.from("controls").delete().eq("id", exact.data!.id)).error,
  );
  assert.equal((await availability(b.cookie)).can_control, true);

  const payloads = [a, b].map(() => ({
    request_id: randomUUID(),
    person_id: personId,
    control: initial.control,
  }));
  const races = await Promise.all([
    save(a.cookie, payloads[0]),
    save(b.cookie, payloads[1]),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
  const winnerIndex = races.findIndex((r) => r.status === 201),
    loserIndex = 1 - winnerIndex;
  const winner = races[winnerIndex].data.control,
    winnerCookie = [a, b][winnerIndex].cookie;
  const losingObjects = await db.storage
    .from(PHOTO_BUCKET)
    .list(payloads[loserIndex].request_id);
  assert.ifError(losingObjects.error);
  assert.equal(losingObjects.data!.length, 0);
  assert.equal(
    (await db.storage.from(PHOTO_BUCKET).list(payloads[winnerIndex].request_id))
      .data!.length,
    2,
  );
  console.log(
    "PASS: límite exacto de 8 horas y dos guardados simultáneos dejan un solo control, sin fotos huérfanas.",
  );

  assert.equal((await remove(first.id, admin.cookie)).status, 200);
  assert.equal(
    (await availability(b.cookie)).can_control,
    false,
    "Eliminar un control antiguo no omite uno más reciente.",
  );
  assert.equal(
    (await save(a.cookie, initial)).status,
    410,
    "Un reintento antiguo no recrea el control eliminado.",
  );
  const before = await ownTotal(winnerCookie);
  for (const result of await Promise.all([
    remove(winner.id, admin.cookie),
    remove(winner.id, admin.cookie),
  ]))
    assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(await ownTotal(winnerCookie), before - 1);
  assert.equal((await availability(b.cookie)).can_control, true);
  assert.equal((await availability(b.cookie)).last_control_at, null);
  assert.ok(
    (await db.from("persons").select("id").eq("id", personId!).single()).data,
  );
  for (const control of [first, winner]) {
    for (const suffix of [
      "photo",
      "photo?kind=document",
      "document?format=pdf",
    ]) {
      assert.equal(
        (
          await timedFetch(`${base}/api/controls/${control.id}/${suffix}`, {
            headers: { Cookie: admin.cookie },
          })
        ).status,
        404,
      );
    }
    assert.equal(
      (await db.storage.from(PHOTO_BUCKET).list(control.request_id)).data!
        .length,
      0,
    );
    assert.ok(
      (
        await db
          .from("control_deletions")
          .select("storage_cleaned_at")
          .eq("control_id", control.id)
          .single()
      ).data?.storage_cleaned_at,
    );
  }
  const replacement = await save(b.cookie, {
    request_id: randomUUID(),
    person_id: personId,
    control: {
      ...initial.control,
      art12bis: {
        ...initial.control.art12bis,
        lesions: "Dato corregido de prueba",
      },
    },
  });
  assert.equal(replacement.status, 201, JSON.stringify(replacement.data));
  assert.equal(
    replacement.data.control.art12bis.lesions,
    "Dato corregido de prueba",
  );
  assert.equal((await availability(a.cookie)).can_control, false);
  console.log(
    "PASS: eliminación y limpieza idempotentes, PDF y fotos retirados, estadísticas recalculadas y reingreso corregido inmediato.",
  );
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  assert.ok(
    (
      await anon.rpc("delete_control_for_correction", {
        target_id: replacement.data.control.id,
        administrator_id: admin.id,
      })
    ).error,
  );
  assert.ifError(
    (
      await anon.auth.signInWithPassword({
        email: a.email,
        password: a.password,
      })
    ).error,
  );
  assert.ok(
    (
      await anon.rpc("delete_control_for_correction", {
        target_id: replacement.data.control.id,
        administrator_id: admin.id,
      })
    ).error,
  );
  assert.ok((await anon.from("control_deletions").select("*")).error);
  console.log(
    "PASS: RPC y recibos privados, sin acceso directo desde el navegador.",
  );
} finally {
  const people = await db
    .from("persons")
    .select("id")
    .eq("document_number", doc);
  assert.ifError(people.error);
  const ids = people.data!.map((p) => p.id);
  if (ids.length) {
    assert.ifError(
      (await db.from("controls").delete().in("person_id", ids)).error,
    );
    assert.ifError(
      (await db.from("control_deletions").delete().in("person_id", ids)).error,
    );
    assert.ifError((await db.from("persons").delete().in("id", ids)).error);
  }
  for (const prefix of prefixes) {
    const objects = await db.storage.from(PHOTO_BUCKET).list(prefix);
    assert.ifError(objects.error);
    if (objects.data!.length)
      assert.ifError(
        (
          await db.storage
            .from(PHOTO_BUCKET)
            .remove(objects.data!.map((o) => `${prefix}/${o.name}`))
        ).error,
      );
  }
  for (const actor of accounts)
    assert.ifError((await db.auth.admin.deleteUser(actor.id)).error);
  console.log(
    "Cuentas, controles, recibos y fotografías sintéticas eliminados.",
  );
}
