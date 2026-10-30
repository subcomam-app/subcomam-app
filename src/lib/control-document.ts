import { readFile } from "node:fs/promises";
import path from "node:path";
import { consultationReportLayout } from "./consultation-report";
import PizZip from "pizzip";
import {
  displayDocument,
  identityDocumentDescription,
  normalizeDocument,
  type Control,
} from "./domain";
import type { ControlImages } from "./control-image-assets";
import { photoAnnexXml } from "./control-photo-docx";
import { wordFieldsWithOverflow } from "./control-word-overflow";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function localDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateText(iso: string) {
  return iso.split("-").reverse().join(" / ");
}

function xmlText(value: string) {
  // Only text is accepted. Keep user input out of OOXML markup, even for braces.
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function documentFields(control: Control) {
  if (!control.art12bis || !control.acta_person || control.acta_version !== 1)
    throw new Error("Este control no tiene un acta del artículo 12 bis.");
  const person = control.acta_person;
  const report = control.art12bis;
  const date = localDate(control.controlled_at);
  const age =
    Number(date.slice(0, 4)) -
    Number(person.birth_date.slice(0, 4)) -
    (date.slice(5) < person.birth_date.slice(5) ? 1 : 0);
  const blank = (value: string, length = 20) => value || "_".repeat(length);
  return {
    // These fields belong to PDI, including when older records contain values.
    NUMBER: "_______",
    DATE: dateText(date),
    FULL_NAME: `${person.first_names} ${person.last_names}`,
    AGE: String(age),
    DOCUMENT_NUMBER: displayDocument(
      person.document_type,
      normalizeDocument(person.document_number),
    ),
    BIRTH_DATE: dateText(person.birth_date),
    NATIONALITY: person.nationality,
    // Historical omissions are not evidence that the person had no injuries.
    LESIONS: report.lesions?.trim() || "No consignadas",
    // Both document fields use the identity captured at registration, including
    // older controls whose free-text description could contain another number.
    PRESENTED_DOCUMENT: identityDocumentDescription(person),
    LOCATION: control.location,
    OFFICER: control.officer_code
      ? `${control.officer} · ${control.officer_code}`
      : control.officer,
    OFFICER_GRADE: blank(report.officer_grade),
    PDI_OFFICER: "_".repeat(46),
    PDI_GRADE: "_".repeat(15),
  };
}

export async function generateControlDocument(
  control: Control,
  images: ControlImages = {},
) {
  const originalFields = documentFields(control);
  const consultation = await consultationReportLayout(control);
  const { fields, overflow } = await wordFieldsWithOverflow(originalFields);
  const template = await readFile(
    path.join(process.cwd(), "assets/templates/art12bis-v1.docx"),
  );
  const zip = new PizZip(template);
  const consultationTemplate = await readFile(
    path.join(process.cwd(), "assets/templates/pdi-consulta-v1.xml"),
    "utf8",
  );
  const consultationXml = consultationTemplate.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (_match, key: string) => {
      if (!(key in consultation.fields))
        throw new Error("Campo desconocido en el reporte de consulta.");
      return xmlText(
        consultation.fields[key as keyof typeof consultation.fields],
      );
    },
  );
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("No se encontró la plantilla del acta.");
  const xml = document
    .asText()
    .replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
      if (!(key in fields))
        throw new Error("Campo desconocido en la plantilla.");
      return xmlText(fields[key as keyof typeof fields]);
    });
  const annex = photoAnnexXml(zip, images, [
    originalFields.FULL_NAME,
    `${control.acta_person!.document_type}: ${originalFields.DOCUMENT_NUMBER}`,
    `Fecha del control: ${fields.DATE}`,
    `Control: ${control.id}`,
  ]);
  const overflowXml = overflow.length
    ? `<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>DATOS COMPLEMENTARIOS DEL ACTA</w:t></w:r></w:p>` +
      overflow
        .map(
          (item, index) =>
            `<w:p><w:pPr><w:spacing w:before="160" w:after="120" w:line="260" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">[${index + 1}] ${xmlText(item.label)}: ${xmlText(item.value)}</w:t></w:r></w:p>`,
        )
        .join("")
    : "";
  const sectionIndex = xml.lastIndexOf("<w:sectPr");
  if (sectionIndex < 0)
    throw new Error("No se encontró la sección de la plantilla.");
  const notesAnnex = consultation.overflow.length
    ? `<w:p><w:pPr><w:pageBreakBefore/><w:keepNext/><w:spacing w:after="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:b/></w:rPr><w:t>DATOS DEL REPORTE DE CONSULTA — ANEXO PDI-1</w:t></w:r></w:p>` +
      consultation.overflow
        .map(
          (item) =>
            `<w:p><w:pPr><w:spacing w:before="160" w:after="120" w:line="260" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlText(item.label)}: ${xmlText(item.value)}</w:t></w:r></w:p>`,
        )
        .join("")
    : "";
  zip.file(
    "word/document.xml",
    (
      xml.slice(0, sectionIndex) +
      annex +
      overflowXml +
      notesAnnex +
      xml.slice(sectionIndex)
    ).replace("<w:body>", () => `<w:body>${consultationXml}`),
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export function controlDocumentFilename(
  control: Pick<Control, "id" | "controlled_at">,
) {
  return `acta-art12bis-${localDate(control.controlled_at)}-${control.id}.docx`;
}
