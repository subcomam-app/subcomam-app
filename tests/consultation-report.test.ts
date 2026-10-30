import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import {
  consultationReportFields,
  consultationReportLayout,
} from "../src/lib/consultation-report";
import { generateControlDocument } from "../src/lib/control-document";
import { documentFixture } from "./document-fixture";

test("El reporte usa el snapshot del control, fecha chilena y documentos normalizados", () => {
  const control = structuredClone(documentFixture);
  Object.assign(control.acta_person!, {
    first_names: "María José",
    last_names: "De la Cruz Pérez",
    paternal_surname: "De la Cruz",
    maternal_surname: "Pérez",
    sex: "Femenino",
    document_type: "RUT",
    document_number: "16597767k",
  });
  const fields = consultationReportFields(control);
  assert.equal(fields.SURNAME_LABEL, "APELLIDO PATERNO");
  assert.equal(fields.PATERNAL_SURNAME, "De la Cruz");
  assert.equal(fields.MATERNAL_SURNAME, "Pérez");
  assert.equal(fields.FIRST_NAMES, "María José");
  assert.equal(fields.DOCUMENT_NUMBER, "16.597.767-K");
  assert.equal(fields.CONTROL_DATE, "17.OCT.26");
  assert.equal(fields.BIRTH_DATE, "18.OCT.1990");
  assert.equal(fields.SEX, "Femenino");
});

test("Los registros antiguos conservan apellidos completos y no adivinan sexo ni apellido materno", () => {
  const fields = consultationReportFields(documentFixture);
  assert.equal(fields.SURNAME_LABEL, "APELLIDOS");
  assert.equal(
    fields.PATERNAL_SURNAME,
    documentFixture.acta_person!.last_names,
  );
  assert.equal(fields.MATERNAL_SURNAME, "");
  assert.equal(fields.SEX, "");
  assert.equal(fields.NOTES, "");
  const mismatched = structuredClone(documentFixture);
  mismatched.acta_person!.paternal_surname = "Apellido diferente";
  assert.equal(
    consultationReportFields(mismatched).PATERNAL_SURNAME,
    documentFixture.acta_person!.last_names,
  );
});

test("Los datos se insertan como texto, incluso con caracteres de reemplazo y etiquetas", async () => {
  const control = structuredClone(documentFixture);
  control.notes = "$& <dato> $` $' y {{NO_ES_UN_CAMPO}}";
  const xml = new PizZip(await generateControlDocument(control))
    .file("word/document.xml")!
    .asText();
  assert.equal((xml.match(/<w:body>/g) || []).length, 1);
  assert.ok(
    xml.includes("$&amp; &lt;dato&gt; $` $&apos; y {{NO_ES_UN_CAMPO}}"),
  );
});

test("El Word comienza con consulta PDI, mantiene sus campos reservados vacíos y luego incluye el acta", async () => {
  const control = structuredClone(documentFixture);
  control.notes = "Dato <registrado> & verificado";
  control.art12bis!.number = "NO_COPIAR_1658";
  control.art12bis!.pdi_officer = "NO_COPIAR_FUNCIONARIO";
  const xml = new PizZip(await generateControlDocument(control))
    .file("word/document.xml")!
    .asText();
  const report = xml.slice(xml.indexOf("<w:body>"), xml.indexOf("</w:sectPr>"));
  const text = report.replace(/<[^>]*>/g, "");
  assert.match(text, /REPORTE DE CONSULTA DE EXTRANJERO N° __________/);
  assert.match(text, /PORTA DOC. DE IDENTIDAD: SI ☐   NO ☐/);
  assert.match(text, /MOVIMIENTOFECHAAVANZADA/);
  assert.match(
    text,
    /SITUACIÓN MIGRATORIA: REGULAR ☐        IRREGULAR ☐MOTIVO:REGISTRA DENUNCIA:CORRESPONDE DENUNCIA:EXPULSIÓN VIGENTE:/,
  );
  assert.match(
    text,
    /UNIDAD QUE CONSULTA: SUBCOMISARIA DE ASUNTOS MIGRATORIOS/,
  );
  assert.match(text, /TIPO DOC\.: ACTA CONTROL IDENTIDADNÚMERO DOC\.: -/);
  assert.match(text, /Dato &lt;registrado&gt; &amp; verificado/);
  assert.match(text, /Persona de prueba/);
  assert.doesNotMatch(
    xml,
    /NO_COPIAR|40254381474|JUAN CARLOS|IVÁN LISIECKI|INGRESO POR PASO NO HABILITADO/,
  );
  assert.ok(
    xml.indexOf("REPORTE DE CONSULTA") < xml.indexOf("CARABINEROS DE CHILE"),
  );
  assert.ok(
    xml.indexOf("CARABINEROS DE CHILE") < xml.indexOf("REGISTRO FOTOGRÁFICO"),
  );
  assert.doesNotMatch(xml, /\{\{[A-Z_]+\}\}/);
});

test("Las opciones PDI son casillas interactivas de Word y conservan sus estados iniciales", async () => {
  const zip = new PizZip(await generateControlDocument(documentFixture));
  const xml = zip.file("word/document.xml")!.asText();
  const controls = [...xml.matchAll(/<w:sdt>([\s\S]*?)<\/w:sdt>/g)].map(
    (match) => match[1],
  );
  const expected = new Map([
    ["pdi_consulta_12bis", "1"],
    ["pdi_consulta_detencion", "0"],
    ["pdi_porta_documento_si", "0"],
    ["pdi_porta_documento_no", "0"],
    ["pdi_situacion_regular", "0"],
    ["pdi_situacion_irregular", "0"],
  ]);
  assert.equal(controls.length, expected.size);
  const ids = new Set<string>();
  for (const control of controls) {
    const tag = control.match(/<w:tag w:val="([^"]+)"/)![1];
    const state = control.match(/<w14:checked w14:val="([01])"/)![1];
    assert.equal(state, expected.get(tag), tag);
    expected.delete(tag);
    ids.add(control.match(/<w:id w:val="([^"]+)"/)![1]);
    assert.match(control, /<w14:checkbox>/);
    assert.match(
      control,
      /<w14:checkedState w14:val="2612" w14:font="Segoe UI Symbol"/,
    );
    assert.match(
      control,
      /<w14:uncheckedState w14:val="2610" w14:font="Segoe UI Symbol"/,
    );
    for (const script of ["ascii", "hAnsi", "eastAsia", "cs"])
      assert.ok(control.includes(`w:${script}="Segoe UI Symbol"`));
    assert.match(control, state === "1" ? /<w:t>☒<\/w:t>/ : /<w:t>☐<\/w:t>/);
    assert.doesNotMatch(control, /<w:lock|<w:temporary/);
  }
  assert.equal(ids.size, 6);
  assert.equal(expected.size, 0);
  assert.doesNotMatch(
    zip.file("word/settings.xml")!.asText(),
    /<w:documentProtection/,
  );
  assert.doesNotMatch(xml.replace(/<w:sdt>[\s\S]*?<\/w:sdt>/g, ""), /[☐☒]/);
});

test("Las observaciones extensas se conservan completas en un anexo identificado", async () => {
  const notes = "Observación íntegra sin recortar. ".repeat(55);
  const control = { ...documentFixture, notes };
  const layout = await consultationReportLayout(control);
  assert.match(layout.fields.NOTES, /PDI-1/);
  assert.ok(
    layout.overflow.some(
      (item) => item.label === "Observaciones" && item.value === notes,
    ),
  );
  const xml = new PizZip(await generateControlDocument(control))
    .file("word/document.xml")!
    .asText();
  assert.ok(xml.includes(notes.trim()));
  assert.ok(
    xml.indexOf("DATOS DEL REPORTE") > xml.indexOf("REGISTRO FOTOGRÁFICO"),
  );
});

test("El formato PDI mantiene sus campos y remite los datos largos al anexo sin recortarlos", async () => {
  const control = structuredClone(documentFixture);
  Object.assign(control.acta_person!, {
    paternal_surname: "Apellido compuesto ".repeat(5).trim(),
    maternal_surname: "Pérez",
    first_names: "Nombre de prueba ".repeat(6).trim(),
    sex: "Masculino",
  });
  control.acta_person!.last_names = `${control.acta_person!.paternal_surname} Pérez`;
  const layout = await consultationReportLayout(control);
  assert.equal(layout.fields.SURNAME_LABEL, "APELLIDO PATERNO");
  assert.equal(layout.fields.PATERNAL_SURNAME, "Ver anexo PDI-1");
  assert.equal(layout.fields.FIRST_NAMES, "Ver anexo PDI-1");
  assert.ok(
    layout.overflow.some(
      (item) => item.value === control.acta_person!.paternal_surname,
    ),
  );
  assert.ok(
    layout.overflow.some(
      (item) => item.value === control.acta_person!.first_names,
    ),
  );
  assert.equal(layout.fields.MATERNAL_SURNAME, "Pérez");
  const xml = new PizZip(await generateControlDocument(control))
    .file("word/document.xml")!
    .asText();
  const report = xml.slice(xml.indexOf("<w:body>"), xml.indexOf("</w:sectPr>"));
  const text = report.replace(/<[^>]*>/g, "");
  assert.match(text, /12° BIS, LEY N° 20.930/);
  assert.match(text, /Distribución:- SUB\. ASUNTOS MIGRATORIOS/);
  assert.doesNotMatch(
    text,
    /FUNCIONARIO PDI|IVÁN|INSPECTOR|ILS|NO REGISTRA|NO HAY/,
  );
  assert.match(report, /<w:caps\s*\/>/);
  const legacy = await consultationReportLayout(documentFixture);
  assert.equal(legacy.fields.SURNAME_LABEL, "APELLIDO PATERNO");
  assert.ok(
    legacy.overflow.some(
      (item) => item.label === "Apellidos registrados sin desglosar",
    ),
  );
});
