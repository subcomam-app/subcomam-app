import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";
import { photoFixture, documentPhotoFixture } from "./photo-fixture";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import sharp from "sharp";
import { DOCUMENT_PHOTO_MAX_BYTES } from "../src/lib/photo-policy";
import { documentFixture } from "./document-fixture";
import { testSession } from "./test-session";
import { ageSyntheticControls } from "./control-time-fixture";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const documentNumber = `QAART${Date.now()}`;
const requests = [crypto.randomUUID(), crypto.randomUUID()];
let personId: string | undefined;
const photo = await photoFixture();
const documentPhoto = await documentPhotoFixture();
const session = await testSession(db, base);
const authorizedFetch: typeof fetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    headers: { ...init.headers, Cookie: session.cookie },
  });
async function save(
  request_id: string,
  art12bis: unknown,
  documentFile: Uint8Array | null = documentPhoto,
  confirmed = true,
  expectedStatus = 201,
) {
  const form = new FormData();
  form.set(
    "payload",
    JSON.stringify({
      request_id,
      ...(personId
        ? { person_id: personId }
        : {
            identity: {
              document_type: "DNI",
              document_number: documentNumber,
              issuing_country: "Perú",
            },
            personal: {
              first_names: "Prueba acta",
              last_names: "Temporal",
              paternal_surname: "Temporal",
              maternal_surname: "",
              sex: "No especificado",
              nationality: "Perú",
              birth_date: "1990-01-01",
              address: "Calle de prueba 123",
              commune: "Santiago",
              phone: "+56 9 0000 0000",
            },
          }),
      control: {
        reason: "Control de identidad",
        location: "Unidad de prueba",
        art12bis,
      },
    }),
  );
  form.set(
    "photo",
    new Blob([new Uint8Array(photo)], { type: "image/jpeg" }),
    "photo.jpg",
  );
  form.set("photo_confirmed", "true");
  if (documentFile)
    form.set(
      "document_photo",
      new Blob([new Uint8Array(documentFile)], { type: "image/jpeg" }),
      "document.jpg",
    );
  form.set("document_photo_confirmed", String(confirmed));
  const response = await authorizedFetch(base + "/api/controls", {
    method: "POST",
    headers: { Origin: base },
    body: form,
  });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(data));
  return data.control;
}

try {
  for (const missing of [
    undefined,
    null,
    {},
    { lesions: "", presented_document: "DNI" },
    { lesions: "Sin lesiones", presented_document: " \t " },
  ])
    await save(requests[0], missing, documentPhoto, true, 400);
  await save(
    requests[0],
    documentFixture.art12bis,
    new Uint8Array(),
    true,
    400,
  );
  await save(requests[0], documentFixture.art12bis, documentPhoto, false, 400);
  await save(
    requests[0],
    documentFixture.art12bis,
    Buffer.from("not a document photo"),
    true,
    400,
  );
  const saved = await save(requests[0], {
    ...documentFixture.art12bis,
    number: "NO_USAR",
    pdi_officer: "NO_USAR",
    pdi_grade: "NO_USAR",
    presented_document: "Pasaporte INCORRECTO999",
  });
  personId = saved.person_id;
  assert.equal(saved.art12bis.lesions, "Sin lesiones");
  assert.equal(saved.art12bis.presented_document, `DNI N.º ${documentNumber}`);
  assert.equal(saved.acta_person.document_number, documentNumber);
  for (const key of ["lesions", "presented_document"]) {
    const rejected = await db.from("controls").insert({
      person_id: saved.person_id,
      request_id: crypto.randomUUID(),
      reason: saved.reason,
      location: saved.location,
      officer: saved.officer,
      created_by: saved.created_by,
      art12bis: { ...saved.art12bis, [key]: " \t " },
      photo_path: saved.photo_path,
      photo_bytes: saved.photo_bytes,
      photo_width: saved.photo_width,
      photo_height: saved.photo_height,
      document_photo_path: saved.document_photo_path,
      document_photo_bytes: saved.document_photo_bytes,
      document_photo_width: saved.document_photo_width,
      document_photo_height: saved.document_photo_height,
    });
    assert.equal(rejected.error?.code, "PT423", key);
  }
  assert.ok(
    saved.document_photo_path && saved.document_photo_path !== saved.photo_path,
  );
  assert.ok(saved.document_photo_bytes <= DOCUMENT_PHOTO_MAX_BYTES);
  const storedDocument = await authorizedFetch(
    `${base}/api/controls/${saved.id}/photo?kind=document`,
  );
  assert.equal(storedDocument.status, 200);
  const documentBytes = Buffer.from(await storedDocument.arrayBuffer());
  const documentMetadata = await sharp(documentBytes).metadata();
  assert.equal(documentMetadata.format, "webp");
  assert.equal(documentMetadata.exif, undefined);
  assert.ok(
    documentMetadata.width! > 640,
    "Document text retains higher resolution than portrait",
  );
  assert.equal(
    (await fetch(`${base}/api/controls/${saved.id}/photo?kind=document`))
      .status,
    401,
  );
  const otherSession = await testSession(db, base);
  try {
    for (const suffix of ["photo?kind=document", "document?format=pdf"])
      assert.equal(
        (
          await fetch(`${base}/api/controls/${saved.id}/${suffix}`, {
            headers: { Cookie: otherSession.cookie },
          })
        ).status,
        404,
      );
  } finally {
    await otherSession.cleanup();
  }
  assert.equal(saved.acta_version, 1);
  assert.equal(saved.acta_person.first_names, "Prueba acta");
  for (const key of ["number", "pdi_officer", "pdi_grade"])
    assert.equal(saved.art12bis[key], "");
  assert.equal(
    (await save(requests[0], documentFixture.art12bis)).id,
    saved.id,
    "Retry returns the original control",
  );
  assert.equal(
    (
      await db
        .from("persons")
        .update({ first_names: "Prueba nombre editado posteriormente" })
        .eq("id", personId)
    ).error,
    null,
  );
  const response = await authorizedFetch(
    `${base}/api/controls/${saved.id}/document`,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /wordprocessingml/);
  assert.match(
    response.headers.get("content-disposition")!,
    /attachment; filename="acta-art12bis-/,
  );
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const word = new PizZip(bytes);
  const xml = word.file("word/document.xml")!.asText();
  assert.ok(word.file("word/media/control-person.jpg"));
  assert.ok(word.file("word/media/control-document.jpg"));
  assert.ok(xml.includes("REGISTRO FOTOGRÁFICO DEL CONTROL"));
  assert.ok(
    xml.includes("Prueba acta Temporal"),
    "Saved identity survives later edits",
  );
  assert.ok(!xml.includes("Prueba nombre editado posteriormente"));
  assert.ok(xml.includes(`DNI N.º ${documentNumber}`));
  assert.ok(!xml.includes("INCORRECTO999"));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(xml));
  assert.ok(!xml.includes("NO_USAR"));
  await writeFile("test-results/acta/api-download.docx", bytes);
  const pdfResponse = await authorizedFetch(
    `${base}/api/controls/${saved.id}/document?format=pdf`,
  );
  assert.equal(pdfResponse.status, 200);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  const pdf = await PDFDocument.load(pdfBytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(
    pdf
      .getPage(1)
      .node.Resources()!
      .lookupMaybe(PDFName.of("XObject"), PDFDict)!
      .keys().length,
    2,
  );
  await writeFile("test-results/acta/api-original-format.pdf", pdfBytes);
  await ageSyntheticControls(db, personId!);
  const automatic = await save(
    requests[1],
    documentFixture.art12bis,
    null,
    false,
  );
  for (const key of ["path", "bytes", "width", "height"])
    assert.equal(automatic[`document_photo_${key}`], null);
  assert.ok(automatic.photo_path);
  assert.equal(
    (await save(requests[1], documentFixture.art12bis, null, false)).id,
    automatic.id,
  );
  const stored = await db.storage.from("control-photos").list(requests[1]);
  assert.ifError(stored.error);
  assert.equal(
    stored.data!.length,
    1,
    "Solo se almacena la foto de la persona",
  );
  const optionalPdfResponse = await authorizedFetch(
    `${base}/api/controls/${automatic.id}/document?format=pdf`,
  );
  assert.equal(optionalPdfResponse.status, 200);
  const optionalPdfBytes = Buffer.from(await optionalPdfResponse.arrayBuffer());
  const optionalPdf = await PDFDocument.load(optionalPdfBytes);
  assert.equal(optionalPdf.getPageCount(), 2);
  assert.equal(
    optionalPdf
      .getPage(1)
      .node.Resources()!
      .lookupMaybe(PDFName.of("XObject"), PDFDict)!
      .keys().length,
    1,
  );
  await writeFile(
    "test-results/acta/api-without-document-photo.pdf",
    optionalPdfBytes,
  );
  const optionalWordResponse = await authorizedFetch(
    `${base}/api/controls/${automatic.id}/document`,
  );
  assert.equal(optionalWordResponse.status, 200);
  const optionalWord = new PizZip(await optionalWordResponse.arrayBuffer());
  assert.ok(optionalWord.file("word/media/control-person.jpg"));
  assert.equal(optionalWord.file("word/media/control-document.jpg"), null);
  assert.ok(
    optionalWord
      .file("word/document.xml")!
      .asText()
      .includes("No se adjuntó imagen del documento en este control."),
  );
  assert.equal(
    (
      await authorizedFetch(
        `${base}/api/controls/${automatic.id}/photo?kind=document`,
      )
    ).status,
    404,
  );
  assert.equal(
    automatic.art12bis.presented_document,
    `DNI N.º ${documentNumber}`,
  );
  assert.equal(automatic.acta_version, 1);
  assert.equal(
    automatic.acta_person.first_names,
    "Prueba nombre editado posteriormente",
  );
  assert.equal(automatic.officer, "Prueba temporal de integración");
  await ageSyntheticControls(db, personId!);
  const { id: _id, controlled_at: _date, ...direct } = automatic;
  const directRequest = crypto.randomUUID();
  const directInsert = await db
    .from("controls")
    .insert({
      ...direct,
      request_id: directRequest,
      photo_path: `${directRequest}/${crypto.randomUUID()}.webp`,
      art12bis: {
        ...automatic.art12bis,
        presented_document: "Pasaporte INCORRECTO999",
      },
    })
    .select()
    .single();
  assert.ifError(directInsert.error);
  assert.equal(
    directInsert.data.art12bis.presented_document,
    `DNI N.º ${documentNumber}`,
    "Database insert independently derives the document from the saved identity",
  );
  assert.equal(
    (
      await authorizedFetch(
        `${base}/api/controls/${automatic.id}/document?format=pdf`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await authorizedFetch(
        `${base}/api/controls/${crypto.randomUUID()}/document`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await authorizedFetch(`${base}/api/controls/invalid/document`)).status,
    400,
  );
  console.log(
    "PASS: actas Word/PDF automáticas, datos del funcionario desde su cuenta, snapshot e idempotencia.",
  );
} finally {
  const people = await db
    .from("persons")
    .select("id")
    .eq("document_number", documentNumber)
    .eq("document_type", "DNI")
    .eq("issuing_country", "Perú");
  assert.equal(people.error, null);
  for (const person of people.data || []) {
    assert.equal(
      (await db.from("controls").delete().eq("person_id", person.id)).error,
      null,
    );
    assert.equal(
      (await db.from("persons").delete().eq("id", person.id)).error,
      null,
    );
  }
  for (const request of requests) {
    const listed = await db.storage.from("control-photos").list(request);
    assert.equal(listed.error, null);
    if (listed.data?.length)
      assert.equal(
        (
          await db.storage
            .from("control-photos")
            .remove(listed.data.map((f) => `${request}/${f.name}`))
        ).error,
        null,
      );
  }
  await session.cleanup();
  console.log("Datos sintéticos de esta prueba eliminados.");
}
