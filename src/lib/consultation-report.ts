import type { Control } from "./domain";
import { displayDocument, normalizeDocument } from "./domain";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

const months = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function reportDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${months[Number(month) - 1]}.${year}`;
}

export function consultationReportFields(control: Control) {
  if (!control.acta_person || !control.art12bis || control.acta_version !== 1)
    throw new Error("Este control no tiene los datos guardados del acta.");
  const person = control.acta_person;
  const separatedSurnames =
    Boolean(person.paternal_surname) &&
    [person.paternal_surname, person.maternal_surname]
      .filter(Boolean)
      .join(" ")
      .trim() === person.last_names.trim();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(control.controlled_at));
  return {
    // Never guess which words form a compound surname in an older record.
    SURNAME_LABEL: separatedSurnames ? "APELLIDO PATERNO" : "APELLIDOS",
    PATERNAL_SURNAME: separatedSurnames
      ? person.paternal_surname!
      : person.last_names,
    MATERNAL_SURNAME: separatedSurnames ? person.maternal_surname || "" : "",
    FIRST_NAMES: person.first_names,
    NATIONALITY: person.nationality,
    DOCUMENT_TYPE:
      person.document_type === "Otro"
        ? person.document_label || "Otro"
        : person.document_type,
    DOCUMENT_NUMBER: displayDocument(
      person.document_type,
      normalizeDocument(person.document_number),
    ),
    BIRTH_DATE: reportDate(person.birth_date),
    SEX: person.sex || "",
    CONTROL_DATE: reportDate(date).slice(0, -4) + date.slice(2, 4),
    NOTES: control.notes || "",
  };
}

export async function consultationReportLayout(control: Control) {
  const fields = consultationReportFields(control);
  const metrics = await PDFDocument.create();
  metrics.registerFontkit(fontkit);
  const font = await metrics.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/LiberationSans-Regular.ttf"),
    ),
  );
  const overflow: { label: string; value: string }[] = [];
  // Keep the PDI field labels and one-line slots in place, including for legacy records.
  if (fields.SURNAME_LABEL === "APELLIDOS") {
    overflow.push({
      label: "Apellidos registrados sin desglosar",
      value: fields.PATERNAL_SURNAME,
    });
    fields.SURNAME_LABEL = "APELLIDO PATERNO";
    fields.PATERNAL_SURNAME = "Ver anexo PDI-1";
  }
  for (const [key, label] of [
    ["PATERNAL_SURNAME", "Apellido paterno"],
    ["MATERNAL_SURNAME", "Apellido materno"],
    ["FIRST_NAMES", "Nombres"],
    ["NATIONALITY", "Nacionalidad"],
    ["DOCUMENT_TYPE", "Tipo de documento"],
    ["DOCUMENT_NUMBER", "Número de documento"],
    ["NOTES", "Observaciones"],
  ] as const) {
    const value = fields[key];
    // Word's caps formatting is measured in capitals, with colon and cell padding reserved.
    if (
      font.widthOfTextAtSize(
        value.replace(/\s+/g, " ").toLocaleUpperCase("es-CL"),
        11,
      ) > 242
    ) {
      overflow.push({ label, value });
      fields[key] = "Ver anexo PDI-1";
    }
  }
  return { fields, overflow };
}
