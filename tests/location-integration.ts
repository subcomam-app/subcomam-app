import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { PHOTO_BUCKET } from "../src/lib/photo-policy";
import { documentFields } from "../src/lib/control-document";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
// A public landmark, never the test runner's physical position.
const coordinates = { latitude: -33.4372, longitude: -70.6506 };
const code = `${randomInt(100000, 999999)}-Q`;
const password = randomBytes(24).toString("base64url");
let userId: string | undefined;

async function request(
  path: string,
  body: unknown,
  cookie = "",
  origin = base,
) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  };
}

try {
  assert.equal(
    (await request("/api/location/reverse", coordinates)).status,
    401,
  );
  const created = await db.auth.admin.createUser({
    email: `qa-location-${randomUUID()}@example.com`,
    password,
    email_confirm: true,
    app_metadata: {
      role: "officer",
      officer_code: code,
      officer_grade: "Cabo 1°",
    },
    user_metadata: { full_name: "Prueba de dirección automática" },
  });
  assert.ifError(created.error);
  userId = created.data.user!.id;
  const signed = await request("/api/session", { identifier: code, password });
  assert.equal(signed.status, 200);
  const cookie = signed.cookie;
  assert.equal(
    (
      await request(
        "/api/location/reverse",
        coordinates,
        cookie,
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/location/reverse",
        { latitude: 91, longitude: 0 },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/location/reverse",
        { ...coordinates, document: "no transmitir" },
        cookie,
      )
    ).status,
    400,
  );
  const located = await request("/api/location/reverse", coordinates, cookie);
  assert.equal(located.status, 200, located.data.error);
  assert.match(located.data.address, /Santiago/);
  assert.ok(located.data.address.length <= 200);

  const form = new FormData();
  form.set(
    "payload",
    JSON.stringify({
      request_id: randomUUID(),
      identity: {
        document_type: "Pasaporte",
        document_number: `QAGPS${Date.now()}`,
        issuing_country: "Chile",
      },
      personal: {
        first_names: "Prueba",
        last_names: "Dirección automática",
        paternal_surname: "Dirección automática",
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
        reason: "Fiscalización migratoria",
        location: located.data.address,
        notes: "Prueba sintética que se elimina al finalizar.",
      },
    }),
  );
  form.set(
    "photo",
    new Blob([new Uint8Array(await photoFixture())], { type: "image/jpeg" }),
    "test.jpg",
  );
  form.set("photo_confirmed", "true");
  form.set(
    "document_photo",
    new Blob([new Uint8Array(await photoFixture())], { type: "image/jpeg" }),
    "document.jpg",
  );
  form.set("document_photo_confirmed", "true");
  const saved = await fetch(base + "/api/controls", {
    method: "POST",
    headers: { Origin: base, Cookie: cookie },
    body: form,
  });
  const record = await saved.json();
  assert.equal(saved.status, 201, record.error);
  assert.equal(record.control.location, located.data.address);
  const stored = await db
    .from("controls")
    .select("*")
    .eq("id", record.control.id)
    .single();
  assert.ifError(stored.error);
  assert.equal(stored.data!.location, located.data.address);
  assert.equal(documentFields(stored.data!).LOCATION, located.data.address);
  const pdf = await fetch(
    `${base}/api/controls/${record.control.id}/document?format=pdf`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") || "", /application\/pdf/);
  console.log(
    "PASS: dirección real desde coordenadas de prueba, permisos, guardado en control y acta PDF.",
  );
} finally {
  if (userId) {
    const controls = await db
      .from("controls")
      .select("id,person_id,photo_path,document_photo_path")
      .eq("created_by", userId);
    assert.ifError(controls.error);
    for (const control of controls.data || []) {
      assert.ifError(
        (await db.from("controls").delete().eq("id", control.id)).error,
      );
      if (control.photo_path)
        assert.ifError(
          (
            await db.storage
              .from(PHOTO_BUCKET)
              .remove(
                [control.photo_path, control.document_photo_path].filter(
                  Boolean,
                ),
              )
          ).error,
        );
      assert.ifError(
        (
          await db
            .from("persons")
            .delete()
            .eq("id", control.person_id)
            .like("document_number", "QAGPS%")
        ).error,
      );
    }
    assert.ifError((await db.auth.admin.deleteUser(userId)).error);
  }
  console.log("Cuenta, control y foto de prueba eliminados.");
}
