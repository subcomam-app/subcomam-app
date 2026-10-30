import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { photoFixture } from "./photo-fixture";
import { PHOTO_BUCKET } from "../src/lib/photo-policy";
import { compressControlPhoto } from "../src/lib/photo-compression";
import { testSession } from "./test-session";
import { ageSyntheticControls } from "./control-time-fixture";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);
const ownPeople = new Set<string>();
const ownPhotos = new Set<string>();
const fixture = await photoFixture();
const session = await testSession(admin, base);
const doc = `QA${Date.now()}`;
const identity = {
  document_type: "Pasaporte",
  document_number: doc,
  issuing_country: "  peru  ",
};
const personal = {
  first_names: "Prueba técnica",
  last_names: "Automatizada",
  paternal_surname: "Automatizada",
  maternal_surname: "",
  sex: "No especificado",
  nationality: "  pErU  ",
  birth_date: "1990-01-01",
  address: "Calle de prueba 123",
  commune: "Santiago",
  phone: "+56 9 0000 0000",
};
const control = {
  art12bis: {
    lesions: "Sin lesiones",
    presented_document: "Documento sintético de prueba",
  },
  reason: "Control de identidad",
  officer: "Prueba técnica automatizada",
  location: "Entorno de pruebas",
  notes: "Registro ficticio temporal; se elimina al finalizar la prueba.",
};
async function post(path: string, data: unknown) {
  let body: string | FormData = JSON.stringify(data);
  if (path === "/api/controls") {
    body = new FormData();
    body.set("payload", JSON.stringify(data));
    body.set(
      "photo",
      new Blob([new Uint8Array(fixture)], { type: "image/jpeg" }),
      "test.jpg",
    );
    body.set("photo_confirmed", "true");
    body.set(
      "document_photo",
      new Blob([new Uint8Array(await photoFixture())], { type: "image/jpeg" }),
      "document.jpg",
    );
    body.set("document_photo_confirmed", "true");
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      ...(typeof body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      Origin: base,
      Cookie: session.cookie,
    },
    body,
  });
  const result = await response.json();
  if (result.control?.photo_path) ownPhotos.add(result.control.photo_path);
  if (result.control?.document_photo_path)
    ownPhotos.add(result.control.document_photo_path);
  if (result.control?.person_id) ownPeople.add(result.control.person_id);
  return { status: response.status, data: result };
}
try {
  const request = {
    request_id: crypto.randomUUID(),
    identity,
    personal,
    control,
  };
  for (const field of ["address", "commune", "phone"] as const) {
    for (const missing of [undefined, "", "   "]) {
      const invalidContact = await post("/api/controls", {
        ...request,
        request_id: crypto.randomUUID(),
        personal: { ...personal, [field]: missing },
      });
      assert.equal(invalidContact.status, 400);
    }
  }
  console.log(
    "PASS: cada dato de contacto es obligatorio; vacíos y espacios rechazados.",
  );
  const first = await post("/api/controls", request);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  ownPeople.add(first.data.control.person_id);
  const [retry1, retry2] = await Promise.all([
    post("/api/controls", request),
    post("/api/controls", request),
  ]);
  assert.equal(retry1.data.control.id, first.data.control.id);
  assert.equal(retry2.data.control.id, first.data.control.id);
  console.log(
    "PASS: nueva persona y control persistidos; reintentos concurrentes no duplican.",
  );

  const found = await post("/api/people/search", {
    type: "Pasaporte",
    country: "peru",
    query: doc.slice(0, -2),
  });
  assert.equal(found.status, 200);
  const person = found.data.people.find(
    (p: { id: string }) => p.id === first.data.control.person_id,
  );
  assert.ok(person);
  assert.equal(person.control_count, 1);
  assert.equal(person.first_names, personal.first_names);
  assert.equal(person.issuing_country, "Perú");
  assert.equal(person.nationality, "Perú");
  assert.equal(
    new Date(person.last_control_at).getTime(),
    new Date(first.data.control.controlled_at).getTime(),
  );
  const duplicate = await post("/api/controls", {
    ...request,
    request_id: crypto.randomUUID(),
  });
  assert.equal(duplicate.status, 409);
  for (const invalid of ["Peruu", "Otro", "Corea"]) {
    assert.equal(
      (
        await post("/api/controls", {
          ...request,
          request_id: crypto.randomUUID(),
          identity: { ...identity, issuing_country: invalid },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/api/controls", {
          ...request,
          request_id: crypto.randomUUID(),
          personal: { ...personal, nationality: invalid },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/api/people/search", {
          type: "Pasaporte",
          country: invalid,
          query: doc,
        })
      ).status,
      400,
    );
  }
  console.log(
    "PASS: búsqueda parcial, país normalizado, datos y último control; duplicado rechazado.",
  );

  await ageSyntheticControls(admin, person.id);
  const second = await post("/api/controls", {
    request_id: crypto.randomUUID(),
    person_id: person.id,
    control,
  });
  assert.equal(second.status, 201);
  const updated = await post("/api/people/search", {
    type: "Pasaporte",
    country: "Perú",
    query: doc,
  });
  assert.equal(updated.data.people[0].control_count, 2);
  assert.equal(
    new Date(updated.data.people[0].last_control_at).getTime(),
    new Date(second.data.control.controlled_at).getTime(),
  );
  const history = await fetch(`${base}/api/controls?person_id=${person.id}`, {
    headers: { Cookie: session.cookie },
  }).then((r) => r.json());
  assert.equal(history.count, 2);
  console.log(
    "PASS: segundo control conserva la ficha, actualiza la última fecha y mantiene historial.",
  );

  // Simulate an older saved record without contact details, using only this test's person.
  assert.ifError(
    (
      await admin
        .from("persons")
        .update({ address: "", commune: "", phone: "" })
        .eq("id", person.id)
    ).error,
  );
  const incomplete = await post("/api/controls", {
    request_id: crypto.randomUUID(),
    person_id: person.id,
    control,
  });
  assert.equal(incomplete.status, 400);
  const missingContact = await post("/api/controls", {
    request_id: crypto.randomUUID(),
    person_id: person.id,
    contact: { address: "Calle de prueba 456", commune: "Santiago", phone: "" },
    control,
  });
  assert.equal(missingContact.status, 400);
  const completedContact = {
    address: "Calle de prueba 456",
    commune: "Santiago",
    phone: "+56 9 0000 0001",
  };
  const completion = {
    request_id: crypto.randomUUID(),
    person_id: person.id,
    contact: completedContact,
    control,
  };
  await ageSyntheticControls(admin, person.id);
  const completed = await post("/api/controls", completion);
  assert.equal(completed.status, 201, JSON.stringify(completed.data));
  const savedContact = await admin
    .from("persons")
    .select("address, commune, phone")
    .eq("id", person.id)
    .single();
  assert.ifError(savedContact.error);
  assert.deepEqual(savedContact.data, completedContact);
  const completionRetry = await post("/api/controls", {
    ...completion,
    contact: { ...completedContact, phone: "+56 9 0000 0002" },
  });
  assert.equal(completionRetry.data.control.id, completed.data.control.id);
  assert.equal(
    (await admin.from("persons").select("phone").eq("id", person.id).single())
      .data?.phone,
    completedContact.phone,
  );
  console.log(
    "PASS: ficha antigua incompleta bloqueada; contactos guardados con el control y reintentos sin sobrescrituras.",
  );
  const rpcRequest = crypto.randomUUID();
  const rpcPhoto = await compressControlPhoto(fixture);
  const rpcPhotoPath = `${rpcRequest}/${crypto.randomUUID()}.webp`;
  assert.ifError(
    (
      await admin.storage
        .from(PHOTO_BUCKET)
        .upload(rpcPhotoPath, rpcPhoto.bytes, { contentType: "image/webp" })
    ).error,
  );
  ownPhotos.add(rpcPhotoPath);
  const rpcDocumentPath = `${rpcRequest}/${crypto.randomUUID()}.webp`;
  assert.ifError(
    (
      await admin.storage
        .from(PHOTO_BUCKET)
        .upload(rpcDocumentPath, rpcPhoto.bytes, { contentType: "image/webp" })
    ).error,
  );
  ownPhotos.add(rpcDocumentPath);
  const rejectedRpc = await admin.rpc("register_control", {
    actor_id: first.data.control.created_by,
    payload: {
      request_id: rpcRequest,
      person_id: person.id,
      contact: { ...completedContact, address: "No debe guardarse", phone: "" },
      control,
      document_photo: {
        path: rpcDocumentPath,
        bytes: rpcPhoto.bytes.byteLength,
        width: rpcPhoto.width,
        height: rpcPhoto.height,
      },
      photo: {
        path: rpcPhotoPath,
        bytes: rpcPhoto.bytes.byteLength,
        width: rpcPhoto.width,
        height: rpcPhoto.height,
      },
    },
  });
  assert.equal(rejectedRpc.error?.code, "PT400");
  assert.deepEqual(
    (
      await admin
        .from("persons")
        .select("address, commune, phone")
        .eq("id", person.id)
        .single()
    ).data,
    completedContact,
  );
  assert.equal(
    (
      await admin
        .from("controls")
        .select("id", { count: "exact", head: true })
        .eq("request_id", rpcRequest)
    ).count,
    0,
  );
  console.log(
    "PASS: Supabase rechaza contactos incompletos y revierte toda la actualización si el control falla.",
  );

  const otherCountry = await post("/api/controls", {
    ...request,
    request_id: crypto.randomUUID(),
    identity: { ...identity, issuing_country: "Colombia" },
  });
  assert.equal(otherCountry.status, 201);
  ownPeople.add(otherCountry.data.control.person_id);
  assert.notEqual(otherCountry.data.control.person_id, person.id);
  const invalid = await post("/api/controls", {
    ...request,
    request_id: crypto.randomUUID(),
    identity: {
      document_type: "RUT",
      document_number: "12345678-9",
      issuing_country: "Chile",
    },
  });
  assert.equal(invalid.status, 400);
  const missing = await post("/api/controls", {
    request_id: crypto.randomUUID(),
    person_id: crypto.randomUUID(),
    control,
  });
  assert.equal(missing.status, 404);
  const crossOrigin = await fetch(`${base}/api/controls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
      Cookie: session.cookie,
    },
    body: JSON.stringify(request),
  });
  assert.equal(crossOrigin.status, 403);
  console.log(
    "PASS: países distintos no colisionan; RUT inválido, persona inexistente y origen ajeno rechazados.",
  );

  for (const table of ["persons", "controls", "person_summary"]) {
    const result = await anon.from(table).select("*");
    assert.ok(
      result.error || result.data?.length === 0,
      `Acceso anónimo a ${table}`,
    );
  }
  const anonWrite = await anon.rpc("register_control", { payload: request });
  assert.ok(anonWrite.error);
  console.log("PASS: consultas y escritura anónimas bloqueadas por Supabase.");
} finally {
  if (ownPeople.size) {
    const ids = [...ownPeople];
    const removedControls = await admin
      .from("controls")
      .delete()
      .in("person_id", ids);
    assert.ifError(removedControls.error);
    const removedPeople = await admin.from("persons").delete().in("id", ids);
    assert.ifError(removedPeople.error);
  }
  if (ownPhotos.size)
    assert.ifError(
      (await admin.storage.from(PHOTO_BUCKET).remove([...ownPhotos])).error,
    );
  await session.cleanup();
  console.log(
    "Limpieza: eliminados únicamente los registros ficticios creados por esta prueba.",
  );
}
