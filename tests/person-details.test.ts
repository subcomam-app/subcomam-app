import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import {
  personalSchema,
  personDetailsSchema,
  registrationSchema,
} from "../src/lib/domain";
import { generateControlDocument } from "../src/lib/control-document";
import { consultationReportFields } from "../src/lib/consultation-report";
import { documentFixture } from "./document-fixture";

const personal = {
  first_names: "Persona de prueba",
  paternal_surname: " De la Cruz ",
  maternal_surname: " Pérez ",
  sex: "Femenino",
  nationality: "Perú",
  birth_date: "1990-01-01",
  address: "Calle de prueba 123",
  commune: "Santiago",
  phone: "00000000",
};
test("Los apellidos compuestos se guardan por separado y generan el nombre completo", () => {
  const parsed = personalSchema.parse({
    ...personal,
    last_names: "No debe usarse",
  });
  assert.equal(parsed.paternal_surname, "De la Cruz");
  assert.equal(parsed.maternal_surname, "Pérez");
  assert.equal(parsed.last_names, "De la Cruz Pérez");
  const oneSurname = personalSchema.parse({
    ...personal,
    maternal_surname: undefined,
  });
  assert.equal(oneSurname.last_names, "De la Cruz");
  assert.equal(oneSurname.maternal_surname, "");
});
test("No se deducen apellidos ni sexo y se validan tanto nuevas fichas como correcciones", () => {
  for (const schema of [personalSchema, personDetailsSchema]) {
    for (const field of ["paternal_surname", "sex"]) {
      for (const missing of [undefined, "", "   "]) {
        assert.equal(
          schema.safeParse({ ...personal, [field]: missing }).success,
          false,
        );
      }
    }
    assert.equal(
      schema.safeParse({ ...personal, sex: "Otro valor" }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        ...personal,
        paternal_surname: "A".repeat(99),
        maternal_surname: "BC",
      }).success,
      false,
    );
    assert.equal(
      schema.safeParse({ ...personal, sex: "No especificado" }).success,
      true,
    );
  }
});
test("Una ficha existente admite apellidos y sexo sin alterar su identidad", () => {
  const request = {
    request_id: crypto.randomUUID(),
    person_id: crypto.randomUUID(),
    person_details: personal,
    control: {
      reason: "Fiscalización migratoria",
      location: "Unidad de prueba",
      art12bis: {
        lesions: "Sin lesiones",
        presented_document: "DNI de prueba",
      },
    },
  };
  const parsed = registrationSchema.parse(request);
  assert.deepEqual(parsed.person_details, {
    paternal_surname: "De la Cruz",
    maternal_surname: "Pérez",
    sex: "Femenino",
  });
  assert.equal(
    registrationSchema.safeParse({ ...request, personal }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({
      ...request,
      person_id: undefined,
      identity: {
        document_type: "DNI",
        document_number: "QA12345",
        issuing_country: "Perú",
      },
      personal,
    }).success,
    false,
  );
});
test("El Word recibe los apellidos y sexo validados, incluyendo personas sin segundo apellido", async () => {
  for (const maternal_surname of ["Pérez", ""]) {
    const person = personalSchema.parse({ ...personal, maternal_surname });
    const control = structuredClone(documentFixture);
    Object.assign(control.acta_person!, person);
    const fields = consultationReportFields(control);
    assert.equal(fields.PATERNAL_SURNAME, "De la Cruz");
    assert.equal(fields.MATERNAL_SURNAME, maternal_surname);
    assert.equal(fields.SEX, "Femenino");
    const xml = new PizZip(await generateControlDocument(control))
      .file("word/document.xml")!
      .asText();
    const text = xml.replace(/<[^>]*>/g, "");
    assert.ok(text.includes("APELLIDO PATERNO: De la Cruz"));
    assert.ok(text.includes("APELLIDO MATERNO: " + maternal_surname));
    assert.ok(text.includes("SEXO: Femenino"));
  }
});
