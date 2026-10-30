import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactSchema,
  displayDocument,
  formatRut,
  identitySchema,
  normalizeDocument,
  personalSchema,
  registrationSchema,
  validRut,
} from "../src/lib/domain";

test("RUT: dígito verificador, puntos, guion y K", () => {
  assert.equal(validRut("12.345.678-5"), true);
  assert.equal(validRut("12345678-9"), false);
  assert.equal(validRut("6.000.000-k"), true);
  assert.equal(validRut("16597767k"), true);
  assert.equal(validRut("00000000-0"), false);
  assert.equal(displayDocument("RUT", "123456785"), "12.345.678-5");
});
test("El RUT se formatea al escribir o pegar, sin inventar ni corregir el dígito", () => {
  const typed = [
    "",
    "1",
    "12",
    "123",
    "1234",
    "12345",
    "123456",
    "1234567",
    "12345678",
    "123456785",
  ];
  assert.deepEqual(typed.map(formatRut), [
    "",
    "1",
    "1-2",
    "12-3",
    "123-4",
    "1.234-5",
    "12.345-6",
    "123.456-7",
    "1.234.567-8",
    "12.345.678-5",
  ]);
  for (const value of ["16597767k", "16.597.767-k", " 16 597 767 k "])
    assert.equal(formatRut(value), "16.597.767-K");
  assert.equal(formatRut("6.000.000-K"), "6.000.000-K");
  assert.equal(formatRut("123456789"), "12.345.678-9");
  assert.equal(validRut(formatRut("123456789")), false);
  for (const value of ["1234567850", "12345678A", "K12345678", "000000000"]) {
    assert.equal(normalizeDocument(formatRut(value)), normalizeDocument(value));
    assert.equal(validRut(formatRut(value)), false);
  }
  assert.equal(displayDocument("RUT", "16.597.767-k"), "16.597.767-K");
  assert.equal(displayDocument("Pasaporte", "AB12345"), "AB12345");
});
test("El servidor rechaza el RUT incorrecto aunque se omita la validación visual", () => {
  const identity = {
    document_type: "RUT",
    document_number: "16.597.767-K",
    issuing_country: "Chile",
  };
  assert.equal(identitySchema.parse(identity).document_number, "16597767K");
  for (const number of [
    "165977670",
    "16.597.767-0",
    "1659776",
    "00000000-0",
    "1234567850",
  ]) {
    const result = identitySchema.safeParse({
      ...identity,
      document_number: number,
    });
    assert.equal(result.success, false);
    if (!result.success)
      assert.ok(
        result.error.issues.some(
          (issue) => issue.path[0] === "document_number",
        ),
      );
  }
});
test("La identidad se normaliza y el país emisor se exige", () => {
  assert.equal(normalizeDocument("ab. 123-45"), "AB12345");
  assert.equal(
    identitySchema.parse({
      document_type: "RUT",
      document_number: "12.345.678-5",
      issuing_country: "Chile",
    }).document_number,
    "123456785",
  );
  assert.equal(
    identitySchema.safeParse({
      document_type: "Pasaporte",
      document_number: "AB12345",
      issuing_country: "",
    }).success,
    false,
  );
  assert.equal(
    identitySchema.safeParse({
      document_type: "Otro",
      document_number: "AB12345",
      issuing_country: "Perú",
    }).success,
    false,
  );
  assert.equal(
    identitySchema.safeParse({
      document_type: "RUT",
      document_number: "12.345.678-5",
      issuing_country: "Perú",
    }).success,
    false,
  );
  assert.equal(
    identitySchema.safeParse({
      document_type: "DNI",
      document_number: "%_23",
      issuing_country: "Perú",
    }).success,
    false,
  );
});
test("No se permiten fechas inexistentes ni futuras", () => {
  const person = {
    first_names: "Persona",
    last_names: "Prueba",
    paternal_surname: "Prueba",
    maternal_surname: "",
    sex: "No especificado",
    nationality: "Chile",
    birth_date: "1990-02-28",
    address: "Calle de prueba 123",
    commune: "Santiago",
    phone: "+56 9 0000 0000",
  };
  assert.equal(personalSchema.safeParse(person).success, true);
  assert.equal(
    personalSchema.safeParse({ ...person, birth_date: "2025-02-29" }).success,
    false,
  );
  assert.equal(
    personalSchema.safeParse({ ...person, birth_date: "2099-01-01" }).success,
    false,
  );
});
test("El registro requiere una identidad nueva completa o una ficha existente", () => {
  const data = {
    request_id: crypto.randomUUID(),
    control: {
      art12bis: {
        lesions: "Sin lesiones",
        presented_document: "Documento sintético de prueba",
      },
      reason: "Control de identidad",
      location: "Unidad de prueba",
      officer: "Funcionario de prueba",
    },
  };
  assert.equal(registrationSchema.safeParse(data).success, false);
  assert.equal(
    registrationSchema.safeParse({ ...data, person_id: crypto.randomUUID() })
      .success,
    true,
  );
  assert.equal(
    registrationSchema.safeParse({
      ...data,
      person_id: crypto.randomUUID(),
      identity: {
        document_type: "DNI",
        document_number: "12345678",
        issuing_country: "Perú",
      },
    }).success,
    false,
  );
});

test("Domicilio, comuna y teléfono son obligatorios en fichas nuevas y al actualizar contactos", () => {
  const contact = {
    address: " Calle de prueba 123 ",
    commune: " Santiago ",
    phone: " +56 9 0000 0000 ",
  };
  const personal = {
    first_names: "Persona",
    last_names: "Prueba",
    paternal_surname: "Prueba",
    maternal_surname: "",
    sex: "No especificado",
    nationality: "Chile",
    birth_date: "1990-01-01",
    ...contact,
  };
  assert.deepEqual(contactSchema.parse(contact), {
    address: "Calle de prueba 123",
    commune: "Santiago",
    phone: "+56 9 0000 0000",
  });
  assert.equal(personalSchema.safeParse(personal).success, true);
  for (const field of ["address", "commune", "phone"] as const) {
    for (const missing of [undefined, "", " \t\n "]) {
      assert.equal(
        contactSchema.safeParse({ ...contact, [field]: missing }).success,
        false,
      );
      assert.equal(
        personalSchema.safeParse({ ...personal, [field]: missing }).success,
        false,
      );
      assert.equal(
        registrationSchema.safeParse({
          request_id: crypto.randomUUID(),
          person_id: crypto.randomUUID(),
          contact: { ...contact, [field]: missing },
          control: {
            art12bis: {
              lesions: "Sin lesiones",
              presented_document: "Documento sintético de prueba",
            },
            reason: "Control de identidad",
            location: "Unidad de prueba",
          },
        }).success,
        false,
      );
    }
  }
});
