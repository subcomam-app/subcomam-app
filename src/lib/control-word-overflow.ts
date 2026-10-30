import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

// Keep unusually long values from displacing the photographic annex beyond page 2.
export async function wordFieldsWithOverflow(fields: Record<string, string>) {
  const metrics = await PDFDocument.create();
  metrics.registerFontkit(fontkit);
  const font = await metrics.embedFont(
    await readFile(
      path.join(process.cwd(), "assets/fonts/LiberationSans-Regular.ttf"),
    ),
  );
  const result = { ...fields };
  const overflow: { label: string; value: string }[] = [];
  for (const [key, label, width, size] of [
    ["FULL_NAME", "Nombre de la persona", 345, 12],
    ["DOCUMENT_NUMBER", "Número de documento", 158, 12],
    ["NATIONALITY", "Nacionalidad", 179, 12],
    ["LESIONS", "Lesiones consignadas", 131, 11],
    ["PRESENTED_DOCUMENT", "Documento presentado", 582, 11],
    ["LOCATION", "Lugar de fiscalización", 632, 11],
    ["OFFICER", "Funcionario de Carabineros", 354, 11],
    ["OFFICER_GRADE", "Grado de Carabineros", 260, 11],
  ] as const) {
    const value = fields[key];
    if (!value || /^_+$/.test(value)) continue;
    if (font.widthOfTextAtSize(value, size) > width) {
      overflow.push({ label, value });
      result[key] = `Ver anexo [${overflow.length}]`;
    }
  }
  return { fields: result, overflow };
}
