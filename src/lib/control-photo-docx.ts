import type PizZip from "pizzip";
import {
  imageFit,
  type ActaImage,
  type ControlImages,
} from "./control-image-assets";

const escape = (value: string) =>
  value
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function photoAnnexXml(
  zip: PizZip,
  images: ControlImages,
  metadata: string[],
) {
  function paragraph(text: string, bold = false, pageBreak = false) {
    return `<w:p><w:pPr>${pageBreak ? "<w:pageBreakBefore/>" : ""}<w:keepNext/><w:spacing w:before="0" w:after="100" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="${bold ? 22 : 20}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;
  }
  function picture(
    image: ActaImage | undefined,
    kind: string,
    height: number,
    id: number,
  ) {
    if (!image)
      return paragraph(
        kind === "person"
          ? "Este control anterior no tiene fotografía de la persona registrada."
          : "No se adjuntó imagen del documento en este control.",
      );
    const fitted = imageFit(image, 470, height);
    const cx = Math.round(fitted.width * 12700),
      cy = Math.round(fitted.height * 12700);
    const relationship = `rIdControlPhoto${id}`;
    const filename = `control-${kind}.jpg`;
    zip.file(`word/media/${filename}`, image.bytes);
    const rels = zip.file("word/_rels/document.xml.rels")!.asText();
    zip.file(
      "word/_rels/document.xml.rels",
      rels.replace(
        "</Relationships>",
        `<Relationship Id="${relationship}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/></Relationships>`,
      ),
    );
    const contentTypes = zip.file("[Content_Types].xml")!.asText();
    if (!/Extension="jpg"/.test(contentTypes))
      zip.file(
        "[Content_Types].xml",
        contentTypes.replace(
          "</Types>",
          '<Default Extension="jpg" ContentType="image/jpeg"/></Types>',
        ),
      );
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="200" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${filename}" descr="${kind === "person" ? "Fotografía de la persona en este control" : "Documento presentado en este control"}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  return (
    paragraph("REGISTRO FOTOGRÁFICO DEL CONTROL", true, true) +
    metadata.map((text) => paragraph(text)).join("") +
    paragraph("FOTOGRAFÍA DE LA PERSONA", true) +
    picture(images.person, "person", 250, 901) +
    paragraph("DOCUMENTO PRESENTADO", true) +
    picture(images.document, "document", 280, 902)
  );
}
