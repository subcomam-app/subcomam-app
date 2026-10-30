import { art12bisSchema, type Control } from "../src/lib/domain";

export const documentFixture: Control = {
  id: "00000000-0000-4000-8000-000000000001",
  person_id: "00000000-0000-4000-8000-000000000002",
  controlled_at: "2026-10-18T02:30:00Z",
  reason: "Control de identidad",
  location: "Unidad de prueba, Santiago",
  officer: "Funcionario de prueba",
  notes: "",
  art12bis: art12bisSchema.parse({
    number: "PRUEBA",
    officer_grade: "Grado de prueba",
    lesions: "Sin lesiones",
    presented_document: "Pasaporte de prueba",
  }),
  acta_version: 1,
  acta_person: {
    first_names: "Persona de prueba",
    last_names: "Validación temporal",
    nationality: "Perú",
    birth_date: "1990-10-18",
    document_type: "Pasaporte",
    document_number: "QADOCUMENTO123",
    issuing_country: "Perú",
    document_label: "",
  },
  photo_path: null,
  photo_bytes: null,
  photo_width: null,
  photo_height: null,
};
