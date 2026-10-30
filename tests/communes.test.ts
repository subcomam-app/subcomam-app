import assert from "node:assert/strict";
import { test } from "node:test";
import {
  communes,
  normalizeCommune,
  suggestCommunes,
  communeKey,
} from "../src/lib/communes";
import {
  contactSchema,
  personalSchema,
  registrationSchema,
} from "../src/lib/domain";

test("Catálogo chileno completo, sin comunas duplicadas ni divisiones antiguas de Santiago", () => {
  assert.equal(communes.length, 346);
  assert.equal(new Set(communes.map(communeKey)).size, 346);
  for (const name of [
    "Arica",
    "Iquique",
    "Chillán Viejo",
    "Ñuñoa",
    "Antártica",
    "Cabo de Hornos",
  ])
    assert.ok(communes.includes(name), name);
  for (const name of ["Santiago Norte", "Santiago Oeste", "Santiago Sur"])
    assert.ok(!communes.includes(name), name);
});

test("Las sugerencias admiten tildes omitidas y priorizan el inicio del nombre", () => {
  assert.deepEqual(suggestCommunes("nunoa"), ["Ñuñoa"]);
  assert.ok(suggestCommunes("  puente ").includes("Puente Alto"));
  assert.equal(suggestCommunes("san")[0], "San Antonio");
  assert.ok(suggestCommunes("san pedro").includes("San Pedro de la Paz"));
  assert.deepEqual(suggestCommunes("comuna inexistente"), []);
  assert.equal(normalizeCommune("san"), undefined);
  assert.equal(normalizeCommune("san pedro"), "San Pedro");
});

test("La comuna se guarda con nombre canónico y admite denominaciones alternativas conocidas", () => {
  assert.equal(normalizeCommune("  SAN   JOSE DE MAIPO "), "San José de Maipo");
  assert.equal(normalizeCommune("AYSEN"), "Aisén");
  assert.equal(normalizeCommune("La Calera"), "Calera");
  assert.equal(normalizeCommune("Llay-Llay"), "Llaillay");
  assert.equal(normalizeCommune("O’Higgins"), "O'Higgins");
  const contact = {
    address: "Calle de prueba 123",
    commune: "nunoa",
    phone: "00000000",
  };
  assert.equal(contactSchema.parse(contact).commune, "Ñuñoa");
  const personal = {
    ...contact,
    first_names: "Prueba",
    paternal_surname: "Temporal",
    maternal_surname: "",
    sex: "No especificado",
    nationality: "Perú",
    birth_date: "1990-01-01",
  };
  assert.equal(personalSchema.parse(personal).commune, "Ñuñoa");
  const registration = {
    request_id: crypto.randomUUID(),
    person_id: crypto.randomUUID(),
    contact,
    control: {
      reason: "Fiscalización migratoria",
      location: "Unidad de prueba",
      art12bis: { lesions: "Sin lesiones", presented_document: "DNI QA123" },
    },
  };
  assert.equal(
    registrationSchema.parse(registration).contact?.commune,
    "Ñuñoa",
  );
  for (const invalid of ["", "Santiagoo", "Santiago Norte", "Lima", "San"])
    assert.equal(
      contactSchema.safeParse({ ...contact, commune: invalid }).success,
      false,
      invalid,
    );
});
