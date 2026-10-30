import { mkdir, writeFile } from "node:fs/promises";
import { generateControlDocument } from "../src/lib/control-document";
import { generateControlPdf } from "../src/lib/control-pdf";
import { actaImage } from "../src/lib/control-image-assets";
import { documentFixture } from "./document-fixture";
import { photoFixture, documentPhotoFixture } from "./photo-fixture";

const directory = "test-results/consultation-report";
await mkdir(directory, { recursive: true });
const images = {
  person: await actaImage(await photoFixture()),
  document: await actaImage(await documentPhotoFixture()),
};
const control = structuredClone(documentFixture);
Object.assign(control.acta_person!, {
  paternal_surname: "Validación",
  maternal_surname: "temporal",
  sex: "No especificado",
});
control.notes = "Sin observaciones.";
await writeFile(
  `${directory}/word-completo.docx`,
  await generateControlDocument(control, images),
);
await writeFile(
  `${directory}/pdf-solo-subcomisaria.pdf`,
  await generateControlPdf(control, images),
);
await writeFile(
  `${directory}/word-sin-foto-documento.docx`,
  await generateControlDocument(control, { person: images.person }),
);
control.acta_person!.first_names = "Nombre de prueba excepcionalmente largo "
  .repeat(3)
  .slice(0, 100);
control.acta_person!.last_names = "Apellido compuesto ".repeat(6).slice(0, 100);
control.acta_person!.paternal_surname = control.acta_person!.last_names.slice(
  0,
  60,
);
control.acta_person!.maternal_surname =
  control.acta_person!.last_names.slice(61);
control.notes = "Observación completa registrada sin recortar. ".repeat(44);
await writeFile(
  `${directory}/word-datos-extensos.docx`,
  await generateControlDocument(control, images),
);
console.log("Fixtures de Word y PDF generados.");
