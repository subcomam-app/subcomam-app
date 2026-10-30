import sharp from "sharp";
export async function photoFixture(background = "#dce8df") {
  const svg = `<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="1000" fill="${background}"/><circle cx="400" cy="350" r="160" fill="#246347"/><path d="M140 860Q140 560 400 560Q660 560 660 860" fill="#246347"/><rect x="0" y="910" width="800" height="90" fill="white"/><text x="400" y="965" font-size="40" font-family="Arial" text-anchor="middle" fill="#143e31">IMAGEN DE PRUEBA</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

export async function documentPhotoFixture() {
  return sharp(
    Buffer.from(
      `<svg width="1440" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1440" height="900" fill="#f5f6f7"/><rect x="35" y="35" width="1370" height="830" rx="20" fill="none" stroke="#333" stroke-width="4"/><g font-family="Arial" fill="#222"><text x="80" y="130" font-size="48">DOCUMENTO DE PRUEBA - SIN VALIDEZ</text><text x="80" y="230" font-size="32">IMAGEN SINTÉTICA PARA VERIFICAR EL ACTA</text><text x="80" y="380" font-size="38">Nombres: PERSONA DE PRUEBA</text><text x="80" y="455" font-size="38">Apellidos: VALIDACIÓN TEMPORAL</text><text x="80" y="530" font-size="38">Documento: QA-DOCUMENTO-001</text><text x="80" y="605" font-size="38">Fecha de nacimiento: 01-01-1990</text><text x="80" y="750" font-size="27">Esta imagen no corresponde a ningún documento oficial.</text></g></svg>`,
    ),
  )
    .jpeg({ quality: 90 })
    .toBuffer();
}
