import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { generateControlPdf } from "../src/lib/control-pdf";
import { documentFixture } from "./document-fixture";
import { photoFixture, documentPhotoFixture } from "./photo-fixture";
import { actaImage } from "../src/lib/control-image-assets";

test("PDF conserva el formulario original, reserva la segunda hoja para las fotos y deriva textos largos a la tercera", async () => {
  const images = {
    person: await actaImage(await photoFixture()),
    document: await actaImage(await documentPhotoFixture()),
  };
  const normal = await generateControlPdf(documentFixture, images);
  assert.equal(Buffer.from(normal).subarray(0, 5).toString(), "%PDF-");
  const loaded = await PDFDocument.load(normal);
  assert.equal(loaded.getPageCount(), 2);
  assert.equal(
    loaded
      .getPage(1)
      .node.Resources()!
      .lookupMaybe(PDFName.of("XObject"), PDFDict)!
      .keys().length,
    2,
  );
  assert.deepEqual(loaded.getPage(0).getSize(), { width: 612, height: 936 });
  const personOnly = await PDFDocument.load(
    await generateControlPdf(documentFixture, { person: images.person }),
  );
  assert.equal(personOnly.getPageCount(), 2);
  assert.equal(
    personOnly
      .getPage(1)
      .node.Resources()!
      .lookupMaybe(PDFName.of("XObject"), PDFDict)!
      .keys().length,
    1,
    "La segunda hoja conserva la foto de la persona sin exigir documento",
  );
  const long = structuredClone(documentFixture);
  long.acta_person!.first_names = "Validación Álvarez Nguyễn "
    .repeat(4)
    .slice(0, 100);
  long.acta_person!.last_names = "Иванов Fernández ".repeat(7).slice(0, 100);
  long.location = "Lugar de control ".repeat(13).slice(0, 200);
  long.art12bis!.lesions = "Observación consignada ".repeat(6).slice(0, 120);
  long.art12bis!.presented_document = "Documento registrado "
    .repeat(8)
    .slice(0, 160);
  long.art12bis!.pdi_officer = "Nombre del receptor ".repeat(7).slice(0, 120);
  const extended = await PDFDocument.load(
    await generateControlPdf(long, images),
  );
  assert.equal(extended.getPageCount(), 3);
  assert.equal(
    extended
      .getPage(1)
      .node.Resources()!
      .lookupMaybe(PDFName.of("XObject"), PDFDict)!
      .keys().length,
    2,
  );
  const historical = await PDFDocument.load(
    await generateControlPdf(documentFixture),
  );
  assert.equal(historical.getPageCount(), 2);
  assert.deepEqual(extended.getPage(0).getSize(), { width: 612, height: 936 });
  await assert.rejects(
    generateControlPdf({ ...documentFixture, art12bis: null }),
  );
});
