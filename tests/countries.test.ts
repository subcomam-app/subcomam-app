import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countries,
  countrySchema,
  normalizeCountry,
  suggestCountries,
} from "../src/lib/countries";
import { identitySchema, personalSchema } from "../src/lib/domain";

test("Catálogo completo y nombres únicos en español", () => {
  assert.ok(countries.length >= 249);
  assert.equal(new Set(countries).size, countries.length);
  for (const name of [
    "Chile",
    "Perú",
    "Haití",
    "Canadá",
    "Alemania",
    "Japón",
    "Nueva Zelanda",
    "Palestina",
  ]) {
    assert.ok(countries.includes(name), name);
    assert.equal(countrySchema.parse(name), name);
  }
  assert.equal(countries.includes("Otro"), false);
});

test("Las sugerencias ignoran tildes y mayúsculas, sin elegir prefijos ambiguos", () => {
  assert.deepEqual(suggestCountries("PeRu"), ["Perú"]);
  assert.deepEqual(suggestCountries("HAI"), ["Haití"]);
  assert.ok(suggestCountries("corea").includes("Corea del Sur"));
  assert.ok(suggestCountries("corea").includes("Corea del Norte"));
  assert.equal(normalizeCountry("corea"), undefined);
  assert.equal(suggestCountries("peruu").length, 0);
});

test("País emisor y nacionalidad usan el mismo nombre canónico", () => {
  const identity = {
    document_type: "Pasaporte",
    document_number: "QA12345",
    issuing_country: "  pErU  ",
  };
  const personal = {
    first_names: "Prueba",
    last_names: "Temporal",
    paternal_surname: "Temporal",
    maternal_surname: "",
    sex: "No especificado",
    birth_date: "1990-01-01",
    address: "Calle de prueba 123",
    commune: "Santiago",
    phone: "+56 9 0000 0000",
    nationality: "  republica   dominicana ",
  };
  assert.equal(identitySchema.parse(identity).issuing_country, "Perú");
  assert.equal(
    personalSchema.parse(personal).nationality,
    "República Dominicana",
  );
  assert.equal(countrySchema.parse("EEUU"), "Estados Unidos");
  for (const invalid of [
    "",
    "Peruu",
    "Columbia",
    "Otro",
    "Corea",
    "<script>",
    "A".repeat(81),
  ]) {
    assert.equal(
      identitySchema.safeParse({ ...identity, issuing_country: invalid })
        .success,
      false,
      invalid,
    );
    assert.equal(
      personalSchema.safeParse({ ...personal, nationality: invalid }).success,
      false,
      invalid,
    );
  }
});
