import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import PizZip from "pizzip";
import { controlSchema, identityDocumentDescription } from "../src/lib/domain";
import {
  documentFields,
  generateControlDocument,
} from "../src/lib/control-document";
import { documentFixture } from "./document-fixture";
import { photoFixture } from "./photo-fixture";
import { actaImage } from "../src/lib/control-image-assets";

test("El Word incluye la persona y señala la imagen del documento no adjunta", async () => {
  const word = new PizZip(
    await generateControlDocument(documentFixture, {
      person: await actaImage(await photoFixture()),
    }),
  );
  assert.ok(word.file("word/media/control-person.jpg"));
  assert.equal(word.file("word/media/control-document.jpg"), null);
  const xml = word.file("word/document.xml")!.asText();
  assert.ok(
    xml.includes("No se adjuntó imagen del documento en este control."),
  );
  assert.ok(xml.includes("Pasaporte N.º QADOCUMENTO123"));
});

test("Todo nuevo control exige lesiones y documento sin aceptar datos del funcionario o PDI", () => {
  const input = controlSchema.parse({
    reason: "Control de identidad",
    location: "Unidad",
    officer: "Nombre falso",
    art12bis: {
      lesions: "Sin lesiones",
      presented_document: "Pasaporte N.º QA123",
      officer_grade: "Grado falso",
      number: "999",
      pdi_officer: "No usar",
      pdi_grade: "No usar",
    },
  });
  assert.ok(input.art12bis);
  assert.equal("officer" in input, false);
  assert.equal("officer_grade" in input.art12bis, false);
  for (const field of ["number", "pdi_officer", "pdi_grade"])
    assert.equal(field in input.art12bis, false);
  for (const art12bis of [
    undefined,
    null,
    {},
    { lesions: "", presented_document: "Pasaporte" },
    { lesions: "Sin lesiones", presented_document: " \t " },
  ])
    assert.equal(
      controlSchema.safeParse({
        reason: "Control de identidad",
        location: "Unidad",
        art12bis,
      }).success,
      false,
    );
});

test("La numeración y los campos PDI siempre quedan vacíos, incluso en controles anteriores", async () => {
  const previous = structuredClone(documentFixture);
  previous.art12bis!.number = "FOLIO_NO_USAR";
  previous.art12bis!.pdi_officer = "RECEPTOR_NO_USAR";
  previous.art12bis!.pdi_grade = "GRADO_NO_USAR";
  const fields = documentFields(previous);
  for (const field of [fields.NUMBER, fields.PDI_OFFICER, fields.PDI_GRADE])
    assert.match(field, /^_+$/);
  const xml = new PizZip(await generateControlDocument(previous))
    .file("word/document.xml")!
    .asText();
  assert.ok(!xml.includes("NO_USAR"));
});

test("El acta toma fecha de Chile, edad y código del funcionario registrados", () => {
  assert.throws(() => documentFields({ ...documentFixture, art12bis: null }));
  const fields = documentFields(documentFixture);
  assert.equal(fields.DATE, "17 / 10 / 2026");
  assert.equal(fields.AGE, "35");
  assert.match(
    documentFields({ ...documentFixture, officer_code: "111111-M" }).OFFICER,
    /111111-M$/,
  );
  assert.equal(fields.LESIONS, "Sin lesiones");
  assert.match(fields.PDI_OFFICER, /^_+$/);
  assert.equal(
    documentFields({
      ...documentFixture,
      controlled_at: "2026-10-18T12:00:00Z",
    }).AGE,
    "36",
  );
});

test("Las actas históricas sin esos campos muestran la omisión y recuperan el documento del snapshot", () => {
  const historical = structuredClone(documentFixture);
  historical.art12bis!.lesions = " \t ";
  historical.art12bis!.presented_document = "";
  const fields = documentFields(historical);
  assert.equal(fields.LESIONS, "No consignadas");
  assert.equal(fields.PRESENTED_DOCUMENT, "Pasaporte N.º QADOCUMENTO123");
  historical.acta_person!.document_type = "RUT";
  historical.acta_person!.document_number = "16597767K";
  assert.equal(
    documentFields(historical).PRESENTED_DOCUMENT,
    "RUT N.º 16.597.767-K",
  );
  historical.acta_person!.document_type = "Otro";
  historical.acta_person!.document_label = "Cédula extranjera";
  assert.equal(
    documentFields(historical).PRESENTED_DOCUMENT,
    "Cédula extranjera N.º 16597767K",
  );
});

test("El Word escapa datos y conserva intactas imágenes, estilos y relaciones", async () => {
  const template = new PizZip(
    await readFile("assets/templates/art12bis-v1.docx"),
  );
  const generated = new PizZip(
    await generateControlDocument({
      ...documentFixture,
      officer: 'Prueba <segura> & "áé" {{DATE}}\u0000',
    }),
  );
  const xml = generated.file("word/document.xml")!.asText();
  assert.ok(
    xml.includes("Prueba &lt;segura&gt; &amp; &quot;áé&quot; {{DATE}}"),
  );
  assert.ok(!xml.includes("JORGE ARAYA MUÑOZ"));
  assert.ok(!xml.includes("TENIENTE"));
  assert.ok(xml.includes("Persona de prueba Validación temporal"));
  assert.ok(xml.includes("17 / 10 / 2026"));
  for (const [name, entry] of Object.entries(template.files)) {
    if (name !== "word/document.xml" && !entry.dir)
      assert.deepEqual(
        generated.file(name)!.asUint8Array(),
        entry.asUint8Array(),
        name,
      );
  }
});

test("El documento propuesto y el acta usan la identidad inicial aunque llegue otra descripción", async () => {
  for (const [type, number, label, expected] of [
    ["DNI", "00123456", "", "DNI N.º 00123456"],
    ["RUT", "16597767k", "", "RUT N.º 16.597.767-K"],
    ["Pasaporte", "qa-12345", "", "Pasaporte N.º QA12345"],
    ["Otro", "00112233", "Cédula extranjera", "Cédula extranjera N.º 00112233"],
  ] as const) {
    const control = structuredClone(documentFixture);
    Object.assign(control.acta_person!, {
      document_type: type,
      document_number: number,
      document_label: label,
    });
    control.art12bis!.presented_document = "DOCUMENTO_EQUIVOCADO 999999";
    assert.equal(identityDocumentDescription(control.acta_person!), expected);
    assert.equal(documentFields(control).PRESENTED_DOCUMENT, expected);
    assert.equal(
      documentFields(control).DOCUMENT_NUMBER,
      expected.split(" N.º ")[1],
    );
    const xml = new PizZip(await generateControlDocument(control))
      .file("word/document.xml")!
      .asText();
    assert.ok(xml.includes(expected));
    assert.ok(!xml.includes("DOCUMENTO_EQUIVOCADO"));
  }
});
