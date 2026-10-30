import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { PHOTO_BUCKET, PHOTO_MAX_BYTES } from "../src/lib/photo-policy";
import { ageSyntheticControls } from "./control-time-fixture";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const anonymous = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const prefixes = new Set<string>();
let actorId: string | undefined;
let personId: string | undefined;
let cookie = "";
const fixture = await photoFixture();
const stamp = Date.now();
const initial = {
  request_id: crypto.randomUUID(),
  identity: {
    document_type: "Pasaporte",
    document_number: `PHOTOQA${stamp}`,
    issuing_country: "Chile",
  },
  personal: {
    first_names: "Prueba temporal",
    last_names: "Fotografía",
    paternal_surname: "Fotografía",
    maternal_surname: "",
    sex: "No especificado",
    nationality: "Chile",
    birth_date: "1990-01-01",
    address: "Calle de prueba 123",
    commune: "Santiago",
    phone: "+56 9 0000 0000",
  },
  control: {
    art12bis: {
      lesions: "Sin lesiones",
      presented_document: "Documento sintético de prueba",
    },
    reason: "Control de identidad",
    location: "Prueba técnica",
    officer: "Prueba fotográfica",
    notes: "Prueba automatizada: se elimina al finalizar.",
  },
};
async function save(
  payload: unknown,
  file: Uint8Array | null = fixture,
  confirmed = true,
  session = cookie,
) {
  const id = (payload as { request_id: string }).request_id;
  prefixes.add(id);
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (file)
    form.set(
      "photo",
      new Blob([new Uint8Array(file)], { type: "image/jpeg" }),
      "photo.jpg",
    );
  form.set("photo_confirmed", String(confirmed));
  form.set(
    "document_photo",
    new Blob([new Uint8Array(await photoFixture())], { type: "image/jpeg" }),
    "document.jpg",
  );
  form.set("document_photo_confirmed", "true");
  const response = await fetch(base + "/api/controls", {
    method: "POST",
    headers: { Cookie: session, Origin: base },
    body: form,
  });
  return { status: response.status, data: await response.json() };
}
try {
  const email = `qa-photo-${stamp}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "officer" },
  });
  assert.equal(created.error, null);
  actorId = created.data.user!.id;
  const login = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.equal((await save(initial, fixture, true, "")).status, 401);
  assert.equal((await save(initial, null)).status, 400);
  assert.equal((await save(initial, fixture, false)).status, 400);
  assert.equal((await save(initial, Buffer.from("fake jpeg"))).status, 400);
  assert.equal(
    (await save(initial, Buffer.alloc(1024 * 1024 + 25000))).status,
    413,
  );
  const bypass = await db.rpc("register_control", {
    payload: initial,
    actor_id: actorId,
  });
  assert.ok(bypass.error);
  console.log(
    "PASS: no photo, false photo declaration, invalid/oversized input and RPC bypass rejected",
  );

  const attempts = await Promise.all([
    save(initial),
    save(initial),
    save(initial),
  ]);
  for (const result of attempts)
    assert.equal(result.status, 201, JSON.stringify(result.data));
  const control = attempts[0].data.control;
  personId = control.person_id;
  assert.ok(attempts.every((result) => result.data.control.id === control.id));
  const objects = await db.storage.from(PHOTO_BUCKET).list(initial.request_id);
  assert.equal(objects.data?.length, 2);
  assert.ok(control.photo_bytes <= PHOTO_MAX_BYTES);
  const first = await fetch(`${base}/api/controls/${control.id}/photo`, {
    headers: { Cookie: cookie },
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/webp");
  assert.ok(first.headers.get("cache-control")?.includes("no-store"));
  const original = Buffer.from(await first.arrayBuffer());
  assert.equal(original.length, control.photo_bytes);
  const meta = await sharp(original).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width! <= 640 && meta.height! <= 640);
  assert.equal(meta.exif, undefined);
  console.log(
    `PASS: concurrent save keeps exactly one control and two private WebP images (${original.length} bytes)`,
  );

  await ageSyntheticControls(db, personId!);
  const followup = await save(
    {
      request_id: crypto.randomUUID(),
      person_id: personId,
      control: initial.control,
    },
    await photoFixture("#cad3f0"),
  );
  assert.equal(followup.status, 201);
  assert.notEqual(followup.data.control.photo_path, control.photo_path);
  const preserved = await db.storage
    .from(PHOTO_BUCKET)
    .download(control.photo_path);
  assert.deepEqual(Buffer.from(await preserved.data!.arrayBuffer()), original);
  const duplicateId = crypto.randomUUID();
  assert.equal(
    (await save({ ...initial, request_id: duplicateId })).status,
    409,
  );
  assert.equal(
    (await db.storage.from(PHOTO_BUCKET).list(duplicateId)).data?.length,
    0,
  );
  console.log(
    "PASS: each control has its own photo; history preserved and failed saves cleaned up",
  );

  assert.equal(
    (await fetch(`${base}/api/controls/${control.id}/photo`)).status,
    401,
  );
  assert.ok(
    (await anonymous.storage.from(PHOTO_BUCKET).download(control.photo_path))
      .error,
  );
  const publicUrl = db.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(control.photo_path).data.publicUrl;
  assert.notEqual((await fetch(publicUrl)).status, 200);
  assert.equal(
    (await db.auth.admin.updateUserById(actorId, { ban_duration: "1h" })).error,
    null,
  );
  assert.ok(
    [401, 403].includes(
      (
        await fetch(`${base}/api/controls/${control.id}/photo`, {
          headers: { Cookie: cookie },
        })
      ).status,
    ),
  );
  console.log(
    "PASS: anonymous, public URL and suspended-session photo access denied",
  );
} finally {
  if (actorId) {
    const records = await db
      .from("controls")
      .select("person_id")
      .eq("created_by", actorId);
    assert.equal(records.error, null);
    const people = [
      ...new Set((records.data || []).map((row) => row.person_id)),
    ];
    assert.equal(
      (await db.from("controls").delete().eq("created_by", actorId)).error,
      null,
    );
    if (people.length)
      assert.equal(
        (await db.from("persons").delete().in("id", people)).error,
        null,
      );
    assert.equal((await db.auth.admin.deleteUser(actorId)).error, null);
  }
  for (const prefix of prefixes) {
    const objects = await db.storage.from(PHOTO_BUCKET).list(prefix);
    assert.equal(objects.error, null);
    if (objects.data?.length)
      assert.equal(
        (
          await db.storage
            .from(PHOTO_BUCKET)
            .remove(objects.data.map((object) => `${prefix}/${object.name}`))
        ).error,
        null,
      );
  }
  console.log("Temporary photos, records and account removed.");
}
