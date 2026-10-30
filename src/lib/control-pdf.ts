import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { documentFields } from "./control-document";
import type { Control } from "./domain";
import { imageFit, type ControlImages } from "./control-image-assets";

// Coordinates measured on the original Word export, in points from the top.
// The first page is the supplied form itself, including its seal and wording.
const slots = [
  {
    key: "DATE",
    label: "Fecha",
    x: 491,
    top: 109,
    width: 93,
    size: 12,
    bold: true,
  },
  {
    key: "FULL_NAME",
    label: "Nombre de la persona",
    x: 86,
    top: 540.95,
    width: 345,
    size: 12,
  },
  { key: "AGE", label: "Edad", x: 468, top: 540.95, width: 42, size: 12 },
  {
    key: "DOCUMENT_NUMBER",
    label: "Número de documento",
    x: 299,
    top: 556.85,
    width: 158,
    size: 12,
  },
  {
    key: "BIRTH_DATE",
    label: "Fecha de nacimiento",
    x: 514.5,
    top: 556.85,
    width: 65,
    size: 10,
  },
  {
    key: "NATIONALITY",
    label: "Nacionalidad",
    x: 164,
    top: 572.75,
    width: 179,
    size: 12,
  },
  {
    key: "LESIONS",
    label: "Lesiones consignadas",
    x: 410,
    top: 572.75,
    width: 131,
    size: 11,
  },
  {
    key: "PRESENTED_DOCUMENT",
    label: "Documento presentado",
    x: 246,
    top: 642.77,
    width: 291,
    size: 11,
    lines: 2,
  },
  {
    key: "LOCATION",
    label: "Lugar de fiscalización",
    x: 220,
    top: 669.28,
    width: 316,
    size: 11,
    lines: 2,
  },
  {
    key: "OFFICER",
    label: "Funcionario de Carabineros",
    x: 217.5,
    top: 719.87,
    width: 177,
    size: 11,
    lines: 2,
    bold: true,
  },
  {
    key: "OFFICER_GRADE",
    label: "Grado de Carabineros",
    x: 133,
    top: 745.18,
    width: 260,
    size: 11,
    bold: true,
  },
] as const;

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateControlPdf(
  control: Control,
  images: ControlImages = {},
) {
  const fields = documentFields(control);
  const asset = (file: string) =>
    readFile(path.join(process.cwd(), "assets", file));
  const [template, regularBytes, boldBytes] = await Promise.all([
    asset("templates/art12bis-form-v1.pdf"),
    asset("fonts/LiberationSans-Regular.ttf"),
    asset("fonts/LiberationSans-Bold.ttf"),
  ]);
  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  let fallback: PDFFont | undefined;
  async function fontFor(text: string, emphasized = false) {
    const font = emphasized ? bold : regular;
    const available = new Set(font.getCharacterSet());
    if ([...text].every((char) => available.has(char.codePointAt(0)!)))
      return font;
    fallback ??= await pdf.embedFont(await asset("fonts/DejaVuSans.ttf"), {
      subset: true,
    });
    return fallback;
  }
  pdf.setTitle("Acta de control de identidad a extranjero - Art. 12 bis");
  pdf.setAuthor("Subcomisaría de Asuntos Migratorios");
  pdf.setLanguage("es-CL");
  const first = pdf.getPage(0);
  const overflow: { label: string; value: string }[] = [];
  for (const slot of slots) {
    const value = fields[slot.key].replace(/\s+/g, " ").trim();
    if (!value || /^_+$/.test(value)) continue;
    const font = await fontFor(value, "bold" in slot && slot.bold);
    const capacity = "lines" in slot ? slot.lines : 1;
    let size: number = slot.size;
    let lines = wrap(value, font, size, slot.width);
    while (lines.length > capacity && size > 9) {
      size -= 0.25;
      lines = wrap(value, font, size, slot.width);
    }
    if (lines.length > capacity) {
      // Long exceptional values continue on an explicit annex, never clipped.
      overflow.push({ label: slot.label, value });
      size = 10;
      lines = [`Ver anexo [${overflow.length}]`];
    }
    // Hide only the typing area; the original rules stay below the text.
    first.drawRectangle({
      x: slot.x,
      y: first.getHeight() - slot.top - 0.3,
      width: slot.width,
      height: 12.5,
      color: rgb(1, 1, 1),
    });
    lines.forEach((text, index) =>
      first.drawText(text, {
        x: slot.x,
        y: first.getHeight() - slot.top - index * 11.4,
        size,
        font,
        color: rgb(0, 0, 0),
      }),
    );
  }
  // This annex is always page two. Any overflowing text follows it.
  const photos = pdf.addPage([612, 936]);
  photos.drawText("REGISTRO FOTOGRÁFICO DEL CONTROL", {
    x: 60,
    y: 880,
    size: 13,
    font: bold,
  });
  let headerTop = 84;
  for (const text of [
    fields.FULL_NAME,
    `${control.acta_person!.document_type}: ${fields.DOCUMENT_NUMBER}`,
    `Fecha del control: ${fields.DATE}`,
  ]) {
    const font = await fontFor(text);
    for (const line of wrap(text.replace(/\s+/g, " "), font, 10, 492)) {
      photos.drawText(line, { x: 60, y: 936 - headerTop, size: 10, font });
      headerTop += 12;
    }
  }
  const personTop = Math.max(182, headerTop + 32);
  for (const item of [
    {
      label: "FOTOGRAFÍA DE LA PERSONA",
      image: images.person,
      top: personTop,
      height: 460 - personTop,
      missing: "Este control anterior no tiene fotografía de la persona.",
    },
    {
      label: "DOCUMENTO PRESENTADO",
      image: images.document,
      top: 520,
      height: 304,
      missing: "No se adjuntó imagen del documento en este control.",
    },
  ]) {
    photos.drawText(item.label, {
      x: 60,
      y: 936 - item.top + 16,
      size: 11,
      font: bold,
    });
    if (item.image) {
      const embedded = await pdf.embedJpg(item.image.bytes);
      const fitted = imageFit(item.image, 492, item.height);
      photos.drawImage(embedded, {
        x: 60 + (492 - fitted.width) / 2,
        y: 936 - item.top - (item.height + fitted.height) / 2,
        ...fitted,
      });
    } else {
      photos.drawText(item.missing, {
        x: 60,
        y: 936 - item.top - 24,
        size: 10,
        font: regular,
      });
    }
  }
  photos.drawText(`Control: ${control.id}`, {
    x: 60,
    y: 46,
    size: 9,
    font: regular,
  });
  if (overflow.length) {
    let page = pdf.addPage([612, 936]);
    let y = 880;
    const heading = () => {
      page.drawText("DATOS COMPLEMENTARIOS DEL ACTA", {
        x: 60,
        y,
        size: 12,
        font: bold,
      });
      y -= 20;
      page.drawText(`Control: ${control.id}`, {
        x: 60,
        y,
        size: 9,
        font: regular,
      });
      y -= 36;
    };
    heading();
    for (const [index, item] of overflow.entries()) {
      const font = await fontFor(item.value);
      const lines = wrap(item.value, font, 11, 492);
      if (y - lines.length * 15 - 40 < 60) {
        page = pdf.addPage([612, 936]);
        y = 880;
        heading();
      }
      page.drawText(`[${index + 1}] ${item.label}`, {
        x: 60,
        y,
        size: 11,
        font: bold,
      });
      y -= 20;
      for (const line of lines) {
        page.drawText(line, { x: 60, y, size: 11, font });
        y -= 15;
      }
      y -= 20;
    }
  }
  return pdf.save();
}
